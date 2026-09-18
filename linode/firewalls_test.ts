import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./firewalls.ts";
import { page, withMockedFetch } from "./_lib/testing.ts";

const sshRule = {
  action: "ACCEPT",
  protocol: "TCP",
  ports: "22",
  addresses: { ipv4: ["0.0.0.0/0"], ipv6: ["::/0"] },
  label: "ssh",
};

function args(overrides: Record<string, unknown> = {}) {
  return {
    token: "t",
    label: "web-fw",
    tags: [],
    inbound_policy: "DROP",
    outbound_policy: "ACCEPT",
    inbound: [sshRule],
    outbound: [],
    linodes: [123],
    ...overrides,
  };
}

function rawFirewall(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    label: "web-fw",
    status: "enabled",
    tags: [],
    rules: { inbound: [sshRule], outbound: [], inbound_policy: "DROP", outbound_policy: "ACCEPT", fingerprint: "abcd1234", version: 1 },
    created: "2026-09-18T00:00:00",
    updated: "2026-09-18T00:00:00",
    ...overrides,
  };
}

const device = { id: 900, entity: { id: 123, type: "linode", label: "web-01", url: "/v4/linode/instances/123" } };

Deno.test("create sends rules and devices and maps state", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: page([]) }, { status: 200, body: rawFirewall() }], async (calls) => {
    await model.methods.create.execute({}, context);
    assertEquals(calls[1].path, "/networking/firewalls");
    assertEquals(calls[1].body, {
      label: "web-fw",
      rules: { inbound_policy: "DROP", outbound_policy: "ACCEPT", inbound: [sshRule], outbound: [] },
      devices: { linodes: [123] },
    });
  });
  const state = getWrittenResources()[0].data as Record<string, unknown>;
  assertEquals(state.status, "enabled");
  assertEquals((state.rules as Record<string, unknown>).fingerprint, "abcd1234");
});

Deno.test("update_rules PUTs the full rule set then refreshes with devices", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ inbound: [] }),
    storedResources: { "web-fw": { id: 55, label: "web-fw", status: "enabled" } },
  });
  await withMockedFetch(
    [{ status: 200, body: {} }, { status: 200, body: rawFirewall() }, { status: 200, body: page([device]) }],
    async (calls) => {
      await model.methods.update_rules.execute({}, context);
      assertEquals(calls[0].method, "PUT");
      assertEquals(calls[0].path, "/networking/firewalls/55/rules");
      assertEquals(calls[0].body, { inbound_policy: "DROP", outbound_policy: "ACCEPT", inbound: [], outbound: [] });
      assertEquals(calls[2].path, "/networking/firewalls/55/devices");
    },
  );
  const state = getWrittenResources()[0].data as Record<string, unknown>;
  assertEquals(state.devices, [{ id: 900, entityId: 123, entityType: "linode", entityLabel: "web-01" }]);
});

Deno.test("attach is idempotent and detach removes the matching device", async () => {
  const { context } = createModelTestContext({
    globalArgs: args(),
    storedResources: { "web-fw": { id: 55, label: "web-fw", status: "enabled" } },
  });
  await withMockedFetch(
    [
      { status: 200, body: page([device]) },
      { status: 200, body: rawFirewall() },
      { status: 200, body: page([device]) },
    ],
    async (calls) => {
      await model.methods.attach.execute({ linode_id: 123 }, context);
      assertEquals(calls.filter((c) => c.method === "POST").length, 0);
    },
  );
  await withMockedFetch(
    [
      { status: 200, body: page([]) },
      { status: 200, body: device },
      { status: 200, body: rawFirewall() },
      { status: 200, body: page([device]) },
    ],
    async (calls) => {
      await model.methods.attach.execute({ linode_id: 123 }, context);
      assertEquals(calls[1].method, "POST");
      assertEquals(calls[1].body, { id: 123, type: "linode" });
    },
  );
  await withMockedFetch(
    [
      { status: 200, body: page([device]) },
      { status: 200, body: {} },
      { status: 200, body: rawFirewall() },
      { status: 200, body: page([]) },
    ],
    async (calls) => {
      await model.methods.detach.execute({ linode_id: 123 }, context);
      assertEquals(calls[1].method, "DELETE");
      assertEquals(calls[1].path, "/networking/firewalls/55/devices/900");
    },
  );
});

Deno.test("delete needs no confirmation label for firewalls", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: rawFirewall() }, { status: 200, body: {} }], async (calls) => {
    const out = await model.methods.delete.execute({ id: 55 }, context);
    assertEquals(out.result, { existed: true });
    assertEquals(calls[1].method, "DELETE");
  });
  const fresh = createModelTestContext({ globalArgs: args() });
  await assertRejects(
    () => model.methods.update_rules.execute({}, fresh.context),
    Error,
    "No stored state",
  );
});
