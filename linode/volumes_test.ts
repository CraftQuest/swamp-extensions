import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./volumes.ts";
import { page, withMockedFetch } from "./_lib/testing.ts";

function args(overrides: Record<string, unknown> = {}) {
  return { token: "t", label: "data-01", size: 20, region: "us-east", tags: [], ...overrides };
}

function rawVolume(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    label: "data-01",
    status: "active",
    size: 20,
    region: "us-east",
    linode_id: null,
    filesystem_path: "/dev/disk/by-id/scsi-0Linode_Volume_data-01",
    tags: [],
    encryption: "enabled",
    hardware_type: "nvme",
    created: "2026-09-18T00:00:00",
    updated: "2026-09-18T00:00:00",
    ...overrides,
  };
}

Deno.test("create requires region or linode_id and maps state", async () => {
  const bad = createModelTestContext({ globalArgs: args({ region: "" }) });
  await withMockedFetch([{ status: 200, body: page([]) }], async () => {
    await assertRejects(() => model.methods.create.execute({}, bad.context), Error, "region");
  });
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: args({ linode_id: 123, region: "" }) });
  await withMockedFetch([{ status: 200, body: page([]) }, { status: 200, body: rawVolume({ linode_id: 123, status: "creating" }) }], async (calls) => {
    await model.methods.create.execute({}, context);
    assertEquals(calls[1].body, { label: "data-01", size: 20, linode_id: 123 });
  });
  const state = getWrittenResources()[0].data;
  assertEquals(state.linodeId, 123);
  assertEquals(state.filesystemPath, "/dev/disk/by-id/scsi-0Linode_Volume_data-01");
});

Deno.test("attach, detach and resize act on the stored volume", async () => {
  const { context } = createModelTestContext({
    globalArgs: args(),
    storedResources: { "data-01": { id: 77, label: "data-01", status: "active", size: 20, linodeId: null } },
  });
  await withMockedFetch([{ status: 200, body: rawVolume({ linode_id: 123 }) }, { status: 200, body: rawVolume({ linode_id: 123 }) }], async (calls) => {
    const out = await model.methods.attach.execute({ linode_id: 123, persist_across_boots: true }, context);
    assertEquals(calls[0].path, "/volumes/77/attach");
    assertEquals(calls[0].body, { linode_id: 123, persist_across_boots: true });
    assertEquals(out.result, { status: "active", linodeId: 123 });
  });
  // detach polls until linode_id clears (Linode detaches asynchronously)
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: rawVolume({ linode_id: 123 }) },
      { status: 200, body: rawVolume({ linode_id: null }) },
      { status: 200, body: rawVolume({ linode_id: null }) },
    ],
    async (calls) => {
      const out = await model.methods.detach.execute({ timeout_seconds: 60 }, context);
      assertEquals(calls[0].path, "/volumes/77/detach");
      assertEquals(calls.length, 4);
      assertEquals(out.result, { status: "active", linodeId: null });
    },
  );
  await withMockedFetch(
    [{ status: 200, body: {} }, { status: 200, body: rawVolume({ linode_id: 123 }) }],
    async () => {
      await assertRejects(
        () => model.methods.detach.execute({ timeout_seconds: 0 }, context),
        Error,
        "still attached",
      );
    },
  );
  await assertRejects(() => model.methods.resize.execute({ size: 20 }, context), Error, "only grows");
  await withMockedFetch([{ status: 200, body: {} }, { status: 200, body: rawVolume({ size: 40, status: "resizing" }) }], async (calls) => {
    await model.methods.resize.execute({ size: 40 }, context);
    assertEquals(calls[0].path, "/volumes/77/resize");
    assertEquals(calls[0].body, { size: 40 });
  });
});

Deno.test("delete is confirmation-gated for volumes", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: rawVolume() }], async () => {
    await assertRejects(() => model.methods.delete.execute({ id: 77 }, context), Error, "confirm_label is missing");
  });
});
