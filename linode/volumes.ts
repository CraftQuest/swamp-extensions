/**
 * Swamp model for Linode Block Storage volumes (`/volumes`): create, adopt,
 * update, sync, list, delete (confirmation-gated), plus attach, detach, resize
 * and wait-for-status actions. Registered as `@craftquest/linode/volumes`.
 *
 * @module
 */

import { z } from "npm:zod@4";
import {
  compact,
  instanceName,
  type Json,
  request,
  waitForStatus,
} from "./_lib/linode.ts";
import {
  type Ctx,
  LifecycleFields,
  ListingSchema,
  makeChecks,
  makeCrudMethods,
  type MethodResult,
  readStoredState,
} from "./_lib/crud.ts";

const ENDPOINT = "/volumes";

/** Global arguments: the desired volume plus the API token. */
const GlobalArgsSchema = z.object({
  token: z.string().default("").meta({ sensitive: true }).describe(
    "Linode personal access token (vault-supplied); falls back to LINODE_TOKEN",
  ),
  label: z.string().default("").describe(
    "Volume label (1-32 chars); also the state name",
  ),
  size: z.number().int().positive().default(20).describe(
    "Size in GB (10-16384)",
  ),
  region: z.string().default("").describe(
    "Region ID; required unless linode_id is set (then the Linode's region is used)",
  ),
  linode_id: z.number().int().optional().describe(
    "Attach to this Linode at creation",
  ),
  config_id: z.number().int().optional().describe(
    "Configuration profile to attach to (requires linode_id)",
  ),
  tags: z.array(z.string()).default([]),
  encryption: z.enum(["enabled", "disabled"]).optional().describe(
    "Volume encryption (default enabled where supported)",
  ),
});

/** Resolved global arguments type. */
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Stored state of one volume. */
const StateSchema = z.object({
  id: z.number(),
  label: z.string(),
  status: z.string(),
  size: z.number().optional(),
  region: z.string().optional(),
  linodeId: z.number().nullable().optional(),
  filesystemPath: z.string().optional(),
  tags: z.array(z.string()).optional(),
  encryption: z.string().optional(),
  hardwareType: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  ...LifecycleFields,
});

/** Stored state type. */
type VolumeState = z.infer<typeof StateSchema>;

/** Map a raw Linode volume object onto {@link StateSchema}. */
function toState(raw: Json): VolumeState {
  return StateSchema.parse(compact({
    id: raw.id,
    label: String(raw.label ?? ""),
    status: String(raw.status ?? "unknown"),
    size: raw.size,
    region: raw.region,
    linodeId: raw.linode_id === undefined
      ? undefined
      : (raw.linode_id as number | null),
    filesystemPath: raw.filesystem_path,
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    encryption: raw.encryption,
    hardwareType: raw.hardware_type,
    created: raw.created,
    updated: raw.updated,
  }));
}

/** Build the POST /volumes body from the global arguments. */
function createBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  if (!a.region && a.linode_id === undefined) {
    throw new Error(
      "globalArgs.region is required to create a volume unless linode_id is set",
    );
  }
  return compact({
    label: a.label,
    size: a.size,
    region: a.region || undefined,
    linode_id: a.linode_id,
    config_id: a.config_id,
    tags: a.tags.length ? a.tags : undefined,
    encryption: a.encryption,
  });
}

/** Build the PUT /volumes/{id} body from the global arguments. */
function updateBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  return compact({ label: a.label || undefined, tags: a.tags });
}

const crud = makeCrudMethods({
  endpoint: ENDPOINT,
  noun: "volume",
  toState: (raw) => toState(raw),
  createBody,
  updateBody,
  confirmDelete: true,
});

const AttachArgs = z.object({
  linode_id: z.number().int().describe(
    "Linode instance to attach to (same region)",
  ),
  config_id: z.number().int().optional(),
  persist_across_boots: z.boolean().default(true),
});
const ResizeArgs = z.object({
  size: z.number().int().positive().describe(
    "New size in GB; must be larger than the current size",
  ),
});
const WaitArgs = z.object({
  status: z.string().default("active").describe(
    "Target status (comma-separate to accept several)",
  ),
  timeout_seconds: z.number().int().positive().default(300),
  interval_seconds: z.number().int().positive().default(5),
});

function tokenOf(ctx: Ctx): string | undefined {
  const t = ctx.globalArgs.token;
  return typeof t === "string" && t.length ? t : undefined;
}

async function refresh(ctx: Ctx, id: number): Promise<MethodResult> {
  const raw = await request("GET", `${ENDPOINT}/${id}`, {
    token: tokenOf(ctx),
    signal: ctx.signal,
  });
  if (!raw) throw new Error(`Volume ${id} not found`);
  const state = toState(raw);
  const handle = await ctx.writeResource(
    "state",
    instanceName(raw.label),
    state,
  );
  return {
    dataHandles: [handle],
    result: { status: state.status, linodeId: state.linodeId ?? null },
  };
}

/**
 * Swamp model for Linode Block Storage volumes. Registered as
 * `@craftquest/linode/volumes`.
 */
export const model = {
  type: "@craftquest/linode/volumes",
  version: "2026.09.18.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    state: {
      description: "Volume state, one resource per volume named by label",
      schema: StateSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    listing: {
      description: "Summary of the most recent list call",
      schema: ListingSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },
  checks: makeChecks(),
  methods: {
    ...crud,
    attach: {
      description:
        "Attach the stored volume to a Linode (no-op if already attached to it)",
      arguments: AttachArgs,
      execute: async (
        args: z.infer<typeof AttachArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "volume");
        if (stored.linodeId === args.linode_id) {
          ctx.logger.warn("Volume {id} already attached to Linode {linode}", {
            id: stored.id,
            linode: args.linode_id,
          });
          return refresh(ctx, stored.id);
        }
        ctx.logger.info("Attaching volume {id} to Linode {linode}", {
          id: stored.id,
          linode: args.linode_id,
        });
        await request("POST", `${ENDPOINT}/${stored.id}/attach`, {
          token: tokenOf(ctx),
          body: compact({
            linode_id: args.linode_id,
            config_id: args.config_id,
            persist_across_boots: args.persist_across_boots,
          }),
          signal: ctx.signal,
        });
        return refresh(ctx, stored.id);
      },
    },
    detach: {
      description:
        "Detach the stored volume from whatever Linode it is attached to (no-op if detached)",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "volume");
        ctx.logger.info("Detaching volume {id}", { id: stored.id });
        await request("POST", `${ENDPOINT}/${stored.id}/detach`, {
          token: tokenOf(ctx),
          body: {},
          signal: ctx.signal,
        });
        return refresh(ctx, stored.id);
      },
    },
    resize: {
      description:
        "Grow the stored volume (POST /resize); volumes cannot shrink",
      arguments: ResizeArgs,
      execute: async (
        args: z.infer<typeof ResizeArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "volume");
        if (typeof stored.size === "number" && args.size <= stored.size) {
          throw new Error(
            `Volume ${stored.id} is already ${stored.size} GB; resize only grows volumes`,
          );
        }
        ctx.logger.info("Resizing volume {id} to {size} GB", {
          id: stored.id,
          size: args.size,
        });
        await request("POST", `${ENDPOINT}/${stored.id}/resize`, {
          token: tokenOf(ctx),
          body: { size: args.size },
          signal: ctx.signal,
        });
        return refresh(ctx, stored.id);
      },
    },
    wait: {
      description:
        "Poll until the stored volume reaches the target status (default active) and refresh state",
      arguments: WaitArgs,
      execute: async (
        args: z.infer<typeof WaitArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "volume");
        const targets = args.status.split(",").map((s) => s.trim()).filter(
          Boolean,
        );
        const raw = await waitForStatus(ENDPOINT, stored.id, targets, {
          token: tokenOf(ctx),
          intervalMs: args.interval_seconds * 1000,
          timeoutMs: args.timeout_seconds * 1000,
          signal: ctx.signal,
        });
        const handle = await ctx.writeResource(
          "state",
          instanceName(raw.label),
          toState(raw),
        );
        return { dataHandles: [handle], result: { status: raw.status } };
      },
    },
  },
};
