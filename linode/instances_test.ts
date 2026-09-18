import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./instances.ts";
import { page, withMockedFetch } from "./_lib/testing.ts";

function args(overrides: Record<string, unknown> = {}) {
  return {
    token: "test-token",
    label: "web-01",
    region: "us-east",
    type: "g6-nanode-1",
    image: "linode/ubuntu24.04",
    root_pass: "",
    authorized_keys: ["ssh-ed25519 AAAA test@example.com"],
    authorized_users: [],
    tags: ["swamp"],
    private_ip: false,
    backups_enabled: false,
    booted: true,
    stackscript_data: {},
    user_data: "",
    ...overrides,
  };
}

function rawInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    label: "web-01",
    status: "running",
    region: "us-east",
    type: "g6-nanode-1",
    image: "linode/ubuntu24.04",
    ipv4: ["192.0.2.10"],
    ipv6: "2001:db8::1/128",
    tags: ["swamp"],
    created: "2026-09-18T00:00:00",
    updated: "2026-09-18T00:00:00",
    specs: { disk: 25600, memory: 1024, vcpus: 1, transfer: 1000, gpus: 0 },
    backups: { enabled: false },
    hypervisor: "kvm",
    watchdog_enabled: true,
    has_user_data: false,
    ...overrides,
  };
}

Deno.test("create POSTs the expected body (base64 user_data) and stores state", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ user_data: "#cloud-config\nhostname: web", firewall_id: 9 }),
  });
  await withMockedFetch(
    [{ status: 200, body: page([]) }, { status: 200, body: rawInstance({ status: "provisioning" }) }],
    async (calls) => {
      const out = await model.methods.create.execute({}, context);
      assertEquals(out.result, { created: true, id: 123 });
      assertEquals(calls[0].method, "GET");
      assertEquals(calls[0].filter, { label: "web-01" });
      assertEquals(calls[1].method, "POST");
      assertEquals(calls[1].path, "/linode/instances");
      assertEquals(calls[1].body, {
        label: "web-01",
        region: "us-east",
        type: "g6-nanode-1",
        image: "linode/ubuntu24.04",
        authorized_keys: ["ssh-ed25519 AAAA test@example.com"],
        tags: ["swamp"],
        booted: true,
        firewall_id: 9,
        metadata: { user_data: btoa("#cloud-config\nhostname: web") },
      });
    },
  );
  const [written] = getWrittenResources();
  assertEquals(written.specName, "state");
  assertEquals(written.name, "web-01");
  assertEquals(written.data.status, "provisioning");
  assertEquals(written.data.ipv4, ["192.0.2.10"]);
  assertEquals(written.data.specs, { disk: 25600, memory: 1024, vcpus: 1, transfer: 1000, gpus: 0 });
  assertEquals(written.data.backupsEnabled, false);
});

Deno.test("create adopts an existing instance with the same label instead of duplicating", async () => {
  const { context, getWrittenResources, getLogsByLevel } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch([{ status: 200, body: page([rawInstance()]) }], async (calls) => {
    const out = await model.methods.create.execute({}, context);
    assertEquals(out.result, { created: false, id: 123 });
    assertEquals(calls.length, 1);
  });
  assertEquals(getWrittenResources()[0].data.id, 123);
  assert(getLogsByLevel("warning").length >= 1);
});

Deno.test("create refuses without region or a login method", async () => {
  const noRegion = createModelTestContext({ globalArgs: args({ region: "" }) });
  await withMockedFetch([{ status: 200, body: page([]) }], async () => {
    await assertRejects(() => model.methods.create.execute({}, noRegion.context), Error, "region");
  });
  const noLogin = createModelTestContext({ globalArgs: args({ authorized_keys: [] }) });
  await withMockedFetch([{ status: 200, body: page([]) }], async () => {
    await assertRejects(() => model.methods.create.execute({}, noLogin.context), Error, "root_pass");
  });
});

Deno.test("delete is gated on confirm_label and tolerates already-deleted instances", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: rawInstance() }], async () => {
    await assertRejects(
      () => model.methods.delete.execute({ id: 123, confirm_label: "other" }, context),
      Error,
      "does not match",
    );
  });
  await withMockedFetch([{ status: 200, body: rawInstance() }], async () => {
    await assertRejects(() => model.methods.delete.execute({ id: 123 }, context), Error, "is missing");
  });
  await withMockedFetch(
    [{ status: 200, body: rawInstance() }, { status: 200, body: {} }],
    async (calls) => {
      const out = await model.methods.delete.execute({ id: 123, confirm_label: "web-01" }, context);
      assertEquals(out.result, { existed: true });
      assertEquals(calls[1].method, "DELETE");
      assertEquals(calls[1].path, "/linode/instances/123");
    },
  );
  await withMockedFetch([{ status: 404, body: {} }], async (calls) => {
    const out = await model.methods.delete.execute({ id: 123, confirm_label: "web-01" }, context);
    assertEquals(out.result, { existed: false });
    assertEquals(calls.length, 1);
  });
  const written = getWrittenResources();
  assertEquals(written[0].data.status, "deleted");
  assertEquals(written[1].data.status, "not_found");
});

Deno.test("update and sync use the stored state id", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ tags: ["swamp", "prod"], watchdog_enabled: false }),
    storedResources: { "web-01": { id: 123, label: "web-01", status: "running" } },
  });
  await withMockedFetch([{ status: 200, body: rawInstance({ tags: ["swamp", "prod"] }) }], async (calls) => {
    await model.methods.update.execute({}, context);
    assertEquals(calls[0].method, "PUT");
    assertEquals(calls[0].path, "/linode/instances/123");
    assertEquals(calls[0].body, { label: "web-01", tags: ["swamp", "prod"], watchdog_enabled: false });
  });
  await withMockedFetch([{ status: 404, body: {} }], async () => {
    await model.methods.sync.execute({}, context);
  });
  const written = getWrittenResources();
  assertEquals(written[0].data.tags, ["swamp", "prod"]);
  assertEquals(written[1].data.status, "not_found");
  assert(typeof written[1].data.syncedAt === "string");
});

Deno.test("sync and actions fail clearly without stored state", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await assertRejects(() => model.methods.sync.execute({}, context), Error, "run create, lookup, or adopt first");
  await assertRejects(() => model.methods.shutdown.execute({}, context), Error, "No stored state");
});

Deno.test("list writes one state per instance plus a listing summary", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch(
    [
      { status: 200, body: page([rawInstance(), rawInstance({ id: 124, label: "web-02" })], 1, 2) },
      { status: 200, body: page([rawInstance({ id: 125, label: "db-01" })], 2, 2) },
    ],
    async (calls) => {
      const out = await model.methods.list.execute({ filter: '{"tags":"swamp"}' }, context);
      assertEquals(out.result, { count: 3, truncated: false });
      assertEquals(calls[0].filter, { tags: "swamp" });
    },
  );
  const written = getWrittenResources();
  assertEquals(written.map((w) => w.name), ["web-01", "web-02", "db-01", "listing"]);
  assertEquals(written[3].specName, "listing");
  assertEquals(written[3].data.count, 3);
  assertEquals(written[3].data.truncated, false);
  await assertRejects(() => model.methods.list.execute({ filter: "nope" }, context), Error, "Invalid filter JSON");
});

Deno.test("lookup requires exactly one match; adopt verifies the label", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: page([]) }], async () => {
    await assertRejects(() => model.methods.lookup.execute({}, context), Error, "No Linode instance found");
  });
  await withMockedFetch([{ status: 200, body: page([rawInstance(), rawInstance({ id: 9 })]) }], async () => {
    await assertRejects(() => model.methods.lookup.execute({}, context), Error, "use adopt");
  });
  await withMockedFetch([{ status: 200, body: page([rawInstance()]) }], async () => {
    assertEquals((await model.methods.lookup.execute({}, context)).result, { id: 123 });
  });
  await withMockedFetch([{ status: 200, body: rawInstance() }], async () => {
    await assertRejects(
      () => model.methods.adopt.execute({ id: 123, expected_label: "db-01" }, context),
      Error,
      "Identity mismatch",
    );
  });
});

Deno.test("boot/reboot/shutdown post the action and refresh state; wait polls to running", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
    storedResources: { "web-01": { id: 123, label: "web-01", status: "offline" } },
  });
  await withMockedFetch(
    [{ status: 200, body: {} }, { status: 200, body: rawInstance({ status: "booting" }) }],
    async (calls) => {
      const out = await model.methods.boot.execute({ config_id: 5 }, context);
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].path, "/linode/instances/123/boot");
      assertEquals(calls[0].body, { config_id: 5 });
      assertEquals(out.result, { status: "booting" });
    },
  );
  await withMockedFetch(
    [{ status: 200, body: {} }, { status: 200, body: rawInstance({ status: "shutting_down" }) }],
    async (calls) => {
      await model.methods.shutdown.execute({}, context);
      assertEquals(calls[0].path, "/linode/instances/123/shutdown");
      assertEquals(calls[0].body, {});
    },
  );
  await withMockedFetch(
    [
      { status: 200, body: rawInstance({ status: "booting" }) },
      { status: 200, body: rawInstance({ status: "running" }) },
    ],
    async () => {
      const out = await model.methods.wait.execute(
        { status: "running", timeout_seconds: 10, interval_seconds: 1 },
        context,
      );
      assertEquals(out.result, { status: "running", ipv4: ["192.0.2.10"] });
    },
  );
  const written = getWrittenResources();
  assertEquals(written.at(-1)?.data.status, "running");
});

Deno.test("methods reject when no token is available", async () => {
  const saved = Deno.env.get("LINODE_TOKEN");
  Deno.env.delete("LINODE_TOKEN");
  try {
    const { context } = createModelTestContext({ globalArgs: args({ token: "" }) });
    await withMockedFetch([], async (calls) => {
      await assertRejects(() => model.methods.get.execute({ id: 1 }, context), Error, "No Linode API token");
      assertEquals(calls.length, 0);
    });
  } finally {
    if (saved !== undefined) Deno.env.set("LINODE_TOKEN", saved);
  }
});
