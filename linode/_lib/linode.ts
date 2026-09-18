/**
 * Shared HTTP client for the Linode API v4 used by every `@craftquest/linode`
 * model. Handles token resolution, JSON envelopes, Linode's `errors[]` error
 * shape, 429/5xx retries, `X-Filter` filtering, and page/pages pagination.
 *
 * @module
 */

/** Base URL of the Linode API. */
export const API_BASE = "https://api.linode.com/v4";

/** A JSON object as returned by the Linode API. */
export type Json = Record<string, unknown>;

/** One entry of Linode's `errors` array. */
export interface LinodeErrorEntry {
  reason: string;
  field?: string;
}

/** Thrown when the Linode API returns a non-2xx response. */
export class LinodeApiError extends Error {
  /** HTTP status code of the failed response. */
  readonly status: number;
  /** Parsed `errors[]` entries, empty when the body was not JSON. */
  readonly errors: LinodeErrorEntry[];

  constructor(
    method: string,
    path: string,
    status: number,
    errors: LinodeErrorEntry[],
    rawBody: string,
  ) {
    const detail = errors.length
      ? errors.map((e) => (e.field ? `${e.field}: ${e.reason}` : e.reason))
        .join("; ")
      : rawBody.slice(0, 300);
    super(`Linode API ${method} ${path} failed (${status}): ${detail}`);
    this.name = "LinodeApiError";
    this.status = status;
    this.errors = errors;
  }
}

/** Options accepted by {@link request}. */
export interface RequestOptions {
  /** Explicit API token; falls back to the LINODE_TOKEN environment variable. */
  token?: string;
  /** JSON request body. */
  body?: Json;
  /** Query string parameters. */
  query?: Record<string, string | number>;
  /** Linode `X-Filter` header object (list endpoints only). */
  filter?: Json;
  /** Return `null` instead of throwing on 404. */
  allowNotFound?: boolean;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/** Overridable internals so unit tests can skip real retry delays. */
export const internals = {
  sleep: (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  maxAttempts: 3,
};

/**
 * Resolve the API token: an explicit value (typically wired from a vault via
 * the model's `token` global argument) wins over the LINODE_TOKEN env var.
 * Throws a descriptive error when neither is set.
 */
export function resolveToken(explicit?: string): string {
  const token = explicit && explicit.length > 0
    ? explicit
    : (Deno.env.get("LINODE_TOKEN") ?? "");
  if (!token) {
    throw new Error(
      "No Linode API token found. Set the model's 'token' global argument " +
        "(wire it with a vault.get(...) expression) or export LINODE_TOKEN.",
    );
  }
  return token;
}

/** Parse Linode's `{ errors: [...] }` body; returns [] for anything else. */
export function parseErrors(rawBody: string): LinodeErrorEntry[] {
  try {
    const parsed = JSON.parse(rawBody) as { errors?: unknown };
    if (!Array.isArray(parsed.errors)) return [];
    return parsed.errors
      .filter((e): e is Json => typeof e === "object" && e !== null)
      .map((e) => ({
        reason: String(e.reason ?? "unknown error"),
        field: typeof e.field === "string" ? e.field : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Perform one Linode API call and return the parsed JSON body.
 *
 * Retries on 429 (honouring `Retry-After`) and on 5xx, up to
 * `internals.maxAttempts` attempts. A 404 throws unless `allowNotFound` is set,
 * in which case `null` is returned. Never logs or echoes the token.
 */
export async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: RequestOptions = {},
): Promise<Json | null> {
  const token = resolveToken(opts.token);
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.filter !== undefined) {
    headers["X-Filter"] = JSON.stringify(opts.filter);
  }

  for (let attempt = 1;; attempt++) {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
    const text = await res.text();

    if (res.ok) {
      return text.trim() ? JSON.parse(text) as Json : {};
    }
    if (res.status === 404 && opts.allowNotFound) return null;

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < internals.maxAttempts) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const delayMs = (Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : attempt * 2) * 1000;
      await internals.sleep(delayMs);
      continue;
    }
    throw new LinodeApiError(method, path, res.status, parseErrors(text), text);
  }
}

/** Result of {@link listAll}. */
export interface ListResult {
  items: Json[];
  /** True when the page cap was hit before the collection was exhausted. */
  truncated: boolean;
}

/**
 * Fetch every page of a Linode collection endpoint (`data`, `page`, `pages`),
 * 500 items per page, following `pages` until exhausted or `maxPages` is hit.
 */
export async function listAll(
  path: string,
  opts: {
    token?: string;
    filter?: Json;
    maxPages?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ListResult> {
  const maxPages = opts.maxPages ?? 200;
  const items: Json[] = [];
  let page = 1;
  let pages = 1;
  do {
    const body = await request("GET", path, {
      token: opts.token,
      filter: opts.filter,
      query: { page, page_size: 500 },
      signal: opts.signal,
    }) ?? {};
    const data = Array.isArray(body.data) ? body.data as Json[] : [];
    items.push(...data);
    pages = typeof body.pages === "number" ? body.pages : 1;
    page++;
  } while (page <= pages && page <= maxPages);
  return { items, truncated: pages > maxPages };
}

/**
 * Convert a Linode label into a safe swamp data instance name: path
 * separators, `..` and NUL bytes are replaced, and an empty label becomes
 * `unnamed`.
 */
export function instanceName(label: unknown): string {
  const raw = label === undefined || label === null ? "" : String(label);
  const cleaned = raw.replace(/[\/\\]/g, "_").replace(/\.\./g, "_").replace(
    /\0/g,
    "",
  ).trim();
  return cleaned.length ? cleaned : "unnamed";
}

/**
 * Poll `GET {path}/{id}` until `status` is one of `targets`, one of
 * `failStates`, or the timeout elapses. Returns the final object.
 */
export async function waitForStatus(
  path: string,
  id: number,
  targets: string[],
  opts: {
    token?: string;
    failStates?: string[];
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onPoll?: (status: string) => void;
  } = {},
): Promise<Json> {
  const intervalMs = opts.intervalMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const failStates = opts.failStates ?? [];
  const started = Date.now();
  let last = "";
  for (;;) {
    const obj = await request("GET", `${path}/${id}`, {
      token: opts.token,
      signal: opts.signal,
    });
    if (!obj) {
      throw new Error(
        `${path}/${id} disappeared while waiting for ${targets.join("|")}`,
      );
    }
    last = String(obj.status ?? "");
    opts.onPoll?.(last);
    if (targets.includes(last)) return obj;
    if (failStates.includes(last)) {
      throw new Error(
        `${path}/${id} entered failure state '${last}' while waiting for ${
          targets.join("|")
        }`,
      );
    }
    if (Date.now() - started >= timeoutMs) {
      throw new Error(
        `Timed out after ${
          Math.round(timeoutMs / 1000)
        }s waiting for ${path}/${id} to reach ${
          targets.join("|")
        } (last status: ${last})`,
      );
    }
    await internals.sleep(intervalMs);
  }
}

/** Strip `undefined` values so they are not serialised into request bodies. */
export function compact(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
