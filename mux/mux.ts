import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  muxTokenId: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe("Mux access token ID (vault-supplied)"),
  muxTokenSecret: z
    .string()
    .default("")
    .meta({ sensitive: true })
    .describe("Mux access token secret (vault-supplied)"),
  assetId: z
    .string()
    .default("")
    .describe("Target Mux asset ID (get/wait/playback/delete methods)"),
  playbackId: z
    .string()
    .default("")
    .describe(
      "Target playback ID (delete_playback_id and sign_playback_token)",
    ),
  videoUrl: z
    .string()
    .default("")
    .describe(
      "Source video URL for create_asset (must be publicly fetchable by Mux)",
    ),
  playbackPolicy: z
    .enum(["public", "signed", "drm"])
    .default("public")
    .describe(
      "Playback policy for new assets, uploads, and playback IDs (drm requires a Mux DRM-enabled plan)",
    ),
  passthrough: z
    .string()
    .default("")
    .describe(
      "Free-form passthrough metadata attached to created assets (max 255 chars)",
    ),
  corsOrigin: z
    .string()
    .default("*")
    .describe("CORS origin allowed to PUT to a direct upload URL"),
  uploadId: z
    .string()
    .default("")
    .describe("Target direct-upload ID (check_upload only)"),
  testMode: z
    .boolean()
    .default(false)
    .describe("Create free watermarked test assets (deleted by Mux after 24h)"),
  confirmAssetId: z
    .string()
    .default("")
    .describe(
      "Delete safety gate: must exactly equal assetId, which must exist in the synced library",
    ),
  audience: z
    .enum(["video", "thumbnail", "gif", "storyboard", "drm"])
    .default("video")
    .describe("What a signed playback token grants access to"),
  tokenTtl: z
    .number()
    .default(3600)
    .describe("Signed playback token lifetime in seconds"),
  confirmSigningKeyId: z
    .string()
    .default("")
    .describe(
      "Revoke safety gate: must exactly equal the stored signing key ID",
    ),
  liveStreamId: z
    .string()
    .default("")
    .describe(
      "Target live stream ID (get/complete/reset/delete live-stream methods)",
    ),
  confirmLiveStreamId: z
    .string()
    .default("")
    .describe(
      "Safety gate for reset_stream_key and delete_live_stream: must exactly equal liveStreamId",
    ),
  latencyMode: z
    .enum(["low", "reduced", "standard"])
    .default("standard")
    .describe("Live stream latency mode (lower latency trades some stability)"),
  reconnectWindow: z
    .number()
    .default(60)
    .describe(
      "Seconds Mux waits for an interrupted encoder to reconnect before ending the stream (0-1800)",
    ),
  metricId: z
    .string()
    .default("views")
    .describe(
      "Mux Data metric ID for get_metrics (e.g. views, watch_time, viewer_experience_score, playback_failure_percentage)",
    ),
  timeframe: z
    .string()
    .default("7:days")
    .describe(
      "Analytics window: '<n>:days' or '<n>:hours' (e.g. 24:hours, 30:days)",
    ),
  groupBy: z
    .string()
    .default("")
    .describe(
      "Breakdown dimension for get_metrics (e.g. video_title, country, browser); empty = overall only",
    ),
  metricFilter: z
    .string()
    .default("")
    .describe(
      "Optional Mux Data filter, 'dimension:value' (e.g. video_id:abc123, country:US)",
    ),
});

const PlaybackIdSchema = z.object({
  id: z.string(),
  policy: z.string(),
});

const AssetSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  duration: z.number().optional(),
  aspectRatio: z.string().optional(),
  resolutionTier: z.string().optional(),
  createdAt: z.string(),
  playbackIds: z.array(PlaybackIdSchema),
  passthrough: z.string().optional(),
  test: z.boolean().optional(),
});

const LibrarySchema = z.object({
  assets: z.array(AssetSummarySchema),
  assetCount: z.number(),
  readyCount: z.number(),
  syncedAt: z.string(),
});

const AssetSchema = AssetSummarySchema.extend({
  maxStoredResolution: z.string().optional(),
  errors: z
    .object({ type: z.string().optional(), messages: z.array(z.string()) })
    .optional(),
  playbackUrl: z
    .string()
    .optional()
    .describe("Convenience HLS URL for the first public playback ID"),
  updatedAt: z.string(),
});

const UploadSchema = z.object({
  id: z.string(),
  url: z.string().describe(
    "PUT the video file to this URL (expires after timeout)",
  ),
  status: z.string(),
  assetId: z.string().optional(),
  timeout: z.number(),
  corsOrigin: z.string().optional(),
  test: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const SigningSchema = z.object({
  keyId: z.string(),
  privateKey: z
    .string()
    .meta({ sensitive: true })
    .describe("RSA private key PEM (vault-stored, never in plain state)"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const PlaybackTokenSchema = z.object({
  playbackId: z.string(),
  audience: z.string(),
  token: z.string().describe("RS256 JWT; append as ?token=... (short-lived)"),
  signedUrl: z
    .string()
    .optional()
    .describe("Ready-to-use signed URL (absent for drm tokens)"),
  expiresAt: z.string(),
  keyId: z.string(),
  createdAt: z.string(),
});

const LiveStreamSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
  latencyMode: z.string().optional(),
  reconnectWindow: z.number().optional(),
  createdAt: z.string(),
  playbackIds: z.array(PlaybackIdSchema),
  passthrough: z.string().optional(),
  test: z.boolean().optional(),
});

const LiveStreamsSchema = z.object({
  streams: z.array(LiveStreamSummarySchema),
  streamCount: z.number(),
  activeCount: z.number(),
  syncedAt: z.string(),
});

const LiveSchema = LiveStreamSummarySchema.extend({
  streamKey: z
    .string()
    .meta({ sensitive: true })
    .describe("Stream key (vault-stored; anyone holding it can broadcast)"),
  rtmpUrl: z
    .string()
    .describe("RTMPS ingest endpoint; pair with the vaulted stream key"),
  playbackUrl: z
    .string()
    .optional()
    .describe("Convenience HLS URL for the first public playback ID"),
  updatedAt: z.string(),
});

const VideoViewSchema = z.object({
  id: z.string(),
  viewStart: z.string().optional(),
  viewEnd: z.string().optional(),
  videoTitle: z.string().optional(),
  watchTime: z.number().optional(),
  viewerExperienceScore: z.number().optional(),
  countryCode: z.string().optional(),
  errorTypeId: z.number().optional(),
  playbackFailure: z.boolean().optional(),
});

const ViewsSchema = z.object({
  views: z.array(VideoViewSchema),
  totalRowCount: z.number(),
  timeframe: z.string(),
  filter: z.string().optional(),
  syncedAt: z.string(),
});

const MetricsSchema = z.object({
  metricId: z.string(),
  timeframe: z.string(),
  filter: z.string().optional(),
  groupBy: z.string().optional(),
  overall: z.object({
    value: z.number().nullable(),
    totalViews: z.number().optional(),
    totalWatchTime: z.number().optional(),
  }),
  breakdown: z.array(
    z.object({
      field: z.string().nullable(),
      value: z.number().nullable(),
      views: z.number().optional(),
    }),
  ),
  syncedAt: z.string(),
});

const PlaybackErrorsSchema = z.object({
  errors: z.array(
    z.object({
      id: z.number().optional(),
      code: z.number().nullable().optional(),
      message: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      count: z.number().optional(),
      percentage: z.number().optional(),
      lastSeen: z.string().optional(),
    }),
  ),
  errorCount: z.number(),
  timeframe: z.string(),
  syncedAt: z.string(),
});

type LibraryData = z.infer<typeof LibrarySchema>;
type AssetData = z.infer<typeof AssetSchema>;
type AssetSummary = z.infer<typeof AssetSummarySchema>;
type SigningData = z.infer<typeof SigningSchema>;
type LiveStreamsData = z.infer<typeof LiveStreamsSchema>;
type LiveStreamSummary = z.infer<typeof LiveStreamSummarySchema>;
type LiveData = z.infer<typeof LiveSchema>;

// deno-lint-ignore no-explicit-any
type Context = any;
// deno-lint-ignore no-explicit-any
type MuxJson = any;

// --- Helpers ---

const MUX_API_BASE = "https://api.mux.com";
const SYNC_PAGE_LIMIT = 100;
const SYNC_MAX_PAGES = 1000; // 100k assets; warns if the cap is hit
const READY_POLL_INTERVAL_MS = 5000;
const READY_POLL_ATTEMPTS = 60;

/**
 * Pause execution for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the Mux REST API with HTTP Basic auth and return the parsed JSON body.
 *
 * Retries once on 429 (respecting Retry-After) and on 5xx responses. Error
 * messages include the (truncated) response body — Mux puts the useful
 * diagnostics there — but never the credentials. With `allowNotFound`, a 404
 * returns null instead of throwing (for idempotent deletes).
 */
async function muxApi(
  tokenId: string,
  tokenSecret: string,
  method: string,
  path: string,
  body?: unknown,
  opts: { allowNotFound?: boolean } = {},
): Promise<MuxJson> {
  if (!tokenId || !tokenSecret) {
    throw new Error(
      "Mux credentials are empty — check the vault wiring for MUX_TOKEN_ID / MUX_TOKEN_SECRET.",
    );
  }
  const auth = "Basic " + btoa(`${tokenId}:${tokenSecret}`);

  for (let attempt = 1;; attempt++) {
    const res = await fetch(`${MUX_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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
      `Mux API ${method} ${path} failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }
}

/**
 * Map a raw Mux asset object to the summary shape stored in the library.
 */
function toAssetSummary(raw: MuxJson): AssetSummary {
  return {
    id: raw.id,
    status: raw.status,
    duration: raw.duration ?? undefined,
    aspectRatio: raw.aspect_ratio ?? undefined,
    resolutionTier: raw.resolution_tier ?? undefined,
    createdAt: String(raw.created_at ?? ""),
    playbackIds: (raw.playback_ids ?? []).map((p: MuxJson) => ({
      id: p.id,
      policy: p.policy,
    })),
    passthrough: raw.passthrough ?? undefined,
    test: raw.test ?? undefined,
  };
}

/**
 * Map a raw Mux asset object to the full asset detail shape, including the
 * convenience HLS playback URL for the first public playback ID.
 */
function toAssetDetail(raw: MuxJson): AssetData {
  const summary = toAssetSummary(raw);
  const publicPlayback = summary.playbackIds.find((p) => p.policy === "public");
  return {
    ...summary,
    maxStoredResolution: raw.max_stored_resolution ?? undefined,
    errors: raw.errors
      ? { type: raw.errors.type, messages: raw.errors.messages ?? [] }
      : undefined,
    playbackUrl: publicPlayback
      ? `https://stream.mux.com/${publicPlayback.id}.m3u8`
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Map a raw Mux direct-upload object to the upload resource shape.
 */
function toUpload(
  raw: MuxJson,
  createdAt?: string,
): z.infer<typeof UploadSchema> {
  const now = new Date().toISOString();
  return {
    id: raw.id,
    url: raw.url ?? "",
    status: raw.status,
    assetId: raw.asset_id ?? undefined,
    timeout: raw.timeout ?? 3600,
    corsOrigin: raw.cors_origin ?? undefined,
    test: raw.test ?? undefined,
    createdAt: createdAt ?? now,
    updatedAt: now,
  };
}

/** Maps the human-readable audience to Mux's JWT `aud` claim value. */
const AUDIENCE_CLAIMS: Record<string, string> = {
  video: "v",
  thumbnail: "t",
  gif: "g",
  storyboard: "s",
  drm: "d",
};

/**
 * Build the ready-to-use signed URL for an audience, or undefined for drm
 * (DRM license tokens are presented during license acquisition, not in URLs).
 */
function signedUrlFor(
  audience: string,
  playbackId: string,
  token: string,
): string | undefined {
  switch (audience) {
    case "video":
      return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    case "thumbnail":
      return `https://image.mux.com/${playbackId}/thumbnail.jpg?token=${token}`;
    case "gif":
      return `https://image.mux.com/${playbackId}/animated.gif?token=${token}`;
    case "storyboard":
      return `https://image.mux.com/${playbackId}/storyboard.vtt?token=${token}`;
    default:
      return undefined;
  }
}

/**
 * Encode a DER length field (short or long form).
 */
function derLength(len: number): number[] {
  if (len < 0x80) return [len];
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

/**
 * Wrap a PKCS#1 RSAPrivateKey DER in a PKCS#8 PrivateKeyInfo structure so
 * Web Crypto can import it (Mux returns PKCS#1 PEMs; importKey wants PKCS#8).
 */
function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  // AlgorithmIdentifier: SEQUENCE { OID rsaEncryption (1.2.840.113549.1.1.1), NULL }
  const algId = [
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  ];
  const version = [0x02, 0x01, 0x00];
  const octetString = [0x04, ...derLength(pkcs1.length)];
  const contentLen = version.length + algId.length + octetString.length +
    pkcs1.length;
  const header = [
    0x30,
    ...derLength(contentLen),
    ...version,
    ...algId,
    ...octetString,
  ];
  const out = new Uint8Array(header.length + pkcs1.length);
  out.set(header);
  out.set(pkcs1, header.length);
  return out;
}

/**
 * Convert a private-key PEM (PKCS#1 "RSA PRIVATE KEY" or PKCS#8
 * "PRIVATE KEY") to PKCS#8 DER bytes for Web Crypto import.
 */
function pemToPkcs8Der(pem: string): Uint8Array {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const body = pem
    .replace(/-----(BEGIN|END)[A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return isPkcs1 ? wrapPkcs1InPkcs8(der) : der;
}

/**
 * Base64url-encode a string or byte array (JWT alphabet, no padding).
 */
function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Sign an RS256 JWT with Web Crypto. The key ID is placed in the header
 * (standard JWT `kid`) and mirrored in the payload, matching what Mux's
 * verification accepts. No external JWT library required.
 */
async function signJwtRS256(
  privateKeyPem: string,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Der(privateKeyPem) as unknown as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const header = { alg: "RS256", typ: "JWT", kid };
  const signingInput = `${b64url(JSON.stringify(header))}.${
    b64url(JSON.stringify({ ...payload, kid }))
  }`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  return `${signingInput}.${b64url(sig)}`;
}

const RTMP_INGEST_URL = "rtmps://global-live.mux.com:443/app";

/**
 * Map a raw Mux live stream to the catalog summary shape. Deliberately
 * excludes the stream key — the catalog is plain state; keys only ever
 * live in the vault-backed `live` resource.
 */
function toLiveStreamSummary(raw: MuxJson): LiveStreamSummary {
  return {
    id: raw.id,
    status: raw.status,
    latencyMode: raw.latency_mode ?? undefined,
    reconnectWindow: raw.reconnect_window ?? undefined,
    createdAt: String(raw.created_at ?? ""),
    playbackIds: (raw.playback_ids ?? []).map((p: MuxJson) => ({
      id: p.id,
      policy: p.policy,
    })),
    passthrough: raw.passthrough ?? undefined,
    test: raw.test ?? undefined,
  };
}

/**
 * Map a raw Mux live stream to the full `live` detail shape, including the
 * sensitive stream key and convenience ingest/playback URLs.
 */
function toLiveDetail(raw: MuxJson): LiveData {
  const summary = toLiveStreamSummary(raw);
  const publicPlayback = summary.playbackIds.find((p) => p.policy === "public");
  return {
    ...summary,
    streamKey: raw.stream_key ?? "",
    rtmpUrl: RTMP_INGEST_URL,
    playbackUrl: publicPlayback
      ? `https://stream.mux.com/${publicPlayback.id}.m3u8`
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Assert a Mux API response carries a `data` payload and return it.
 */
function requireData(res: MuxJson, what: string): MuxJson {
  if (!res?.data) {
    throw new Error(`Mux API response for ${what} had no data payload.`);
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
 * Fetch a single asset from Mux and persist it as the current asset detail.
 */
async function fetchAndWriteAsset(
  context: Context,
  assetId: string,
): Promise<{ dataHandles: MuxJson[] }> {
  const { muxTokenId, muxTokenSecret } = context.globalArgs;
  const res = await muxApi(
    muxTokenId,
    muxTokenSecret,
    "GET",
    `/video/v1/assets/${assetId}`,
  );
  const data = requireData(res, `asset ${assetId}`);
  context.logger.info("Fetched asset {id} (status: {status})", {
    id: data.id,
    status: data.status,
  });
  const handle = await context.writeResource(
    "asset",
    "asset",
    toAssetDetail(data),
  );
  return { dataHandles: [handle] };
}

// --- Model ---

/**
 * Manages a Mux video library: asset ingestion (from URL or direct upload),
 * playback IDs, and a synced local catalog — with a confirmation-gated delete.
 *
 * Phase 1 of @craftquest/mux covers the Mux Video asset core. Credentials are
 * a Mux access-token ID/secret pair supplied via vault expressions in the
 * instance definition; they are never accepted as plain inputs and never
 * written to state. All calls are plain HTTPS against api.mux.com — no shell,
 * no SDK.
 *
 * State model: `library` holds the synced asset catalog, `asset` holds the
 * most recently touched asset's full detail, and `upload` tracks the latest
 * direct upload (instance names match their spec names). Destructive operations
 * (delete_asset) require the asset ID to be re-stated via `confirmAssetId`
 * and to exist in the synced library — the same protect-the-real-thing gate
 * as craft-server's teardown.
 */
export const model = {
  type: "@craftquest/mux",
  version: "2026.08.09.1",
  reports: ["@craftquest/mux-engagement"],
  globalArguments: GlobalArgsSchema,
  resources: {
    library: {
      description: "Synced Mux asset catalog with counts and sync timestamp",
      schema: LibrarySchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    asset: {
      description: "Full detail of the most recently touched asset",
      schema: AssetSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    upload: {
      description: "Latest direct upload: PUT URL, status, resulting asset ID",
      schema: UploadSchema,
      lifetime: "7d" as const,
      garbageCollection: 5,
    },
    signing: {
      description:
        "Active signing key: ID in plain state, private key vault-referenced",
      schema: SigningSchema,
      vaultName: "mux-secrets",
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
    playbackToken: {
      description: "Most recently minted signed playback token and URL",
      schema: PlaybackTokenSchema,
      lifetime: "1d" as const,
      garbageCollection: 5,
    },
    liveStreams: {
      description: "Synced live-stream catalog (never contains stream keys)",
      schema: LiveStreamsSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    views: {
      description: "Latest video-views pull from Mux Data (most recent 100)",
      schema: ViewsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    metrics: {
      description: "Latest metric pull: overall value + optional breakdown",
      schema: MetricsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    playbackErrors: {
      description: "Latest playback-errors pull from Mux Data",
      schema: PlaybackErrorsSchema,
      lifetime: "30d" as const,
      garbageCollection: 5,
    },
    live: {
      description:
        "Most recently touched live stream: ingest URL plain, stream key vault-referenced",
      schema: LiveSchema,
      vaultName: "mux-secrets",
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },
  checks: {
    "mux-credentials": {
      description: "Verify Mux credentials are wired in from the vault",
      execute: (context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        const errors: string[] = [];
        if (!muxTokenId) {
          errors.push("muxTokenId is empty — check the vault wiring.");
        }
        if (!muxTokenSecret) {
          errors.push("muxTokenSecret is empty — check the vault wiring.");
        }
        return Promise.resolve(
          errors.length ? { pass: false, errors } : { pass: true },
        );
      },
    },
    "mux-auth": {
      description: "Verify the Mux credentials authenticate (1 cheap API call)",
      labels: ["live"],
      execute: async (context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        if (!muxTokenId || !muxTokenSecret) {
          return {
            pass: false,
            errors: ["Credentials empty; see mux-credentials check."],
          };
        }
        try {
          await muxApi(
            muxTokenId,
            muxTokenSecret,
            "GET",
            "/video/v1/assets?limit=1",
          );
          return { pass: true };
        } catch (err) {
          return {
            pass: false,
            errors: [`Mux authentication failed: ${(err as Error).message}`],
          };
        }
      },
    },
  },
  methods: {
    sync_assets: {
      description:
        "Sync the full Mux asset catalog into the library resource (paginates to completion)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        context.logger.info("Syncing the Mux asset library");
        const assets: AssetSummary[] = [];

        for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
          const res = await muxApi(
            muxTokenId,
            muxTokenSecret,
            "GET",
            `/video/v1/assets?limit=${SYNC_PAGE_LIMIT}&page=${page}`,
          );
          const batch: MuxJson[] = res.data ?? [];
          assets.push(...batch.map(toAssetSummary));
          context.logger.info("Synced page {page}: {count} assets", {
            page,
            count: batch.length,
          });
          if (batch.length < SYNC_PAGE_LIMIT) break;
          if (page === SYNC_MAX_PAGES) {
            context.logger.warn(
              "Stopped at page cap ({cap}); library may be incomplete",
              { cap: SYNC_MAX_PAGES },
            );
          }
        }

        const readyCount = assets.filter((a) => a.status === "ready").length;
        context.logger.info("Library synced: {count} assets ({ready} ready)", {
          count: assets.length,
          ready: readyCount,
        });
        const handle = await context.writeResource("library", "library", {
          assets,
          assetCount: assets.length,
          readyCount,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_asset: {
      description: "Fetch one asset's full detail into the asset resource",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const assetId = requireArg(
          context.globalArgs.assetId,
          "assetId",
          "get_asset",
        );
        return await fetchAndWriteAsset(context, assetId);
      },
    },

    create_asset: {
      description:
        "Create an asset by having Mux ingest a video from a URL (videoUrl argument)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          muxTokenId,
          muxTokenSecret,
          videoUrl,
          playbackPolicy,
          passthrough,
          testMode,
        } = context.globalArgs;
        requireArg(videoUrl, "videoUrl", "create_asset");

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          "/video/v1/assets",
          {
            inputs: [{ url: videoUrl }],
            playback_policies: [playbackPolicy],
            ...(passthrough ? { passthrough } : {}),
            ...(testMode ? { test: true } : {}),
          },
        );
        const data = requireData(res, "created asset");
        context.logger.info("Created asset {id} (status: {status})", {
          id: data.id,
          status: data.status,
        });
        const handle = await context.writeResource(
          "asset",
          "asset",
          toAssetDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    create_direct_upload: {
      description:
        "Create a direct-upload URL; PUT the video file to it, then run check_upload",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          muxTokenId,
          muxTokenSecret,
          playbackPolicy,
          passthrough,
          corsOrigin,
          testMode,
        } = context.globalArgs;

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          "/video/v1/uploads",
          {
            cors_origin: corsOrigin,
            new_asset_settings: {
              playback_policies: [playbackPolicy],
              ...(passthrough ? { passthrough } : {}),
              ...(testMode ? { test: true } : {}),
            },
          },
        );
        const data = requireData(res, "direct upload");
        context.logger.info(
          "Created direct upload {id} (expires in {timeout}s)",
          {
            id: data.id,
            timeout: data.timeout ?? 3600,
          },
        );
        const handle = await context.writeResource(
          "upload",
          "upload",
          toUpload(data),
        );
        return { dataHandles: [handle] };
      },
    },

    check_upload: {
      description:
        "Refresh a direct upload's status (uploadId argument, or the stored current upload)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        let uploadId: string = context.globalArgs.uploadId;
        let createdAt: string | undefined;
        if (!uploadId) {
          const stored = (await context.readResource!("upload")) as
            | z.infer<typeof UploadSchema>
            | null;
          if (!stored?.id) {
            throw new Error(
              "check_upload needs an uploadId argument or a prior create_direct_upload.",
            );
          }
          uploadId = stored.id;
          createdAt = stored.createdAt;
        }
        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/video/v1/uploads/${uploadId}`,
        );
        const data = requireData(res, `upload ${uploadId}`);
        context.logger.info("Upload {id} status: {status}", {
          id: data.id,
          status: data.status,
        });
        const handle = await context.writeResource(
          "upload",
          "upload",
          toUpload(data, createdAt),
        );
        return { dataHandles: [handle] };
      },
    },

    wait_asset_ready: {
      description:
        "Poll an asset (assetId argument) until it is ready or errored (5s interval, 5 min cap)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        const assetId = requireArg(
          context.globalArgs.assetId,
          "assetId",
          "wait_asset_ready",
        );

        for (let attempt = 1; attempt <= READY_POLL_ATTEMPTS; attempt++) {
          const res = await muxApi(
            muxTokenId,
            muxTokenSecret,
            "GET",
            `/video/v1/assets/${assetId}`,
          );
          const data = requireData(res, `asset ${assetId}`);
          const status: string = data.status;
          if (status === "ready") {
            context.logger.info("Asset {id} is ready", { id: assetId });
            const handle = await context.writeResource(
              "asset",
              "asset",
              toAssetDetail(data),
            );
            return { dataHandles: [handle] };
          }
          if (status === "errored") {
            const messages = data.errors?.messages?.join("; ") ??
              "unknown error";
            throw new Error(
              `Asset ${assetId} errored during processing: ${messages}`,
            );
          }
          context.logger.info(
            "Asset {id} is {status} (attempt {attempt}/{max})",
            {
              id: assetId,
              status,
              attempt,
              max: READY_POLL_ATTEMPTS,
            },
          );
          await sleep(READY_POLL_INTERVAL_MS);
        }
        throw new Error(
          `Asset ${assetId} not ready after ${
            (READY_POLL_ATTEMPTS * READY_POLL_INTERVAL_MS) / 60000
          } minutes — re-run wait_asset_ready to keep waiting.`,
        );
      },
    },

    create_playback_id: {
      description:
        "Add a playback ID (playbackPolicy argument) to an asset and refresh its detail",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, playbackPolicy } =
          context.globalArgs;
        const assetId = requireArg(
          context.globalArgs.assetId,
          "assetId",
          "create_playback_id",
        );
        await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          `/video/v1/assets/${assetId}/playback-ids`,
          { policy: playbackPolicy },
        );
        context.logger.info("Added {policy} playback ID to asset {id}", {
          policy: playbackPolicy,
          id: assetId,
        });
        return await fetchAndWriteAsset(context, assetId);
      },
    },

    delete_playback_id: {
      description:
        "Remove a playback ID (playbackId argument) from an asset — breaks existing URLs using it",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        const assetId = requireArg(
          context.globalArgs.assetId,
          "assetId",
          "delete_playback_id",
        );
        const playbackId = requireArg(
          context.globalArgs.playbackId,
          "playbackId",
          "delete_playback_id",
        );
        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "DELETE",
          `/video/v1/assets/${assetId}/playback-ids/${playbackId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn(
            "Playback ID {playbackId} was already gone on asset {assetId}",
            { playbackId, assetId },
          );
        } else {
          context.logger.info(
            "Deleted playback ID {playbackId} from asset {assetId}",
            { playbackId, assetId },
          );
        }
        return await fetchAndWriteAsset(context, assetId);
      },
    },

    delete_asset: {
      description:
        "Permanently delete an asset. Gated: confirmAssetId must equal assetId, and the asset must exist in the synced library.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, assetId, confirmAssetId } =
          context.globalArgs;
        requireArg(assetId, "assetId", "delete_asset");

        if (confirmAssetId !== assetId) {
          throw new Error(
            "Delete refused: confirmAssetId does not match assetId. " +
              "Re-state the exact asset ID in confirmAssetId to confirm deletion.",
          );
        }
        const library = (await context.readResource!("library")) as
          | LibraryData
          | null;
        const known = library?.assets?.find((a) => a.id === assetId);
        if (!known) {
          throw new Error(
            `Delete refused: asset ${assetId} is not in the synced library. ` +
              "Run sync_assets first — deletes are only allowed against known assets.",
          );
        }

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "DELETE",
          `/video/v1/assets/${assetId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn(
            "Asset {id} was already gone on Mux; removing it from the library",
            { id: assetId },
          );
        } else {
          context.logger.info("Deleted asset {id}", { id: assetId });
        }

        const remaining = library!.assets.filter((a) => a.id !== assetId);
        const handle = await context.writeResource("library", "library", {
          assets: remaining,
          assetCount: remaining.length,
          readyCount: remaining.filter((a) => a.status === "ready").length,
          syncedAt: library!.syncedAt,
        });
        return { dataHandles: [handle] };
      },
    },

    create_signing_key: {
      description:
        "Create a Mux signing key for signed playback. The private key goes straight to the vault; only the key ID is plainly visible. Refuses if a key already exists.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;

        let existing: SigningData | null = null;
        try {
          existing = (await context.readResource!("signing")) as
            | SigningData
            | null;
        } catch (err) {
          // A broken vault reference (e.g. manually pruned secret) must not
          // block creating a fresh key — treat unreadable state as absent.
          context.logger.warn(
            "Existing signing state unreadable ({error}); treating as absent",
            { error: (err as Error).message },
          );
        }
        if (existing?.keyId) {
          throw new Error(
            `A signing key already exists (${existing.keyId}). ` +
              "Run revoke_signing_key first — every asset can share one key, so you rarely need more.",
          );
        }

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          "/system/v1/signing-keys",
        );
        const data = requireData(res, "signing key");
        const privateKeyPem = atob(data.private_key ?? "");
        if (!data.id || !privateKeyPem.includes("PRIVATE KEY")) {
          throw new Error(
            "Mux signing-key response was missing the key ID or private key.",
          );
        }
        context.logger.info("Created signing key {id}", { id: data.id });

        const now = new Date().toISOString();
        const handle = await context.writeResource("signing", "signing", {
          keyId: data.id,
          privateKey: privateKeyPem,
          createdAt: String(data.created_at ?? now),
          updatedAt: now,
        });
        return { dataHandles: [handle] };
      },
    },

    sign_playback_token: {
      description:
        "Mint a short-lived RS256 playback token (playbackId + audience arguments) and its ready-to-use signed URL",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { audience, tokenTtl } = context.globalArgs;
        const playbackId = requireArg(
          context.globalArgs.playbackId,
          "playbackId",
          "sign_playback_token",
        );

        const signing = (await context.readResource!("signing")) as
          | SigningData
          | null;
        if (!signing?.keyId || !signing.privateKey) {
          throw new Error(
            "No signing key available — run create_signing_key first.",
          );
        }

        const exp = Math.floor(Date.now() / 1000) + tokenTtl;
        const token = await signJwtRS256(signing.privateKey, signing.keyId, {
          sub: playbackId,
          aud: AUDIENCE_CLAIMS[audience],
          exp,
        });
        const expiresAt = new Date(exp * 1000).toISOString();
        context.logger.info(
          "Signed {audience} token for {playbackId} (expires {expiresAt})",
          { audience, playbackId, expiresAt },
        );

        const handle = await context.writeResource(
          "playbackToken",
          "playbackToken",
          {
            playbackId,
            audience,
            token,
            signedUrl: signedUrlFor(audience, playbackId, token),
            expiresAt,
            keyId: signing.keyId,
            createdAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    revoke_signing_key: {
      description:
        "Revoke the signing key on Mux. Gated: confirmSigningKeyId must equal the stored key ID. Every token signed with it stops working immediately.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, confirmSigningKeyId } =
          context.globalArgs;

        const signing = (await context.readResource!("signing")) as
          | SigningData
          | null;
        if (!signing?.keyId) {
          throw new Error("No signing key recorded — nothing to revoke.");
        }
        if (confirmSigningKeyId !== signing.keyId) {
          throw new Error(
            "Revoke refused: confirmSigningKeyId does not match the stored signing key ID. " +
              "Re-state the exact key ID to confirm — revoking breaks every URL signed with it.",
          );
        }

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "DELETE",
          `/system/v1/signing-keys/${signing.keyId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn(
            "Signing key {id} was already gone on Mux; clearing local state",
            { id: signing.keyId },
          );
        } else {
          context.logger.info("Revoked signing key {id}", {
            id: signing.keyId,
          });
        }

        const handle = await context.writeResource("signing", "signing", {
          keyId: "",
          privateKey: "",
          createdAt: signing.createdAt,
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_live_stream: {
      description:
        "Create a live stream (latencyMode/reconnectWindow/playbackPolicy arguments). Stream key goes to the vault; recordings inherit the playback policy.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          muxTokenId,
          muxTokenSecret,
          playbackPolicy,
          latencyMode,
          reconnectWindow,
          passthrough,
          testMode,
        } = context.globalArgs;

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          "/video/v1/live-streams",
          {
            playback_policies: [playbackPolicy],
            new_asset_settings: { playback_policies: [playbackPolicy] },
            latency_mode: latencyMode,
            reconnect_window: reconnectWindow,
            ...(passthrough ? { passthrough } : {}),
            ...(testMode ? { test: true } : {}),
          },
        );
        const data = requireData(res, "live stream");
        context.logger.info(
          "Created live stream {id} ({latencyMode} latency, status: {status})",
          { id: data.id, latencyMode: data.latency_mode, status: data.status },
        );
        const handle = await context.writeResource(
          "live",
          "live",
          toLiveDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    sync_live_streams: {
      description:
        "Sync the live-stream catalog into the liveStreams resource (paginates; never stores stream keys)",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        context.logger.info("Syncing the Mux live-stream catalog");
        const streams: LiveStreamSummary[] = [];

        for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
          const res = await muxApi(
            muxTokenId,
            muxTokenSecret,
            "GET",
            `/video/v1/live-streams?limit=${SYNC_PAGE_LIMIT}&page=${page}`,
          );
          const batch: MuxJson[] = res.data ?? [];
          streams.push(...batch.map(toLiveStreamSummary));
          if (batch.length < SYNC_PAGE_LIMIT) break;
          if (page === SYNC_MAX_PAGES) {
            context.logger.warn(
              "Stopped at page cap ({cap}); catalog may be incomplete",
              { cap: SYNC_MAX_PAGES },
            );
          }
        }

        const activeCount = streams.filter((s) => s.status === "active").length;
        context.logger.info(
          "Catalog synced: {count} live streams ({active} active)",
          { count: streams.length, active: activeCount },
        );
        const handle = await context.writeResource(
          "liveStreams",
          "liveStreams",
          {
            streams,
            streamCount: streams.length,
            activeCount,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_live_stream: {
      description:
        "Fetch one live stream's full detail (liveStreamId argument) into the live resource",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret } = context.globalArgs;
        const liveStreamId = requireArg(
          context.globalArgs.liveStreamId,
          "liveStreamId",
          "get_live_stream",
        );
        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/video/v1/live-streams/${liveStreamId}`,
        );
        const data = requireData(res, `live stream ${liveStreamId}`);
        context.logger.info("Fetched live stream {id} (status: {status})", {
          id: data.id,
          status: data.status,
        });
        const handle = await context.writeResource(
          "live",
          "live",
          toLiveDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    complete_live_stream: {
      description:
        "Signal the end of a live stream (liveStreamId argument) — stops waiting for reconnects and finalizes the recording. Gated only while the stream is actively broadcasting: then confirmLiveStreamId must match.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, confirmLiveStreamId } =
          context.globalArgs;
        const liveStreamId = requireArg(
          context.globalArgs.liveStreamId,
          "liveStreamId",
          "complete_live_stream",
        );

        const current = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/video/v1/live-streams/${liveStreamId}`,
        );
        const status = requireData(current, `live stream ${liveStreamId}`)
          .status;
        if (status === "active" && confirmLiveStreamId !== liveStreamId) {
          throw new Error(
            `Complete refused: live stream ${liveStreamId} is actively broadcasting. ` +
              "Ending it now will cut off viewers and finalize the recording — " +
              "re-state the exact stream ID in confirmLiveStreamId to confirm.",
          );
        }

        await muxApi(
          muxTokenId,
          muxTokenSecret,
          "PUT",
          `/video/v1/live-streams/${liveStreamId}/complete`,
        );
        context.logger.info("Signaled complete for live stream {id}", {
          id: liveStreamId,
        });
        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/video/v1/live-streams/${liveStreamId}`,
        );
        const handle = await context.writeResource(
          "live",
          "live",
          toLiveDetail(requireData(res, `live stream ${liveStreamId}`)),
        );
        return { dataHandles: [handle] };
      },
    },

    reset_stream_key: {
      description:
        "Rotate a live stream's key. Gated: confirmLiveStreamId must equal liveStreamId — the old key stops working immediately.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, confirmLiveStreamId } =
          context.globalArgs;
        const liveStreamId = requireArg(
          context.globalArgs.liveStreamId,
          "liveStreamId",
          "reset_stream_key",
        );
        if (confirmLiveStreamId !== liveStreamId) {
          throw new Error(
            "Reset refused: confirmLiveStreamId does not match liveStreamId. " +
              "Re-state the exact live stream ID — the current stream key stops working the moment it is reset.",
          );
        }
        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "POST",
          `/video/v1/live-streams/${liveStreamId}/reset-stream-key`,
        );
        const data = requireData(res, `live stream ${liveStreamId}`);
        context.logger.warn(
          "Stream key rotated for live stream {id}; the previous key is now invalid",
          { id: liveStreamId },
        );
        const handle = await context.writeResource(
          "live",
          "live",
          toLiveDetail(data),
        );
        return { dataHandles: [handle] };
      },
    },

    delete_live_stream: {
      description:
        "Permanently delete a live stream. Gated: confirmLiveStreamId must equal liveStreamId, and the stream must exist in the synced catalog. Recorded assets are not deleted.",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          muxTokenId,
          muxTokenSecret,
          liveStreamId,
          confirmLiveStreamId,
        } = context.globalArgs;
        requireArg(liveStreamId, "liveStreamId", "delete_live_stream");

        if (confirmLiveStreamId !== liveStreamId) {
          throw new Error(
            "Delete refused: confirmLiveStreamId does not match liveStreamId. " +
              "Re-state the exact live stream ID to confirm deletion.",
          );
        }
        const catalog = (await context.readResource!("liveStreams")) as
          | LiveStreamsData
          | null;
        const known = catalog?.streams?.find((s) => s.id === liveStreamId);
        if (!known) {
          throw new Error(
            `Delete refused: live stream ${liveStreamId} is not in the synced catalog. ` +
              "Run sync_live_streams first — deletes are only allowed against known streams.",
          );
        }

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "DELETE",
          `/video/v1/live-streams/${liveStreamId}`,
          undefined,
          { allowNotFound: true },
        );
        if (res === null) {
          context.logger.warn(
            "Live stream {id} was already gone on Mux; removing it from the catalog",
            { id: liveStreamId },
          );
        } else {
          context.logger.info("Deleted live stream {id}", { id: liveStreamId });
        }

        const remaining = catalog!.streams.filter((s) => s.id !== liveStreamId);
        const handle = await context.writeResource(
          "liveStreams",
          "liveStreams",
          {
            streams: remaining,
            streamCount: remaining.length,
            activeCount: remaining.filter((s) => s.status === "active").length,
            syncedAt: catalog!.syncedAt,
          },
        );
        return { dataHandles: [handle] };
      },
    },

    get_video_views: {
      description:
        "Pull the most recent video views from Mux Data (timeframe/metricFilter arguments) into the views resource",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, timeframe, metricFilter } =
          context.globalArgs;
        context.logger.info("Pulling video views for the last {timeframe}", {
          timeframe,
        });

        const params = new URLSearchParams();
        params.append("limit", "100");
        params.append("timeframe[]", timeframe);
        if (metricFilter) params.append("filters[]", metricFilter);

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/data/v1/video-views?${params}`,
        );
        const items: MuxJson[] = res.data ?? [];
        const totalRowCount = res.total_row_count ?? items.length;
        if (totalRowCount > items.length) {
          context.logger.warn(
            "Showing the most recent {shown} of {total} views in this timeframe",
            { shown: items.length, total: totalRowCount },
          );
        }
        context.logger.info("Pulled {count} views ({total} total in window)", {
          count: items.length,
          total: totalRowCount,
        });

        const handle = await context.writeResource("views", "views", {
          views: items.map((v: MuxJson) => ({
            id: v.id,
            viewStart: v.view_start ?? undefined,
            viewEnd: v.view_end ?? undefined,
            videoTitle: v.video_title ?? undefined,
            watchTime: v.watch_time ?? undefined,
            viewerExperienceScore: v.viewer_experience_score ?? undefined,
            countryCode: v.country_code ?? undefined,
            errorTypeId: v.error_type_id ?? undefined,
            playbackFailure: v.playback_failure ?? undefined,
          })),
          totalRowCount,
          timeframe,
          filter: metricFilter || undefined,
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    get_metrics: {
      description:
        "Pull a Mux Data metric's overall value (metricId/timeframe arguments), plus a breakdown when groupBy is set",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const {
          muxTokenId,
          muxTokenSecret,
          metricId,
          timeframe,
          groupBy,
          metricFilter,
        } = context.globalArgs;
        context.logger.info(
          "Pulling metric {metricId} for the last {timeframe}",
          { metricId, timeframe },
        );

        const base = new URLSearchParams();
        base.append("timeframe[]", timeframe);
        if (metricFilter) base.append("filters[]", metricFilter);

        const overallRes = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/data/v1/metrics/${encodeURIComponent(metricId)}/overall?${base}`,
        );
        const overall = requireData(overallRes, `metric ${metricId}`);

        let breakdown: MuxJson[] = [];
        if (groupBy) {
          const bp = new URLSearchParams(base);
          bp.append("group_by", groupBy);
          bp.append("limit", "25");
          const breakdownRes = await muxApi(
            muxTokenId,
            muxTokenSecret,
            "GET",
            `/data/v1/metrics/${encodeURIComponent(metricId)}/breakdown?${bp}`,
          );
          breakdown = breakdownRes.data ?? [];
        }

        context.logger.info(
          "Metric {metricId}: overall value {value} ({views} views)",
          {
            metricId,
            value: overall.value ?? "n/a",
            views: overall.total_views ?? 0,
          },
        );

        const handle = await context.writeResource("metrics", "metrics", {
          metricId,
          timeframe,
          filter: metricFilter || undefined,
          groupBy: groupBy || undefined,
          overall: {
            value: overall.value ?? null,
            totalViews: overall.total_views ?? undefined,
            totalWatchTime: overall.total_watch_time ?? undefined,
          },
          breakdown: breakdown.map((b: MuxJson) => ({
            field: b.field ?? null,
            value: b.value ?? null,
            views: b.views ?? undefined,
          })),
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    list_playback_errors: {
      description:
        "Pull playback errors from Mux Data (timeframe argument) into the playbackErrors resource",
      arguments: z.object({}),
      execute: async (_args: unknown, context: Context) => {
        const { muxTokenId, muxTokenSecret, timeframe, metricFilter } =
          context.globalArgs;
        context.logger.info(
          "Pulling playback errors for the last {timeframe}",
          {
            timeframe,
          },
        );

        const params = new URLSearchParams();
        params.append("timeframe[]", timeframe);
        if (metricFilter) params.append("filters[]", metricFilter);

        const res = await muxApi(
          muxTokenId,
          muxTokenSecret,
          "GET",
          `/data/v1/errors?${params}`,
        );
        const items: MuxJson[] = res.data ?? [];
        context.logger.info("Found {count} distinct playback errors", {
          count: items.length,
        });

        const handle = await context.writeResource(
          "playbackErrors",
          "playbackErrors",
          {
            errors: items.map((e: MuxJson) => ({
              id: e.id ?? undefined,
              code: e.code ?? null,
              message: e.message ?? null,
              description: e.description ?? null,
              count: e.count ?? undefined,
              percentage: e.percentage ?? undefined,
              lastSeen: e.last_seen ?? undefined,
            })),
            errorCount: items.length,
            timeframe,
            syncedAt: new Date().toISOString(),
          },
        );
        return { dataHandles: [handle] };
      },
    },
  },
};
