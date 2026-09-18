import { assertEquals } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./catalog.ts";
import { page, withMockedFetch } from "./_lib/testing.ts";

Deno.test("list_types maps pricing and honours the filter", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: { token: "t" } });
  await withMockedFetch(
    [{
      status: 200,
      body: page([{
        id: "g6-nanode-1",
        label: "Nanode 1GB",
        class: "nanode",
        vcpus: 1,
        memory: 1024,
        disk: 25600,
        gpus: 0,
        transfer: 1000,
        network_out: 1000,
        price: { hourly: 0.0075, monthly: 5 },
      }]),
    }],
    async (calls) => {
      const out = await model.methods.list_types.execute({ filter: '{"class":"nanode"}' }, context);
      assertEquals(out.result, { count: 1, truncated: false });
      assertEquals(calls[0].filter, { class: "nanode" });
      assertEquals(calls[0].path, "/linode/types");
    },
  );
  const w = getWrittenResources()[0];
  assertEquals(w.specName, "types");
  assertEquals((w.data.items as unknown[])[0], {
    id: "g6-nanode-1",
    label: "Nanode 1GB",
    class: "nanode",
    vcpus: 1,
    memoryMb: 1024,
    diskMb: 25600,
    gpus: 0,
    transferMb: 1000,
    networkOutMbps: 1000,
    priceHourly: 0.0075,
    priceMonthly: 5,
  });
});

Deno.test("list_images drops private and deprecated images by default", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: { token: "t" } });
  const images = [
    { id: "linode/ubuntu24.04", label: "Ubuntu 24.04 LTS", vendor: "Ubuntu", is_public: true, deprecated: false, status: "available", size: 3500, created: "2024-04-25T00:00:00", eol: null, capabilities: ["cloud-init"] },
    { id: "linode/ubuntu20.04", label: "Ubuntu 20.04", vendor: "Ubuntu", is_public: true, deprecated: true },
    { id: "private/1", label: "mine", vendor: null, is_public: false, deprecated: false },
  ];
  await withMockedFetch([{ status: 200, body: page(images) }], async () => {
    await model.methods.list_images.execute({ public_only: true }, context);
  });
  await withMockedFetch([{ status: 200, body: page(images) }], async () => {
    await model.methods.list_images.execute({ public_only: false }, context);
  });
  const [publicOnly, all] = getWrittenResources();
  assertEquals(publicOnly.data.count, 1);
  assertEquals(all.data.count, 3);
  assertEquals((all.data.items as Array<Record<string, unknown>>)[2].vendor, null);
});

Deno.test("list_regions maps the region shape", async () => {
  const { context, getWrittenResources } = createModelTestContext({ globalArgs: { token: "t" } });
  await withMockedFetch(
    [{ status: 200, body: page([{ id: "us-east", label: "Newark, NJ", country: "us", status: "ok", site_type: "core", capabilities: ["Linodes"] }]) }],
    async () => {
      await model.methods.list_regions.execute({}, context);
    },
  );
  assertEquals((getWrittenResources()[0].data.items as unknown[])[0], {
    id: "us-east",
    label: "Newark, NJ",
    country: "us",
    status: "ok",
    siteType: "core",
    capabilities: ["Linodes"],
  });
});
