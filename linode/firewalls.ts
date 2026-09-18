/**
 * Swamp model for Linode Cloud Firewalls (`/networking/firewalls`): create,
 * adopt, update, sync, list, delete, replace rules, and attach/detach Linode
 * instances as devices. Registered as `@craftquest/linode/firewalls`.
 *
 * @module
 */

import { z } from "npm:zod@4";
import {
  compact,
  instanceName,
  type Json,
  listAll,
  request,
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

const ENDPOINT = "/networking/firewalls";

/** One firewall rule as the API represents it. */
const RuleSchema = z.object({
  action: z.enum(["ACCEPT", "DROP"]),
  protocol: z.enum(["TCP", "UDP", "ICMP", "IPENCAP"]),
  ports: z.string().optional().describe(
    "e.g. 22, 80-443, 22,80,443 (omit for ICMP)",
  ),
  addresses: z.object({
    ipv4: z.array(z.string()).optional(),
    ipv6: z.array(z.string()).optional(),
  }),
  label: z.string().optional(),
  description: z.string().optional(),
});

/** Global arguments: the desired firewall plus the API token. */
const GlobalArgsSchema = z.object({
  token: z.string().default("").meta({ sensitive: true }).describe(
    "Linode personal access token (vault-supplied); falls back to LINODE_TOKEN",
  ),
  label: z.string().default("").describe(
    "Firewall label (3-32 chars); also the state name",
  ),
  tags: z.array(z.string()).default([]),
  inbound_policy: z.enum(["ACCEPT", "DROP"]).default("DROP").describe(
    "Default for inbound traffic not matched by a rule",
  ),
  outbound_policy: z.enum(["ACCEPT", "DROP"]).default("ACCEPT").describe(
    "Default for outbound traffic not matched by a rule",
  ),
  inbound: z.array(RuleSchema).default([]).describe(
    "Inbound rules, first match wins",
  ),
  outbound: z.array(RuleSchema).default([]).describe(
    "Outbound rules, first match wins",
  ),
  linodes: z.array(z.number().int()).default([]).describe(
    "Linode instance IDs to attach at creation",
  ),
  status: z.enum(["enabled", "disabled"]).optional().describe("Update only"),
});

/** Resolved global arguments type. */
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** A device (attached entity) of a firewall. */
const DeviceSchema = z.object({
  id: z.number(),
  entityId: z.number(),
  entityType: z.string(),
  entityLabel: z.string().optional(),
});

/** Stored state of one firewall. */
const StateSchema = z.object({
  id: z.number(),
  label: z.string(),
  status: z.string(),
  tags: z.array(z.string()).optional(),
  rules: z.object({
    inbound: z.array(RuleSchema),
    outbound: z.array(RuleSchema),
    inbound_policy: z.string().optional(),
    outbound_policy: z.string().optional(),
    fingerprint: z.string().optional(),
    version: z.number().optional(),
  }).optional(),
  devices: z.array(DeviceSchema).optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  ...LifecycleFields,
});

/** Stored state type. */
type FirewallState = z.infer<typeof StateSchema>;

function toRule(raw: Json): z.infer<typeof RuleSchema> {
  const addresses = (raw.addresses ?? {}) as Json;
  return RuleSchema.parse(compact({
    action: raw.action,
    protocol: raw.protocol,
    ports: raw.ports ?? undefined,
    addresses: compact({
      ipv4: Array.isArray(addresses.ipv4) ? addresses.ipv4 : undefined,
      ipv6: Array.isArray(addresses.ipv6) ? addresses.ipv6 : undefined,
    }),
    label: raw.label ?? undefined,
    description: raw.description ?? undefined,
  }));
}

/** Map a raw device object onto {@link DeviceSchema}. */
function toDevice(raw: Json): z.infer<typeof DeviceSchema> {
  const entity = (raw.entity ?? {}) as Json;
  return DeviceSchema.parse(compact({
    id: raw.id,
    entityId: entity.id,
    entityType: String(entity.type ?? ""),
    entityLabel: typeof entity.label === "string" ? entity.label : undefined,
  }));
}

/** Map a raw firewall object onto {@link StateSchema}. */
function toState(raw: Json, devices?: Json[]): FirewallState {
  const rules = (raw.rules ?? {}) as Json;
  return StateSchema.parse(compact({
    id: raw.id,
    label: String(raw.label ?? ""),
    status: String(raw.status ?? "unknown"),
    tags: Array.isArray(raw.tags) ? raw.tags : undefined,
    rules: raw.rules
      ? compact({
        inbound: (Array.isArray(rules.inbound) ? rules.inbound as Json[] : [])
          .map(toRule),
        outbound:
          (Array.isArray(rules.outbound) ? rules.outbound as Json[] : []).map(
            toRule,
          ),
        inbound_policy: rules.inbound_policy,
        outbound_policy: rules.outbound_policy,
        fingerprint: rules.fingerprint,
        version: rules.version,
      })
      : undefined,
    devices: devices ? devices.map(toDevice) : undefined,
    created: raw.created,
    updated: raw.updated,
  }));
}

function rulesBody(a: GlobalArgs): Json {
  return {
    inbound_policy: a.inbound_policy,
    outbound_policy: a.outbound_policy,
    inbound: a.inbound,
    outbound: a.outbound,
  };
}

/** Build the POST /networking/firewalls body from the global arguments. */
function createBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  return compact({
    label: a.label,
    tags: a.tags.length ? a.tags : undefined,
    rules: rulesBody(a),
    devices: a.linodes.length ? { linodes: a.linodes } : undefined,
  });
}

/** Build the PUT /networking/firewalls/{id} body from the global arguments. */
function updateBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  return compact({
    label: a.label || undefined,
    tags: a.tags,
    status: a.status,
  });
}

const crud = makeCrudMethods({
  endpoint: ENDPOINT,
  noun: "firewall",
  toState: (raw) => toState(raw),
  createBody,
  updateBody,
  confirmDelete: false,
});

const LinodeArgs = z.object({
  linode_id: z.number().int().describe("Linode instance ID"),
});

function tokenOf(ctx: Ctx): string | undefined {
  const t = ctx.globalArgs.token;
  return typeof t === "string" && t.length ? t : undefined;
}

async function fetchDevices(ctx: Ctx, id: number): Promise<Json[]> {
  const { items } = await listAll(`${ENDPOINT}/${id}/devices`, {
    token: tokenOf(ctx),
    signal: ctx.signal,
  });
  return items;
}

/** Re-read the firewall plus its devices and write state. */
async function refresh(ctx: Ctx, id: number): Promise<MethodResult> {
  const raw = await request("GET", `${ENDPOINT}/${id}`, {
    token: tokenOf(ctx),
    signal: ctx.signal,
  });
  if (!raw) throw new Error(`Firewall ${id} not found`);
  const devices = await fetchDevices(ctx, id);
  const state = toState(raw, devices);
  const handle = await ctx.writeResource(
    "state",
    instanceName(raw.label),
    state,
  );
  return { dataHandles: [handle], result: { devices: state.devices } };
}

/**
 * Swamp model for Linode Cloud Firewalls. Registered as
 * `@craftquest/linode/firewalls`.
 */
export const model = {
  type: "@craftquest/linode/firewalls",
  version: "2026.09.18.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    state: {
      description:
        "Firewall state (rules and devices), one resource per firewall named by label",
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
    update_rules: {
      description:
        "Replace the stored firewall's entire inbound/outbound rule sets and policies with the global arguments (PUT /rules)",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "firewall");
        const a = GlobalArgsSchema.parse(ctx.globalArgs);
        ctx.logger.info(
          "Replacing rules on firewall {id} ({inbound} in / {outbound} out)",
          {
            id: stored.id,
            inbound: a.inbound.length,
            outbound: a.outbound.length,
          },
        );
        await request("PUT", `${ENDPOINT}/${stored.id}/rules`, {
          token: tokenOf(ctx),
          body: rulesBody(a),
          signal: ctx.signal,
        });
        return refresh(ctx, stored.id);
      },
    },
    list_devices: {
      description:
        "Fetch the entities attached to the stored firewall and record them in state",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "firewall");
        return refresh(ctx, stored.id);
      },
    },
    attach: {
      description:
        "Attach a Linode instance to the stored firewall (no-op if already attached)",
      arguments: LinodeArgs,
      execute: async (
        args: z.infer<typeof LinodeArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "firewall");
        const existing = (await fetchDevices(ctx, stored.id)).map(toDevice);
        if (
          existing.some((d) =>
            d.entityType === "linode" && d.entityId === args.linode_id
          )
        ) {
          ctx.logger.warn("Linode {linode} already attached to firewall {id}", {
            linode: args.linode_id,
            id: stored.id,
          });
        } else {
          ctx.logger.info("Attaching Linode {linode} to firewall {id}", {
            linode: args.linode_id,
            id: stored.id,
          });
          await request("POST", `${ENDPOINT}/${stored.id}/devices`, {
            token: tokenOf(ctx),
            body: { id: args.linode_id, type: "linode" },
            signal: ctx.signal,
          });
        }
        return refresh(ctx, stored.id);
      },
    },
    detach: {
      description:
        "Detach a Linode instance from the stored firewall (no-op if not attached)",
      arguments: LinodeArgs,
      execute: async (
        args: z.infer<typeof LinodeArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> => {
        const stored = await readStoredState(ctx, "firewall");
        const device = (await fetchDevices(ctx, stored.id)).map(toDevice).find((
          d,
        ) => d.entityType === "linode" && d.entityId === args.linode_id);
        if (!device) {
          ctx.logger.warn("Linode {linode} is not attached to firewall {id}", {
            linode: args.linode_id,
            id: stored.id,
          });
        } else {
          ctx.logger.info("Detaching Linode {linode} from firewall {id}", {
            linode: args.linode_id,
            id: stored.id,
          });
          await request(
            "DELETE",
            `${ENDPOINT}/${stored.id}/devices/${device.id}`,
            {
              token: tokenOf(ctx),
              allowNotFound: true,
              signal: ctx.signal,
            },
          );
        }
        return refresh(ctx, stored.id);
      },
    },
  },
};
