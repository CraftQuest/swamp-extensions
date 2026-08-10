import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing";
import { model } from "./mux.ts";

// --- Fetch mocking ---

type MockResponse = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

// deno-lint-ignore no-explicit-any
type RecordedCall = { url: string; method: string; body?: any };

/**
 * Replace globalThis.fetch with a queue of canned responses for the duration
 * of `fn`, recording every call. Restores the real fetch afterwards.
 */
async function withMockedFetch(
  responses: MockResponse[],
  fn: (calls: RecordedCall[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = queue.shift();
    if (!next) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "mock queue exhausted" }), {
          status: 500,
        }),
      );
    }
    const body = next.status === 204 ? null : JSON.stringify(next.body ?? {});
    return Promise.resolve(
      new Response(body, { status: next.status, headers: next.headers }),
    );
  }) as typeof fetch;
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

// --- Fixtures ---

/** Complete globalArgs with test credentials; spread overrides on top. */
function args(overrides: Record<string, unknown> = {}) {
  return {
    muxTokenId: "test-token-id",
    muxTokenSecret: "test-token-secret",
    assetId: "",
    playbackId: "",
    videoUrl: "",
    playbackPolicy: "public",
    passthrough: "",
    corsOrigin: "*",
    uploadId: "",
    testMode: false,
    confirmAssetId: "",
    audience: "video",
    tokenTtl: 3600,
    confirmSigningKeyId: "",
    liveStreamId: "",
    confirmLiveStreamId: "",
    latencyMode: "standard",
    reconnectWindow: 60,
    metricId: "views",
    timeframe: "7:days",
    groupBy: "",
    metricFilter: "",
    ...overrides,
  };
}

/** A raw Mux asset object as the API returns it. */
function rawAsset(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "ready",
    duration: 61.5,
    aspect_ratio: "16:9",
    created_at: "1754600000",
    playback_ids: [{ id: `pb-${id}`, policy: "public" }],
    ...overrides,
  };
}

/** A library resource as sync_assets would have stored it. */
function storedLibrary(ids: string[]) {
  return {
    assets: ids.map((id) => ({
      id,
      status: "ready",
      createdAt: "1754600000",
      playbackIds: [{ id: `pb-${id}`, policy: "public" }],
    })),
    assetCount: ids.length,
    readyCount: ids.length,
    syncedAt: "2026-08-08T00:00:00.000Z",
  };
}

// --- Credentials ---

Deno.test("methods throw when credentials are empty", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ muxTokenId: "", muxTokenSecret: "" }),
  });
  await withMockedFetch([], async () => {
    await assertRejects(
      () => model.methods.sync_assets.execute({}, context),
      Error,
      "credentials are empty",
    );
  });
});

// --- sync_assets ---

Deno.test("sync_assets paginates to completion and stores the library", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => rawAsset(`a-${i}`));
  const page2 = Array.from({ length: 30 }, (_, i) => rawAsset(`b-${i}`));
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });

  await withMockedFetch(
    [
      { status: 200, body: { data: page1 } },
      { status: 200, body: { data: page2 } },
    ],
    async (calls) => {
      await model.methods.sync_assets.execute({}, context);
      assertEquals(calls.length, 2);
      assert(calls[0].url.includes("page=1"));
      assert(calls[1].url.includes("page=2"));
    },
  );

  const written = getWrittenResources();
  assertEquals(written.length, 1);
  assertEquals(written[0].specName, "library");
  assertEquals(written[0].name, "library");
  assertEquals(written[0].data.assetCount, 130);
  assertEquals(written[0].data.readyCount, 130);
});

Deno.test("sync_assets retries once on 429 before succeeding", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [
      { status: 429, body: {}, headers: { "Retry-After": "1" } },
      { status: 200, body: { data: [rawAsset("a-1")] } },
    ],
    async (calls) => {
      await model.methods.sync_assets.execute({}, context);
      assertEquals(calls.length, 2);
    },
  );
  assertEquals(getWrittenResources()[0].data.assetCount, 1);
});

// --- create_asset ---

Deno.test("create_asset requires videoUrl", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await assertRejects(
    () => model.methods.create_asset.execute({}, context),
    Error,
    "videoUrl",
  );
});

Deno.test("create_asset stores detail with a playback URL", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ videoUrl: "https://example.com/v.mp4" }),
  });
  await withMockedFetch(
    [{ status: 201, body: { data: rawAsset("new-asset") } }],
    async (calls) => {
      await model.methods.create_asset.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].body.inputs, [{
        url: "https://example.com/v.mp4",
      }]);
      assertEquals(calls[0].body.playback_policies, ["public"]);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "asset");
  assertEquals(
    written[0].data.playbackUrl,
    "https://stream.mux.com/pb-new-asset.m3u8",
  );
});

// --- wait_asset_ready ---

Deno.test("wait_asset_ready throws on an errored asset", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ assetId: "bad-asset" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: rawAsset("bad-asset", {
            status: "errored",
            errors: { type: "invalid_input", messages: ["download failed"] },
          }),
        },
      },
    ],
    async () => {
      await assertRejects(
        () => model.methods.wait_asset_ready.execute({}, context),
        Error,
        "download failed",
      );
    },
  );
});

// --- check_upload ---

Deno.test("check_upload falls back to the stored upload", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
    storedResources: {
      upload: {
        id: "up-1",
        url: "https://storage.mux.com/put-here",
        status: "waiting",
        timeout: 3600,
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
    },
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: {
            id: "up-1",
            status: "asset_created",
            asset_id: "a-9",
            timeout: 3600,
          },
        },
      },
    ],
    async (calls) => {
      await model.methods.check_upload.execute({}, context);
      assert(calls[0].url.endsWith("/video/v1/uploads/up-1"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].data.assetId, "a-9");
  assertEquals(written[0].data.status, "asset_created");
  // createdAt survives the refresh
  assertEquals(written[0].data.createdAt, "2026-08-08T00:00:00.000Z");
});

Deno.test("check_upload with no uploadId and no stored upload throws", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await assertRejects(
    () => model.methods.check_upload.execute({}, context),
    Error,
    "check_upload needs an uploadId",
  );
});

// --- delete_asset gate ---

Deno.test("delete_asset refuses a mismatched confirmAssetId", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ assetId: "a-1", confirmAssetId: "a-2" }),
    storedResources: { library: storedLibrary(["a-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_asset.execute({}, context),
      Error,
      "confirmAssetId does not match",
    );
    assertEquals(calls.length, 0); // refused before any API call
  });
});

Deno.test("delete_asset refuses an asset missing from the synced library", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ assetId: "ghost", confirmAssetId: "ghost" }),
    storedResources: { library: storedLibrary(["a-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_asset.execute({}, context),
      Error,
      "not in the synced library",
    );
    assertEquals(calls.length, 0);
  });
});

Deno.test("delete_asset deletes a confirmed, known asset and updates the library", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ assetId: "a-1", confirmAssetId: "a-1" }),
    storedResources: { library: storedLibrary(["a-1", "a-2"]) },
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.delete_asset.execute({}, context);
    assertEquals(calls[0].method, "DELETE");
    assert(calls[0].url.endsWith("/video/v1/assets/a-1"));
  });
  const written = getWrittenResources();
  assertEquals(written[0].specName, "library");
  assertEquals(written[0].data.assetCount, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.assets as any)[0].id, "a-2");
});

Deno.test("delete_asset treats 404 as already gone", async () => {
  const { context, getWrittenResources, getLogsByLevel } =
    createModelTestContext({
      globalArgs: args({ assetId: "a-1", confirmAssetId: "a-1" }),
      storedResources: { library: storedLibrary(["a-1"]) },
    });
  await withMockedFetch(
    [{ status: 404, body: { error: { messages: ["not found"] } } }],
    async () => {
      await model.methods.delete_asset.execute({}, context);
    },
  );
  assertEquals(getWrittenResources()[0].data.assetCount, 0);
  assertEquals(getLogsByLevel("warning").length, 1);
});

// --- delete_playback_id ---

Deno.test("delete_playback_id removes the ID and refreshes the asset", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ assetId: "a-1", playbackId: "pb-a-1" }),
  });
  await withMockedFetch(
    [
      { status: 204 },
      { status: 200, body: { data: rawAsset("a-1", { playback_ids: [] }) } },
    ],
    async (calls) => {
      await model.methods.delete_playback_id.execute({}, context);
      assertEquals(calls[0].method, "DELETE");
      assertEquals(calls[1].method, "GET");
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "asset");
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.playbackIds as any).length, 0);
  assertEquals(written[0].data.playbackUrl, undefined);
});

// --- checks ---

Deno.test("mux-credentials check fails on empty credentials", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ muxTokenId: "", muxTokenSecret: "" }),
  });
  const result = await model.checks["mux-credentials"].execute(context);
  assertEquals(result.pass, false);
  assertEquals(result.errors?.length, 2);
});

Deno.test("mux-auth check passes when the API accepts the credentials", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch([{ status: 200, body: { data: [] } }], async () => {
    const result = await model.checks["mux-auth"].execute(context);
    assertEquals(result.pass, true);
  });
});

Deno.test("mux-auth check fails on a 401", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await withMockedFetch(
    [{ status: 401, body: { error: { messages: ["bad credentials"] } } }],
    async () => {
      const result = await model.checks["mux-auth"].execute(context);
      assertEquals(result.pass, false);
      assert(result.errors?.[0].includes("401"));
    },
  );
});

// --- Signed playback fixtures ---
// Test-only RSA keypair (never used anywhere real). Same key in both
// encodings, to exercise both PEM import paths.

const PKCS8_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8QHljj5DX83o5
Xgew0McuHX0PcSDhqMUxeJr2Sqa46ZSE7JTfknVxX9scwmFAICxIxsNAHqejOR/p
uLOYSvrp+V9SKlYPV8I8LP/TmOOfb/5B1ruw7ZA9hjt6E7DZ28ehrkCX6AP97crN
5jnkWsahx46Jynz/gLsnPbJT3k7/Y82VuHkigETOvUEo7QvJTA5eKRb6GykhjRx2
DzWl+o22DUQG7qUN3EKG+/3NAbXA9xTlkQZkyOfxvGC6OqraDPj9zFaii+L20KsJ
y4jgEkbFWs0nvwSesdrCiJCBpzF8Ta1a/lLiArO4tNn9VbWIwoppSNhLJm4xQy5k
rKaUeTxNAgMBAAECggEAAquBbT2QhtePsLeaMVJMuOU3LFxk5H5xyYlV3U9ivPWn
Ixl95QvdOY3r/CTvnyq1phSXmVW19/Ur9DMn7O2HUIE2bmJmVRJgEV1sBXLCK7U5
bHKgt9outQit2EXmOLjKxIrFpMHoKJZSTYhJ4ui8r3e2mFK0YiVPwjc4S8M36JxZ
+lm+zq+7O4/hTUKRiKBPoVSkYhyTfv4RBcYWKUwd1m+aa6Wr9kDUptwrtYc0HMyE
W1Xd4U4imtV4OIp14idDi7cQpd3ClDtcgpji/yGF9C1YP3o2bVZ7oIBdT+wmcDXH
y2DneC5qS6GtRQ0onWg9gmclR8loRoKne8Nu1IEqYQKBgQD6usieJ6Udst9VC2OJ
c7c81VtrDlWy4NvxRAEqguYV0bLYJlijsNlDkgxZY7eniPzQh8jpWnft+tQ7RPL8
7SHSI8t9sAMSMw1aAplZt7vt0RzOhdGokF5HsCcUK4C+49vVOdj1Iq1fVVsXEkIy
Ie9wIOD9LKuPjy09l5jp59gCcQKBgQDANXzTSXoXMQr9kNW3/KoXugcsvwb7QppO
FGrgerlEpmaUS2wcpnepP+X7zSbmshbeFvAgksf7Nl6yvn2ulShgjqVyX5/3MASp
T4V406QhIICHSc39BfN2tUrQrDp0JhYhEjf/q0J4US5F0O5shh/USZo07HCpgBdR
xUAw6uANnQKBgQDyieSvOOJ8jB+GAPJUcF98tVcthDxaQTIBfSszmFRCHwvGE7ID
Bnvk5U6U2eU6Z0VH41HyidUhnFXYz6XODQV+Zane93jBDimIPKNjKlzcfEBFdyWM
zbql1jy3Qi3Uek6ZQNAisVzMr6Dh/IOUQ0d/TA7YWXHL+VBmGFOPUPqfwQKBgCEs
WhnhUZgVF8+BotE5Y2Xq7ngTlDHjYdxd+8A4jidCDOxFRCiBtp9YbuoRk0g3rmiw
TstgafF6hceVxv1NswVPOVDPHj28ZOGP3vpmlKo/AM/YthuYXle7nGj9gK0xMZqN
mWqf9T3szO6xy6ShVXb/KQU/VYZ7nAq534VR1E+lAoGAQ0/hDae6Y+3qiYnUhtcA
HE/GvSGGVj3aSJIMPgkqZedf2riF8oXKGB/H/Gz6vyf30XPyF7Fgw49+/m0SywXk
E2kMvTE1Z7vyVeb07M4i8KI2cTw+fBu3xq5SPPcK6VyLYKN8WYQdXhWLauXL162T
Mp+ukqVpDunHfXk+w0hy/xk=
-----END PRIVATE KEY-----`;

const PKCS1_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAvEB5Y4+Q1/N6OV4HsNDHLh19D3Eg4ajFMXia9kqmuOmUhOyU
35J1cV/bHMJhQCAsSMbDQB6nozkf6bizmEr66flfUipWD1fCPCz/05jjn2/+Qda7
sO2QPYY7ehOw2dvHoa5Al+gD/e3KzeY55FrGoceOicp8/4C7Jz2yU95O/2PNlbh5
IoBEzr1BKO0LyUwOXikW+hspIY0cdg81pfqNtg1EBu6lDdxChvv9zQG1wPcU5ZEG
ZMjn8bxgujqq2gz4/cxWoovi9tCrCcuI4BJGxVrNJ78EnrHawoiQgacxfE2tWv5S
4gKzuLTZ/VW1iMKKaUjYSyZuMUMuZKymlHk8TQIDAQABAoIBAAKrgW09kIbXj7C3
mjFSTLjlNyxcZOR+ccmJVd1PYrz1pyMZfeUL3TmN6/wk758qtaYUl5lVtff1K/Qz
J+zth1CBNm5iZlUSYBFdbAVywiu1OWxyoLfaLrUIrdhF5ji4ysSKxaTB6CiWUk2I
SeLovK93tphStGIlT8I3OEvDN+icWfpZvs6vuzuP4U1CkYigT6FUpGIck37+EQXG
FilMHdZvmmulq/ZA1KbcK7WHNBzMhFtV3eFOIprVeDiKdeInQ4u3EKXdwpQ7XIKY
4v8hhfQtWD96Nm1We6CAXU/sJnA1x8tg53guakuhrUUNKJ1oPYJnJUfJaEaCp3vD
btSBKmECgYEA+rrInielHbLfVQtjiXO3PNVbaw5VsuDb8UQBKoLmFdGy2CZYo7DZ
Q5IMWWO3p4j80IfI6Vp37frUO0Ty/O0h0iPLfbADEjMNWgKZWbe77dEczoXRqJBe
R7AnFCuAvuPb1TnY9SKtX1VbFxJCMiHvcCDg/Syrj48tPZeY6efYAnECgYEAwDV8
00l6FzEK/ZDVt/yqF7oHLL8G+0KaThRq4Hq5RKZmlEtsHKZ3qT/l+80m5rIW3hbw
IJLH+zZesr59rpUoYI6lcl+f9zAEqU+FeNOkISCAh0nN/QXzdrVK0Kw6dCYWIRI3
/6tCeFEuRdDubIYf1EmaNOxwqYAXUcVAMOrgDZ0CgYEA8onkrzjifIwfhgDyVHBf
fLVXLYQ8WkEyAX0rM5hUQh8LxhOyAwZ75OVOlNnlOmdFR+NR8onVIZxV2M+lzg0F
fmWp3vd4wQ4piDyjYypc3HxARXcljM26pdY8t0It1HpOmUDQIrFczK+g4fyDlENH
f0wO2Flxy/lQZhhTj1D6n8ECgYAhLFoZ4VGYFRfPgaLROWNl6u54E5Qx42HcXfvA
OI4nQgzsRUQogbafWG7qEZNIN65osE7LYGnxeoXHlcb9TbMFTzlQzx49vGThj976
ZpSqPwDP2LYbmF5Xu5xo/YCtMTGajZlqn/U97MzuscukoVV2/ykFP1WGe5wKud+F
UdRPpQKBgENP4Q2numPt6omJ1IbXABxPxr0hhlY92kiSDD4JKmXnX9q4hfKFyhgf
x/xs+r8n99Fz8hexYMOPfv5tEssF5BNpDL0xNWe78lXm9OzOIvCiNnE8Pnwbt8au
Ujz3Culci2CjfFmEHV4Vi2rly9etkzKfrpKlaQ7px315PsNIcv8Z
-----END RSA PRIVATE KEY-----`;

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEB5Y4+Q1/N6OV4HsNDH
Lh19D3Eg4ajFMXia9kqmuOmUhOyU35J1cV/bHMJhQCAsSMbDQB6nozkf6bizmEr6
6flfUipWD1fCPCz/05jjn2/+Qda7sO2QPYY7ehOw2dvHoa5Al+gD/e3KzeY55FrG
oceOicp8/4C7Jz2yU95O/2PNlbh5IoBEzr1BKO0LyUwOXikW+hspIY0cdg81pfqN
tg1EBu6lDdxChvv9zQG1wPcU5ZEGZMjn8bxgujqq2gz4/cxWoovi9tCrCcuI4BJG
xVrNJ78EnrHawoiQgacxfE2tWv5S4gKzuLTZ/VW1iMKKaUjYSyZuMUMuZKymlHk8
TQIDAQAB
-----END PUBLIC KEY-----`;

/** Seedable signing resource for tests. */
function storedSigning(privateKey: string) {
  return {
    keyId: "sk-test-1",
    privateKey,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

/** Decode a base64url segment (restores padding for atob). */
function b64urlDecode(seg: string): string {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** Verify an RS256 JWT against the fixture public key; return its parts. */
async function verifyJwt(token: string) {
  const [h, p, s] = token.split(".");
  const spki = Uint8Array.from(
    atob(PUBLIC_KEY.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = Uint8Array.from(b64urlDecode(s), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return {
    ok,
    header: JSON.parse(b64urlDecode(h)),
    payload: JSON.parse(b64urlDecode(p)),
  };
}

// --- create_signing_key ---

Deno.test("create_signing_key stores the key and never logs the private key", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [
      {
        status: 201,
        body: {
          data: { id: "sk-new", private_key: btoa(PKCS1_KEY) },
        },
      },
    ],
    async (calls) => {
      await model.methods.create_signing_key.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assert(calls[0].url.endsWith("/system/v1/signing-keys"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "signing");
  assertEquals(written[0].data.keyId, "sk-new");
  assert(String(written[0].data.privateKey).includes("RSA PRIVATE KEY"));
  // the private key must never appear in log output
  assert(!JSON.stringify(getLogs()).includes("PRIVATE KEY"));
});

Deno.test("create_signing_key refuses when a key already exists", async () => {
  const { context } = createModelTestContext({
    globalArgs: args(),
    storedResources: { signing: storedSigning(PKCS8_KEY) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.create_signing_key.execute({}, context),
      Error,
      "already exists",
    );
    assertEquals(calls.length, 0);
  });
});

// --- sign_playback_token ---

Deno.test("sign_playback_token mints a verifiable RS256 token (PKCS#8 key)", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ playbackId: "pb-123", tokenTtl: 600 }),
    storedResources: { signing: storedSigning(PKCS8_KEY) },
  });
  await model.methods.sign_playback_token.execute({}, context);

  const written = getWrittenResources();
  assertEquals(written[0].specName, "playbackToken");
  const token = String(written[0].data.token);
  const { ok, header, payload } = await verifyJwt(token);
  assert(ok, "signature must verify against the public key");
  assertEquals(header.alg, "RS256");
  assertEquals(header.kid, "sk-test-1");
  assertEquals(payload.sub, "pb-123");
  assertEquals(payload.aud, "v");
  const now = Math.floor(Date.now() / 1000);
  assert(payload.exp > now + 500 && payload.exp <= now + 700);
  assertEquals(
    written[0].data.signedUrl,
    `https://stream.mux.com/pb-123.m3u8?token=${token}`,
  );
  // the token must never appear in log output
  assert(!JSON.stringify(getLogs()).includes(token.slice(0, 25)));
});

Deno.test("sign_playback_token works with a PKCS#1 key (Mux's format)", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ playbackId: "pb-123" }),
    storedResources: { signing: storedSigning(PKCS1_KEY) },
  });
  await model.methods.sign_playback_token.execute({}, context);
  const { ok } = await verifyJwt(String(getWrittenResources()[0].data.token));
  assert(ok, "PKCS#1-derived signature must verify");
});

Deno.test("sign_playback_token maps thumbnail audience to aud 't' and an image URL", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ playbackId: "pb-123", audience: "thumbnail" }),
    storedResources: { signing: storedSigning(PKCS8_KEY) },
  });
  await model.methods.sign_playback_token.execute({}, context);
  const data = getWrittenResources()[0].data;
  const { payload } = await verifyJwt(String(data.token));
  assertEquals(payload.aud, "t");
  assert(
    String(data.signedUrl).startsWith(
      "https://image.mux.com/pb-123/thumbnail.jpg?token=",
    ),
  );
});

Deno.test("sign_playback_token without a signing key throws", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ playbackId: "pb-123" }),
  });
  await assertRejects(
    () => model.methods.sign_playback_token.execute({}, context),
    Error,
    "create_signing_key first",
  );
});

// --- revoke_signing_key ---

Deno.test("revoke_signing_key refuses a mismatched confirmation", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ confirmSigningKeyId: "sk-wrong" }),
    storedResources: { signing: storedSigning(PKCS8_KEY) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.revoke_signing_key.execute({}, context),
      Error,
      "Revoke refused",
    );
    assertEquals(calls.length, 0);
  });
});

Deno.test("revoke_signing_key deletes the key and clears state", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ confirmSigningKeyId: "sk-test-1" }),
    storedResources: { signing: storedSigning(PKCS8_KEY) },
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.revoke_signing_key.execute({}, context);
    assertEquals(calls[0].method, "DELETE");
    assert(calls[0].url.endsWith("/system/v1/signing-keys/sk-test-1"));
  });
  const written = getWrittenResources();
  assertEquals(written[0].data.keyId, "");
  assertEquals(written[0].data.privateKey, "");
});

// --- Live streaming fixtures ---

/** A raw Mux live stream as the API returns it. */
function rawLiveStream(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "idle",
    stream_key: `secret-stream-key-${id}`,
    latency_mode: "standard",
    reconnect_window: 60,
    created_at: "1754700000",
    playback_ids: [{ id: `pb-${id}`, policy: "public" }],
    ...overrides,
  };
}

/** A liveStreams catalog as sync_live_streams would have stored it. */
function storedLiveStreams(ids: string[]) {
  return {
    streams: ids.map((id) => ({
      id,
      status: "idle",
      createdAt: "1754700000",
      playbackIds: [{ id: `pb-${id}`, policy: "public" }],
    })),
    streamCount: ids.length,
    activeCount: 0,
    syncedAt: "2026-08-09T00:00:00.000Z",
  };
}

// --- create_live_stream ---

Deno.test("create_live_stream sends current-contract fields and vaults the key", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ latencyMode: "low", reconnectWindow: 30 }),
  });
  await withMockedFetch(
    [{
      status: 201,
      body: {
        data: rawLiveStream("ls-1", {
          latency_mode: "low",
          reconnect_window: 30,
        }),
      },
    }],
    async (calls) => {
      await model.methods.create_live_stream.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assert(calls[0].url.endsWith("/video/v1/live-streams"));
      assertEquals(calls[0].body.playback_policies, ["public"]);
      assertEquals(calls[0].body.new_asset_settings, {
        playback_policies: ["public"],
      });
      assertEquals(calls[0].body.latency_mode, "low");
      assertEquals(calls[0].body.reconnect_window, 30);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "live");
  assertEquals(written[0].data.streamKey, "secret-stream-key-ls-1");
  assertEquals(written[0].data.rtmpUrl, "rtmps://global-live.mux.com:443/app");
  assertEquals(
    written[0].data.playbackUrl,
    "https://stream.mux.com/pb-ls-1.m3u8",
  );
  // the stream key must never appear in log output
  assert(!JSON.stringify(getLogs()).includes("secret-stream-key"));
});

// --- sync_live_streams ---

Deno.test("sync_live_streams stores the catalog without stream keys", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [
          rawLiveStream("ls-1"),
          rawLiveStream("ls-2", { status: "active" }),
        ],
      },
    }],
    async () => {
      await model.methods.sync_live_streams.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "liveStreams");
  assertEquals(written[0].data.streamCount, 2);
  assertEquals(written[0].data.activeCount, 1);
  // catalog must never contain stream keys
  assert(!JSON.stringify(written[0].data).includes("secret-stream-key"));
});

// --- complete_live_stream ---

Deno.test("complete_live_stream completes an idle stream without confirmation", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: { data: rawLiveStream("ls-1", { status: "idle" }) },
      },
      { status: 200, body: { data: {} } },
      {
        status: 200,
        body: { data: rawLiveStream("ls-1", { status: "idle" }) },
      },
    ],
    async (calls) => {
      await model.methods.complete_live_stream.execute({}, context);
      assertEquals(calls[0].method, "GET");
      assertEquals(calls[1].method, "PUT");
      assert(calls[1].url.endsWith("/video/v1/live-streams/ls-1/complete"));
      assertEquals(calls[2].method, "GET");
    },
  );
  assertEquals(getWrittenResources()[0].specName, "live");
});

Deno.test("complete_live_stream refuses an ACTIVE stream without confirmation", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: rawLiveStream("ls-1", { status: "active" }) },
    }],
    async (calls) => {
      await assertRejects(
        () => model.methods.complete_live_stream.execute({}, context),
        Error,
        "actively broadcasting",
      );
      assertEquals(calls.length, 1); // status check only — complete never sent
    },
  );
});

Deno.test("complete_live_stream completes an ACTIVE stream with matching confirmation", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1", confirmLiveStreamId: "ls-1" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: { data: rawLiveStream("ls-1", { status: "active" }) },
      },
      { status: 200, body: { data: {} } },
      {
        status: 200,
        body: { data: rawLiveStream("ls-1", { status: "idle" }) },
      },
    ],
    async (calls) => {
      await model.methods.complete_live_stream.execute({}, context);
      assertEquals(calls[1].method, "PUT");
    },
  );
  assertEquals(getWrittenResources()[0].specName, "live");
});

// --- reset_stream_key ---

Deno.test("reset_stream_key refuses a mismatched confirmation", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1", confirmLiveStreamId: "ls-2" }),
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.reset_stream_key.execute({}, context),
      Error,
      "Reset refused",
    );
    assertEquals(calls.length, 0);
  });
});

Deno.test("reset_stream_key rotates the key via the hyphenated endpoint", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1", confirmLiveStreamId: "ls-1" }),
  });
  await withMockedFetch(
    [{
      status: 201,
      body: {
        data: rawLiveStream("ls-1", { stream_key: "secret-stream-key-NEW" }),
      },
    }],
    async (calls) => {
      await model.methods.reset_stream_key.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assert(
        calls[0].url.endsWith("/video/v1/live-streams/ls-1/reset-stream-key"),
      );
    },
  );
  assertEquals(
    getWrittenResources()[0].data.streamKey,
    "secret-stream-key-NEW",
  );
});

// --- delete_live_stream ---

Deno.test("delete_live_stream refuses without confirmation or catalog entry", async () => {
  const mismatch = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1", confirmLiveStreamId: "nope" }),
    storedResources: { liveStreams: storedLiveStreams(["ls-1"]) },
  });
  await assertRejects(
    () => model.methods.delete_live_stream.execute({}, mismatch.context),
    Error,
    "Delete refused",
  );

  const unknown = createModelTestContext({
    globalArgs: args({ liveStreamId: "ghost", confirmLiveStreamId: "ghost" }),
    storedResources: { liveStreams: storedLiveStreams(["ls-1"]) },
  });
  await assertRejects(
    () => model.methods.delete_live_stream.execute({}, unknown.context),
    Error,
    "not in the synced catalog",
  );
});

Deno.test("delete_live_stream deletes a confirmed, known stream and updates the catalog", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ liveStreamId: "ls-1", confirmLiveStreamId: "ls-1" }),
    storedResources: { liveStreams: storedLiveStreams(["ls-1", "ls-2"]) },
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.delete_live_stream.execute({}, context);
    assertEquals(calls[0].method, "DELETE");
    assert(calls[0].url.endsWith("/video/v1/live-streams/ls-1"));
  });
  const written = getWrittenResources();
  assertEquals(written[0].data.streamCount, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.streams as any)[0].id, "ls-2");
});

// --- Analytics (Mux Data) ---

Deno.test("get_video_views sends timeframe/filter params and maps fields", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ timeframe: "24:hours", metricFilter: "country:US" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        total_row_count: 250,
        data: [{
          id: "view-1",
          view_start: "2026-08-09T01:00:00Z",
          video_title: "Intro to Craft",
          watch_time: 90000,
          viewer_experience_score: 0.95,
          country_code: "US",
          playback_failure: false,
        }],
      },
    }],
    async (calls) => {
      await model.methods.get_video_views.execute({}, context);
      assert(calls[0].url.includes("/data/v1/video-views?"));
      assert(calls[0].url.includes("timeframe%5B%5D=24%3Ahours"));
      assert(calls[0].url.includes("filters%5B%5D=country%3AUS"));
      assert(calls[0].url.includes("limit=100"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "views");
  assertEquals(written[0].data.totalRowCount, 250);
  // deno-lint-ignore no-explicit-any
  const v = (written[0].data.views as any)[0];
  assertEquals(v.videoTitle, "Intro to Craft");
  assertEquals(v.watchTime, 90000);
});

Deno.test("get_metrics pulls overall only when groupBy is empty", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ metricId: "watch_time" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: { value: 123456, total_views: 42, total_watch_time: 123456 },
      },
    }],
    async (calls) => {
      await model.methods.get_metrics.execute({}, context);
      assertEquals(calls.length, 1); // no breakdown call
      assert(calls[0].url.includes("/data/v1/metrics/watch_time/overall?"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "metrics");
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.overall as any).value, 123456);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.breakdown as any).length, 0);
});

Deno.test("get_metrics adds a breakdown call when groupBy is set", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ metricId: "views", groupBy: "video_title" }),
  });
  await withMockedFetch(
    [
      { status: 200, body: { data: { value: 100, total_views: 100 } } },
      {
        status: 200,
        body: {
          data: [
            { field: "Intro to Craft", value: 60, views: 60 },
            { field: "Twig Basics", value: 40, views: 40 },
          ],
        },
      },
    ],
    async (calls) => {
      await model.methods.get_metrics.execute({}, context);
      assertEquals(calls.length, 2);
      assert(calls[1].url.includes("/data/v1/metrics/views/breakdown?"));
      assert(calls[1].url.includes("group_by=video_title"));
    },
  );
  // deno-lint-ignore no-explicit-any
  const breakdown = getWrittenResources()[0].data.breakdown as any;
  assertEquals(breakdown.length, 2);
  assertEquals(breakdown[0].field, "Intro to Craft");
});

Deno.test("list_playback_errors stores the error digest", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [{
          id: 7,
          code: 2,
          message: "MEDIA_ERR_NETWORK",
          count: 3,
          percentage: 1.2,
          last_seen: "2026-08-09T01:00:00Z",
        }],
      },
    }],
    async (calls) => {
      await model.methods.list_playback_errors.execute({}, context);
      assert(calls[0].url.includes("/data/v1/errors?"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "playbackErrors");
  assertEquals(written[0].data.errorCount, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.errors as any)[0].message, "MEDIA_ERR_NETWORK");
});
