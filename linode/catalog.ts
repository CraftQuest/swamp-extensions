/**
 * Read-only swamp model for the Linode catalog: regions, instance types with
 * pricing, and images. Use it to look up valid `region`, `type` and `image`
 * values before provisioning. Registered as `@craftquest/linode/catalog`.
 *
 * @module
 */

import { z } from "npm:zod@4";
import { compact, type Json, listAll } from "./_lib/linode.ts";
import {
  type Ctx,
  makeChecks,
  type MethodResult,
  parseFilter,
} from "./_lib/crud.ts";

/** Global arguments: only the API token. */
const GlobalArgsSchema = z.object({
  token: z.string().default("").meta({ sensitive: true }).describe(
    "Linode personal access token (vault-supplied); falls back to LINODE_TOKEN",
  ),
});

/** Resolved global arguments type. */
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** One region. */
const RegionSchema = z.object({
  id: z.string(),
  label: z.string(),
  country: z.string().optional(),
  status: z.string().optional(),
  siteType: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

/** One instance type (plan) with list pricing. */
const TypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  class: z.string().optional(),
  vcpus: z.number().optional(),
  memoryMb: z.number().optional(),
  diskMb: z.number().optional(),
  gpus: z.number().optional(),
  transferMb: z.number().optional(),
  networkOutMbps: z.number().optional(),
  priceHourly: z.number().nullable().optional(),
  priceMonthly: z.number().nullable().optional(),
});

/** One image. */
const ImageSchema = z.object({
  id: z.string(),
  label: z.string(),
  vendor: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  status: z.string().optional(),
  sizeMb: z.number().optional(),
  created: z.string().optional(),
  eol: z.string().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
});

function catalogSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    count: z.number(),
    truncated: z.boolean(),
    fetchedAt: z.iso.datetime(),
  });
}

/** Regions catalog resource schema. */
const RegionsSchema = catalogSchema(RegionSchema);
/** Types catalog resource schema. */
const TypesSchema = catalogSchema(TypeSchema);
/** Images catalog resource schema. */
const ImagesSchema = catalogSchema(ImageSchema);

/** Map a raw region onto {@link RegionSchema}. */
function toRegion(raw: Json): z.infer<typeof RegionSchema> {
  return RegionSchema.parse(compact({
    id: String(raw.id),
    label: String(raw.label ?? raw.id),
    country: raw.country,
    status: raw.status,
    siteType: raw.site_type,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities
      : undefined,
  }));
}

/** Map a raw type onto {@link TypeSchema}. */
function toType(raw: Json): z.infer<typeof TypeSchema> {
  const price = (raw.price ?? {}) as Json;
  return TypeSchema.parse(compact({
    id: String(raw.id),
    label: String(raw.label ?? raw.id),
    class: raw.class,
    vcpus: raw.vcpus,
    memoryMb: raw.memory,
    diskMb: raw.disk,
    gpus: raw.gpus,
    transferMb: raw.transfer,
    networkOutMbps: raw.network_out,
    priceHourly: price.hourly ?? null,
    priceMonthly: price.monthly ?? null,
  }));
}

/** Map a raw image onto {@link ImageSchema}. */
function toImage(raw: Json): z.infer<typeof ImageSchema> {
  return ImageSchema.parse(compact({
    id: String(raw.id),
    label: String(raw.label ?? raw.id),
    vendor: raw.vendor ?? null,
    isPublic: raw.is_public,
    deprecated: raw.deprecated,
    status: raw.status,
    sizeMb: raw.size,
    created: raw.created,
    eol: raw.eol ?? null,
    capabilities: Array.isArray(raw.capabilities)
      ? raw.capabilities
      : undefined,
  }));
}

const FilterArgs = z.object({
  filter: z.string().optional().describe(
    'Optional X-Filter JSON, e.g. {"class":"standard"}',
  ),
});
const ImagesArgs = z.object({
  filter: z.string().optional().describe(
    'Optional X-Filter JSON, e.g. {"vendor":"Ubuntu"}',
  ),
  public_only: z.boolean().default(true).describe(
    "Only public linode/* images (skips deprecated ones too)",
  ),
});

function tokenOf(ctx: Ctx): string | undefined {
  const t = ctx.globalArgs.token;
  return typeof t === "string" && t.length ? t : undefined;
}

async function fetchCatalog(
  ctx: Ctx,
  path: string,
  filter: string | undefined,
  spec: "regions" | "types" | "images",
  mapItem: (raw: Json) => Json,
  keep: (raw: Json) => boolean = () => true,
): Promise<MethodResult> {
  const { items, truncated } = await listAll(path, {
    token: tokenOf(ctx),
    filter: parseFilter(filter),
    signal: ctx.signal,
  });
  const mapped = items.filter(keep).map(mapItem);
  ctx.logger.info("Fetched {count} {spec}", { count: mapped.length, spec });
  const handle = await ctx.writeResource(spec, spec, {
    items: mapped,
    count: mapped.length,
    truncated,
    fetchedAt: new Date().toISOString(),
  });
  return { dataHandles: [handle], result: { count: mapped.length, truncated } };
}

/**
 * Read-only swamp model for the Linode regions/types/images catalog.
 * Registered as `@craftquest/linode/catalog`.
 */
export const model = {
  type: "@craftquest/linode/catalog",
  version: "2026.09.18.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    regions: {
      description: "Available regions",
      schema: RegionsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
    types: {
      description:
        "Instance types (plans) with hourly/monthly list prices in USD",
      schema: TypesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
    images: {
      description: "Deployable images",
      schema: ImagesSchema,
      lifetime: "infinite" as const,
      garbageCollection: 3,
    },
  },
  checks: makeChecks(),
  methods: {
    list_regions: {
      description: "Fetch all regions into the 'regions' resource",
      arguments: FilterArgs,
      execute: (
        args: z.infer<typeof FilterArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> =>
        fetchCatalog(
          ctx,
          "/regions",
          args.filter,
          "regions",
          (r) => toRegion(r),
        ),
    },
    list_types: {
      description:
        "Fetch all instance types with pricing into the 'types' resource",
      arguments: FilterArgs,
      execute: (
        args: z.infer<typeof FilterArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> =>
        fetchCatalog(
          ctx,
          "/linode/types",
          args.filter,
          "types",
          (r) => toType(r),
        ),
    },
    list_images: {
      description:
        "Fetch images into the 'images' resource (public, non-deprecated by default)",
      arguments: ImagesArgs,
      execute: (
        args: z.infer<typeof ImagesArgs>,
        ctx: Ctx,
      ): Promise<MethodResult> =>
        fetchCatalog(
          ctx,
          "/images",
          args.filter,
          "images",
          (r) => toImage(r),
          (r) =>
            !args.public_only ||
            (r.is_public === true && r.deprecated !== true),
        ),
    },
  },
};
