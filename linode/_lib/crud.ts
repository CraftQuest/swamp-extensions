/**
 * Generic create/get/update/delete/sync/list/lookup/adopt method factory for
 * label-addressed Linode resources. Each `@craftquest/linode/*` model spreads
 * the methods returned by {@link makeCrudMethods} and adds its own actions.
 *
 * @module
 */

import { z } from "npm:zod@4";
import { instanceName, type Json, listAll, request } from "./linode.ts";

/** Minimal structured logger shape used by the generated methods. */
export interface Logger {
  info(message: string, props?: Record<string, unknown>): void;
  warn(message: string, props?: Record<string, unknown>): void;
  debug(message: string, props?: Record<string, unknown>): void;
}

/** The subset of the swamp method context the generated methods use. */
export interface Ctx {
  globalArgs: Record<string, unknown>;
  logger: Logger;
  writeResource: (
    specName: string,
    name: string,
    data: Json,
  ) => Promise<{ name: string }>;
  readResource: (
    instanceName: string,
    version?: number,
  ) => Promise<Json | null>;
  signal?: AbortSignal;
}

/** Return shape of every generated method. */
export interface MethodResult {
  dataHandles: Array<{ name: string }>;
  result?: Json;
}

/** Per-resource configuration for {@link makeCrudMethods}. */
export interface CrudConfig {
  /** Collection path, e.g. `/linode/instances`. */
  endpoint: string;
  /** Human noun used in messages, e.g. `Linode instance`. */
  noun: string;
  /** Map a raw API object onto the model's `state` resource schema. */
  toState: (raw: Json) => Json;
  /** Build the POST body from the model's global arguments. */
  createBody: (g: Json) => Json;
  /** Build the PUT body from the model's global arguments. */
  updateBody: (g: Json) => Json;
  /** When true, `delete` requires `confirm_label` to equal the live label. */
  confirmDelete: boolean;
}

/** Arguments for `get`. */
export const IdArgs = z.object({
  id: z.number().int().describe("Linode-assigned numeric ID of the resource"),
});
/** Arguments for `delete`. */
export const DeleteArgs = z.object({
  id: z.number().int().describe("Numeric ID of the resource to delete"),
  confirm_label: z.string().optional().describe(
    "Safety gate: must exactly equal the resource's current label",
  ),
});
/** Arguments for `list`. */
export const ListArgs = z.object({
  filter: z.string().optional().describe(
    'Optional Linode X-Filter JSON, e.g. {"tags":"prod"} or {"label":{"+contains":"web"}}',
  ),
});
/** Arguments for `adopt`. */
export const AdoptArgs = z.object({
  id: z.number().int().describe("Numeric ID of the existing resource to adopt"),
  expected_label: z.string().optional().describe(
    "If set, adoption fails unless the live label matches",
  ),
});
/** Schema of the `listing` resource written by `list`. */
export const ListingSchema = z.object({
  items: z.array(z.object({
    id: z.number(),
    label: z.string(),
    status: z.string().optional(),
  })),
  count: z.number(),
  truncated: z.boolean(),
  listedAt: z.iso.datetime(),
});

/** Fields every `state` schema carries for delete/sync bookkeeping. */
export const LifecycleFields = {
  existed: z.boolean().optional().describe(
    "delete: whether the resource existed when delete ran",
  ),
  deletedAt: z.iso.datetime().optional(),
  syncedAt: z.iso.datetime().optional(),
};

/** Parse a user-supplied X-Filter JSON string, with a clear error. */
export function parseFilter(filter?: string): Json | undefined {
  if (!filter) return undefined;
  try {
    const parsed = JSON.parse(filter);
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed)
    ) {
      throw new Error("filter must be a JSON object");
    }
    return parsed as Json;
  } catch (err) {
    throw new Error(`Invalid filter JSON: ${(err as Error).message}`);
  }
}

/** Token from global arguments, if wired. */
function tokenOf(ctx: Ctx): string | undefined {
  const t = ctx.globalArgs.token;
  return typeof t === "string" && t.length ? t : undefined;
}

/** Read the stored `state` for the configured label; throws when absent. */
export async function readStoredState(
  ctx: Ctx,
  noun: string,
): Promise<Json & { id: number }> {
  const name = instanceName(ctx.globalArgs.label);
  const stored = await ctx.readResource(name);
  if (!stored || typeof stored.id !== "number") {
    throw new Error(
      `No stored state for ${noun} '${name}' — run create, lookup, or adopt first`,
    );
  }
  return stored as Json & { id: number };
}

/**
 * Build the standard CRUD method set for one Linode resource type.
 */
export function makeCrudMethods(cfg: CrudConfig): {
  create: {
    description: string;
    arguments: z.ZodObject<Record<string, never>>;
    execute: (_args: Record<string, never>, ctx: Ctx) => Promise<MethodResult>;
  };
  get: {
    description: string;
    arguments: typeof IdArgs;
    execute: (args: z.infer<typeof IdArgs>, ctx: Ctx) => Promise<MethodResult>;
  };
  update: {
    description: string;
    arguments: z.ZodObject<Record<string, never>>;
    execute: (_args: Record<string, never>, ctx: Ctx) => Promise<MethodResult>;
  };
  delete: {
    description: string;
    arguments: typeof DeleteArgs;
    execute: (
      args: z.infer<typeof DeleteArgs>,
      ctx: Ctx,
    ) => Promise<MethodResult>;
  };
  sync: {
    description: string;
    arguments: z.ZodObject<Record<string, never>>;
    execute: (_args: Record<string, never>, ctx: Ctx) => Promise<MethodResult>;
  };
  list: {
    description: string;
    arguments: typeof ListArgs;
    execute: (
      args: z.infer<typeof ListArgs>,
      ctx: Ctx,
    ) => Promise<MethodResult>;
  };
  lookup: {
    description: string;
    arguments: z.ZodObject<Record<string, never>>;
    execute: (_args: Record<string, never>, ctx: Ctx) => Promise<MethodResult>;
  };
  adopt: {
    description: string;
    arguments: typeof AdoptArgs;
    execute: (
      args: z.infer<typeof AdoptArgs>,
      ctx: Ctx,
    ) => Promise<MethodResult>;
  };
} {
  const { endpoint, noun } = cfg;

  async function writeState(ctx: Ctx, raw: Json): Promise<{ name: string }> {
    return await ctx.writeResource(
      "state",
      instanceName(raw.label),
      cfg.toState(raw),
    );
  }

  async function findByLabel(ctx: Ctx, label: string): Promise<Json[]> {
    const { items } = await listAll(endpoint, {
      token: tokenOf(ctx),
      filter: { label },
      signal: ctx.signal,
    });
    // Linode label filters are exact, but guard against partial matches anyway.
    return items.filter((i) => i.label === label);
  }

  return {
    create: {
      description:
        `Create a ${noun} from the global arguments. If one with the same label already exists it is adopted instead of duplicated.`,
      arguments: z.object({}),
      execute: async (_args, ctx) => {
        const g = ctx.globalArgs;
        const label = typeof g.label === "string" ? g.label : "";
        if (!label) {
          throw new Error(`globalArgs.label is required to create a ${noun}`);
        }
        const existing = await findByLabel(ctx, label);
        if (existing.length === 1) {
          ctx.logger.warn(
            `${noun} '{label}' already exists (id {id}); adopting instead of creating`,
            { label, id: existing[0].id },
          );
          const handle = await writeState(ctx, existing[0]);
          return {
            dataHandles: [handle],
            result: { created: false, id: existing[0].id },
          };
        }
        if (existing.length > 1) {
          throw new Error(
            `${existing.length} ${noun}s already carry label '${label}'; refusing to create another. Use adopt with a specific id.`,
          );
        }
        ctx.logger.info(`Creating ${noun} '{label}'`, { label });
        const raw = await request("POST", endpoint, {
          token: tokenOf(ctx),
          body: cfg.createBody(g),
          signal: ctx.signal,
        });
        if (!raw || typeof raw.id !== "number") {
          throw new Error(
            `Linode API returned no id when creating ${noun} '${label}'`,
          );
        }
        ctx.logger.info(`Created ${noun} '{label}' (id {id})`, {
          label,
          id: raw.id,
        });
        const handle = await writeState(ctx, raw);
        return { dataHandles: [handle], result: { created: true, id: raw.id } };
      },
    },

    get: {
      description: `Fetch a ${noun} by ID and store its state`,
      arguments: IdArgs,
      execute: async (args, ctx) => {
        ctx.logger.info(`Fetching ${noun} {id}`, { id: args.id });
        const raw = await request("GET", `${endpoint}/${args.id}`, {
          token: tokenOf(ctx),
          signal: ctx.signal,
        });
        if (!raw) throw new Error(`${noun} ${args.id} not found`);
        const handle = await writeState(ctx, raw);
        return { dataHandles: [handle] };
      },
    },

    update: {
      description:
        `Update the mutable attributes (label, tags, ...) of the stored ${noun} from the global arguments`,
      arguments: z.object({}),
      execute: async (_args, ctx) => {
        const stored = await readStoredState(ctx, noun);
        ctx.logger.info(`Updating ${noun} {id}`, { id: stored.id });
        const raw = await request("PUT", `${endpoint}/${stored.id}`, {
          token: tokenOf(ctx),
          body: cfg.updateBody(ctx.globalArgs),
          signal: ctx.signal,
        });
        if (!raw) throw new Error(`${noun} ${stored.id} not found`);
        const handle = await writeState(ctx, raw);
        return { dataHandles: [handle] };
      },
    },

    delete: {
      description: cfg.confirmDelete
        ? `Delete a ${noun} by ID. Gated: confirm_label must equal the live label. Already-deleted resources succeed.`
        : `Delete a ${noun} by ID. Already-deleted resources succeed.`,
      arguments: DeleteArgs,
      execute: async (args, ctx) => {
        const token = tokenOf(ctx);
        const live = await request("GET", `${endpoint}/${args.id}`, {
          token,
          allowNotFound: true,
          signal: ctx.signal,
        });
        const now = new Date().toISOString();
        if (!live) {
          ctx.logger.warn(`${noun} {id} already gone; nothing to delete`, {
            id: args.id,
          });
          const name = instanceName(
            args.confirm_label ?? ctx.globalArgs.label ?? args.id,
          );
          const handle = await ctx.writeResource("state", name, {
            id: args.id,
            label: String(
              args.confirm_label ?? ctx.globalArgs.label ?? args.id,
            ),
            status: "not_found",
            existed: false,
            deletedAt: now,
          });
          return { dataHandles: [handle], result: { existed: false } };
        }
        const label = String(live.label ?? "");
        if (cfg.confirmDelete && args.confirm_label !== label) {
          throw new Error(
            `Refusing to delete ${noun} ${args.id}: confirm_label ${
              args.confirm_label === undefined
                ? "is missing"
                : `'${args.confirm_label}' does not match`
            } the live label '${label}'`,
          );
        }
        ctx.logger.info(`Deleting ${noun} '{label}' (id {id})`, {
          label,
          id: args.id,
        });
        await request("DELETE", `${endpoint}/${args.id}`, {
          token,
          allowNotFound: true,
          signal: ctx.signal,
        });
        const handle = await ctx.writeResource("state", instanceName(label), {
          id: args.id,
          label,
          status: "deleted",
          existed: true,
          deletedAt: now,
        });
        return { dataHandles: [handle], result: { existed: true } };
      },
    },

    sync: {
      description:
        `Refresh the stored ${noun} state from the Linode API (marks not_found if it was deleted)`,
      arguments: z.object({}),
      execute: async (_args, ctx) => {
        const stored = await readStoredState(ctx, noun);
        const live = await request("GET", `${endpoint}/${stored.id}`, {
          token: tokenOf(ctx),
          allowNotFound: true,
          signal: ctx.signal,
        });
        const now = new Date().toISOString();
        if (live) {
          const handle = await ctx.writeResource(
            "state",
            instanceName(live.label),
            { ...cfg.toState(live), syncedAt: now },
          );
          return { dataHandles: [handle] };
        }
        ctx.logger.warn(`${noun} {id} no longer exists`, { id: stored.id });
        const handle = await ctx.writeResource(
          "state",
          instanceName(stored.label),
          {
            id: stored.id,
            label: String(stored.label ?? ""),
            status: "not_found",
            existed: false,
            syncedAt: now,
          },
        );
        return { dataHandles: [handle] };
      },
    },

    list: {
      description:
        `List every ${noun} on the account (optionally X-Filtered); writes one state resource per item plus a 'listing' summary`,
      arguments: ListArgs,
      execute: async (args, ctx) => {
        const { items, truncated } = await listAll(endpoint, {
          token: tokenOf(ctx),
          filter: parseFilter(args.filter),
          signal: ctx.signal,
        });
        ctx.logger.info(`Listed {count} ${noun}s`, {
          count: items.length,
          truncated,
        });
        const dataHandles: Array<{ name: string }> = [];
        for (const item of items) dataHandles.push(await writeState(ctx, item));
        const listing = ListingSchema.parse({
          items: items.map((i) => ({
            id: Number(i.id),
            label: String(i.label ?? ""),
            status: typeof i.status === "string" ? i.status : undefined,
          })),
          count: items.length,
          truncated,
          listedAt: new Date().toISOString(),
        });
        dataHandles.push(
          await ctx.writeResource("listing", "listing", listing),
        );
        return { dataHandles, result: { count: items.length, truncated } };
      },
    },

    lookup: {
      description:
        `Find the ${noun} whose label equals globalArgs.label and import it into state`,
      arguments: z.object({}),
      execute: async (_args, ctx) => {
        const label = typeof ctx.globalArgs.label === "string"
          ? ctx.globalArgs.label
          : "";
        if (!label) throw new Error(`globalArgs.label is required for lookup`);
        ctx.logger.info(`Looking up ${noun} '{label}'`, { label });
        const matches = await findByLabel(ctx, label);
        if (matches.length === 0) {
          throw new Error(`No ${noun} found with label '${label}'`);
        }
        if (matches.length > 1) {
          throw new Error(
            `${matches.length} ${noun}s carry label '${label}'; use adopt with a specific id`,
          );
        }
        const handle = await writeState(ctx, matches[0]);
        return { dataHandles: [handle], result: { id: matches[0].id } };
      },
    },

    adopt: {
      description:
        `Import an existing ${noun} into state by ID, optionally asserting its label`,
      arguments: AdoptArgs,
      execute: async (args, ctx) => {
        const raw = await request("GET", `${endpoint}/${args.id}`, {
          token: tokenOf(ctx),
          signal: ctx.signal,
        });
        if (!raw) throw new Error(`${noun} ${args.id} not found`);
        if (
          args.expected_label !== undefined && raw.label !== args.expected_label
        ) {
          throw new Error(
            `Identity mismatch: expected label '${args.expected_label}' but ${noun} ${args.id} is '${raw.label}'`,
          );
        }
        const handle = await writeState(ctx, raw);
        return { dataHandles: [handle], result: { id: raw.id } };
      },
    },
  };
}

/** Pre-flight checks shared by every model: token wired, token authenticates. */
export function makeChecks(): {
  "linode-token": {
    description: string;
    labels: string[];
    execute: (
      ctx: { globalArgs: Record<string, unknown> },
    ) => Promise<{ pass: boolean; errors?: string[] }>;
  };
  "linode-auth": {
    description: string;
    labels: string[];
    execute: (
      ctx: { globalArgs: Record<string, unknown> },
    ) => Promise<{ pass: boolean; errors?: string[] }>;
  };
} {
  return {
    "linode-token": {
      description:
        "A Linode API token is wired in (globalArgs.token or LINODE_TOKEN)",
      labels: ["policy"],
      execute: (ctx) => {
        const t = ctx.globalArgs.token;
        const explicit = typeof t === "string" && t.length > 0;
        if (explicit || Deno.env.get("LINODE_TOKEN")) {
          return Promise.resolve({ pass: true });
        }
        return Promise.resolve({
          pass: false,
          errors: [
            "No Linode token: wire globalArgs.token with vault.get(...) or export LINODE_TOKEN",
          ],
        });
      },
    },
    "linode-auth": {
      description: "The Linode token authenticates (one GET /profile call)",
      labels: ["live"],
      execute: async (ctx) => {
        const t = ctx.globalArgs.token;
        try {
          await request("GET", "/profile", {
            token: typeof t === "string" && t.length ? t : undefined,
          });
          return { pass: true };
        } catch (err) {
          return {
            pass: false,
            errors: [`Linode authentication failed: ${(err as Error).message}`],
          };
        }
      },
    },
  };
}
