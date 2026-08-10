import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing";
import { model } from "./data.ts";

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

/** Complete globalArgs with a test token; spread overrides on top. */
function args(overrides: Record<string, unknown> = {}) {
  return {
    laravelCloudToken: "test-lc-token",
    clusterId: "",
    confirmClusterId: "",
    clusterName: "",
    databaseType: "laravel_mysql_84",
    region: "us-east-2",
    clusterConfig: "",
    databaseName: "",
    confirmDatabaseName: "",
    snapshotName: "",
    snapshotDescription: "",
    snapshotId: "",
    confirmSnapshotId: "",
    restoreName: "",
    restoreTime: "",
    cacheId: "",
    confirmCacheId: "",
    cacheName: "",
    cacheType: "laravel_valkey",
    cacheSize: "250mb",
    cachePublic: false,
    bucketId: "",
    confirmBucketId: "",
    bucketName: "",
    bucketVisibility: "private",
    bucketKeyName: "",
    bucketKeyPermission: "read_write",
    bucketKeyId: "",
    confirmBucketKeyId: "",
    ...overrides,
  };
}

/** A JSON:API cluster resource, including secret connection credentials. */
function rawCluster(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "databases",
    attributes: {
      name: `cluster-${id}`,
      type: "laravel_mysql_84",
      status: "available",
      region: "us-east-2",
      created_at: "2026-08-01T00:00:00Z",
      connection: {
        hostname: "db.example.laravel.cloud",
        port: 3306,
        protocol: "mysql",
        driver: "mysql",
        username: "cloud_user",
        password: "sup3r-secret-db-pass",
      },
      ...overrides,
    },
  };
}

/** A JSON:API cache resource with secret connection credentials. */
function rawCache(id: string) {
  return {
    id,
    type: "caches",
    attributes: {
      name: `cache-${id}`,
      type: "laravel_valkey",
      status: "available",
      region: "us-east-2",
      size: "250mb",
      is_public: false,
      uses_hibernation: true,
      created_at: "2026-08-01T00:00:00Z",
      connection: {
        hostname: "cache.example.laravel.cloud",
        port: 6379,
        protocol: "redis",
        username: "default",
        password: "s3cret-cache-pass",
      },
    },
  };
}

/** Stored catalogs for gate tests. */
function storedClusters(ids: string[]) {
  return {
    clusters: ids.map((id) => ({
      id,
      name: `cluster-${id}`,
      engine: "laravel_mysql_84",
      status: "available",
    })),
    clusterCount: ids.length,
    syncedAt: "2026-08-09T00:00:00Z",
  };
}

// --- sync_clusters + credential stripping ---

Deno.test("sync_clusters maps the catalog without connection data", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: [rawCluster("db-1"), rawCluster("db-2")], links: {} },
    }],
    async () => {
      await model.methods.sync_clusters.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].data.clusterCount, 2);
  assert(!JSON.stringify(written[0].data).includes("sup3r-secret"));
});

Deno.test("get_cluster keeps hostname/port but never credentials", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ clusterId: "db-1" }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: rawCluster("db-1") } }],
    async () => {
      await model.methods.get_cluster.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].data.hostname, "db.example.laravel.cloud");
  assertEquals(written[0].data.port, 3306);
  const everything = JSON.stringify(written[0].data) +
    JSON.stringify(getLogs());
  assert(!everything.includes("sup3r-secret-db-pass"));
  assert(!everything.includes("cloud_user"));
});

// --- create_cluster ---

Deno.test("create_cluster sends type/name/region and optional config", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({
      clusterName: "smoke-db",
      clusterConfig: '{"cu_min": 0.25, "cu_max": 1}',
      databaseType: "neon_serverless_postgres_18",
    }),
  });
  await withMockedFetch(
    [{ status: 201, body: { data: rawCluster("db-9") } }],
    async (calls) => {
      await model.methods.create_cluster.execute({}, context);
      assertEquals(calls[0].body.type, "neon_serverless_postgres_18");
      assertEquals(calls[0].body.name, "smoke-db");
      assertEquals(calls[0].body.config, { cu_min: 0.25, cu_max: 1 });
    },
  );
});

// --- delete_cluster gates ---

Deno.test("delete_cluster refuses mismatch and unknown clusters", async () => {
  const mismatch = createModelTestContext({
    globalArgs: args({ clusterId: "db-1", confirmClusterId: "db-2" }),
    storedResources: { clusters: storedClusters(["db-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_cluster.execute({}, mismatch.context),
      Error,
      "confirmClusterId does not match",
    );
    assertEquals(calls.length, 0);
  });

  const unknown = createModelTestContext({
    globalArgs: args({ clusterId: "ghost", confirmClusterId: "ghost" }),
    storedResources: { clusters: storedClusters(["db-1"]) },
  });
  await assertRejects(
    () => model.methods.delete_cluster.execute({}, unknown.context),
    Error,
    "not in the synced catalog",
  );
});

// --- delete_database gate ---

Deno.test("delete_database requires confirmation and a stored entry for the same cluster", async () => {
  const stored = {
    databases: {
      clusterId: "db-1",
      databases: [{ id: "66065640", name: "app_production" }],
      databaseCount: 1,
      syncedAt: "2026-08-09T00:00:00Z",
    },
  };
  const wrongCluster = createModelTestContext({
    globalArgs: args({
      clusterId: "db-2",
      databaseName: "app_production",
      confirmDatabaseName: "app_production",
    }),
    storedResources: stored,
  });
  await assertRejects(
    () => model.methods.delete_database.execute({}, wrongCluster.context),
    Error,
    "not in the stored list",
  );

  const ok = createModelTestContext({
    globalArgs: args({
      clusterId: "db-1",
      databaseName: "app_production",
      confirmDatabaseName: "app_production",
    }),
    storedResources: stored,
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.delete_database.execute({}, ok.context);
    // the API routes schema deletes by ID, not name (name-routed = 405)
    assert(
      calls[0].url.endsWith("/databases/clusters/db-1/databases/66065640"),
    );
  });
});

// --- restore_database ---

Deno.test("restore_database requires exactly one source", async () => {
  const none = createModelTestContext({
    globalArgs: args({ clusterId: "db-1", restoreName: "restored_db" }),
  });
  await assertRejects(
    () => model.methods.restore_database.execute({}, none.context),
    Error,
    "needs a source",
  );

  const both = createModelTestContext({
    globalArgs: args({
      clusterId: "db-1",
      restoreName: "restored_db",
      snapshotId: "snap-1",
      restoreTime: "2026-08-09T00:00:00Z",
    }),
  });
  await assertRejects(
    () => model.methods.restore_database.execute({}, both.context),
    Error,
    "not both",
  );
});

Deno.test("restore_database posts the snapshot source (creates a new cluster, writes nothing)", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({
      clusterId: "db-1",
      restoreName: "restored_db",
      snapshotId: "snap-1",
    }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: {} } }],
    async (calls) => {
      await model.methods.restore_database.execute({}, context);
      assert(calls[0].url.endsWith("/databases/clusters/db-1/restore"));
      assertEquals(calls[0].body.name, "restored_db");
      assertEquals(calls[0].body.database_snapshot_id, "snap-1");
      assertEquals(calls[0].body.restore_time, undefined);
    },
  );
  // live-verified: restore clones a whole cluster; state comes from sync_clusters
  assertEquals(getWrittenResources().length, 0);
});

// --- snapshots ---

Deno.test("delete_snapshot refuses without confirmation or stored entry", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ snapshotId: "snap-1", confirmSnapshotId: "nope" }),
    storedResources: {
      snapshots: {
        clusterId: "db-1",
        snapshots: [{ id: "snap-1", name: "pre-migration" }],
        snapshotCount: 1,
        syncedAt: "2026-08-09T00:00:00Z",
      },
    },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_snapshot.execute({}, context),
      Error,
      "confirmSnapshotId does not match",
    );
    assertEquals(calls.length, 0);
  });
});

// --- caches ---

Deno.test("create_cache sends all required fields", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ cacheName: "smoke-cache" }),
  });
  await withMockedFetch(
    [{ status: 201, body: { data: rawCache("c-1") } }],
    async (calls) => {
      await model.methods.create_cache.execute({}, context);
      assertEquals(calls[0].body.type, "laravel_valkey");
      assertEquals(calls[0].body.name, "smoke-cache");
      assertEquals(calls[0].body.size, "250mb");
      assertEquals(calls[0].body.auto_upgrade_enabled, true);
      assertEquals(calls[0].body.is_public, false);
    },
  );
});

Deno.test("get_cache strips connection credentials", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ cacheId: "c-1" }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: rawCache("c-1") } }],
    async () => {
      await model.methods.get_cache.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].data.hostname, "cache.example.laravel.cloud");
  const everything = JSON.stringify(written[0].data) +
    JSON.stringify(getLogs());
  assert(!everything.includes("s3cret-cache-pass"));
});

// --- bucket keys ---

Deno.test("create_bucket_key stores the pair as sensitive fields, never logs them", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ bucketId: "b-1", bucketKeyName: "app-key" }),
  });
  await withMockedFetch(
    [{
      status: 201,
      body: {
        data: {
          id: "key-1",
          type: "filesystemKeys",
          attributes: {
            name: "app-key",
            permission: "read_write",
            access_key_id: "AKIA-TEST-ID",
            access_key_secret: "VERY-SECRET-S3-KEY",
            created_at: "2026-08-09T00:00:00Z",
          },
        },
      },
    }],
    async (calls) => {
      await model.methods.create_bucket_key.execute({}, context);
      assertEquals(calls[0].body.name, "app-key");
      assertEquals(calls[0].body.permission, "read_write");
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "bucketKey");
  assertEquals(written[0].data.accessKeySecret, "VERY-SECRET-S3-KEY");
  assert(!JSON.stringify(getLogs()).includes("VERY-SECRET-S3-KEY"));
});

Deno.test("list_bucket_keys stores names only — no key material", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ bucketId: "b-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [{
          id: "key-1",
          type: "filesystemKeys",
          attributes: {
            name: "app-key",
            permission: "read_write",
            access_key_id: "AKIA-TEST-ID",
            access_key_secret: "VERY-SECRET-S3-KEY",
          },
        }],
        links: {},
      },
    }],
    async () => {
      await model.methods.list_bucket_keys.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "bucketKeys");
  assert(!JSON.stringify(written[0].data).includes("VERY-SECRET-S3-KEY"));
  assert(!JSON.stringify(written[0].data).includes("AKIA-TEST-ID"));
});

Deno.test("delete_bucket_key refuses without confirmation", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ bucketKeyId: "key-1", confirmBucketKeyId: "wrong" }),
    storedResources: {
      bucketKeys: {
        bucketId: "b-1",
        keys: [{ id: "key-1", name: "app-key" }],
        keyCount: 1,
        syncedAt: "2026-08-09T00:00:00Z",
      },
    },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_bucket_key.execute({}, context),
      Error,
      "confirmBucketKeyId does not match",
    );
    assertEquals(calls.length, 0);
  });
});

// --- Bucket 2-3 additions ---

Deno.test("update_cache PATCHes the payload and refreshes without credentials", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({
      cacheId: "c-1",
      updatePayload: '{"size": "valkey-flex-1gb"}',
    }),
  });
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: { data: rawCache("c-1") } },
    ],
    async (calls) => {
      await model.methods.update_cache.execute({}, context);
      assertEquals(calls[0].method, "PATCH");
      assertEquals(calls[0].body.size, "valkey-flex-1gb");
    },
  );
  const everything = JSON.stringify(getWrittenResources()[0].data) +
    JSON.stringify(getLogs());
  assert(!everything.includes("s3cret-cache-pass"));
});

Deno.test("get_cluster_metrics summarizes series under the target id", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ clusterId: "db-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: {
          cpu_usage: {
            labels: ["db"],
            average: [5],
            data: [{ x: "t", y: [5] }],
          },
        },
      },
    }],
    async () => {
      await model.methods.get_cluster_metrics.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "clusterMetrics");
  assertEquals(written[0].data.targetId, "db-1");
});

Deno.test("get_database resolves the schema ID from stored state", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ clusterId: "db-1", databaseName: "app_production" }),
    storedResources: {
      databases: {
        clusterId: "db-1",
        databases: [{ id: "66065640", name: "app_production" }],
        databaseCount: 1,
        syncedAt: "2026-08-10T00:00:00Z",
      },
    },
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: {
          id: "66065640",
          type: "databaseSchemas",
          attributes: { name: "app_production", status: "available" },
        },
      },
    }],
    async (calls) => {
      await model.methods.get_database.execute({}, context);
      assert(
        calls[0].url.endsWith("/databases/clusters/db-1/databases/66065640"),
      );
    },
  );
  assertEquals(getWrittenResources()[0].specName, "schema");
});

Deno.test("list_database_types stores the engine catalog", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [{
          type: "laravel_mysql_84",
          label: "MySQL 8.4",
          regions: ["us-east-2"],
        }],
      },
    }],
    async () => {
      await model.methods.list_database_types.execute({}, context);
    },
  );
  // deno-lint-ignore no-explicit-any
  assertEquals(
    (getWrittenResources()[0].data.types as any)[0].type,
    "laravel_mysql_84",
  );
});
