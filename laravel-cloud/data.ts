import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  laravelCloudToken: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe("Laravel Cloud API bearer token (vault-supplied, org-scoped)"),
  clusterId: z
    .string()
    .default("")
    .describe("Target database cluster ID"),
  confirmClusterId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal clusterId"),
  clusterName: z
    .string()
    .default("")
    .describe("Cluster name for create_cluster (lowercase, 3-40 chars)"),
  databaseType: z
    .enum([
      "laravel_mysql_84",
      "laravel_mysql_8",
      "aws_rds_mysql_8",
      "aws_rds_postgres_18",
      "neon_serverless_postgres_18",
      "neon_serverless_postgres_17",
      "neon_serverless_postgres_16",
    ])
    .default("laravel_mysql_84")
    .describe("Database engine for create_cluster"),
  region: z
    .string()
    .default("us-east-2")
    .describe("Cloud region for create_cluster / create_cache"),
  clusterConfig: z
    .string()
    .default("")
    .describe(
      "Optional JSON config object for create_cluster (engine-specific, e.g. Neon compute units)",
    ),
  databaseName: z
    .string()
    .default("")
    .describe(
      "Database (schema) name within a cluster (create/delete_database)",
    ),
  confirmDatabaseName: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal databaseName"),
  snapshotName: z
    .string()
    .default("")
    .describe("Snapshot name for create_snapshot"),
  snapshotDescription: z
    .string()
    .default("")
    .describe("Optional snapshot description"),
  snapshotId: z
    .string()
    .default("")
    .describe("Target snapshot ID (delete_snapshot, restore_database source)"),
  confirmSnapshotId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal snapshotId"),
  restoreName: z
    .string()
    .default("")
    .describe(
      "Name of the NEW database created by restore_database (restores never overwrite in place)",
    ),
  restoreTime: z
    .string()
    .default("")
    .describe(
      "Point-in-time to restore to (ISO datetime); mutually exclusive with snapshotId",
    ),
  cacheId: z
    .string()
    .default("")
    .describe("Target cache ID"),
  confirmCacheId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal cacheId"),
  cacheName: z
    .string()
    .default("")
    .describe("Cache name for create_cache (lowercase, 3-40 chars)"),
  cacheType: z
    .enum([
      "laravel_valkey",
      "upstash_redis",
      "aws_elasticache_valkey",
      "aws_elasticache_redis",
    ])
    .default("laravel_valkey")
    .describe("Cache engine for create_cache"),
  cacheSize: z
    .string()
    .default("valkey-flex-250mb")
    .describe(
      "Cache size for create_cache — size values are engine-specific (run list_cache_types); laravel_valkey uses valkey-flex-*/valkey-pro.*, upstash_redis uses 250mb/1gb/...",
    ),
  cachePublic: z
    .boolean()
    .default(false)
    .describe("Whether the cache is publicly reachable"),
  bucketId: z
    .string()
    .default("")
    .describe("Target object storage bucket ID"),
  confirmBucketId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal bucketId"),
  bucketName: z
    .string()
    .default("")
    .describe("Bucket name for create_bucket (lowercase, 3-40 chars)"),
  bucketVisibility: z
    .enum(["private", "public"])
    .default("private")
    .describe("Bucket visibility for create_bucket"),
  bucketJurisdiction: z
    .enum(["default", "eu"])
    .default("default")
    .describe("Bucket data jurisdiction for create_bucket"),
  bucketKeyName: z
    .string()
    .default("")
    .describe("Access key name for create_bucket_key"),
  bucketKeyPermission: z
    .enum(["read_write", "read_only"])
    .default("read_write")
    .describe("Access key permission for create_bucket_key"),
  bucketKeyId: z
    .string()
    .default("")
    .describe("Target bucket access key ID (delete_bucket_key)"),
  confirmBucketKeyId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal bucketKeyId"),
  updatePayload: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe(
      "JSON object of fields to change, passed through to the update_* methods (see the Laravel Cloud API docs for valid fields per resource)",
    ),
  metricsPeriod: z
    .string()
    .default("")
    .describe("Metrics period for get_*_metrics (API default when empty)"),
});

const ClusterSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  engine: z.string(),
  status: z.string(),
  region: z.string().optional(),
  createdAt: z.string().optional(),
});

const ClustersSchema = z.object({
  clusters: z.array(ClusterSummarySchema),
  clusterCount: z.number(),
  syncedAt: z.string(),
});

const ClusterSchema = ClusterSummarySchema.extend({
  hostname: z.string().optional(),
  port: z.number().optional(),
  protocol: z.string().optional(),
  updatedAt: z.string(),
});

const DatabasesSchema = z.object({
  clusterId: z.string(),
  databases: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string(),
      status: z.string().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  databaseCount: z.number(),
  syncedAt: z.string(),
});

const SnapshotsSchema = z.object({
  clusterId: z.string(),
  snapshots: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
      status: z.string().optional(),
      storageBytes: z.number().nullable().optional(),
      completedAt: z.string().nullable().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  snapshotCount: z.number(),
  syncedAt: z.string(),
});

const CacheSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  engine: z.string(),
  status: z.string(),
  region: z.string().optional(),
  size: z.string().optional(),
  createdAt: z.string().optional(),
});

const CachesSchema = z.object({
  caches: z.array(CacheSummarySchema),
  cacheCount: z.number(),
  syncedAt: z.string(),
});

const CacheTypesSchema = z.object({
  types: z.array(
    z.object({
      type: z.string(),
      label: z.string().optional(),
      sizes: z.array(z.string()),
      regions: z.array(z.string()),
    }),
  ),
  syncedAt: z.string(),
});

const CacheSchema = CacheSummarySchema.extend({
  isPublic: z.boolean().optional(),
  usesHibernation: z.boolean().optional(),
  hostname: z.string().nullable().optional(),
  port: z.number().nullable().optional(),
  updatedAt: z.string(),
});

const BucketSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  visibility: z.string().optional(),
  createdAt: z.string().optional(),
});

const BucketsSchema = z.object({
  buckets: z.array(BucketSummarySchema),
  bucketCount: z.number(),
  syncedAt: z.string(),
});

const BucketSchema = BucketSummarySchema.extend({
  jurisdiction: z.string().optional(),
  endpoint: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  updatedAt: z.string(),
});

const BucketKeySchema = z.object({
  id: z.string(),
  bucketId: z.string(),
  name: z.string(),
  permission: z.string(),
  accessKeyId: z
    .string()
    .meta({ sensitive: true })
    .describe("S3-style access key ID (vault-stored)"),
  accessKeySecret: z
    .string()
    .meta({ sensitive: true })
    .describe("S3-style secret (vault-stored; shown by the API only once)"),
  createdAt: z.string(),
});

const MetricSeriesSchema = z.object({
  name: z.string(),
  pointCount: z.number(),
  labels: z
    .array(z.string())
    .describe("Sub-series labels; empty when the endpoint doesn't label"),
  average: z
    .array(z.number())
    .describe("Averages, one per label; a scalar average becomes one entry"),
  // Scalar summaries the cluster/cache endpoints use instead of averages.
  // Optional so snapshots written before 2026.08.12.1 still read back.
  total: z.number().nullable().optional(),
  current: z.number().nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  latest: z
    .number()
    .nullable()
    .optional()
    .describe("y of the most recent point, when it is a plain number"),
});

type MetricSeries = z.infer<typeof MetricSeriesSchema>;

const DataMetricsSchema = z.object({
  targetId: z.string(),
  period: z.string().optional(),
  series: z.array(MetricSeriesSchema),
  syncedAt: z.string(),
});

const ClusterConfigFieldSchema = z
  .object({
    name: z.string(),
    type: z.string().optional(),
    required: z.boolean().optional(),
    description: z.string().optional(),
    enum: z.array(z.union([z.string(), z.number()])).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    nullable: z.boolean().optional(),
    example: z.string().optional(),
  })
  .catchall(z.unknown());

const DatabaseTypesSchema = z.object({
  types: z.array(
    z.object({
      type: z.string(),
      label: z.string().optional(),
      regions: z.array(z.string()),
      configSchema: z
        .array(ClusterConfigFieldSchema)
        .optional()
        .describe(
          "Engine-specific config fields for create_cluster's clusterConfig — required flags, enum sizes, and min/max bounds come from here",
        ),
    }),
  ),
  syncedAt: z.string(),
});

const SnapshotDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  storageBytes: z.number().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string(),
});

const SchemaDetailSchema = z.object({
  id: z.string().optional(),
  clusterId: z.string(),
  name: z.string(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string(),
});

const BucketKeyInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  permission: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string(),
});

const BucketKeysSchema = z.object({
  bucketId: z.string(),
  keys: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      permission: z.string().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  keyCount: z.number(),
  syncedAt: z.string(),
});

type ClustersData = z.infer<typeof ClustersSchema>;
type DatabasesData = z.infer<typeof DatabasesSchema>;
type SnapshotsData = z.infer<typeof SnapshotsSchema>;
type CachesData = z.infer<typeof CachesSchema>;
type BucketsData = z.infer<typeof BucketsSchema>;
type BucketKeysData = z.infer<typeof BucketKeysSchema>;

// deno-lint-ignore no-explicit-any
type Context = any;
// deno-lint-ignore no-explicit-any
type Json = any;

// --- Helpers ---

const LC_API_BASE = "https://cloud.laravel.com/api";
const SYNC_MAX_PAGES = 100;

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
 * so replaying a POST could create a second cluster, cache, or bucket.
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
        "Stopped at page cap ({cap}); catalog may be incomplete",
        { cap: SYNC_MAX_PAGES },
      );
    }
  }
  return items;
}

/**
 * Map a cluster resource to the catalog summary. The `connection` attribute
 * (which contains credentials) is never read here.
 */
function toClusterSummary(raw: Json): z.infer<typeof ClusterSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    engine: a.type,
    status: a.status,
    region: a.region ?? undefined,
    createdAt: a.created_at ?? undefined,
  };
}

/**
 * Map a cluster resource to the detail shape. From `connection`, only the
 * non-secret hostname/port/protocol are kept — username and password are
 * deliberately never stored.
 */
function toClusterDetail(raw: Json): z.infer<typeof ClusterSchema> {
  const c = raw.attributes?.connection ?? {};
  return {
    ...toClusterSummary(raw),
    hostname: c.hostname ?? undefined,
    port: c.port ?? undefined,
    protocol: c.protocol ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a cache resource to the catalog summary (no connection data).
 */
function toCacheSummary(raw: Json): z.infer<typeof CacheSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    engine: a.type,
    status: a.status,
    region: a.region ?? undefined,
    size: a.size ?? undefined,
    createdAt: a.created_at ?? undefined,
  };
}

/**
 * Map a cache resource to the detail shape — connection credentials
 * (username/password) are deliberately never stored, only hostname/port.
 */
function toCacheDetail(raw: Json): z.infer<typeof CacheSchema> {
  const a = raw.attributes ?? {};
  const c = a.connection ?? {};
  return {
    ...toCacheSummary(raw),
    isPublic: a.is_public ?? undefined,
    usesHibernation: a.uses_hibernation ?? undefined,
    hostname: c.hostname ?? null,
    port: c.port ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a bucket resource to the catalog summary.
 */
function toBucketSummary(raw: Json): z.infer<typeof BucketSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    status: a.status ?? undefined,
    visibility: a.visibility ?? undefined,
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
 * Parse the updatePayload argument into a non-empty JSON object.
 */
function parseUpdatePayload(value: string, method: string): Json {
  requireArg(value, "updatePayload", method);
  let parsed: Json;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${method}: 'updatePayload' must be a JSON object (parse failed).`,
    );
  }
  if (
    typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
    Object.keys(parsed).length === 0
  ) {
    throw new Error(
      `${method}: 'updatePayload' must be a non-empty JSON object.`,
    );
  }
  return parsed;
}

/**
 * Summarize the API's named metric series into a compact, schema-stable
 * shape.
 *
 * The two metrics endpoints do NOT agree on a shape, both verified live on
 * 2026-08-12:
 *
 * - `/environments/{id}/metrics` labels its sub-series —
 *   `{labels: ["1/2/3XX","4XX","5XX"], average: [0,0,0], data: [...]}`
 * - `/databases/clusters/{id}/metrics` and the cache equivalent use scalar
 *   summaries whose field name varies per metric — `{data: [], average: 0}`,
 *   `{data: [...], total: 0.01}`, `{data: [], current: 0, min: 0, max: 0}` —
 *   and `replica_lag` arrives as a bare array with no summary at all.
 *
 * Both are normalized here without discarding either: labelled averages stay
 * an array (a lone scalar average becomes a single entry), and the scalar
 * summaries are carried alongside. Nothing is assumed to be an array, and a
 * non-numeric value becomes null rather than throwing or coercing to 0.
 */
function summarizeMetrics(data: Json): MetricSeries[] {
  const num = (v: Json): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const numArray = (v: Json): number[] => {
    if (Array.isArray(v)) return v.map((n: Json) => num(n) ?? 0);
    const scalar = num(v);
    return scalar === null ? [] : [scalar];
  };
  return Object.entries(data ?? {}).map(([name, raw]: [string, Json]) => {
    const series: Json = Array.isArray(raw) || raw == null ? {} : raw;
    const points: Json[] = Array.isArray(series.data) ? series.data : [];
    const last = points.length ? points[points.length - 1] : undefined;
    return {
      name,
      pointCount: points.length,
      labels: Array.isArray(series.labels) ? series.labels.map(String) : [],
      average: numArray(series.average),
      total: num(series.total),
      current: num(series.current),
      min: num(series.min),
      max: num(series.max),
      latest: num(last?.y),
    };
  });
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

// --- Model ---

/**
 * Operates Laravel Cloud data services: database clusters and their
 * databases, snapshots and restores, caches, and object storage buckets
 * with access keys.
 *
 * Part of @craftquest/laravel-cloud (data domain). Auth is an org-scoped
 * bearer token supplied via a vault expression. Connection credentials
 * returned by the API (database/cache usernames and passwords) are never
 * stored — only hostnames and ports. Bucket access keys go straight to the
 * vault via sensitive resource fields. Every delete is double-gated
 * (exact-ID confirmation + presence in synced state), and restores create
 * NEW databases — they never overwrite in place.
 */
export const model = {
  type: "@craftquest/laravel-cloud/data",
  version: "2026.08.21.3",
  upgrades: [
    {
      toVersion: "2026.08.10.2",
      description:
        "Version bump alongside the new queues model; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
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
        "5xx retries restricted to idempotent methods (a replayed POST could create a second cluster, cache, or bucket); no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.12.1",
      description:
        "Metrics fix: get_cluster_metrics and get_cache_metrics threw on live data because the cluster endpoint returns scalar summaries (average: 0) where the environment endpoint returns arrays. Both shapes are now normalized; series gain optional total/current/min/max/latest and older snapshots still read back",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.12.2",
      description:
        "Version bump alongside the apps/queues documentation and error-handling round; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.21.1",
      description:
        "Version bump alongside apps' attach_database / detach_database; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.21.2",
      description:
        "Version bump alongside apps' retry-safe create_environment; no schema changes",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
    {
      toVersion: "2026.08.21.3",
      description:
        "list_database_types keeps each engine's config_schema (as configSchema) — previously dropped, leaving create_cluster unable to build a valid config payload — and create_cluster fails actionably before the POST when required config fields are missing. databaseTypes artifacts written earlier read back (configSchema is optional)",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  globalArguments: GlobalArgsSchema,
  resources: {
    clusters: {
      description: "Synced database cluster catalog",
      schema: ClustersSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    cluster: {
      description:
        "Most recently touched cluster (hostname/port only — never credentials)",
      schema: ClusterSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    databases: {
      description: "Databases in the most recently listed cluster",
      schema: DatabasesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    snapshots: {
      description: "Snapshots of the most recently listed cluster",
      schema: SnapshotsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    caches: {
      description: "Synced cache catalog",
      schema: CachesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    cacheTypes: {
      description: "Available cache engines with their valid sizes and regions",
      schema: CacheTypesSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    cache: {
      description:
        "Most recently touched cache (hostname/port only — never credentials)",
      schema: CacheSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    buckets: {
      description: "Synced object storage bucket catalog",
      schema: BucketsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    bucket: {
      description: "Most recently touched bucket",
      schema: BucketSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    bucketKey: {
      description:
        "Most recently created bucket access key: ID/secret vault-referenced",
      schema: BucketKeySchema,
      vaultName: "laravel-cloud-secrets",
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    bucketKeys: {
      description:
        "Access keys of the most recently listed bucket (names only, no secrets)",
      schema: BucketKeysSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    bucketKeyInfo: {
      description:
        "Most recently inspected access key (metadata only, no secrets)",
      schema: BucketKeyInfoSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
    clusterMetrics: {
      description: "Metrics snapshot for the most recently inspected cluster",
      schema: DataMetricsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    cacheMetrics: {
      description: "Metrics snapshot for the most recently inspected cache",
      schema: DataMetricsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    databaseTypes: {
      description: "Available database engines with their regions",
      schema: DatabaseTypesSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    snapshot: {
      description: "Most recently inspected snapshot",
      schema: SnapshotDetailSchema,
      lifetime: "30d" as const,
      garbageCollection: 3,
    },
    schema: {
      description: "Most recently inspected database (schema)",
      schema: SchemaDetailSchema,
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
    sync_clusters: {
      description:
        "Sync the database cluster catalog into the clusters resource (paginates to completion)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        context.logger.info("Syncing the database cluster catalog");
        const items = await lcPaginate(
          laravelCloudToken,
          "/databases/clusters",
          context,
        );
        const clusters = items.map(toClusterSummary);
        context.logger.info("Catalog synced: {count} cluster(s)", {
          count: clusters.length,
        });
        const handle = await context.writeResource("clusters", "clusters", {
          clusters,
          clusterCount: clusters.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_cluster: {
      description:
        "Fetch one cluster's detail (clusterId argument) — hostname/port only, never credentials",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "get_cluster",
        );
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/databases/clusters/${clusterId}`,
        );
        const data = requireData(res, `cluster ${clusterId}`);
        context.logger.info("Fetched cluster {name} (status: {status})", {
          name: data.attributes?.name,
          status: data.attributes?.status,
        });
        const handle = await context.writeResource(
          "cluster",
          "cluster",
          toClusterDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    create_cluster: {
      description:
        "Create a database cluster (clusterName/databaseType/region arguments). Most engines REQUIRE clusterConfig (e.g. MySQL needs size/storage/is_public/…) — run list_database_types first and build clusterConfig from the engine's configSchema",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          laravelCloudToken,
          clusterName,
          databaseType,
          region,
          clusterConfig,
        } = context.globalArgs;
        requireArg(clusterName, "clusterName", "create_cluster");

        let config: Json = undefined;
        if (clusterConfig) {
          try {
            config = JSON.parse(clusterConfig);
          } catch {
            throw new Error(
              "create_cluster: 'clusterConfig' must be a JSON object (parse failed).",
            );
          }
        }
        // Engines advertise their required config in /databases/types. When
        // the engine catalog has been synced, fail actionably before the POST
        // instead of letting the API 422 on a missing size/storage field.
        const engineCatalog = (await context.readResource!(
          "databaseTypes",
        )) as z.infer<typeof DatabaseTypesSchema> | null;
        const engine = engineCatalog?.types?.find(
          (t) => t.type === databaseType,
        );
        const missing = (engine?.configSchema ?? []).filter(
          (f) =>
            f.required &&
            (config === undefined || (config as Json)[f.name] === undefined),
        );
        if (missing.length > 0) {
          const hints = missing.map((f) => {
            if (f.enum) return `${f.name} (one of: ${f.enum.join(", ")})`;
            if (f.min !== undefined || f.max !== undefined) {
              return `${f.name} (${f.type ?? "number"}, ${f.min ?? "?"}–${
                f.max ?? "?"
              })`;
            }
            return `${f.name} (${f.type ?? "value"})`;
          });
          throw new Error(
            `create_cluster: engine ${databaseType} requires clusterConfig field(s) ` +
              `${hints.join(", ")}. Build clusterConfig from this engine's ` +
              "configSchema in the databaseTypes state (list_database_types).",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          "/databases/clusters",
          {
            type: databaseType,
            name: clusterName,
            region,
            ...(config !== undefined ? { config } : {}),
          },
        );
        const data = requireData(res, "created cluster");
        context.logger.info("Created cluster {name} ({id}, {engine})", {
          name: clusterName,
          id: data.id,
          engine: databaseType,
        });
        const handle = await context.writeResource(
          "cluster",
          "cluster",
          toClusterDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    delete_cluster: {
      description:
        "Permanently delete a cluster and every database in it. Gated: confirmClusterId must equal clusterId, and the cluster must exist in the synced catalog.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, clusterId, confirmClusterId } =
          context.globalArgs;
        requireArg(clusterId, "clusterId", "delete_cluster");
        requireConfirm(
          clusterId,
          confirmClusterId,
          "confirmClusterId",
          "cluster ID",
        );
        const catalog = (await context.readResource!("clusters")) as
          | ClustersData
          | null;
        const known = catalog?.clusters?.find((c) => c.id === clusterId);
        if (!known) {
          throw new Error(
            `Delete refused: cluster ${clusterId} is not in the synced catalog. ` +
              "Run sync_clusters first — deletes are only allowed against known clusters.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/databases/clusters/${clusterId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Cluster {id} was already gone", {
            id: clusterId,
          });
        } else {
          context.logger.info("Deleted cluster {name} ({id})", {
            name: known.name,
            id: clusterId,
          });
        }
        const remaining = catalog!.clusters.filter((c) => c.id !== clusterId);
        const handle = await context.writeResource("clusters", "clusters", {
          clusters: remaining,
          clusterCount: remaining.length,
          syncedAt: catalog!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    list_databases: {
      description: "List the databases in a cluster (clusterId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "list_databases",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/databases/clusters/${clusterId}/databases`,
          context,
        );
        const databases = items.map((d: Json) => ({
          id: d.id ?? undefined,
          name: d.attributes?.name ?? d.id,
          status: d.attributes?.status ?? undefined,
          createdAt: d.attributes?.created_at ?? undefined,
        }));
        context.logger.info("Cluster {id} has {count} database(s)", {
          id: clusterId,
          count: databases.length,
        });
        const handle = await context.writeResource("databases", "databases", {
          clusterId,
          databases,
          databaseCount: databases.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_database: {
      description:
        "Create a database (schema) in a cluster (clusterId + databaseName arguments)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, databaseName } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "create_database",
        );
        requireArg(databaseName, "databaseName", "create_database");
        await lcApi(
          laravelCloudToken,
          "POST",
          `/databases/clusters/${clusterId}/databases`,
          { name: databaseName },
        );
        context.logger.info("Created database {name} in cluster {id}", {
          name: databaseName,
          id: clusterId,
        });
        const stored = (await context.readResource!("databases")) as
          | DatabasesData
          | null;
        const databases = [
          ...(stored?.clusterId === clusterId ? stored.databases : []),
          { name: databaseName, status: "creating" },
        ];
        const handle = await context.writeResource("databases", "databases", {
          clusterId,
          databases,
          databaseCount: databases.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    delete_database: {
      description:
        "Permanently delete a database (schema) and its data. Gated: confirmDatabaseName must equal databaseName, and the database must be in the stored list (run list_databases first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, databaseName, confirmDatabaseName } =
          context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "delete_database",
        );
        requireArg(databaseName, "databaseName", "delete_database");
        requireConfirm(
          databaseName,
          confirmDatabaseName,
          "confirmDatabaseName",
          "database name",
        );
        const stored = (await context.readResource!("databases")) as
          | DatabasesData
          | null;
        const known = (stored?.clusterId === clusterId || undefined) &&
          stored!.databases.find((d) => d.name === databaseName);
        if (!known) {
          throw new Error(
            `Delete refused: database '${databaseName}' is not in the stored list for cluster ${clusterId}. ` +
              "Run list_databases first.",
          );
        }
        if (!known.id) {
          throw new Error(
            `Delete refused: no schema ID recorded for '${databaseName}' — re-run list_databases (the API routes schema deletes by ID, not name).`,
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/databases/clusters/${clusterId}/databases/${known.id}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Database {name} was already gone", {
            name: databaseName,
          });
        } else {
          context.logger.info("Deleted database {name} from cluster {id}", {
            name: databaseName,
            id: clusterId,
          });
        }
        const databases = stored!.databases.filter(
          (d) => d.name !== databaseName,
        );
        const handle = await context.writeResource("databases", "databases", {
          clusterId,
          databases,
          databaseCount: databases.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    list_snapshots: {
      description: "List a cluster's snapshots (clusterId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "list_snapshots",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/databases/clusters/${clusterId}/snapshots`,
          context,
        );
        const snapshots = items.map((s: Json) => ({
          id: s.id,
          name: s.attributes?.name ?? "",
          description: s.attributes?.description ?? null,
          status: s.attributes?.status ?? undefined,
          storageBytes: s.attributes?.storage_bytes ?? null,
          completedAt: s.attributes?.completed_at ?? null,
          createdAt: s.attributes?.created_at ?? undefined,
        }));
        context.logger.info("Cluster {id} has {count} snapshot(s)", {
          id: clusterId,
          count: snapshots.length,
        });
        const handle = await context.writeResource("snapshots", "snapshots", {
          clusterId,
          snapshots,
          snapshotCount: snapshots.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_snapshot: {
      description:
        "Create a snapshot of a cluster (clusterId + snapshotName arguments) — do this before risky changes",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, snapshotName, snapshotDescription } =
          context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "create_snapshot",
        );
        requireArg(snapshotName, "snapshotName", "create_snapshot");
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/databases/clusters/${clusterId}/snapshots`,
          {
            name: snapshotName,
            ...(snapshotDescription
              ? { description: snapshotDescription }
              : {}),
          },
        );
        const data = requireData(res, "created snapshot");
        context.logger.info(
          "Snapshot {name} ({id}) started on cluster {cluster}",
          {
            name: snapshotName,
            id: data.id,
            cluster: clusterId,
          },
        );
        const stored = (await context.readResource!("snapshots")) as
          | SnapshotsData
          | null;
        const snapshots = [
          ...(stored?.clusterId === clusterId ? stored.snapshots : []),
          {
            id: data.id,
            name: snapshotName,
            description: snapshotDescription || null,
            status: data.attributes?.status ?? "creating",
            storageBytes: null,
            completedAt: null,
            createdAt: data.attributes?.created_at ?? undefined,
          },
        ];
        const handle = await context.writeResource("snapshots", "snapshots", {
          clusterId,
          snapshots,
          snapshotCount: snapshots.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    delete_snapshot: {
      description:
        "Delete a snapshot. Gated: confirmSnapshotId must equal snapshotId, and the snapshot must be in the stored list (run list_snapshots first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, snapshotId, confirmSnapshotId } =
          context.globalArgs;
        requireArg(snapshotId, "snapshotId", "delete_snapshot");
        requireConfirm(
          snapshotId,
          confirmSnapshotId,
          "confirmSnapshotId",
          "snapshot ID",
        );
        const stored = (await context.readResource!("snapshots")) as
          | SnapshotsData
          | null;
        const known = stored?.snapshots?.find((s) => s.id === snapshotId);
        if (!known) {
          throw new Error(
            `Delete refused: snapshot ${snapshotId} is not in the stored list. ` +
              "Run list_snapshots for its cluster first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/database-snapshots/${snapshotId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Snapshot {id} was already gone", {
            id: snapshotId,
          });
        } else {
          context.logger.info("Deleted snapshot {name} ({id})", {
            name: known.name,
            id: snapshotId,
          });
        }
        const snapshots = stored!.snapshots.filter((s) => s.id !== snapshotId);
        const handle = await context.writeResource("snapshots", "snapshots", {
          clusterId: stored!.clusterId,
          snapshots,
          snapshotCount: snapshots.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    restore_database: {
      description:
        "Restore into a NEW cluster (restoreName argument) from a snapshot (snapshotId) or point in time (restoreTime). Never overwrites existing data. Verified live: this clones the whole cluster, not a schema.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, restoreName, snapshotId, restoreTime } =
          context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "restore_database",
        );
        requireArg(restoreName, "restoreName", "restore_database");
        if (!snapshotId && !restoreTime) {
          throw new Error(
            "restore_database needs a source: set snapshotId OR restoreTime.",
          );
        }
        if (snapshotId && restoreTime) {
          throw new Error(
            "restore_database takes snapshotId OR restoreTime, not both.",
          );
        }
        await lcApi(
          laravelCloudToken,
          "POST",
          `/databases/clusters/${clusterId}/restore`,
          {
            name: restoreName,
            ...(snapshotId
              ? { database_snapshot_id: snapshotId }
              : { restore_time: restoreTime }),
          },
        );
        context.logger.info(
          "Restore started: a NEW cluster named '{name}' is being created from {source} — run sync_clusters to see it",
          {
            name: restoreName,
            source: snapshotId || restoreTime,
          },
        );
        context.logger.warn(
          "Known platform issue: the restored cluster can appear in listings under its source cluster's ID and may only be manageable in the Cloud UI — verify there",
        );
        return { dataHandles: [] };
      },
    },

    list_cache_types: {
      description:
        "List available cache engines with their valid sizes and regions — run before create_cache",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const res = await lcApi(laravelCloudToken, "GET", "/caches/types");
        const types = (res.data ?? []).map((t: Json) => ({
          type: t.type,
          label: t.label ?? undefined,
          sizes: (t.sizes ?? []).map((s: Json) =>
            typeof s === "string" ? s : s.value
          ),
          regions: t.regions ?? [],
        }));
        context.logger.info("{count} cache engine(s) available", {
          count: types.length,
        });
        const handle = await context.writeResource("cacheTypes", "cacheTypes", {
          types,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    sync_caches: {
      description:
        "Sync the cache catalog into the caches resource (paginates to completion)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        context.logger.info("Syncing the cache catalog");
        const items = await lcPaginate(laravelCloudToken, "/caches", context);
        const caches = items.map(toCacheSummary);
        context.logger.info("Catalog synced: {count} cache(s)", {
          count: caches.length,
        });
        const handle = await context.writeResource("caches", "caches", {
          caches,
          cacheCount: caches.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_cache: {
      description:
        "Fetch one cache's detail (cacheId argument) — hostname/port only, never credentials",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const cacheId = requireArg(
          context.globalArgs.cacheId,
          "cacheId",
          "get_cache",
        );
        const res = await lcApi(laravelCloudToken, "GET", `/caches/${cacheId}`);
        const data = requireData(res, `cache ${cacheId}`);
        context.logger.info("Fetched cache {name} (status: {status})", {
          name: data.attributes?.name,
          status: data.attributes?.status,
        });
        const handle = await context.writeResource(
          "cache",
          "cache",
          toCacheDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    create_cache: {
      description:
        "Create a cache (cacheName/cacheType/cacheSize/region arguments)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          laravelCloudToken,
          cacheName,
          cacheType,
          cacheSize,
          region,
          cachePublic,
        } = context.globalArgs;
        requireArg(cacheName, "cacheName", "create_cache");
        const res = await lcApi(laravelCloudToken, "POST", "/caches", {
          type: cacheType,
          name: cacheName,
          region,
          size: cacheSize,
          auto_upgrade_enabled: true,
          is_public: cachePublic,
        });
        const data = requireData(res, "created cache");
        context.logger.info("Created cache {name} ({id}, {size})", {
          name: cacheName,
          id: data.id,
          size: cacheSize,
        });
        const handle = await context.writeResource(
          "cache",
          "cache",
          toCacheDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    delete_cache: {
      description:
        "Permanently delete a cache. Gated: confirmCacheId must equal cacheId, and the cache must exist in the synced catalog.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, cacheId, confirmCacheId } =
          context.globalArgs;
        requireArg(cacheId, "cacheId", "delete_cache");
        requireConfirm(cacheId, confirmCacheId, "confirmCacheId", "cache ID");
        const catalog = (await context.readResource!("caches")) as
          | CachesData
          | null;
        const known = catalog?.caches?.find((c) => c.id === cacheId);
        if (!known) {
          throw new Error(
            `Delete refused: cache ${cacheId} is not in the synced catalog. ` +
              "Run sync_caches first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/caches/${cacheId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Cache {id} was already gone", { id: cacheId });
        } else {
          context.logger.info("Deleted cache {name} ({id})", {
            name: known.name,
            id: cacheId,
          });
        }
        const remaining = catalog!.caches.filter((c) => c.id !== cacheId);
        const handle = await context.writeResource("caches", "caches", {
          caches: remaining,
          cacheCount: remaining.length,
          syncedAt: catalog!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    sync_buckets: {
      description:
        "Sync the object storage bucket catalog (paginates to completion)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        context.logger.info("Syncing the bucket catalog");
        const items = await lcPaginate(laravelCloudToken, "/buckets", context);
        const buckets = items.map(toBucketSummary);
        context.logger.info("Catalog synced: {count} bucket(s)", {
          count: buckets.length,
        });
        const handle = await context.writeResource("buckets", "buckets", {
          buckets,
          bucketCount: buckets.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_bucket: {
      description: "Fetch one bucket's detail (bucketId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const bucketId = requireArg(
          context.globalArgs.bucketId,
          "bucketId",
          "get_bucket",
        );
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/buckets/${bucketId}`,
        );
        const data = requireData(res, `bucket ${bucketId}`);
        const a = data.attributes ?? {};
        context.logger.info("Fetched bucket {name} ({visibility})", {
          name: a.name,
          visibility: a.visibility,
        });
        const handle = await context.writeResource("bucket", "bucket", {
          ...toBucketSummary(data),
          jurisdiction: a.jurisdiction ?? undefined,
          endpoint: a.endpoint ?? null,
          url: a.url ?? null,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_bucket: {
      description:
        "Create an object storage bucket (bucketName/bucketVisibility/bucketJurisdiction arguments). The API also mints an initial access key — its pair goes straight to the vault.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          laravelCloudToken,
          bucketName,
          bucketVisibility,
          bucketJurisdiction,
          bucketKeyName,
          bucketKeyPermission,
        } = context.globalArgs;
        requireArg(bucketName, "bucketName", "create_bucket");
        const keyName = bucketKeyName || `${bucketName}-key`;
        const res = await lcApi(laravelCloudToken, "POST", "/buckets", {
          name: bucketName,
          visibility: bucketVisibility,
          jurisdiction: bucketJurisdiction,
          key_name: keyName,
          key_permission: bucketKeyPermission,
        });
        const data = requireData(res, "created bucket");
        const a = data.attributes ?? {};
        context.logger.info(
          "Created bucket {name} ({id}, {visibility}) with initial key {key}",
          {
            name: bucketName,
            id: data.id,
            visibility: bucketVisibility,
            key: keyName,
          },
        );
        const handles = [
          await context.writeResource("bucket", "bucket", {
            ...toBucketSummary(data),
            jurisdiction: a.jurisdiction ?? undefined,
            endpoint: a.endpoint ?? null,
            url: a.url ?? null,
            updatedAt: new Date().toISOString(),
          }),
        ];
        // Match by the presence of key material rather than the JSON:API
        // type string — the secret is only ever shown in this response.
        const initialKey = (res.included ?? []).find(
          (i: Json) => i.attributes?.access_key_secret,
        );
        if (initialKey) {
          const k = initialKey.attributes ?? {};
          handles.push(
            await context.writeResource("bucketKey", "bucketKey", {
              id: initialKey.id,
              bucketId: data.id,
              name: k.name ?? keyName,
              permission: k.permission ?? bucketKeyPermission,
              accessKeyId: k.access_key_id ?? "",
              accessKeySecret: k.access_key_secret ?? "",
              createdAt: k.created_at ?? new Date().toISOString(),
            }),
          );
          context.logger.info(
            "Initial access key {id} stored (key material in the vault)",
            { id: initialKey.id },
          );
        }
        return { dataHandles: handles };
      },
    },

    delete_bucket: {
      description:
        "Permanently delete a bucket and its objects. Gated: confirmBucketId must equal bucketId, and the bucket must exist in the synced catalog.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, bucketId, confirmBucketId } =
          context.globalArgs;
        requireArg(bucketId, "bucketId", "delete_bucket");
        requireConfirm(
          bucketId,
          confirmBucketId,
          "confirmBucketId",
          "bucket ID",
        );
        const catalog = (await context.readResource!("buckets")) as
          | BucketsData
          | null;
        const known = catalog?.buckets?.find((b) => b.id === bucketId);
        if (!known) {
          throw new Error(
            `Delete refused: bucket ${bucketId} is not in the synced catalog. ` +
              "Run sync_buckets first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/buckets/${bucketId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Bucket {id} was already gone", { id: bucketId });
        } else {
          context.logger.info("Deleted bucket {name} ({id})", {
            name: known.name,
            id: bucketId,
          });
        }
        const remaining = catalog!.buckets.filter((b) => b.id !== bucketId);
        const handle = await context.writeResource("buckets", "buckets", {
          buckets: remaining,
          bucketCount: remaining.length,
          syncedAt: catalog!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    list_bucket_keys: {
      description:
        "List a bucket's access keys (bucketId argument) — names and permissions only, never secrets",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const bucketId = requireArg(
          context.globalArgs.bucketId,
          "bucketId",
          "list_bucket_keys",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/buckets/${bucketId}/keys`,
          context,
        );
        const keys = items.map((k: Json) => ({
          id: k.id,
          name: k.attributes?.name ?? "",
          permission: k.attributes?.permission ?? undefined,
          createdAt: k.attributes?.created_at ?? undefined,
        }));
        context.logger.info("Bucket {id} has {count} access key(s)", {
          id: bucketId,
          count: keys.length,
        });
        const handle = await context.writeResource("bucketKeys", "bucketKeys", {
          bucketId,
          keys,
          keyCount: keys.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_bucket_key: {
      description:
        "Create an S3-style access key for a bucket (bucketId + bucketKeyName arguments). The key pair goes straight to the vault.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, bucketKeyName, bucketKeyPermission } =
          context.globalArgs;
        const bucketId = requireArg(
          context.globalArgs.bucketId,
          "bucketId",
          "create_bucket_key",
        );
        requireArg(bucketKeyName, "bucketKeyName", "create_bucket_key");
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/buckets/${bucketId}/keys`,
          { name: bucketKeyName, permission: bucketKeyPermission },
        );
        const data = requireData(res, "created bucket key");
        const a = data.attributes ?? {};
        context.logger.info(
          "Created access key {name} ({id}, {permission}) — key material stored in the vault",
          { name: bucketKeyName, id: data.id, permission: bucketKeyPermission },
        );
        const handle = await context.writeResource("bucketKey", "bucketKey", {
          id: data.id,
          bucketId,
          name: a.name ?? bucketKeyName,
          permission: a.permission ?? bucketKeyPermission,
          accessKeyId: a.access_key_id ?? "",
          accessKeySecret: a.access_key_secret ?? "",
          createdAt: a.created_at ?? new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    delete_bucket_key: {
      description:
        "Revoke a bucket access key. Gated: confirmBucketKeyId must equal bucketKeyId, and the key must be in the stored list (run list_bucket_keys first). Apps using the key lose access immediately.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, bucketKeyId, confirmBucketKeyId } =
          context.globalArgs;
        requireArg(bucketKeyId, "bucketKeyId", "delete_bucket_key");
        requireConfirm(
          bucketKeyId,
          confirmBucketKeyId,
          "confirmBucketKeyId",
          "bucket key ID",
        );
        const stored = (await context.readResource!("bucketKeys")) as
          | BucketKeysData
          | null;
        const known = stored?.keys?.find((k) => k.id === bucketKeyId);
        if (!known) {
          throw new Error(
            `Delete refused: access key ${bucketKeyId} is not in the stored list. ` +
              "Run list_bucket_keys for its bucket first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/bucket-keys/${bucketKeyId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Access key {id} was already gone", {
            id: bucketKeyId,
          });
        } else {
          context.logger.warn(
            "Revoked access key {name} ({id}) — anything using it just lost access",
            { name: known.name, id: bucketKeyId },
          );
        }
        const keys = stored!.keys.filter((k) => k.id !== bucketKeyId);
        const handle = await context.writeResource("bucketKeys", "bucketKeys", {
          bucketId: stored!.bucketId,
          keys,
          keyCount: keys.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    update_cluster: {
      description:
        "Update a cluster's config (clusterId + updatePayload arguments; the API expects a config object)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "update_cluster",
        );
        const payload = parseUpdatePayload(updatePayload, "update_cluster");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/databases/clusters/${clusterId}`,
          payload,
        );
        context.logger.info("Updated cluster {id}: {fields}", {
          id: clusterId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/databases/clusters/${clusterId}`,
        );
        const handle = await context.writeResource(
          "cluster",
          "cluster",
          toClusterDetail(requireData(res, `cluster ${clusterId}`)),
        );
        return { dataHandles: [handle] };
      },
    },

    update_cache: {
      description:
        "Update cache settings (cacheId + updatePayload arguments, e.g. size, eviction_policy, uses_hibernation)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const cacheId = requireArg(
          context.globalArgs.cacheId,
          "cacheId",
          "update_cache",
        );
        const payload = parseUpdatePayload(updatePayload, "update_cache");
        await lcApi(laravelCloudToken, "PATCH", `/caches/${cacheId}`, payload);
        context.logger.info("Updated cache {id}: {fields}", {
          id: cacheId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(laravelCloudToken, "GET", `/caches/${cacheId}`);
        const handle = await context.writeResource(
          "cache",
          "cache",
          toCacheDetail(requireData(res, `cache ${cacheId}`)),
        );
        return { dataHandles: [handle] };
      },
    },

    update_bucket: {
      description:
        "Update bucket settings (bucketId + updatePayload arguments, e.g. visibility, cors_settings)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const bucketId = requireArg(
          context.globalArgs.bucketId,
          "bucketId",
          "update_bucket",
        );
        const payload = parseUpdatePayload(updatePayload, "update_bucket");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/buckets/${bucketId}`,
          payload,
        );
        context.logger.info("Updated bucket {id}: {fields}", {
          id: bucketId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/buckets/${bucketId}`,
        );
        const data = requireData(res, `bucket ${bucketId}`);
        const a = data.attributes ?? {};
        const handle = await context.writeResource("bucket", "bucket", {
          ...toBucketSummary(data),
          jurisdiction: a.jurisdiction ?? undefined,
          endpoint: a.endpoint ?? null,
          url: a.url ?? null,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    update_bucket_key: {
      description:
        "Rename a bucket access key (bucketKeyId + updatePayload arguments; the API supports name)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const bucketKeyId = requireArg(
          context.globalArgs.bucketKeyId,
          "bucketKeyId",
          "update_bucket_key",
        );
        const payload = parseUpdatePayload(updatePayload, "update_bucket_key");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/bucket-keys/${bucketKeyId}`,
          payload,
        );
        context.logger.info("Updated access key {id}: {fields}", {
          id: bucketKeyId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/bucket-keys/${bucketKeyId}`,
        );
        const data = requireData(res, `access key ${bucketKeyId}`);
        const handle = await context.writeResource(
          "bucketKeyInfo",
          "bucketKeyInfo",
          {
            id: data.id,
            name: data.attributes?.name ?? "",
            permission: data.attributes?.permission ?? undefined,
            createdAt: data.attributes?.created_at ?? undefined,
            updatedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_bucket_key: {
      description:
        "Fetch an access key's metadata (bucketKeyId argument) — never secrets",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const bucketKeyId = requireArg(
          context.globalArgs.bucketKeyId,
          "bucketKeyId",
          "get_bucket_key",
        );
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/bucket-keys/${bucketKeyId}`,
        );
        const data = requireData(res, `access key ${bucketKeyId}`);
        const handle = await context.writeResource(
          "bucketKeyInfo",
          "bucketKeyInfo",
          {
            id: data.id,
            name: data.attributes?.name ?? "",
            permission: data.attributes?.permission ?? undefined,
            createdAt: data.attributes?.created_at ?? undefined,
            updatedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_cluster_metrics: {
      description:
        "Fetch a cluster's metrics snapshot (clusterId argument; metricsPeriod optional)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, metricsPeriod } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "get_cluster_metrics",
        );
        const qs = metricsPeriod
          ? `?period=${encodeURIComponent(metricsPeriod)}`
          : "";
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/databases/clusters/${clusterId}/metrics${qs}`,
        );
        const series = summarizeMetrics(res.data);
        context.logger.info("Cluster {id} metrics: {names}", {
          id: clusterId,
          names: series.map((m) => m.name).join(", "),
        });
        const handle = await context.writeResource(
          "clusterMetrics",
          "clusterMetrics",
          {
            targetId: clusterId,
            period: metricsPeriod || undefined,
            series,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_cache_metrics: {
      description:
        "Fetch a cache's metrics snapshot (cacheId argument; metricsPeriod optional)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, metricsPeriod } = context.globalArgs;
        const cacheId = requireArg(
          context.globalArgs.cacheId,
          "cacheId",
          "get_cache_metrics",
        );
        const qs = metricsPeriod
          ? `?period=${encodeURIComponent(metricsPeriod)}`
          : "";
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/caches/${cacheId}/metrics${qs}`,
        );
        const series = summarizeMetrics(res.data);
        context.logger.info("Cache {id} metrics: {names}", {
          id: cacheId,
          names: series.map((m) => m.name).join(", "),
        });
        const handle = await context.writeResource(
          "cacheMetrics",
          "cacheMetrics",
          {
            targetId: cacheId,
            period: metricsPeriod || undefined,
            series,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    list_database_types: {
      description:
        "List available database engines with their regions and per-engine configSchema (required config fields, size enums, storage bounds) — run before create_cluster and build clusterConfig from configSchema",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const res = await lcApi(laravelCloudToken, "GET", "/databases/types");
        const types = (res.data ?? []).map((t: Json) => ({
          type: t.type ?? "",
          label: t.label ?? undefined,
          regions: t.regions ?? [],
          configSchema: t.config_schema ?? [],
        }));
        context.logger.info("{count} database engine(s) available", {
          count: types.length,
        });
        const handle = await context.writeResource(
          "databaseTypes",
          "databaseTypes",
          { types, syncedAt: new Date().toISOString() },
        );
        return { dataHandles: [handle] };
      },
    },

    get_snapshot: {
      description: "Fetch one snapshot's detail (snapshotId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const snapshotId = requireArg(
          context.globalArgs.snapshotId,
          "snapshotId",
          "get_snapshot",
        );
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/database-snapshots/${snapshotId}`,
        );
        const data = requireData(res, `snapshot ${snapshotId}`);
        const a = data.attributes ?? {};
        context.logger.info("Snapshot {name}: {status}", {
          name: a.name,
          status: a.status,
        });
        const handle = await context.writeResource("snapshot", "snapshot", {
          id: data.id,
          name: a.name ?? "",
          description: a.description ?? null,
          status: a.status ?? undefined,
          storageBytes: a.storage_bytes ?? null,
          completedAt: a.completed_at ?? null,
          createdAt: a.created_at ?? undefined,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_database: {
      description:
        "Fetch one database (schema) detail (clusterId + databaseName arguments; resolved to its ID via the stored list)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, databaseName } = context.globalArgs;
        const clusterId = requireArg(
          context.globalArgs.clusterId,
          "clusterId",
          "get_database",
        );
        requireArg(databaseName, "databaseName", "get_database");
        const stored = (await context.readResource!("databases")) as
          | DatabasesData
          | null;
        const known = (stored?.clusterId === clusterId || undefined) &&
          stored!.databases.find((d) => d.name === databaseName);
        if (!known?.id) {
          throw new Error(
            `get_database: no schema ID recorded for '${databaseName}' — run list_databases for cluster ${clusterId} first.`,
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/databases/clusters/${clusterId}/databases/${known.id}`,
        );
        const data = requireData(res, `database ${databaseName}`);
        const handle = await context.writeResource("schema", "schema", {
          id: data.id ?? known.id,
          clusterId,
          name: data.attributes?.name ?? databaseName,
          status: data.attributes?.status ?? undefined,
          createdAt: data.attributes?.created_at ?? undefined,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
