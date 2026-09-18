import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./ssh_keys.ts";
import { page, withMockedFetch } from "./_lib/testing.ts";

const key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample test@example.com";

Deno.test("create validates the key, POSTs it, and stores state", async () => {
  const bad = createModelTestContext({ globalArgs: { token: "t", label: "laptop", ssh_key: "  " } });
  await withMockedFetch([{ status: 200, body: page([]) }], async () => {
    await assertRejects(() => model.methods.create.execute({}, bad.context), Error, "ssh_key");
  });
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: { token: "t", label: "laptop", ssh_key: `${key}\n` },
  });
  await withMockedFetch(
    [{ status: 200, body: page([]) }, { status: 200, body: { id: 3, label: "laptop", ssh_key: key, created: "2026-09-18T00:00:00" } }],
    async (calls) => {
      await model.methods.create.execute({}, context);
      assertEquals(calls[1].path, "/profile/sshkeys");
      assertEquals(calls[1].body, { label: "laptop", ssh_key: key });
    },
  );
  assertEquals(getWrittenResources()[0].data, {
    id: 3,
    label: "laptop",
    status: "active",
    sshKey: key,
    created: "2026-09-18T00:00:00",
  });
});

Deno.test("delete needs no confirmation and tolerates a missing key", async () => {
  const { context } = createModelTestContext({ globalArgs: { token: "t", label: "laptop", ssh_key: key } });
  await withMockedFetch([{ status: 404, body: {} }], async () => {
    assertEquals((await model.methods.delete.execute({ id: 3 }, context)).result, { existed: false });
  });
});
