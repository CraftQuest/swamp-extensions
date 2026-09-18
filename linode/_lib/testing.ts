/**
 * Test-only helpers: a canned-response fetch mock and a globalArgs builder.
 * Not part of the published extension surface.
 *
 * @module
 */

import { internals } from "./linode.ts";

/** One canned HTTP response. */
export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** One recorded fetch call. */
export interface RecordedCall {
  url: string;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  hasAuth: boolean;
}

/**
 * Replace `globalThis.fetch` with a queue of canned responses for the duration
 * of `fn`, recording every call. Retry sleeps are disabled while mocked.
 */
export async function withMockedFetch(
  responses: MockResponse[],
  fn: (calls: RecordedCall[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalSleep = internals.sleep;
  internals.sleep = () => Promise.resolve();
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      path: new URL(url).pathname.replace(/^\/v4/, "") +
        (new URL(url).search.includes("page=") ? "" : ""),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      filter: headers["X-Filter"] ? JSON.parse(headers["X-Filter"]) : undefined,
      hasAuth: typeof headers.Authorization === "string" &&
        headers.Authorization.startsWith("Bearer "),
    });
    const next = queue.shift();
    if (!next) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ errors: [{ reason: "mock queue exhausted" }] }),
          {
            status: 500,
          },
        ),
      );
    }
    const body = next.body === undefined ? "" : JSON.stringify(next.body);
    return Promise.resolve(
      new Response(body, { status: next.status, headers: next.headers }),
    );
  }) as typeof fetch;
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
    internals.sleep = originalSleep;
  }
}

/** A paginated Linode list envelope. */
export function page(
  data: unknown[],
  pageNo = 1,
  pages = 1,
): Record<string, unknown> {
  return { data, page: pageNo, pages, results: data.length };
}
