import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  laravelCloudToken: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe("Laravel Cloud API bearer token (vault-supplied, org-scoped)"),
  environmentId: z
    .string()
    .default("")
    .describe("Target environment ID (list/create instances)"),
  instanceId: z
    .string()
    .default("")
    .describe("Target instance ID (get/update/delete, queue and job methods)"),
  confirmInstanceId: z
    .string()
    .default("")
    .describe(
      "Safety gate for delete_instance and purge_queue: must exactly equal instanceId",
    ),
  jobId: z
    .string()
    .default("")
    .describe("Target failed-job ID (retry_failed_job, delete_failed_job)"),
  confirmJobId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal jobId"),
  processId: z
    .string()
    .default("")
    .describe("Target background-process ID (get/update/delete)"),
  confirmProcessId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal processId"),
  createPayload: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe(
      'JSON object for create_instance / create_background_process. Background processes need config.connection and config.queue, e.g. {"type":"worker","processes":1,"command":"php artisan queue:work","config":{"connection":"sqs","queue":"default"}}',
    ),
  updatePayload: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe(
      "JSON object of fields to change for update_instance / update_background_process",
    ),
});

const InstanceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  instanceType: z.string(),
  size: z.string().optional(),
  scalingType: z.string().optional(),
  minReplicas: z.number().optional(),
  maxReplicas: z.number().nullable().optional(),
  queueStatus: z.string().nullable().optional(),
  paused: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  usesScheduler: z.boolean().optional(),
  createdAt: z.string().optional(),
});

const InstancesSchema = z.object({
  environmentId: z.string(),
  instances: z.array(InstanceSummarySchema),
  instanceCount: z.number(),
  syncedAt: z.string(),
});

const InstanceSchema = InstanceSummarySchema.extend({
  visibilityTimeout: z.number().optional(),
  shutdownTimeout: z.number().optional(),
  updatedAt: z.string(),
});

const InstanceSizesSchema = z.object({
  sizes: z.array(
    z.object({
      group: z.string(),
      name: z.string(),
      label: z.string().optional(),
      cpuCount: z.number().optional(),
      memoryMib: z.number().optional(),
    }),
  ),
  syncedAt: z.string(),
});

const FailedJobsSchema = z.object({
  instanceId: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      queue: z.string().optional(),
      failedAt: z.string().optional(),
      attempts: z.number().optional(),
      exception: z.string().optional().describe("Truncated to 1000 chars"),
      retriedAt: z.string().nullable().optional(),
    }),
  ),
  jobCount: z.number(),
  syncedAt: z.string(),
});

const ProcessSummarySchema = z.object({
  id: z.string(),
  processType: z.string(),
  processes: z.number().optional(),
  command: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

const ProcessesSchema = z.object({
  instanceId: z.string(),
  processes: z.array(ProcessSummarySchema),
  processCount: z.number(),
  syncedAt: z.string(),
});

const ProcessSchema = ProcessSummarySchema.extend({
  updatedAt: z.string(),
});

type InstancesData = z.infer<typeof InstancesSchema>;
type FailedJobsData = z.infer<typeof FailedJobsSchema>;
type ProcessesData = z.infer<typeof ProcessesSchema>;

// deno-lint-ignore no-explicit-any
type Context = any;
// deno-lint-ignore no-explicit-any
type Json = any;

// --- Helpers ---

const LC_API_BASE = "https://cloud.laravel.com/api";
const SYNC_MAX_PAGES = 100;
const EXCEPTION_CAP = 1000;

// HTTP methods safe to replay after a 5xx: the server either performed the
// operation or it didn't, and repeating it changes nothing further.
const IDEMPOTENT_METHODS = ["GET", "HEAD", "PUT", "DELETE"];

/**
 * An HTTP-level failure from the Laravel Cloud API, carrying the status code
 * so callers can react to it structurally rather than by matching on the
 * response text.
 */
class LcApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LcApiError";
    this.status = status;
  }
}

/**
 * Pause execution for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert a Retry-After header (delay in seconds) to milliseconds, falling
 * back to 2s when it is absent or not a usable number. A literal `0` is
 * honored rather than treated as missing.
 */
function retryAfterMs(header: string | null): number {
  const seconds = header === null ? Number.NaN : Number(header);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 2) * 1000;
}

/**
 * Call the Laravel Cloud API with bearer auth and return the parsed JSON
 * body.
 *
 * Retry policy: a 429 is always retried once (honoring Retry-After) because
 * the request was rejected before it ran. A 5xx is retried only for
 * idempotent methods — a 5xx can arrive *after* Laravel Cloud already acted,
 * so replaying a POST could purge a queue or create a second instance.
 *
 * Errors carry the HTTP status and truncated response body — never the
 * token. With `allowNotFound`, a 404 returns null (for idempotent deletes).
 */
async function lcApi(
  tokenArg: string,
  method: string,
  path: string,
  body?: unknown,
  opts: { allowNotFound?: boolean } = {},
): Promise<Json> {
  // vault-wired argument first; LARAVEL_CLOUD_TOKEN env var as fallback
  // (Hetzner-style zero-setup: export the var and run @type-prefixed methods)
  const token = tokenArg || Deno.env.get("LARAVEL_CLOUD_TOKEN") || "";
  if (!token) {
    throw new Error(
      "No Laravel Cloud token: wire LARAVEL_CLOUD_TOKEN into the laravel-cloud-secrets vault (recommended) or export it as an environment variable.",
    );
  }
  const url = path.startsWith("https://") ? path : `${LC_API_BASE}${path}`;

  for (let attempt = 1;; attempt++) {
    const res = await fetch(url, {
      method,
      // A JSON API that answers with a redirect is signalling a rejected
      // request, not a resource move (Laravel bounces some failures to an
      // HTML page). Surface the 3xx instead of chasing it into markup.
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();

    if (res.ok) {
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        throw new LcApiError(
          `Laravel Cloud API ${method} ${path} returned a non-JSON body (${res.status}, content-type ${
            res.headers.get("content-type") ?? "unknown"
          }): ${text.slice(0, 200)}`,
          res.status,
        );
      }
    }
    if (res.status >= 300 && res.status < 400) {
      throw new LcApiError(
        `Laravel Cloud API ${method} ${path} redirected (${res.status}) instead of returning JSON — the request was rejected, commonly by validation.`,
        res.status,
      );
    }
    if (res.status === 404 && opts.allowNotFound) {
      return null;
    }
    const retryable = res.status === 429 ||
      (res.status >= 500 &&
        IDEMPOTENT_METHODS.includes(method.toUpperCase()));
    if (retryable && attempt === 1) {
      await sleep(retryAfterMs(res.headers.get("Retry-After")));
      continue;
    }
    throw new LcApiError(
      `Laravel Cloud API ${method} ${path} failed (${res.status}): ${
        text.slice(0, 500)
      }`,
      res.status,
    );
  }
}

/**
 * Walk a paginated JSON:API list endpoint to completion via `links.next`.
 */
async function lcPaginate(
  token: string,
  path: string,
  context: Context,
): Promise<Json[]> {
  const items: Json[] = [];
  let next: string | null = path;
  for (let page = 1; page <= SYNC_MAX_PAGES && next; page++) {
    const res: Json = await lcApi(token, "GET", next);
    items.push(...(res.data ?? []));
    next = res.links?.next ?? null;
    if (page === SYNC_MAX_PAGES && next) {
      context.logger.warn(
        "Stopped at page cap ({cap}); list may be incomplete",
        { cap: SYNC_MAX_PAGES },
      );
    }
  }
  return items;
}

/**
 * Map a JSON:API instance resource to the summary shape.
 */
function toInstanceSummary(raw: Json): z.infer<typeof InstanceSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    instanceType: a.type,
    size: a.size ?? undefined,
    scalingType: a.scaling_type ?? undefined,
    minReplicas: a.min_replicas ?? undefined,
    maxReplicas: a.max_replicas ?? null,
    queueStatus: a.queue_status ?? null,
    paused: a.paused ?? undefined,
    isDefault: a.is_default ?? undefined,
    usesScheduler: a.uses_scheduler ?? undefined,
    createdAt: a.created_at ?? undefined,
  };
}

/**
 * Map a JSON:API instance resource to the detail shape.
 */
function toInstanceDetail(raw: Json): z.infer<typeof InstanceSchema> {
  const a = raw.attributes ?? {};
  return {
    ...toInstanceSummary(raw),
    visibilityTimeout: a.visibility_timeout ?? undefined,
    shutdownTimeout: a.shutdown_timeout ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a JSON:API background-process resource to the summary shape.
 */
function toProcessSummary(raw: Json): z.infer<typeof ProcessSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    processType: a.type,
    processes: a.processes ?? undefined,
    command: a.command ?? null,
    createdAt: a.created_at ?? undefined,
  };
}

/**
 * Assert a response carries a `data` payload and return it.
 */
function requireData(res: Json, what: string): Json {
  if (!res?.data) {
    throw new Error(
      `Laravel Cloud API response for ${what} had no data payload.`,
    );
  }
  return res.data;
}

/**
 * Require a non-empty global argument, with a method-specific error message.
 */
function requireArg(value: string, name: string, method: string): string {
  if (!value) {
    throw new Error(`${method} requires the '${name}' argument to be set.`);
  }
  return value;
}

/**
 * Parse a JSON-object argument, with a helpful error naming the argument.
 */
function parseJsonObject(value: string, name: string, method: string): Json {
  requireArg(value, name, method);
  let parsed: Json;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${method}: '${name}' must be a JSON object (parse failed).`,
    );
  }
  if (
    typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
    Object.keys(parsed).length === 0
  ) {
    throw new Error(`${method}: '${name}' must be a non-empty JSON object.`);
  }
  return parsed;
}

/**
 * Enforce the confirm-gate: the confirmation must exactly equal the target.
 */
function requireConfirm(
  target: string,
  confirm: string,
  confirmName: string,
  what: string,
): void {
  if (confirm !== target) {
    throw new Error(
      `Refused: ${confirmName} does not match. Re-state the exact ${what} to confirm — this operation is destructive.`,
    );
  }
}

/**
 * Decide whether a failed state-transition call actually means "the instance
 * is already in the state you asked for" — which is success, not failure.
 *
 * Laravel Cloud signals this with a 409 Conflict; the phrase list is a
 * secondary signal kept for older/alternate responses. Matching the status
 * first means a reworded message alone cannot turn pause/resume back into a
 * hard failure — which matters because @craftquest/safe-deploy's cleanup job
 * depends on resume_queue succeeding to un-park a deploy that failed.
 *
 * Every caller re-fetches the instance afterwards, so if this guess is ever
 * wrong the stored state still reflects reality.
 */
function isAlreadyInDesiredState(err: unknown, phrases: string[]): boolean {
  if (err instanceof LcApiError && err.status === 409) return true;
  const message = err instanceof Error ? err.message : "";
  return phrases.some((phrase) => message.includes(phrase));
}

/**
 * Read the stored instances list and require the target to be in it.
 */
async function requireKnownInstance(
  context: Context,
  instanceId: string,
  method: string,
): Promise<z.infer<typeof InstanceSummarySchema>> {
  const stored = (await context.readResource!("instances")) as
    | InstancesData
    | null;
  const known = stored?.instances?.find((i) => i.id === instanceId);
  if (!known) {
    throw new Error(
      `${method} refused: instance ${instanceId} is not in the stored list. ` +
        "Run list_instances for its environment first.",
    );
  }
  return known;
}

/**
 * Fetch one instance and persist its detail.
 */
async function fetchAndWriteInstance(
  context: Context,
  instanceId: string,
): Promise<{ dataHandles: Json[] }> {
  const { laravelCloudToken } = context.globalArgs;
  const res = await lcApi(laravelCloudToken, "GET", `/instances/${instanceId}`);
  const data = requireData(res, `instance ${instanceId}`);
  context.logger.info("Fetched instance {name} ({type})", {
    name: data.attributes?.name,
    type: data.attributes?.type,
  });
  const handle = await context.writeResource(
    "instance",
    "instance",
    toInstanceDetail(data),
  );
  return { dataHandles: [handle] };
}

// --- Model ---

/**
 * Operates Laravel Cloud compute instances, managed queues, and background
 * processes: list/create/update/delete instances, pause/resume/purge queues,
 * retry or delete failed jobs, and manage background worker processes.
 *
 * Part of @craftquest/laravel-cloud (queues domain). Auth is an org-scoped
 * bearer token supplied via a vault expression. Deletes and queue purges are
 * confirmation-gated (a purge permanently destroys pending jobs); pausing
 * and resuming are reversible and ungated. Failed-job exceptions are stored
 * truncated.
 */
export const model = {
  type: "@craftquest/laravel-cloud/queues",
  version: "2026.08.12.2",
  upgrades: [
    {
      toVersion: "2026.08.10.3",
      description: "Usage + spend report phase; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.10.4",
      description:
        "safe-deploy workflow + run_command fails on nonzero exit + idempotent queue pause/resume; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.10.5",
      description:
        "LARAVEL_CLOUD_TOKEN environment fallback for zero-setup use; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.10.6",
      description:
        "README leads with the agent-first interface; no code changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.11.1",
      description:
        "5xx retries restricted to idempotent methods (a replayed POST could purge a queue or create a second instance), and pause/resume/set_default idempotency now keys on a 409 rather than only on API message text; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.12.1",
      description:
        "Version bump alongside the metrics fix in the apps and data models; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.12.2",
      description:
        "Background-process requirements documented from live verification — config.connection and config.queue are required, and they do not attach to managed_queue instances; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  globalArguments: GlobalArgsSchema,
  resources: {
    instances: {
      description: "Instances of the most recently listed environment",
      schema: InstancesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    instance: {
      description: "Most recently touched instance",
      schema: InstanceSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    instanceSizes: {
      description: "Available instance sizes by group",
      schema: InstanceSizesSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    failedJobs: {
      description: "Failed jobs of the most recently inspected managed queue",
      schema: FailedJobsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    processes: {
      description: "Background processes of the most recently listed instance",
      schema: ProcessesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    process: {
      description: "Most recently touched background process",
      schema: ProcessSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
  },
  checks: {
    "lc-credentials": {
      description: "Verify the Laravel Cloud token is wired in from the vault",
      execute: (context: Context) => {
        const token = context.globalArgs.laravelCloudToken ||
          Deno.env.get("LARAVEL_CLOUD_TOKEN");
        return Promise.resolve(
          token ? { pass: true } : {
            pass: false,
            errors: [
              "No Laravel Cloud token: wire LARAVEL_CLOUD_TOKEN into the vault (recommended) or export it as an environment variable.",
            ],
          },
        );
      },
    },
    "lc-auth": {
      description: "Verify the token authenticates (1 cheap API call)",
      labels: ["live"],
      execute: async (context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        try {
          await lcApi(laravelCloudToken, "GET", "/meta/organization");
          return { pass: true };
        } catch (err) {
          return {
            pass: false,
            errors: [
              `Laravel Cloud authentication failed: ${(err as Error).message}`,
            ],
          };
        }
      },
    },
  },
  methods: {
    list_instances: {
      description:
        "List an environment's compute/queue instances (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "list_instances",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/environments/${environmentId}/instances`,
          context,
        );
        const instances = items.map(toInstanceSummary);
        context.logger.info("Environment {id} has {count} instance(s)", {
          id: environmentId,
          count: instances.length,
        });
        const handle = await context.writeResource("instances", "instances", {
          environmentId,
          instances,
          instanceCount: instances.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_instance: {
      description: "Fetch one instance's detail (instanceId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "get_instance",
        );
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    list_instance_sizes: {
      description:
        "List available instance sizes by group — run before create_instance",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const res = await lcApi(laravelCloudToken, "GET", "/instances/sizes");
        const sizes: Json[] = [];
        for (const [group, list] of Object.entries(res.data ?? {})) {
          for (const item of (list as Json[]) ?? []) {
            sizes.push({
              group,
              name: item.name ?? "",
              label: item.label ?? undefined,
              cpuCount: item.cpu_count ?? undefined,
              memoryMib: item.memory_mib ?? undefined,
            });
          }
        }
        context.logger.info(
          "{count} instance size(s) across {groups} group(s)",
          {
            count: sizes.length,
            groups: Object.keys(res.data ?? {}).length,
          },
        );
        const handle = await context.writeResource(
          "instanceSizes",
          "instanceSizes",
          { sizes, syncedAt: new Date().toISOString() },
        );
        return { dataHandles: [handle] };
      },
    },

    create_instance: {
      description:
        "Create an instance on an environment (environmentId + createPayload arguments; required fields: name, type, size, scaling_type, min_replicas, visibility_timeout, shutdown_timeout)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, createPayload } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "create_instance",
        );
        const payload = parseJsonObject(
          createPayload,
          "createPayload",
          "create_instance",
        );
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/instances`,
          payload,
        );
        const data = requireData(res, "created instance");
        context.logger.info("Created instance {name} ({id}, {type})", {
          name: data.attributes?.name,
          id: data.id,
          type: data.attributes?.type,
        });
        const handle = await context.writeResource(
          "instance",
          "instance",
          toInstanceDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    update_instance: {
      description:
        "Update instance settings (instanceId + updatePayload arguments, e.g. size, min_replicas, uses_scheduler)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "update_instance",
        );
        const payload = parseJsonObject(
          updatePayload,
          "updatePayload",
          "update_instance",
        );
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/instances/${instanceId}`,
          payload,
        );
        context.logger.info("Updated instance {id}: {fields}", {
          id: instanceId,
          fields: Object.keys(payload).join(", "),
        });
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    delete_instance: {
      description:
        "Delete an instance. Gated: confirmInstanceId must equal instanceId, and the instance must be in the stored list (run list_instances first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, instanceId, confirmInstanceId } =
          context.globalArgs;
        requireArg(instanceId, "instanceId", "delete_instance");
        requireConfirm(
          instanceId,
          confirmInstanceId,
          "confirmInstanceId",
          "instance ID",
        );
        const known = await requireKnownInstance(
          context,
          instanceId,
          "delete_instance",
        );
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/instances/${instanceId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Instance {id} was already gone", {
            id: instanceId,
          });
        } else {
          context.logger.info("Deleted instance {name} ({id})", {
            name: known.name,
            id: instanceId,
          });
        }
        const stored = (await context.readResource!("instances")) as
          | InstancesData
          | null;
        const instances = stored!.instances.filter((i) => i.id !== instanceId);
        const handle = await context.writeResource("instances", "instances", {
          environmentId: stored!.environmentId,
          instances,
          instanceCount: instances.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    pause_queue: {
      description:
        "Pause a managed queue (instanceId argument) — reversible, jobs wait",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "pause_queue",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/pause`,
        ).then(() => {
          context.logger.info("Queue {id} paused", { id: instanceId });
        }).catch((err: unknown) => {
          // idempotent: already-paused is success, not failure
          if (!isAlreadyInDesiredState(err, ["already paused"])) throw err;
          context.logger.info("Queue {id} was already paused", {
            id: instanceId,
          });
        });
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    resume_queue: {
      description: "Resume a paused managed queue (instanceId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "resume_queue",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/resume`,
        ).then(() => {
          context.logger.info("Queue {id} resumed", { id: instanceId });
        }).catch((err: unknown) => {
          // idempotent: not-paused is success, not failure
          if (
            !isAlreadyInDesiredState(err, ["not paused", "already running"])
          ) {
            throw err;
          }
          context.logger.info("Queue {id} was not paused", { id: instanceId });
        });
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    purge_queue: {
      description:
        "Permanently discard ALL pending jobs on a managed queue. Gated: confirmInstanceId must equal instanceId, and the instance must be in the stored list.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, instanceId, confirmInstanceId } =
          context.globalArgs;
        requireArg(instanceId, "instanceId", "purge_queue");
        requireConfirm(
          instanceId,
          confirmInstanceId,
          "confirmInstanceId",
          "instance ID",
        );
        await requireKnownInstance(context, instanceId, "purge_queue");
        await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/purge`,
        );
        context.logger.warn(
          "Queue {id} purged — all pending jobs were discarded",
          { id: instanceId },
        );
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    set_default_queue: {
      description:
        "Make a managed queue the environment's default (instanceId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "set_default_queue",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/default`,
        ).then(() => {
          context.logger.info("Queue {id} is now the default", {
            id: instanceId,
          });
        }).catch((err: unknown) => {
          // idempotent: already-default is success, not failure
          if (!isAlreadyInDesiredState(err, ["already the default"])) throw err;
          context.logger.info("Queue {id} was already the default", {
            id: instanceId,
          });
        });
        return await fetchAndWriteInstance(context, instanceId);
      },
    },

    list_failed_jobs: {
      description:
        "List a managed queue's failed jobs (instanceId argument; exceptions truncated)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "list_failed_jobs",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/instances/${instanceId}/failed-jobs`,
          context,
        );
        const jobs = items.map((j: Json) => ({
          id: j.id,
          name: j.attributes?.name ?? undefined,
          queue: j.attributes?.queue ?? undefined,
          failedAt: j.attributes?.failed_at ?? undefined,
          attempts: j.attributes?.attempts ?? undefined,
          exception: typeof j.attributes?.exception === "string"
            ? j.attributes.exception.slice(0, EXCEPTION_CAP)
            : undefined,
          retriedAt: j.attributes?.retried_at ?? null,
        }));
        context.logger.info("Queue {id} has {count} failed job(s)", {
          id: instanceId,
          count: jobs.length,
        });
        const handle = await context.writeResource("failedJobs", "failedJobs", {
          instanceId,
          jobs,
          jobCount: jobs.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    retry_failed_job: {
      description:
        "Retry a failed job (instanceId + jobId arguments) — the job re-enters the queue",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, jobId } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "retry_failed_job",
        );
        requireArg(jobId, "jobId", "retry_failed_job");
        await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/failed-jobs/${jobId}/retry`,
        );
        context.logger.info("Failed job {jobId} queued for retry", { jobId });
        return { dataHandles: [] };
      },
    },

    delete_failed_job: {
      description:
        "Delete a failed job permanently. Gated: confirmJobId must equal jobId, and the job must be in the stored failed-jobs list.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, instanceId, jobId, confirmJobId } =
          context.globalArgs;
        requireArg(instanceId, "instanceId", "delete_failed_job");
        requireArg(jobId, "jobId", "delete_failed_job");
        requireConfirm(jobId, confirmJobId, "confirmJobId", "job ID");
        const stored = (await context.readResource!("failedJobs")) as
          | FailedJobsData
          | null;
        const known = (stored?.instanceId === instanceId || undefined) &&
          stored!.jobs.find((j) => j.id === jobId);
        if (!known) {
          throw new Error(
            `Delete refused: job ${jobId} is not in the stored failed-jobs list for instance ${instanceId}. ` +
              "Run list_failed_jobs first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/instances/${instanceId}/failed-jobs/${jobId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Failed job {jobId} was already gone", { jobId });
        } else {
          context.logger.info("Deleted failed job {jobId}", { jobId });
        }
        const jobs = stored!.jobs.filter((j) => j.id !== jobId);
        const handle = await context.writeResource("failedJobs", "failedJobs", {
          instanceId,
          jobs,
          jobCount: jobs.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    list_background_processes: {
      description:
        "List an instance's background processes (instanceId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "list_background_processes",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/instances/${instanceId}/background-processes`,
          context,
        );
        const processes = items.map(toProcessSummary);
        context.logger.info(
          "Instance {id} has {count} background process(es)",
          {
            id: instanceId,
            count: processes.length,
          },
        );
        const handle = await context.writeResource("processes", "processes", {
          instanceId,
          processes,
          processCount: processes.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_background_process: {
      description:
        'Create a background process on an app/service/queue instance (instanceId + createPayload). Live-verified required shape: {"type":"worker","processes":1,"command":"php artisan queue:work","config":{"connection":"sqs","queue":"default"}} — config.connection and config.queue are required. NOT available on managed_queue instances, which take background_processes at creation instead.',
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, createPayload } = context.globalArgs;
        const instanceId = requireArg(
          context.globalArgs.instanceId,
          "instanceId",
          "create_background_process",
        );
        const payload = parseJsonObject(
          createPayload,
          "createPayload",
          "create_background_process",
        );
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/instances/${instanceId}/background-processes`,
          payload,
        );
        const data = requireData(res, "created background process");
        context.logger.info("Created background process {id} ({type})", {
          id: data.id,
          type: data.attributes?.type,
        });
        const handle = await context.writeResource("process", "process", {
          ...toProcessSummary(data),
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    update_background_process: {
      description:
        "Update a background process (processId + updatePayload arguments). The live-verified call sent the whole definition — type, processes, command and config.connection/config.queue — so send the full shape rather than only the field you are changing.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const processId = requireArg(
          context.globalArgs.processId,
          "processId",
          "update_background_process",
        );
        const payload = parseJsonObject(
          updatePayload,
          "updatePayload",
          "update_background_process",
        );
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/background-processes/${processId}`,
          payload,
        );
        context.logger.info("Updated background process {id}: {fields}", {
          id: processId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/background-processes/${processId}`,
        );
        const handle = await context.writeResource("process", "process", {
          ...toProcessSummary(
            requireData(res, `background process ${processId}`),
          ),
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    delete_background_process: {
      description:
        "Delete a background process. Gated: confirmProcessId must equal processId, and the process must be in the stored list (run list_background_processes first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, processId, confirmProcessId } =
          context.globalArgs;
        requireArg(processId, "processId", "delete_background_process");
        requireConfirm(
          processId,
          confirmProcessId,
          "confirmProcessId",
          "process ID",
        );
        const stored = (await context.readResource!("processes")) as
          | ProcessesData
          | null;
        const known = stored?.processes?.find((p) => p.id === processId);
        if (!known) {
          throw new Error(
            `Delete refused: background process ${processId} is not in the stored list. ` +
              "Run list_background_processes for its instance first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/background-processes/${processId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Background process {id} was already gone", {
            id: processId,
          });
        } else {
          context.logger.info("Deleted background process {id}", {
            id: processId,
          });
        }
        const processes = stored!.processes.filter((p) => p.id !== processId);
        const handle = await context.writeResource("processes", "processes", {
          instanceId: stored!.instanceId,
          processes,
          processCount: processes.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
