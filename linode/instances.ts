/**
 * Swamp model for Linode compute instances (`/linode/instances`): create,
 * adopt, update, sync, list, delete (confirmation-gated), plus boot, shutdown,
 * reboot and wait-for-status actions. Registered as
 * `@craftquest/linode/instances`.
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

const ENDPOINT = "/linode/instances";

/** Global arguments: the desired instance plus the API token. */
const GlobalArgsSchema = z.object({
  token: z.string().default("").meta({ sensitive: true }).describe(
    "Linode personal access token (vault-supplied); falls back to LINODE_TOKEN",
  ),
  label: z.string().default("").describe(
    "Instance label, unique on the account (3-64 chars); also the state name",
  ),
  region: z.string().default("").describe(
    "Region ID, e.g. us-east, eu-central",
  ),
  type: z.string().default("g6-nanode-1").describe(
    "Plan/type ID, e.g. g6-nanode-1, g6-standard-2 (see catalog list_types)",
  ),
  image: z.string().default("linode/ubuntu24.04").describe(
    "Image ID to deploy, e.g. linode/ubuntu24.04",
  ),
  root_pass: z.string().default("").meta({ sensitive: true }).describe(
    "Root password (vault-supplied). Optional when authorized_keys is set",
  ),
  authorized_keys: z.array(z.string()).default([]).describe(
    "Public SSH keys (key text) appended to root's authorized_keys",
  ),
  authorized_users: z.array(z.string()).default([]).describe(
    "Linode usernames whose profile SSH keys are installed for root",
  ),
  tags: z.array(z.string()).default([]).describe(
    "Tags applied to the instance",
  ),
  private_ip: z.boolean().default(false).describe(
    "Also allocate a private IPv4",
  ),
  backups_enabled: z.boolean().default(false).describe(
    "Enable the paid Backup service",
  ),
  booted: z.boolean().default(true).describe("Boot after provisioning"),
  firewall_id: z.number().int().optional().describe(
    "Cloud Firewall ID to attach at creation",
  ),
  stackscript_id: z.number().int().optional().describe(
    "StackScript to run on first boot",
  ),
  stackscript_data: z.record(z.string(), z.string()).default({}).describe(
    "StackScript UDF values",
  ),
  user_data: z.string().default("").describe(
    "cloud-init user data (plain text; base64-encoded for the API)",
  ),
  watchdog_enabled: z.boolean().optional().describe(
    "Lassie shutdown watchdog (update only)",
  ),
});

/** Resolved global arguments type. */
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Stored state of one instance. */
const StateSchema = z.object({
  id: z.number(),
  label: z.string(),
  status: z.string(),
  region: z.string().optional(),
  type: z.string().optional(),
  image: z.string().nullable().optional(),
  ipv4: z.array(z.string()).optional(),
  ipv6: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  specs: z.object({
    disk: z.number().optional(),
    memory: z.number().optional(),
    vcpus: z.number().optional(),
    transfer: z.number().optional(),
    gpus: z.number().optional(),
  }).optional(),
  backupsEnabled: z.boolean().optional(),
  hypervisor: z.string().optional(),
  watchdogEnabled: z.boolean().optional(),
  hasUserData: z.boolean().optional(),
  ...LifecycleFields,
});

/** Stored state type. */
type InstanceState = z.infer<typeof StateSchema>;

/** Map a raw Linode instance object onto {@link StateSchema}. */
function toState(raw: Json): InstanceState {
  const specs = (raw.specs ?? {}) as Json;
  const backups = (raw.backups ?? {}) as Json;
  return StateSchema.parse(compact({
    id: raw.id,
    label: String(raw.label ?? ""),
    status: String(raw.status ?? "unknown"),
    region: raw.region,
    type: raw.type,
    image: raw.image ?? null,
    ipv4: Array.isArray(raw.ipv4) ? raw.ipv4 : undefined,
    ipv6: raw.ipv6 ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    created: raw.created,
    updated: raw.updated,
    specs: raw.specs
      ? compact({
        disk: specs.disk,
        memory: specs.memory,
        vcpus: specs.vcpus,
        transfer: specs.transfer,
        gpus: specs.gpus,
      })
      : undefined,
    backupsEnabled: typeof backups.enabled === "boolean"
      ? backups.enabled
      : undefined,
    hypervisor: raw.hypervisor,
    watchdogEnabled: raw.watchdog_enabled,
    hasUserData: raw.has_user_data,
  }));
}

/** UTF-8 safe base64 encoding for cloud-init user data. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Build the POST /linode/instances body from the global arguments. */
function createBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  if (!a.region) {
    throw new Error("globalArgs.region is required to create an instance");
  }
  if (
    !a.root_pass && a.authorized_keys.length === 0 &&
    a.authorized_users.length === 0
  ) {
    throw new Error(
      "Provide root_pass, authorized_keys, or authorized_users — Linode requires at least one way to log in",
    );
  }
  return compact({
    label: a.label,
    region: a.region,
    type: a.type,
    image: a.image || undefined,
    root_pass: a.root_pass || undefined,
    authorized_keys: a.authorized_keys.length ? a.authorized_keys : undefined,
    authorized_users: a.authorized_users.length
      ? a.authorized_users
      : undefined,
    tags: a.tags.length ? a.tags : undefined,
    private_ip: a.private_ip || undefined,
    backups_enabled: a.backups_enabled || undefined,
    booted: a.booted,
    firewall_id: a.firewall_id,
    stackscript_id: a.stackscript_id,
    stackscript_data:
      a.stackscript_id !== undefined && Object.keys(a.stackscript_data).length
        ? a.stackscript_data
        : undefined,
    metadata: a.user_data ? { user_data: toBase64(a.user_data) } : undefined,
  });
}

/** Build the PUT /linode/instances/{id} body from the global arguments. */
function updateBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  return compact({
    label: a.label || undefined,
    tags: a.tags,
    watchdog_enabled: a.watchdog_enabled,
  });
}

const crud = makeCrudMethods({
  endpoint: ENDPOINT,
  noun: "Linode instance",
  toState: (raw) => toState(raw),
  createBody,
  updateBody,
  confirmDelete: true,
});

const ConfigArgs = z.object({
  config_id: z.number().int().optional().describe(
    "Configuration profile to boot; defaults to the only/last-booted one",
  ),
});

const WaitArgs = z.object({
  status: z.string().default("running").describe(
    "Target status: running, offline, ... (comma-separate to accept several)",
  ),
  timeout_seconds: z.number().int().positive().default(300),
  interval_seconds: z.number().int().positive().default(5),
});

function tokenOf(ctx: Ctx): string | undefined {
  const t = ctx.globalArgs.token;
  return typeof t === "string" && t.length ? t : undefined;
}

/** Run an instance action (boot/shutdown/reboot) and refresh state. */
async function runAction(
  ctx: Ctx,
  action: "boot" | "shutdown" | "reboot",
  body?: Json,
): Promise<MethodResult> {
  const stored = await readStoredState(ctx, "Linode instance");
  ctx.logger.info(`Instance {id}: {action}`, { id: stored.id, action });
  await request("POST", `${ENDPOINT}/${stored.id}/${action}`, {
    token: tokenOf(ctx),
    body: body ?? {},
    signal: ctx.signal,
  });
  const raw = await request("GET", `${ENDPOINT}/${stored.id}`, {
    token: tokenOf(ctx),
    signal: ctx.signal,
  });
  if (!raw) {
    throw new Error(`Linode instance ${stored.id} vanished after ${action}`);
  }
  const handle = await ctx.writeResource(
    "state",
    instanceName(raw.label),
    toState(raw),
  );
  return { dataHandles: [handle], result: { status: raw.status } };
}

/**
 * Swamp model for Linode compute instances. Registered as
 * `@craftquest/linode/instances`.
 */
export const model = {
  type: "@craftquest/linode/instances",
  version: "2026.09.18.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    state: {
      description: "Instance state, one resource per instance named by label",
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
    boot: {
      description: "Boot the stored instance (POST /boot)",
      arguments: ConfigArgs,
      execute: (
        args: z.infer<typeof ConfigArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> =>
        runAction(ctx, "boot", compact({ config_id: args.config_id })),
    },
    shutdown: {
      description: "Shut the stored instance down (POST /shutdown)",
      arguments: z.object({}),
      execute: (
        _args: Record<string, never>,
        ctx: Ctx,
      ): Promise<MethodResult> => runAction(ctx, "shutdown"),
    },
    reboot: {
      description: "Reboot the stored instance (POST /reboot)",
      arguments: ConfigArgs,
      execute: (
        args: z.infer<typeof ConfigArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> =>
        runAction(ctx, "reboot", compact({ config_id: args.config_id })),
    },
    wait: {
      description:
        "Poll until the stored instance reaches the target status (default running) and refresh state",
      arguments: WaitArgs,
      execute: async (
        args: z.infer<typeof WaitArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "Linode instance");
        const targets = args.status.split(",").map((s) => s.trim()).filter(
          Boolean,
        );
        ctx.logger.info("Waiting for instance {id} to reach {targets}", {
          id: stored.id,
          targets: targets.join("|"),
        });
        const raw = await waitForStatus(ENDPOINT, stored.id, targets, {
          token: tokenOf(ctx),
          intervalMs: args.interval_seconds * 1000,
          timeoutMs: args.timeout_seconds * 1000,
          signal: ctx.signal,
          onPoll: (status) =>
            ctx.logger.debug("Instance {id} status {status}", {
              id: stored.id,
              status,
            }),
        });
        const handle = await ctx.writeResource(
          "state",
          instanceName(raw.label),
          toState(raw),
        );
        return {
          dataHandles: [handle],
          result: { status: raw.status, ipv4: raw.ipv4 },
        };
      },
    },
  },
};
