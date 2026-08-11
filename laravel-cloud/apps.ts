import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  laravelCloudToken: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe("Laravel Cloud API bearer token (vault-supplied, org-scoped)"),
  appId: z
    .string()
    .default("")
    .describe("Target application ID (get/delete app, create_environment)"),
  confirmAppId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal appId"),
  environmentId: z
    .string()
    .default("")
    .describe(
      "Target environment ID (environment/deploy/command/domain methods)",
    ),
  confirmEnvironmentId: z
    .string()
    .default("")
    .describe(
      "Safety gate for delete_environment, and for stop_environment while the environment is running",
    ),
  deploymentId: z
    .string()
    .default("")
    .describe(
      "Target deployment ID (wait/logs; empty = the stored deployment)",
    ),
  appName: z
    .string()
    .default("")
    .describe("Application name for create_app (3-40 chars)"),
  repository: z
    .string()
    .default("")
    .describe("Repository for create_app, 'owner/name'"),
  sourceControlProvider: z
    .enum(["github", "gitlab", "bitbucket"])
    .default("github")
    .describe("Source control provider for create_app"),
  region: z
    .string()
    .default("us-east-2")
    .describe("Cloud region for create_app (e.g. us-east-2, eu-west-1)"),
  rootDirectory: z
    .string()
    .default("")
    .describe("Monorepo root directory for create_app (empty = repo root)"),
  branch: z
    .string()
    .default("")
    .describe("Git branch for create_environment"),
  environmentName: z
    .string()
    .default("")
    .describe("Environment name for create_environment (1-40 chars)"),
  command: z
    .string()
    .default("")
    .describe(
      "Shell/artisan command for run_command (runs in the environment)",
    ),
  envVariables: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe(
      'JSON array of {"key","value"} pairs for set_env_variables (values are secrets — never stored or logged)',
    ),
  envVarMethod: z
    .enum(["set", "append"])
    .default("set")
    .describe(
      "set updates matching keys; append adds without duplicate checks",
    ),
  envVarKeys: z
    .string()
    .default("")
    .describe(
      'JSON array of key names for delete_env_variables (e.g. ["OLD_KEY"])',
    ),
  domainName: z
    .string()
    .default("")
    .describe("Domain name for create_domain"),
  domainId: z
    .string()
    .default("")
    .describe("Target domain ID (verify_domain, delete_domain)"),
  confirmDomainId: z
    .string()
    .default("")
    .describe("Delete safety gate: must exactly equal domainId"),
  updatePayload: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe(
      "JSON object of fields to change, passed through to the update_* methods (see the Laravel Cloud API docs for valid fields per resource)",
    ),
  avatarPath: z
    .string()
    .default("")
    .describe("Local image file path for upload_avatar"),
  logQuery: z
    .string()
    .default("")
    .describe("Search query for get_environment_logs (optional)"),
  logType: z
    .string()
    .default("")
    .describe(
      "Log type filter for get_environment_logs: access, application, exception, or system (optional)",
    ),
  logFrom: z
    .string()
    .default("")
    .describe(
      "Log range start (ISO datetime) for get_environment_logs; defaults to one hour ago",
    ),
  logTo: z
    .string()
    .default("")
    .describe("Log range end (ISO datetime); defaults to now"),
  metricsPeriod: z
    .string()
    .default("")
    .describe(
      "Metrics period for get_environment_metrics (API default when empty)",
    ),
});

const AppSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  region: z.string(),
  repository: z.string().optional(),
  defaultBranch: z.string().optional(),
  createdAt: z.string().optional(),
});

const AppsSchema = z.object({
  apps: z.array(AppSummarySchema),
  appCount: z.number(),
  syncedAt: z.string(),
});

const EnvironmentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  vanityDomain: z.string().optional(),
});

const AppSchema = AppSummarySchema.extend({
  rootDirectory: z.string().optional(),
  environments: z.array(EnvironmentSummarySchema),
  updatedAt: z.string(),
});

const EnvironmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  vanityDomain: z.string().optional(),
  phpVersion: z.string().optional(),
  nodeVersion: z.string().optional(),
  buildCommand: z.string().nullable().optional(),
  deployCommand: z.string().nullable().optional(),
  usesOctane: z.boolean().optional(),
  usesHibernation: z.boolean().optional(),
  envVarKeys: z
    .array(z.string())
    .describe("Environment variable KEY NAMES only — values are never stored"),
  updatedAt: z.string(),
});

const DeploymentSchema = z.object({
  id: z.string(),
  environmentId: z.string().optional(),
  status: z.string(),
  branchName: z.string().optional(),
  commitHash: z.string().optional(),
  commitMessage: z.string().optional(),
  failureReason: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  updatedAt: z.string(),
});

const DeploymentLogsSchema = z.object({
  deploymentId: z.string(),
  build: z.array(
    z.object({
      step: z.string(),
      status: z.string(),
      output: z.string().optional(),
    }),
  ),
  deploy: z.array(
    z.object({
      step: z.string(),
      status: z.string(),
      output: z.string().optional(),
    }),
  ),
  updatedAt: z.string(),
});

const CommandRunSchema = z.object({
  id: z.string(),
  command: z.string(),
  status: z.string(),
  exitCode: z.number().nullable().optional(),
  output: z.string().optional().describe("Truncated to 10000 chars"),
  failureReason: z.string().nullable().optional(),
  updatedAt: z.string(),
});

const DomainSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  hostnameStatus: z.string().optional(),
  sslStatus: z.string().optional(),
  actionRequired: z.boolean().optional(),
  lastVerifiedAt: z.string().nullable().optional(),
});

const DeploymentsSchema = z.object({
  environmentId: z.string(),
  deployments: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      branchName: z.string().optional(),
      commitHash: z.string().optional(),
      commitMessage: z.string().optional(),
      startedAt: z.string().nullable().optional(),
      finishedAt: z.string().nullable().optional(),
    }),
  ),
  deploymentCount: z.number(),
  syncedAt: z.string(),
});

const CommandsSchema = z.object({
  environmentId: z.string(),
  commands: z.array(
    z.object({
      id: z.string(),
      command: z.string(),
      status: z.string(),
      exitCode: z.number().nullable().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  commandCount: z.number(),
  syncedAt: z.string(),
});

const EnvironmentLogsSchema = z.object({
  environmentId: z.string(),
  logs: z.array(
    z.object({
      loggedAt: z.string().optional(),
      level: z.string().optional(),
      logType: z.string().optional(),
      message: z.string().describe("Truncated to 500 chars"),
    }),
  ),
  logCount: z.number(),
  cursor: z.string().optional(),
  syncedAt: z.string(),
});

const MetricSeriesSchema = z.object({
  name: z.string(),
  labels: z.array(z.string()),
  average: z.array(z.number()),
  pointCount: z.number(),
});

const EnvironmentMetricsSchema = z.object({
  environmentId: z.string(),
  period: z.string().optional(),
  series: z.array(MetricSeriesSchema),
  syncedAt: z.string(),
});

const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  syncedAt: z.string(),
});

const RegionsSchema = z.object({
  regions: z.array(z.object({ region: z.string(), label: z.string() })),
  syncedAt: z.string(),
});

const UsageSchema = z.object({
  period: z.string().optional(),
  environmentId: z.string().optional(),
  currentSpendCents: z.number(),
  credits: z
    .object({ usedCents: z.number(), totalCents: z.number() })
    .nullable()
    .optional(),
  bandwidth: z
    .object({ costCents: z.number(), usagePercentage: z.number() })
    .nullable()
    .optional(),
  alert: z
    .object({ thresholdCents: z.number(), remainingPercentage: z.number() })
    .nullable()
    .optional(),
  resourceTotalCents: z.number().optional(),
  addonTotalCents: z.number().optional(),
  applicationTotalCents: z.number().optional(),
  applicationCount: z.number().optional(),
  applications: z.array(
    z.object({ name: z.string(), totalCents: z.number() }),
  ),
  addons: z.array(z.object({ name: z.string(), totalCents: z.number() })),
  resourceLines: z.array(
    z.object({
      kind: z.string(),
      name: z.string().optional(),
      totalCents: z.number().optional(),
    }),
  ),
  syncedAt: z.string(),
});

const DomainDetailSchema = DomainSummarySchema.extend({
  updatedAt: z.string(),
});

const DomainsSchema = z.object({
  environmentId: z.string(),
  domains: z.array(DomainSummarySchema),
  domainCount: z.number(),
  syncedAt: z.string(),
});

type AppsData = z.infer<typeof AppsSchema>;
type AppData = z.infer<typeof AppSchema>;
type DeploymentData = z.infer<typeof DeploymentSchema>;
type DomainsData = z.infer<typeof DomainsSchema>;

// deno-lint-ignore no-explicit-any
type Context = any;
// deno-lint-ignore no-explicit-any
type Json = any;

// --- Helpers ---

const LC_API_BASE = "https://cloud.laravel.com/api";
const SYNC_MAX_PAGES = 100;
const COMMAND_OUTPUT_CAP = 10000;
const LOG_STEP_OUTPUT_CAP = 2000;
const DEPLOY_POLL_INTERVAL_MS = 10000;
const DEPLOY_POLL_ATTEMPTS = 90;
const COMMAND_POLL_INTERVAL_MS = 5000;
const COMMAND_POLL_ATTEMPTS = 60;

const DEPLOY_TERMINAL_FAILURES = [
  "build.failed",
  "deployment.failed",
  "failed",
  "cancelled",
];

/**
 * Pause execution for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the Laravel Cloud API with bearer auth and return the parsed JSON
 * body. Retries once on 429 (honoring Retry-After) and on 5xx. Errors carry
 * the HTTP status and truncated response body — never the token. With
 * `allowNotFound`, a 404 returns null (for idempotent deletes).
 */
async function lcApi(
  tokenArg: string,
  method: string,
  path: string,
  body?: unknown,
  opts: { allowNotFound?: boolean; form?: FormData } = {},
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    // multipart: let fetch set the boundary; JSON otherwise
    if (!opts.form) headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      body: opts.form ??
        (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await res.text();

    if (res.ok) {
      return text ? JSON.parse(text) : {};
    }
    if (res.status === 404 && opts.allowNotFound) {
      return null;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt === 1) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 2;
      await sleep(retryAfter * 1000);
      continue;
    }
    throw new Error(
      `Laravel Cloud API ${method} ${path} failed (${res.status}): ${
        text.slice(0, 500)
      }`,
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
 * Map a JSON:API application resource to the catalog summary shape.
 */
function toAppSummary(raw: Json): z.infer<typeof AppSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    slug: a.slug,
    region: a.region,
    repository: a.repository?.full_name ?? undefined,
    defaultBranch: a.repository?.default_branch ?? undefined,
    createdAt: a.created_at ?? undefined,
  };
}

/**
 * Map a JSON:API environment resource to the summary shape (no env vars).
 */
function toEnvironmentSummary(
  raw: Json,
): z.infer<typeof EnvironmentSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    slug: a.slug,
    status: a.status,
    vanityDomain: a.vanity_domain ?? undefined,
  };
}

/**
 * Map a JSON:API environment resource to the full detail shape.
 *
 * Environment variable VALUES are deliberately stripped — only key names
 * are kept. Values are secrets and must never reach plain state or logs.
 */
function toEnvironmentDetail(raw: Json): z.infer<typeof EnvironmentSchema> {
  const a = raw.attributes ?? {};
  const envVars: Json[] = Array.isArray(a.environment_variables)
    ? a.environment_variables
    : (a[""]?.environment_variables ?? []);
  return {
    ...toEnvironmentSummary(raw),
    phpVersion: a.php_major_version ?? undefined,
    nodeVersion: a.node_version ?? undefined,
    buildCommand: a.build_command ?? null,
    deployCommand: a.deploy_command ?? null,
    usesOctane: a.uses_octane ?? undefined,
    usesHibernation: a.uses_hibernation ?? undefined,
    envVarKeys: envVars.map((v: Json) => v.key).filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a JSON:API deployment resource to the deployment shape.
 */
function toDeployment(raw: Json, environmentId?: string): DeploymentData {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    environmentId: environmentId ??
      raw.relationships?.environment?.data?.id ?? undefined,
    status: a.status,
    branchName: a.branch_name ?? undefined,
    commitHash: a.commit_hash ?? undefined,
    commitMessage: a.commit_message ?? undefined,
    failureReason: a.failure_reason ?? null,
    startedAt: a.started_at ?? null,
    finishedAt: a.finished_at ?? null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a JSON:API domain resource to the summary shape.
 */
function toDomainSummary(raw: Json): z.infer<typeof DomainSummarySchema> {
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    name: a.name,
    type: a.type ?? undefined,
    hostnameStatus: a.hostname_status ?? undefined,
    sslStatus: a.ssl_status ?? undefined,
    actionRequired: a.action_required ?? undefined,
    lastVerifiedAt: a.last_verified_at ?? null,
  };
}

/**
 * Map log steps from the deployment-logs endpoint, truncating step output.
 */
function toLogSteps(
  steps: Json[],
): { step: string; status: string; output?: string }[] {
  return (steps ?? []).map((s: Json) => ({
    step: s.step ?? "",
    status: s.status ?? "",
    output: typeof s.output === "string"
      ? s.output.slice(-LOG_STEP_OUTPUT_CAP)
      : undefined,
  }));
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
 * shape: series name, labels, averages, and the number of data points.
 */
function summarizeMetrics(
  data: Json,
): { name: string; labels: string[]; average: number[]; pointCount: number }[] {
  return Object.entries(data ?? {}).map(([name, s]: [string, Json]) => ({
    name,
    labels: (s?.labels ?? []).map(String),
    average: (s?.average ?? []).map((n: Json) => Number(n) || 0),
    pointCount: (s?.data ?? []).length,
  }));
}

/**
 * Parse a JSON-array argument, with a helpful error naming the argument.
 */
function parseJsonArray(value: string, name: string, method: string): Json[] {
  requireArg(value, name, method);
  let parsed: Json;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `${method}: '${name}' must be a JSON array (parse failed).`,
    );
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${method}: '${name}' must be a non-empty JSON array.`);
  }
  return parsed;
}

/**
 * Fetch one environment and persist its detail (env var values stripped).
 */
async function fetchAndWriteEnvironment(
  context: Context,
  environmentId: string,
): Promise<{ dataHandles: Json[] }> {
  const { laravelCloudToken } = context.globalArgs;
  const res = await lcApi(
    laravelCloudToken,
    "GET",
    `/environments/${environmentId}`,
  );
  const data = requireData(res, `environment ${environmentId}`);
  context.logger.info("Fetched environment {id} (status: {status})", {
    id: data.id,
    status: data.attributes?.status,
  });
  const handle = await context.writeResource(
    "environment",
    "environment",
    toEnvironmentDetail(data),
  );
  return { dataHandles: [handle] };
}

// --- Model ---

/**
 * Operates Laravel Cloud applications: the app catalog, environments
 * (including start/stop and environment variables), deployments with
 * follow-to-completion, artisan/shell commands, and custom domains.
 *
 * Part of @craftquest/laravel-cloud (apps domain). Auth is an org-scoped
 * bearer token supplied via a vault expression — never a plain input.
 * Environment variable VALUES never enter state or logs (key names only),
 * and every destructive operation is confirmation-gated: deletes require
 * the exact ID re-stated (and presence in synced state), while
 * stop_environment is gated only when the environment is actually running.
 */
export const model = {
  type: "@craftquest/laravel-cloud/apps",
  reports: ["@craftquest/laravel-cloud-usage"],
  version: "2026.08.10.5",
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
  ],
  globalArguments: GlobalArgsSchema,
  resources: {
    apps: {
      description: "Synced application catalog for the organization",
      schema: AppsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    app: {
      description: "Most recently touched application, with environment list",
      schema: AppSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    environment: {
      description:
        "Most recently touched environment (env var key names only, never values)",
      schema: EnvironmentSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    deployment: {
      description: "Most recently initiated or inspected deployment",
      schema: DeploymentSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    deploymentLogs: {
      description: "Build/deploy step logs for the last inspected deployment",
      schema: DeploymentLogsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    commandRun: {
      description: "Result of the last run_command (output truncated)",
      schema: CommandRunSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    domains: {
      description: "Domains for the most recently inspected environment",
      schema: DomainsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    domain: {
      description: "Most recently inspected single domain",
      schema: DomainDetailSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    deployments: {
      description:
        "Deployment history for the most recently listed environment",
      schema: DeploymentsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    commands: {
      description: "Command history for the most recently listed environment",
      schema: CommandsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    environmentLogs: {
      description: "Recent logs for the most recently inspected environment",
      schema: EnvironmentLogsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    environmentMetrics: {
      description:
        "Metrics snapshot for the most recently inspected environment",
      schema: EnvironmentMetricsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    organization: {
      description: "The organization this token operates on",
      schema: OrganizationSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
    regions: {
      description: "Available Laravel Cloud regions",
      schema: RegionsSchema,
      lifetime: "7d" as const,
      garbageCollection: 3,
    },
    usage: {
      description: "Latest spend/usage pull for the organization",
      schema: UsageSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
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
    sync_apps: {
      description:
        "Sync the organization's application catalog into the apps resource (paginates to completion)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        context.logger.info("Syncing the Laravel Cloud application catalog");
        const items = await lcPaginate(
          laravelCloudToken,
          "/applications",
          context,
        );
        const apps = items.map(toAppSummary);
        context.logger.info("Catalog synced: {count} applications", {
          count: apps.length,
        });
        const handle = await context.writeResource("apps", "apps", {
          apps,
          appCount: apps.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_app: {
      description:
        "Fetch one application (appId argument) with its environments into the app resource",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const appId = requireArg(context.globalArgs.appId, "appId", "get_app");
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/applications/${appId}?include=environments`,
        );
        const data = requireData(res, `application ${appId}`);
        const environments = (res.included ?? [])
          .filter((i: Json) => i.type === "environments")
          .map(toEnvironmentSummary);
        context.logger.info("Fetched app {name} ({envs} environments)", {
          name: data.attributes?.name,
          envs: environments.length,
        });
        const handle = await context.writeResource("app", "app", {
          ...toAppSummary(data),
          rootDirectory: data.attributes?.root_directory ?? undefined,
          environments,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_app: {
      description:
        "Create an application (appName/repository/region arguments). Requires the git integration to already be connected in the Cloud UI.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          laravelCloudToken,
          appName,
          repository,
          sourceControlProvider,
          region,
          rootDirectory,
        } = context.globalArgs;
        requireArg(appName, "appName", "create_app");
        requireArg(repository, "repository", "create_app");

        const res = await lcApi(laravelCloudToken, "POST", "/applications", {
          name: appName,
          repository,
          source_control_provider_type: sourceControlProvider,
          region,
          ...(rootDirectory ? { root_directory: rootDirectory } : {}),
        });
        const data = requireData(res, "created application");
        context.logger.info("Created application {name} ({id}) in {region}", {
          name: appName,
          id: data.id,
          region,
        });
        const handle = await context.writeResource("app", "app", {
          ...toAppSummary(data),
          rootDirectory: data.attributes?.root_directory ?? undefined,
          environments: [],
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    delete_app: {
      description:
        "Permanently delete an application and everything in it. Gated: confirmAppId must equal appId, and the app must exist in the synced catalog.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, appId, confirmAppId } = context.globalArgs;
        requireArg(appId, "appId", "delete_app");
        if (confirmAppId !== appId) {
          throw new Error(
            "Delete refused: confirmAppId does not match appId. " +
              "Re-state the exact application ID to confirm deletion.",
          );
        }
        const catalog = (await context.readResource!("apps")) as
          | AppsData
          | null;
        const known = catalog?.apps?.find((a) => a.id === appId);
        if (!known) {
          throw new Error(
            `Delete refused: application ${appId} is not in the synced catalog. ` +
              "Run sync_apps first — deletes are only allowed against known apps.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/applications/${appId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn(
            "Application {id} was already gone; removing it from the catalog",
            { id: appId },
          );
        } else {
          context.logger.info("Deleted application {name} ({id})", {
            name: known.name,
            id: appId,
          });
        }
        const remaining = catalog!.apps.filter((a) => a.id !== appId);
        const handle = await context.writeResource("apps", "apps", {
          apps: remaining,
          appCount: remaining.length,
          syncedAt: catalog!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    get_environment: {
      description:
        "Fetch one environment's detail (environmentId argument) — env var key names only, never values",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "get_environment",
        );
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    create_environment: {
      description:
        "Create an environment on an application (appId, branch, environmentName arguments)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, appId, branch, environmentName } =
          context.globalArgs;
        requireArg(appId, "appId", "create_environment");
        requireArg(branch, "branch", "create_environment");
        requireArg(environmentName, "environmentName", "create_environment");

        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/applications/${appId}/environments`,
          { branch, name: environmentName },
        );
        const data = requireData(res, "created environment");
        context.logger.info(
          "Created environment {name} ({id}) tracking branch {branch}",
          { name: environmentName, id: data.id, branch },
        );
        const handle = await context.writeResource(
          "environment",
          "environment",
          toEnvironmentDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    delete_environment: {
      description:
        "Permanently delete an environment. Gated: confirmEnvironmentId must equal environmentId, and the environment must appear in the stored app detail (run get_app first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, environmentId, confirmEnvironmentId } =
          context.globalArgs;
        requireArg(environmentId, "environmentId", "delete_environment");
        if (confirmEnvironmentId !== environmentId) {
          throw new Error(
            "Delete refused: confirmEnvironmentId does not match environmentId. " +
              "Re-state the exact environment ID to confirm deletion.",
          );
        }
        const app = (await context.readResource!("app")) as AppData | null;
        const known = app?.environments?.find((e) => e.id === environmentId);
        if (!known) {
          throw new Error(
            `Delete refused: environment ${environmentId} is not in the stored app detail. ` +
              "Run get_app for its application first — deletes are only allowed against known environments.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/environments/${environmentId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Environment {id} was already gone", {
            id: environmentId,
          });
        } else {
          context.logger.info("Deleted environment {name} ({id})", {
            name: known.name,
            id: environmentId,
          });
        }
        const environments = app!.environments.filter(
          (e) => e.id !== environmentId,
        );
        const handle = await context.writeResource("app", "app", {
          ...app!,
          environments,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    start_environment: {
      description: "Start a stopped environment (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "start_environment",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/start`,
        );
        context.logger.info("Start signaled for environment {id}", {
          id: environmentId,
        });
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    stop_environment: {
      description:
        "Stop an environment. Gated only while it is running: then confirmEnvironmentId must match — stopping a live site takes it offline.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, confirmEnvironmentId } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "stop_environment",
        );
        const current = await lcApi(
          laravelCloudToken,
          "GET",
          `/environments/${environmentId}`,
        );
        const status = requireData(current, `environment ${environmentId}`)
          .attributes?.status;
        if (status === "running" && confirmEnvironmentId !== environmentId) {
          throw new Error(
            `Stop refused: environment ${environmentId} is running — stopping takes the site offline. ` +
              "Re-state the exact environment ID in confirmEnvironmentId to confirm.",
          );
        }
        await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/stop`,
        );
        context.logger.info("Stop signaled for environment {id}", {
          id: environmentId,
        });
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    set_env_variables: {
      description:
        "Add or update environment variables (envVariables argument: JSON [{key,value}]). Values are secrets — never stored or logged.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, envVariables, envVarMethod } =
          context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "set_env_variables",
        );
        const variables = parseJsonArray(
          envVariables,
          "envVariables",
          "set_env_variables",
        );
        for (const v of variables) {
          if (typeof v?.key !== "string" || typeof v?.value !== "string") {
            throw new Error(
              'set_env_variables: every entry needs string "key" and "value" fields.',
            );
          }
        }
        await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/variables`,
          { method: envVarMethod, variables },
        );
        context.logger.info(
          "{method} {count} environment variable(s) on {id}: {keys}",
          {
            method: envVarMethod,
            count: variables.length,
            id: environmentId,
            keys: variables.map((v: Json) => v.key).join(", "),
          },
        );
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    delete_env_variables: {
      description:
        "Delete environment variables by key name (envVarKeys argument: JSON array of keys)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, envVarKeys } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "delete_env_variables",
        );
        const keys = parseJsonArray(
          envVarKeys,
          "envVarKeys",
          "delete_env_variables",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/variables/delete`,
          { keys },
        );
        context.logger.info("Deleted {count} environment variable(s): {keys}", {
          count: keys.length,
          keys: keys.join(", "),
        });
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    purge_edge_cache: {
      description:
        "Purge the edge cache for an environment (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "purge_edge_cache",
        );
        await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/purge-edge-cache`,
        );
        context.logger.info("Edge cache purged for environment {id}", {
          id: environmentId,
        });
        return { dataHandles: [] };
      },
    },

    deploy: {
      description:
        "Initiate a deployment of the environment's tracked branch (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "deploy",
        );
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/deployments`,
        );
        const data = requireData(res, "initiated deployment");
        context.logger.info(
          "Deployment {id} initiated on {environmentId} ({branch} @ {commit})",
          {
            id: data.id,
            environmentId,
            branch: data.attributes?.branch_name,
            commit: (data.attributes?.commit_hash ?? "").slice(0, 8),
          },
        );
        const handle = await context.writeResource(
          "deployment",
          "deployment",
          toDeployment(data, environmentId),
        );
        return { dataHandles: [handle] };
      },
    },

    wait_deployment: {
      description:
        "Poll a deployment (deploymentId argument, or the stored one) until it succeeds or terminally fails (10s interval, 15 min cap). Failures surface the failure reason and log tail.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        let deploymentId: string = context.globalArgs.deploymentId;
        let environmentId: string | undefined;
        if (!deploymentId) {
          const stored = (await context.readResource!("deployment")) as
            | DeploymentData
            | null;
          if (!stored?.id) {
            throw new Error(
              "wait_deployment needs a deploymentId argument or a prior deploy.",
            );
          }
          deploymentId = stored.id;
          environmentId = stored.environmentId;
        }

        for (let attempt = 1; attempt <= DEPLOY_POLL_ATTEMPTS; attempt++) {
          const res = await lcApi(
            laravelCloudToken,
            "GET",
            `/deployments/${deploymentId}`,
          );
          const data = requireData(res, `deployment ${deploymentId}`);
          const status: string = data.attributes?.status ?? "";

          if (status === "deployment.succeeded") {
            context.logger.info("Deployment {id} succeeded", {
              id: deploymentId,
            });
            const handle = await context.writeResource(
              "deployment",
              "deployment",
              toDeployment(data, environmentId),
            );
            return { dataHandles: [handle] };
          }
          if (DEPLOY_TERMINAL_FAILURES.includes(status)) {
            let logTail = "";
            try {
              const logs = await lcApi(
                laravelCloudToken,
                "GET",
                `/deployments/${deploymentId}/logs`,
              );
              const steps = [
                ...(logs.data?.build?.steps ?? []),
                ...(logs.data?.deploy?.steps ?? []),
              ];
              const failed = steps.filter((s: Json) => s.status === "failed");
              logTail = failed
                .map((s: Json) => `${s.step}: ${(s.output ?? "").slice(-500)}`)
                .join(" | ");
            } catch {
              // logs are best-effort on failure
            }
            throw new Error(
              `Deployment ${deploymentId} ended '${status}'` +
                (data.attributes?.failure_reason
                  ? ` — ${data.attributes.failure_reason}`
                  : "") +
                (logTail ? `\nFailed steps: ${logTail.slice(0, 1500)}` : ""),
            );
          }
          context.logger.info(
            "Deployment {id} is {status} (attempt {attempt}/{max})",
            { id: deploymentId, status, attempt, max: DEPLOY_POLL_ATTEMPTS },
          );
          await sleep(DEPLOY_POLL_INTERVAL_MS);
        }
        throw new Error(
          `Deployment ${deploymentId} still not finished after ${
            (DEPLOY_POLL_ATTEMPTS * DEPLOY_POLL_INTERVAL_MS) / 60000
          } minutes — re-run wait_deployment to keep waiting.`,
        );
      },
    },

    get_deployment_logs: {
      description:
        "Fetch build/deploy step logs for a deployment (deploymentId argument, or the stored one)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        let deploymentId: string = context.globalArgs.deploymentId;
        if (!deploymentId) {
          const stored = (await context.readResource!("deployment")) as
            | DeploymentData
            | null;
          if (!stored?.id) {
            throw new Error(
              "get_deployment_logs needs a deploymentId argument or a prior deploy.",
            );
          }
          deploymentId = stored.id;
        }
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/deployments/${deploymentId}/logs`,
        );
        const handle = await context.writeResource(
          "deploymentLogs",
          "deploymentLogs",
          {
            deploymentId,
            build: toLogSteps(res.data?.build?.steps),
            deploy: toLogSteps(res.data?.deploy?.steps),
            updatedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    run_command: {
      description:
        "Run a shell/artisan command in an environment (environmentId + command arguments) and wait for its output",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, command } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "run_command",
        );
        requireArg(command, "command", "run_command");

        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/commands`,
          { command },
        );
        const created = requireData(res, "created command");
        context.logger.info("Command {id} queued on {environmentId}", {
          id: created.id,
          environmentId,
        });

        for (let attempt = 1; attempt <= COMMAND_POLL_ATTEMPTS; attempt++) {
          const poll = await lcApi(
            laravelCloudToken,
            "GET",
            `/commands/${created.id}`,
          );
          const data = requireData(poll, `command ${created.id}`);
          const a = data.attributes ?? {};
          if (
            a.status === "command.success" || a.status === "command.failure"
          ) {
            context.logger.info(
              "Command {id} finished: {status} (exit {exit})",
              {
                id: created.id,
                status: a.status,
                exit: a.exit_code ?? "n/a",
              },
            );
            const handle = await context.writeResource(
              "commandRun",
              "commandRun",
              {
                id: data.id,
                command: a.command ?? command,
                status: a.status,
                exitCode: a.exit_code ?? null,
                output: typeof a.output === "string"
                  ? a.output.slice(-COMMAND_OUTPUT_CAP)
                  : undefined,
                failureReason: a.failure_reason ?? null,
                updatedAt: new Date().toISOString(),
              },
            );
            // platform quirk: "command.success" means "the command ran";
            // a nonzero exit code is still a failed command
            const failed = a.status === "command.failure" ||
              (a.exit_code != null && a.exit_code !== 0);
            if (failed) {
              // output is stored first so it survives the throw; failing
              // here makes workflow steps fail when the command fails
              throw new Error(
                `Command failed (exit ${a.exit_code ?? "n/a"}): ${
                  String(a.output ?? "").trim().slice(-500)
                }`,
              );
            }
            return { dataHandles: [handle] };
          }
          await sleep(COMMAND_POLL_INTERVAL_MS);
        }
        throw new Error(
          `Command ${created.id} still running after ${
            (COMMAND_POLL_ATTEMPTS * COMMAND_POLL_INTERVAL_MS) / 60000
          } minutes — check it with 'swamp data get' later or in the Cloud UI.`,
        );
      },
    },

    get_domains: {
      description: "List an environment's domains (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "get_domains",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/environments/${environmentId}/domains`,
          context,
        );
        const domains = items.map(toDomainSummary);
        context.logger.info("Environment {id} has {count} domain(s)", {
          id: environmentId,
          count: domains.length,
        });
        const handle = await context.writeResource("domains", "domains", {
          environmentId,
          domains,
          domainCount: domains.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_domain: {
      description:
        "Attach a custom domain to an environment (environmentId + domainName arguments)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, domainName } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "create_domain",
        );
        requireArg(domainName, "domainName", "create_domain");
        const res = await lcApi(
          laravelCloudToken,
          "POST",
          `/environments/${environmentId}/domains`,
          { name: domainName },
        );
        const data = requireData(res, "created domain");
        context.logger.info("Domain {name} attached ({id})", {
          name: domainName,
          id: data.id,
        });
        const stored = (await context.readResource!("domains")) as
          | DomainsData
          | null;
        const domains = [
          ...(stored?.environmentId === environmentId ? stored.domains : []),
          toDomainSummary(data),
        ];
        const handle = await context.writeResource("domains", "domains", {
          environmentId,
          domains,
          domainCount: domains.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    verify_domain: {
      description: "Trigger verification for a domain (domainId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const domainId = requireArg(
          context.globalArgs.domainId,
          "domainId",
          "verify_domain",
        );
        await lcApi(laravelCloudToken, "POST", `/domains/${domainId}/verify`);
        context.logger.info("Verification triggered for domain {id}", {
          id: domainId,
        });
        return { dataHandles: [] };
      },
    },

    delete_domain: {
      description:
        "Detach a domain. Gated: confirmDomainId must equal domainId, and the domain must be in the stored domains list (run get_domains first).",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, domainId, confirmDomainId } =
          context.globalArgs;
        requireArg(domainId, "domainId", "delete_domain");
        if (confirmDomainId !== domainId) {
          throw new Error(
            "Delete refused: confirmDomainId does not match domainId. " +
              "Re-state the exact domain ID to confirm.",
          );
        }
        const stored = (await context.readResource!("domains")) as
          | DomainsData
          | null;
        const known = stored?.domains?.find((d) => d.id === domainId);
        if (!known) {
          throw new Error(
            `Delete refused: domain ${domainId} is not in the stored domains list. ` +
              "Run get_domains for its environment first.",
          );
        }
        const res = await lcApi(
          laravelCloudToken,
          "DELETE",
          `/domains/${domainId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn("Domain {id} was already gone", { id: domainId });
        } else {
          context.logger.info("Deleted domain {name} ({id})", {
            name: known.name,
            id: domainId,
          });
        }
        const domains = stored!.domains.filter((d) => d.id !== domainId);
        const handle = await context.writeResource("domains", "domains", {
          environmentId: stored!.environmentId,
          domains,
          domainCount: domains.length,
          syncedAt: stored!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    update_app: {
      description:
        "Update application settings (appId + updatePayload arguments, e.g. name, slack_channel, default_environment_id)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const appId = requireArg(
          context.globalArgs.appId,
          "appId",
          "update_app",
        );
        const payload = parseUpdatePayload(updatePayload, "update_app");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/applications/${appId}`,
          payload,
        );
        context.logger.info("Updated app {id}: {fields}", {
          id: appId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/applications/${appId}?include=environments`,
        );
        const data = requireData(res, `application ${appId}`);
        const environments = (res.included ?? [])
          .filter((i: Json) => i.type === "environments")
          .map(toEnvironmentSummary);
        const handle = await context.writeResource("app", "app", {
          ...toAppSummary(data),
          rootDirectory: data.attributes?.root_directory ?? undefined,
          environments,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    update_environment: {
      description:
        "Update environment settings (environmentId + updatePayload arguments, e.g. php_version, build_command, uses_hibernation)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "update_environment",
        );
        const payload = parseUpdatePayload(updatePayload, "update_environment");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/environments/${environmentId}`,
          payload,
        );
        context.logger.info("Updated environment {id}: {fields}", {
          id: environmentId,
          fields: Object.keys(payload).join(", "),
        });
        return await fetchAndWriteEnvironment(context, environmentId);
      },
    },

    get_domain: {
      description: "Fetch one domain's detail (domainId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const domainId = requireArg(
          context.globalArgs.domainId,
          "domainId",
          "get_domain",
        );
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/domains/${domainId}`,
        );
        const data = requireData(res, `domain ${domainId}`);
        context.logger.info("Fetched domain {name} (ssl: {ssl})", {
          name: data.attributes?.name,
          ssl: data.attributes?.ssl_status,
        });
        const handle = await context.writeResource("domain", "domain", {
          ...toDomainSummary(data),
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    update_domain: {
      description:
        "Update a domain (domainId + updatePayload arguments; the API currently supports verification_method)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, updatePayload } = context.globalArgs;
        const domainId = requireArg(
          context.globalArgs.domainId,
          "domainId",
          "update_domain",
        );
        const payload = parseUpdatePayload(updatePayload, "update_domain");
        await lcApi(
          laravelCloudToken,
          "PATCH",
          `/domains/${domainId}`,
          payload,
        );
        context.logger.info("Updated domain {id}: {fields}", {
          id: domainId,
          fields: Object.keys(payload).join(", "),
        });
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/domains/${domainId}`,
        );
        const handle = await context.writeResource("domain", "domain", {
          ...toDomainSummary(requireData(res, `domain ${domainId}`)),
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    list_deployments: {
      description:
        "List an environment's deployment history (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "list_deployments",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/environments/${environmentId}/deployments`,
          context,
        );
        const deployments = items.map((d: Json) => ({
          id: d.id,
          status: d.attributes?.status ?? "",
          branchName: d.attributes?.branch_name ?? undefined,
          commitHash: d.attributes?.commit_hash ?? undefined,
          commitMessage: d.attributes?.commit_message ?? undefined,
          startedAt: d.attributes?.started_at ?? null,
          finishedAt: d.attributes?.finished_at ?? null,
        }));
        context.logger.info("Environment {id} has {count} deployment(s)", {
          id: environmentId,
          count: deployments.length,
        });
        const handle = await context.writeResource(
          "deployments",
          "deployments",
          {
            environmentId,
            deployments,
            deploymentCount: deployments.length,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    list_commands: {
      description:
        "List an environment's command history (environmentId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "list_commands",
        );
        const items = await lcPaginate(
          laravelCloudToken,
          `/environments/${environmentId}/commands`,
          context,
        );
        const commands = items.map((c: Json) => ({
          id: c.id,
          command: c.attributes?.command ?? "",
          status: c.attributes?.status ?? "",
          exitCode: c.attributes?.exit_code ?? null,
          createdAt: c.attributes?.created_at ?? undefined,
        }));
        context.logger.info("Environment {id} has {count} command run(s)", {
          id: environmentId,
          count: commands.length,
        });
        const handle = await context.writeResource("commands", "commands", {
          environmentId,
          commands,
          commandCount: commands.length,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_environment_logs: {
      description:
        "Fetch recent environment logs (environmentId argument; logQuery/logType filters). Messages are truncated; secrets in logs stay in Laravel Cloud, so avoid logging secrets app-side.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, logQuery, logType } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "get_environment_logs",
        );
        const { logFrom, logTo } = context.globalArgs;
        const params = new URLSearchParams();
        if (logQuery) params.append("query", logQuery);
        if (logType) params.append("type", logType);
        // the API requires an explicit range; default to the last hour
        params.append(
          "from",
          logFrom || new Date(Date.now() - 3600_000).toISOString(),
        );
        params.append("to", logTo || new Date().toISOString());
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/environments/${environmentId}/logs?${params}`,
        );
        const logs = (res.data ?? []).map((l: Json) => ({
          loggedAt: l.logged_at ?? l.attributes?.logged_at ?? undefined,
          level: l.level ?? l.attributes?.level ?? undefined,
          logType: l.type ?? l.attributes?.type ?? undefined,
          message: String(l.message ?? l.attributes?.message ?? "").slice(
            0,
            500,
          ),
        }));
        context.logger.info("Fetched {count} log line(s) for {id}", {
          count: logs.length,
          id: environmentId,
        });
        const handle = await context.writeResource(
          "environmentLogs",
          "environmentLogs",
          {
            environmentId,
            logs,
            logCount: logs.length,
            cursor: res.meta?.cursor ?? undefined,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_environment_metrics: {
      description:
        "Fetch an environment's metrics snapshot (environmentId argument; metricsPeriod optional)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, metricsPeriod } = context.globalArgs;
        const environmentId = requireArg(
          context.globalArgs.environmentId,
          "environmentId",
          "get_environment_metrics",
        );
        const qs = metricsPeriod
          ? `?period=${encodeURIComponent(metricsPeriod)}`
          : "";
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/environments/${environmentId}/metrics${qs}`,
        );
        const series = summarizeMetrics(res.data);
        context.logger.info("Metrics for {id}: {names}", {
          id: environmentId,
          names: series.map((m) => m.name).join(", "),
        });
        const handle = await context.writeResource(
          "environmentMetrics",
          "environmentMetrics",
          {
            environmentId,
            period: metricsPeriod || undefined,
            series,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    upload_avatar: {
      description:
        "Upload an application avatar image (appId + avatarPath arguments)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, avatarPath } = context.globalArgs;
        const appId = requireArg(
          context.globalArgs.appId,
          "appId",
          "upload_avatar",
        );
        requireArg(avatarPath, "avatarPath", "upload_avatar");
        const bytes = await Deno.readFile(avatarPath);
        const form = new FormData();
        const filename = avatarPath.split("/").pop() ?? "avatar.png";
        form.append("avatar", new Blob([bytes]), filename);
        await lcApi(
          laravelCloudToken,
          "POST",
          `/applications/${appId}/avatar`,
          undefined,
          { form },
        );
        context.logger.info("Uploaded avatar for app {id} ({bytes} bytes)", {
          id: appId,
          bytes: bytes.length,
        });
        return { dataHandles: [] };
      },
    },

    delete_avatar: {
      description: "Remove the application avatar (appId argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const appId = requireArg(
          context.globalArgs.appId,
          "appId",
          "delete_avatar",
        );
        await lcApi(
          laravelCloudToken,
          "DELETE",
          `/applications/${appId}/avatar`,
          undefined,
          { allowNotFound: true },
        );
        context.logger.info("Avatar removed for app {id}", { id: appId });
        return { dataHandles: [] };
      },
    },

    get_organization: {
      description: "Fetch the organization this token operates on",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const res = await lcApi(laravelCloudToken, "GET", "/meta/organization");
        const data = requireData(res, "organization");
        context.logger.info("Organization: {name} ({slug})", {
          name: data.attributes?.name,
          slug: data.attributes?.slug,
        });
        const handle = await context.writeResource(
          "organization",
          "organization",
          {
            id: data.id,
            name: data.attributes?.name ?? "",
            slug: data.attributes?.slug ?? "",
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    list_regions: {
      description: "List available Laravel Cloud regions",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken } = context.globalArgs;
        const res = await lcApi(laravelCloudToken, "GET", "/meta/regions");
        const regions = (res.data ?? []).map((r: Json) => ({
          region: r.region ?? "",
          label: r.label ?? "",
        }));
        context.logger.info("{count} region(s) available", {
          count: regions.length,
        });
        const handle = await context.writeResource("regions", "regions", {
          regions,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_usage: {
      description:
        "Pull the organization's spend/usage summary (metricsPeriod optional; environmentId optionally narrows to one environment)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { laravelCloudToken, metricsPeriod, environmentId } =
          context.globalArgs;
        const params = new URLSearchParams();
        if (metricsPeriod) params.append("period", metricsPeriod);
        if (environmentId) params.append("environment", environmentId);
        const qs = params.toString();
        const res = await lcApi(
          laravelCloudToken,
          "GET",
          `/usage${qs ? `?${qs}` : ""}`,
        );
        const d = res.data ?? {};
        const summary = d.summary ?? {};
        const cents = (v: Json): number => Number(v) || 0;
        const nameOf = (item: Json): string =>
          String(item?.name ?? item?.label ?? item?.id ?? "unknown");
        const applications = (d.application_totals?.applications ?? []).map(
          (a: Json) => ({ name: nameOf(a), totalCents: cents(a?.total_cents) }),
        );
        const addons = (d.addons?.items ?? []).map((a: Json) => ({
          name: nameOf(a),
          totalCents: cents(a?.total_cents),
        }));
        const resourceLines: Json[] = [];
        for (const kind of ["databases", "caches", "buckets", "websockets"]) {
          for (const item of d.resources?.[kind] ?? []) {
            resourceLines.push({
              kind,
              name: nameOf(item),
              totalCents: item?.total_cents !== undefined
                ? cents(item.total_cents)
                : undefined,
            });
          }
        }
        context.logger.info(
          "Current spend: {dollars} ({apps} application(s))",
          {
            dollars: `$${
              (cents(summary.current_spend_cents) / 100).toFixed(2)
            }`,
            apps: d.application_totals?.application_count ?? 0,
          },
        );
        const handle = await context.writeResource("usage", "usage", {
          period: metricsPeriod || undefined,
          environmentId: environmentId || undefined,
          currentSpendCents: cents(summary.current_spend_cents),
          credits: summary.credits
            ? {
              usedCents: cents(summary.credits.used_cents),
              totalCents: cents(summary.credits.total_cents),
            }
            : null,
          bandwidth: summary.bandwidth
            ? {
              costCents: cents(summary.bandwidth.cost_cents),
              usagePercentage: cents(summary.bandwidth.usage_percentage),
            }
            : null,
          alert: summary.alert
            ? {
              thresholdCents: cents(summary.alert.threshold_cents),
              remainingPercentage: cents(summary.alert.remaining_percentage),
            }
            : null,
          resourceTotalCents: cents(d.resources?.total_cost_cents),
          addonTotalCents: cents(d.addons?.total_cost_cents),
          applicationTotalCents: cents(d.application_totals?.total_cost_cents),
          applicationCount: d.application_totals?.application_count ?? 0,
          applications,
          addons,
          resourceLines,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
