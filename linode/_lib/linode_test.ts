import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  compact,
  instanceName,
  listAll,
  parseErrors,
  request,
  resolveToken,
  waitForStatus,
} from "./linode.ts";
import { page, withMockedFetch } from "./testing.ts";

Deno.test("resolveToken prefers the explicit token and errors when none is set", () => {
  const saved = Deno.env.get("LINODE_TOKEN");
  Deno.env.delete("LINODE_TOKEN");
  try {
    assertEquals(resolveToken("abc"), "abc");
    let threw = false;
    try {
      resolveToken("");
    } catch (err) {
      threw = true;
      assert((err as Error).message.includes("LINODE_TOKEN"));
    }
    assert(threw);
    Deno.env.set("LINODE_TOKEN", "from-env");
    assertEquals(resolveToken(undefined), "from-env");
    assertEquals(resolveToken("explicit"), "explicit");
  } finally {
    if (saved === undefined) Deno.env.delete("LINODE_TOKEN");
    else Deno.env.set("LINODE_TOKEN", saved);
  }
});

Deno.test("parseErrors reads Linode's errors[] shape and tolerates junk", () => {
  assertEquals(
    parseErrors('{"errors":[{"reason":"bad","field":"label"},{"reason":"x"}]}'),
    [
      { reason: "bad", field: "label" },
      { reason: "x", field: undefined },
    ],
  );
  assertEquals(parseErrors("not json"), []);
  assertEquals(parseErrors('{"ok":true}'), []);
});

Deno.test("request sends bearer auth, X-Filter, and surfaces error reasons", async () => {
  await withMockedFetch(
    [{
      status: 400,
      body: { errors: [{ reason: "Label must be unique", field: "label" }] },
    }],
    async (calls) => {
      await assertRejects(
        () =>
          request("POST", "/linode/instances", {
            token: "t",
            body: { label: "x" },
            filter: { a: 1 },
          }),
        Error,
        "label: Label must be unique",
      );
      assertEquals(calls.length, 1);
      assert(calls[0].hasAuth);
      assertEquals(calls[0].filter, { a: 1 });
      assertEquals(calls[0].body, { label: "x" });
    },
  );
});

Deno.test("request retries 429 with Retry-After and 5xx, then succeeds", async () => {
  await withMockedFetch(
    [
      { status: 429, body: {}, headers: { "Retry-After": "1" } },
      { status: 503, body: {} },
      { status: 200, body: { id: 7 } },
    ],
    async (calls) => {
      const out = await request("GET", "/x", { token: "t" });
      assertEquals(out, { id: 7 });
      assertEquals(calls.length, 3);
    },
  );
});

Deno.test("request gives up after maxAttempts and 404 honours allowNotFound", async () => {
  await withMockedFetch(
    [{ status: 500, body: {} }, { status: 500, body: {} }, {
      status: 500,
      body: {},
    }],
    async () => {
      await assertRejects(
        () => request("GET", "/x", { token: "t" }),
        Error,
        "failed (500)",
      );
    },
  );
  await withMockedFetch([{ status: 404, body: {} }], async () => {
    assertEquals(
      await request("GET", "/x/1", { token: "t", allowNotFound: true }),
      null,
    );
  });
  await withMockedFetch([{
    status: 404,
    body: { errors: [{ reason: "Not found" }] },
  }], async () => {
    await assertRejects(
      () => request("GET", "/x/1", { token: "t" }),
      Error,
      "Not found",
    );
  });
});

Deno.test("listAll follows pages and reports truncation", async () => {
  await withMockedFetch(
    [{ status: 200, body: page([{ id: 1 }], 1, 2) }, {
      status: 200,
      body: page([{ id: 2 }], 2, 2),
    }],
    async (calls) => {
      const out = await listAll("/things", { token: "t" });
      assertEquals(out.items.map((i) => i.id), [1, 2]);
      assertEquals(out.truncated, false);
      assert(calls[0].url.includes("page=1"));
      assert(calls[0].url.includes("page_size=500"));
      assert(calls[1].url.includes("page=2"));
    },
  );
  await withMockedFetch(
    [{ status: 200, body: page([{ id: 1 }], 1, 5) }],
    async () => {
      const out = await listAll("/things", { token: "t", maxPages: 1 });
      assertEquals(out.items.length, 1);
      assertEquals(out.truncated, true);
    },
  );
});

Deno.test("instanceName sanitises labels", () => {
  assertEquals(instanceName("web-01"), "web-01");
  assertEquals(instanceName("a/b\\c..d"), "a_b_c_d");
  assertEquals(instanceName(""), "unnamed");
  assertEquals(instanceName(undefined), "unnamed");
  assertEquals(instanceName(42), "42");
});

Deno.test("compact drops undefined values only", () => {
  assertEquals(compact({ a: 1, b: undefined, c: null, d: false }), {
    a: 1,
    c: null,
    d: false,
  });
});

Deno.test("waitForStatus polls until a target status and times out otherwise", async () => {
  await withMockedFetch(
    [
      { status: 200, body: { id: 1, status: "provisioning" } },
      { status: 200, body: { id: 1, status: "booting" } },
      { status: 200, body: { id: 1, status: "running" } },
    ],
    async (calls) => {
      const seen: string[] = [];
      const out = await waitForStatus("/linode/instances", 1, ["running"], {
        token: "t",
        intervalMs: 1,
        onPoll: (s) => seen.push(s),
      });
      assertEquals(out.status, "running");
      assertEquals(seen, ["provisioning", "booting", "running"]);
      assertEquals(calls.length, 3);
    },
  );
  await withMockedFetch(
    [{ status: 200, body: { id: 1, status: "offline" } }, {
      status: 200,
      body: { id: 1, status: "offline" },
    }],
    async () => {
      await assertRejects(
        () =>
          waitForStatus("/linode/instances", 1, ["running"], {
            token: "t",
            intervalMs: 1,
            timeoutMs: 0,
          }),
        Error,
        "Timed out",
      );
    },
  );
  await withMockedFetch(
    [{ status: 200, body: { id: 1, status: "deleting" } }],
    async () => {
      await assertRejects(
        () =>
          waitForStatus("/volumes", 1, ["active"], {
            token: "t",
            failStates: ["deleting"],
          }),
        Error,
        "failure state 'deleting'",
      );
    },
  );
});
