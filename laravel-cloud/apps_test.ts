import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing@0.20260604.20";
import { model } from "./apps.ts";

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
      // Not every body is JSON — upload_avatar sends FormData. Record what
      // we can rather than throwing inside the mock itself.
      body: init?.body === undefined || init?.body === null
        ? undefined
        : (() => {
          try {
            return JSON.parse(String(init.body));
          } catch {
            return String(init.body);
          }
        })(),
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
    appId: "",
    confirmAppId: "",
    environmentId: "",
    confirmEnvironmentId: "",
    deploymentId: "",
    appName: "",
    repository: "",
    sourceControlProvider: "github",
    region: "us-east-2",
    rootDirectory: "",
    branch: "",
    environmentName: "",
    command: "",
    envVariables: "",
    envVarMethod: "set",
    envVarKeys: "",
    domainName: "",
    domainId: "",
    confirmDomainId: "",
    ...overrides,
  };
}

/** A JSON:API application resource as the API returns it. */
function rawApp(id: string, name = "demo-app") {
  return {
    id,
    type: "applications",
    attributes: {
      name,
      slug: name,
      region: "us-east-2",
      root_directory: null,
      created_at: "2026-08-01T00:00:00Z",
      repository: { full_name: "craftquest/demo", default_branch: "main" },
    },
  };
}

/** A JSON:API environment resource, including secret env var values. */
function rawEnvironment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "environments",
    attributes: {
      name: "production",
      slug: "production",
      status: "running",
      vanity_domain: "demo.laravel.cloud",
      php_major_version: "8.4",
      node_version: "22",
      build_command: "npm run build",
      deploy_command: null,
      uses_octane: false,
      uses_hibernation: true,
      environment_variables: [
        { key: "APP_KEY", value: "base64:VERYSECRETVALUE" },
        { key: "DB_PASSWORD", value: "s3cret-db-pass" },
      ],
      ...overrides,
    },
  };
}

/** A JSON:API deployment resource. */
function rawDeployment(id: string, status: string) {
  return {
    id,
    type: "deployments",
    attributes: {
      status,
      branch_name: "main",
      commit_hash: "abc1234def",
      commit_message: "Fix things",
      commit_author: "ryan",
      failure_reason: status.endsWith("failed") ? "build exploded" : null,
      started_at: "2026-08-09T00:00:00Z",
      finished_at: null,
    },
    relationships: {
      environment: { data: { type: "environments", id: "env-1" } },
    },
  };
}

/** A stored apps catalog. */
function storedApps(ids: string[]) {
  return {
    apps: ids.map((id) => ({
      id,
      name: `app-${id}`,
      slug: `app-${id}`,
      region: "us-east-2",
    })),
    appCount: ids.length,
    syncedAt: "2026-08-09T00:00:00Z",
  };
}

// --- Credentials ---

Deno.test("methods throw when the token is empty", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ laravelCloudToken: "" }),
  });
  await withMockedFetch([], async () => {
    await assertRejects(
      () => model.methods.sync_apps.execute({}, context),
      Error,
      "No Laravel Cloud token",
    );
  });
});

// --- sync_apps ---

Deno.test("sync_apps follows links.next to completion", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: [rawApp("a-1"), rawApp("a-2")],
          links: { next: "https://cloud.laravel.com/api/applications?page=2" },
        },
      },
      { status: 200, body: { data: [rawApp("a-3")], links: { next: null } } },
    ],
    async (calls) => {
      await model.methods.sync_apps.execute({}, context);
      assertEquals(calls.length, 2);
      assert(calls[1].url.includes("page=2"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "apps");
  assertEquals(written[0].data.appCount, 3);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.apps as any)[0].repository, "craftquest/demo");
});

// --- get_app ---

Deno.test("get_app maps included environments", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ appId: "a-1" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: rawApp("a-1"),
          included: [rawEnvironment("env-1"), { id: "x", type: "deployments" }],
        },
      },
    ],
    async (calls) => {
      await model.methods.get_app.execute({}, context);
      assert(calls[0].url.includes("/applications/a-1?include=environments"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "app");
  // deno-lint-ignore no-explicit-any
  const envs = written[0].data.environments as any;
  assertEquals(envs.length, 1);
  assertEquals(envs[0].status, "running");
  // environment summaries in app detail must not leak env vars either
  assert(!JSON.stringify(written[0].data).includes("s3cret"));
});

// --- create_app ---

Deno.test("create_app sends the current-contract body", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ appName: "new-app", repository: "craftquest/new" }),
  });
  await withMockedFetch(
    [{ status: 201, body: { data: rawApp("a-9", "new-app") } }],
    async (calls) => {
      await model.methods.create_app.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].body.name, "new-app");
      assertEquals(calls[0].body.repository, "craftquest/new");
      assertEquals(calls[0].body.source_control_provider_type, "github");
      assertEquals(calls[0].body.region, "us-east-2");
    },
  );
  assertEquals(getWrittenResources()[0].specName, "app");
});

Deno.test("create_app requires appName and repository", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  await assertRejects(
    () => model.methods.create_app.execute({}, context),
    Error,
    "appName",
  );
});

// --- delete_app gates ---

Deno.test("delete_app refuses mismatched confirmation and unknown apps", async () => {
  const mismatch = createModelTestContext({
    globalArgs: args({ appId: "a-1", confirmAppId: "a-2" }),
    storedResources: { apps: storedApps(["a-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_app.execute({}, mismatch.context),
      Error,
      "confirmAppId does not match",
    );
    assertEquals(calls.length, 0);
  });

  const unknown = createModelTestContext({
    globalArgs: args({ appId: "ghost", confirmAppId: "ghost" }),
    storedResources: { apps: storedApps(["a-1"]) },
  });
  await assertRejects(
    () => model.methods.delete_app.execute({}, unknown.context),
    Error,
    "not in the synced catalog",
  );
});

Deno.test("delete_app deletes a confirmed, known app and updates the catalog", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ appId: "a-1", confirmAppId: "a-1" }),
    storedResources: { apps: storedApps(["a-1", "a-2"]) },
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.delete_app.execute({}, context);
    assertEquals(calls[0].method, "DELETE");
    assert(calls[0].url.endsWith("/applications/a-1"));
  });
  assertEquals(getWrittenResources()[0].data.appCount, 1);
});

Deno.test("delete_environment is gated on confirmation and the stored app detail", async () => {
  const storedApp = {
    id: "a-1",
    name: "demo-app",
    slug: "demo-app",
    region: "us-east-2",
    environments: [
      { id: "env-1", name: "production", slug: "production", status: "running" },
      { id: "env-2", name: "staging", slug: "staging", status: "stopped" },
    ],
    updatedAt: "2026-08-09T00:00:00Z",
  };

  const mismatch = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", confirmEnvironmentId: "env-2" }),
    storedResources: { app: storedApp },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_environment.execute({}, mismatch.context),
      Error,
      "confirmEnvironmentId does not match",
    );
    assertEquals(calls.length, 0);
  });

  const unknown = createModelTestContext({
    globalArgs: args({ environmentId: "ghost", confirmEnvironmentId: "ghost" }),
    storedResources: { app: storedApp },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_environment.execute({}, unknown.context),
      Error,
      "not in the stored app detail",
    );
    assertEquals(calls.length, 0);
  });

  // confirmed + known: deletes and drops the environment from the app detail
  const ok = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", confirmEnvironmentId: "env-1" }),
    storedResources: { app: storedApp },
  });
  await withMockedFetch([{ status: 204 }], async (calls) => {
    await model.methods.delete_environment.execute({}, ok.context);
    assertEquals(calls[0].method, "DELETE");
    assert(calls[0].url.endsWith("/environments/env-1"));
  });
  const written = ok.getWrittenResources();
  assertEquals(written[0].specName, "app");
  assertEquals(written[0].data.environments, [
    { id: "env-2", name: "staging", slug: "staging", status: "stopped" },
  ]);
});

// --- get_environment: THE env var stripping test ---

Deno.test("get_environment stores env var KEY NAMES only — values never in state or logs", async () => {
  const { context, getWrittenResources, getLogs } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: rawEnvironment("env-1") } }],
    async () => {
      await model.methods.get_environment.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "environment");
  assertEquals(written[0].data.envVarKeys, ["APP_KEY", "DB_PASSWORD"]);
  const everything = JSON.stringify(written[0].data) +
    JSON.stringify(getLogs());
  assert(!everything.includes("VERYSECRETVALUE"));
  assert(!everything.includes("s3cret-db-pass"));
});

// --- stop_environment conditional gate ---

Deno.test("stop_environment refuses a RUNNING environment without confirmation", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: rawEnvironment("env-1") } }],
    async (calls) => {
      await assertRejects(
        () => model.methods.stop_environment.execute({}, context),
        Error,
        "running",
      );
      assertEquals(calls.length, 1); // status check only, stop never sent
    },
  );
});

Deno.test("stop_environment stops a running env with confirmation, and a stopped env without", async () => {
  const confirmed = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", confirmEnvironmentId: "env-1" }),
  });
  await withMockedFetch(
    [
      { status: 200, body: { data: rawEnvironment("env-1") } },
      { status: 200, body: {} },
      {
        status: 200,
        body: { data: rawEnvironment("env-1", { status: "stopped" }) },
      },
    ],
    async (calls) => {
      await model.methods.stop_environment.execute({}, confirmed.context);
      assertEquals(calls[1].method, "POST");
      assert(calls[1].url.endsWith("/environments/env-1/stop"));
    },
  );

  const idle = createModelTestContext({
    globalArgs: args({ environmentId: "env-2" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: { data: rawEnvironment("env-2", { status: "stopped" }) },
      },
      { status: 200, body: {} },
      {
        status: 200,
        body: { data: rawEnvironment("env-2", { status: "stopped" }) },
      },
    ],
    async (calls) => {
      await model.methods.stop_environment.execute({}, idle.context);
      assertEquals(calls.length, 3); // already stopped — nothing to confirm
    },
  );
});

Deno.test("stop_environment gates hibernating and deploying environments too", async () => {
  // EnvironmentStatus is deploying|running|hibernating|stopped. A hibernating
  // environment has scaled to zero but still wakes on request, so stopping it
  // is an outage — it must be gated exactly like a running one.
  for (const status of ["hibernating", "deploying"]) {
    const { context } = createModelTestContext({
      globalArgs: args({ environmentId: "env-1" }),
    });
    await withMockedFetch(
      [{ status: 200, body: { data: rawEnvironment("env-1", { status }) } }],
      async (calls) => {
        await assertRejects(
          () => model.methods.stop_environment.execute({}, context),
          Error,
          status,
        );
        assertEquals(calls.length, 1); // status check only, stop never sent
      },
    );
  }

  // An unrecognized future status must fail safe rather than stop silently.
  const unknown = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: rawEnvironment("env-1", { status: "some_new_state" }) },
    }],
    async (calls) => {
      await assertRejects(
        () => model.methods.stop_environment.execute({}, unknown.context),
        Error,
        "Stop refused",
      );
      assertEquals(calls.length, 1);
    },
  );
});

// --- set_env_variables ---

Deno.test("set_env_variables sends values but never logs them", async () => {
  const { context, getLogs } = createModelTestContext({
    globalArgs: args({
      environmentId: "env-1",
      envVariables: '[{"key": "NEW_SECRET", "value": "super-hidden-123"}]',
    }),
  });
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: { data: rawEnvironment("env-1") } },
    ],
    async (calls) => {
      await model.methods.set_env_variables.execute({}, context);
      assertEquals(calls[0].body.method, "set");
      assertEquals(calls[0].body.variables[0].value, "super-hidden-123");
    },
  );
  assert(!JSON.stringify(getLogs()).includes("super-hidden-123"));
});

Deno.test("set_env_variables rejects malformed JSON and entries", async () => {
  const bad = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", envVariables: "not json" }),
  });
  await assertRejects(
    () => model.methods.set_env_variables.execute({}, bad.context),
    Error,
    "JSON array",
  );
  const missing = createModelTestContext({
    globalArgs: args({
      environmentId: "env-1",
      envVariables: '[{"key": "X"}]',
    }),
  });
  await assertRejects(
    () => model.methods.set_env_variables.execute({}, missing.context),
    Error,
    '"key" and "value"',
  );
});

// --- deploy + wait_deployment ---

Deno.test("deploy stores the initiated deployment", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{ status: 200, body: { data: rawDeployment("d-1", "pending") } }],
    async (calls) => {
      await model.methods.deploy.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assert(calls[0].url.endsWith("/environments/env-1/deployments"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "deployment");
  assertEquals(written[0].data.id, "d-1");
  assertEquals(written[0].data.environmentId, "env-1");
});

Deno.test("wait_deployment succeeds on deployment.succeeded", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ deploymentId: "d-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: rawDeployment("d-1", "deployment.succeeded") },
    }],
    async () => {
      await model.methods.wait_deployment.execute({}, context);
    },
  );
  assertEquals(getWrittenResources()[0].data.status, "deployment.succeeded");
});

Deno.test("wait_deployment fails with reason and failed-step log tail", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ deploymentId: "d-1" }),
  });
  await withMockedFetch(
    [
      { status: 200, body: { data: rawDeployment("d-1", "build.failed") } },
      {
        status: 200,
        body: {
          data: {
            build: {
              available: true,
              steps: [
                { step: "composer", status: "failed", output: "OOM killed" },
              ],
            },
            deploy: { available: false, steps: [] },
          },
        },
      },
    ],
    async () => {
      const err = await assertRejects(
        () => model.methods.wait_deployment.execute({}, context),
        Error,
      );
      assert(err.message.includes("build.failed"));
      assert(err.message.includes("build exploded"));
      assert(err.message.includes("OOM killed"));
    },
  );
});

// --- run_command ---

Deno.test("run_command polls to completion and truncates output", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({
      environmentId: "env-1",
      command: "php artisan migrate --force",
    }),
  });
  const bigOutput = "x".repeat(20000) + "TAIL";
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: {
            id: "c-1",
            type: "commands",
            attributes: {
              command: "php artisan migrate --force",
              status: "pending",
            },
          },
        },
      },
      {
        status: 200,
        body: {
          data: {
            id: "c-1",
            type: "commands",
            attributes: {
              command: "php artisan migrate --force",
              status: "command.success",
              exit_code: 0,
              output: bigOutput,
            },
          },
        },
      },
    ],
    async (calls) => {
      await model.methods.run_command.execute({}, context);
      assertEquals(calls[0].body.command, "php artisan migrate --force");
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "commandRun");
  assertEquals(written[0].data.exitCode, 0);
  const out = String(written[0].data.output);
  assertEquals(out.length, 10000);
  assert(out.endsWith("TAIL")); // truncation keeps the tail
});

// --- domains ---

Deno.test("delete_domain refuses without confirmation or stored entry", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ domainId: "dom-1", confirmDomainId: "wrong" }),
    storedResources: {
      domains: {
        environmentId: "env-1",
        domains: [{ id: "dom-1", name: "example.com" }],
        domainCount: 1,
        syncedAt: "2026-08-09T00:00:00Z",
      },
    },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_domain.execute({}, context),
      Error,
      "confirmDomainId does not match",
    );
    assertEquals(calls.length, 0);
  });
});

// --- Bucket 2-3 additions ---

Deno.test("update_environment PATCHes the payload and refreshes", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({
      environmentId: "env-1",
      updatePayload: '{"php_version": "8.4", "build_command": "npm run build"}',
    }),
  });
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: { data: rawEnvironment("env-1") } },
    ],
    async (calls) => {
      await model.methods.update_environment.execute({}, context);
      assertEquals(calls[0].method, "PATCH");
      assert(calls[0].url.endsWith("/environments/env-1"));
      assertEquals(calls[0].body.php_version, "8.4");
    },
  );
  assertEquals(getWrittenResources()[0].specName, "environment");
});

Deno.test("update methods reject malformed payloads", async () => {
  const bad = createModelTestContext({
    globalArgs: args({ appId: "a-1", updatePayload: "[1,2]" }),
  });
  await assertRejects(
    () => model.methods.update_app.execute({}, bad.context),
    Error,
    "non-empty JSON object",
  );
});

Deno.test("list_deployments maps deployment history", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [
          rawDeployment("d-1", "deployment.succeeded"),
          rawDeployment("d-2", "build.failed"),
        ],
        links: {},
      },
    }],
    async () => {
      await model.methods.list_deployments.execute({}, context);
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "deployments");
  assertEquals(written[0].data.deploymentCount, 2);
});

Deno.test("get_environment_logs truncates messages and stores the cursor", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", logType: "application" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [{
          message: "y".repeat(2000),
          level: "info",
          type: "application",
          logged_at: "2026-08-10T00:00:00Z",
        }],
        meta: { cursor: "cur-1", type: "application", from: "a", to: "b" },
      },
    }],
    async (calls) => {
      await model.methods.get_environment_logs.execute({}, context);
      assert(calls[0].url.includes("type=application"));
    },
  );
  const written = getWrittenResources();
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.logs as any)[0].message.length, 500);
  assertEquals(written[0].data.cursor, "cur-1");
});

Deno.test("get_environment_metrics summarizes named series", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", metricsPeriod: "24h" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      // The ENVIRONMENT endpoint labels its sub-series and returns parallel
      // average arrays — captured from a live environment on 2026-08-10.
      body: {
        data: {
          cpu_usage: {
            labels: ["App"],
            average: [12.5],
            data: [{ x: "t1", y: 10 }, { x: "t2", y: 15 }],
          },
          http_response_count: {
            labels: ["1/2/3XX", "4XX", "5XX"],
            average: [0, 0, 0],
            data: [],
          },
        },
      },
    }],
    async (calls) => {
      await model.methods.get_environment_metrics.execute({}, context);
      assert(calls[0].url.includes("period=24h"));
    },
  );
  const series = getWrittenResources()[0].data.series as Record<
    string,
    unknown
  >[];
  assertEquals(series.length, 2);
  assertEquals(series[0].name, "cpu_usage");
  assertEquals(series[0].labels, ["App"]);
  assertEquals(series[0].average, [12.5]);
  assertEquals(series[0].pointCount, 2);
  assertEquals(series[0].latest, 15);
  // multi-label series keep every average, one per label
  assertEquals(series[1].labels, ["1/2/3XX", "4XX", "5XX"]);
  assertEquals(series[1].average, [0, 0, 0]);
});

Deno.test("environment metrics tolerate the cluster endpoint's scalar shape", async () => {
  // The two endpoints disagree; neither should be able to break the other.
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: {
          cpu_usage: { data: [], average: 0 },
          writes: { data: [{ x: "t", y: 3 }], total: 7 },
          replica_lag: [],
        },
      },
    }],
    async () => {
      await model.methods.get_environment_metrics.execute({}, context);
    },
  );
  const series = getWrittenResources()[0].data.series as Record<
    string,
    unknown
  >[];
  // a scalar average of 0 becomes a single-entry array, not a crash
  assertEquals(series[0].average, [0]);
  assertEquals(series[0].labels, []);
  assertEquals(series[1].total, 7);
  assertEquals(series[1].latest, 3);
  assertEquals(series[2].pointCount, 0);
});

Deno.test("list_regions stores the region catalog", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: [{ region: "us-east-2", label: "Ohio", flag: "us" }] },
    }],
    async () => {
      await model.methods.list_regions.execute({}, context);
    },
  );
  const regions = getWrittenResources()[0].data.regions as { region: string }[];
  assertEquals(regions[0].region, "us-east-2");
});

// --- usage ---

Deno.test("get_usage maps the spend summary and breakdowns", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ metricsPeriod: "current" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: {
          summary: {
            current_spend_cents: 1234,
            credits: { used_cents: 500, total_cents: 2000 },
            bandwidth: {
              cost_cents: 0,
              usage_percentage: 3,
              allowance_bytes: 1,
            },
            alert: { threshold_cents: 5000, remaining_percentage: 75 },
          },
          resources: {
            total_cost_cents: 400,
            databases: [{ name: "main-db", total_cents: 400 }],
            caches: [],
            buckets: [],
            websockets: [],
          },
          addons: {
            total_cost_cents: 100,
            items: [{ name: "Extra seats", total_cents: 100 }],
          },
          application_totals: {
            total_cost_cents: 734,
            application_count: 2,
            applications: [
              { name: "craftquest", total_cents: 700 },
              { name: "sandbox", total_cents: 34 },
            ],
          },
        },
      },
    }],
    async (calls) => {
      await model.methods.get_usage.execute({}, context);
      assert(calls[0].url.includes("/usage?period=current"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "usage");
  assertEquals(written[0].data.currentSpendCents, 1234);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.applications as any).length, 2);
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.resourceLines as any)[0].kind, "databases");
  // deno-lint-ignore no-explicit-any
  assertEquals((written[0].data.credits as any).totalCents, 2000);
});

Deno.test("run_command stores output then FAILS when the command fails", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1", command: "php artisan boom" }),
  });
  await withMockedFetch(
    [
      {
        status: 200,
        body: {
          data: {
            id: "c-2",
            type: "commands",
            attributes: { command: "php artisan boom", status: "pending" },
          },
        },
      },
      {
        status: 200,
        body: {
          data: {
            id: "c-2",
            type: "commands",
            attributes: {
              command: "php artisan boom",
              // the REAL platform shape: success status, nonzero exit
              status: "command.success",
              exit_code: 1,
              output: "There are no commands defined in the boom namespace.",
            },
          },
        },
      },
    ],
    async () => {
      const err = await assertRejects(
        () => model.methods.run_command.execute({}, context),
        Error,
      );
      assert(err.message.includes("exit 1"));
      assert(err.message.includes("no commands defined"));
    },
  );
  // the failed run's output was stored BEFORE the throw
  const written = getWrittenResources();
  assertEquals(written[0].specName, "commandRun");
  assertEquals(written[0].data.exitCode, 1);
});

Deno.test("token falls back to the LARAVEL_CLOUD_TOKEN env var", async () => {
  Deno.env.set("LARAVEL_CLOUD_TOKEN", "env-token-123");
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: args({ laravelCloudToken: "" }),
    });
    await withMockedFetch(
      [{ status: 200, body: { data: [], links: {} } }],
      async (calls) => {
        await model.methods.sync_apps.execute({}, context);
        assertEquals(calls.length, 1); // no "token empty" throw — env used
      },
    );
    assertEquals(getWrittenResources()[0].data.appCount, 0);
  } finally {
    Deno.env.delete("LARAVEL_CLOUD_TOKEN");
  }
});

// --- Retry policy ---

Deno.test("a 5xx is retried for GET but never replayed for POST", async () => {
  // GET: safe to replay — the second attempt's payload is the one used.
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [
      { status: 503, body: {}, headers: { "Retry-After": "0" } },
      { status: 200, body: { data: [rawApp("app-1")], links: {} } },
    ],
    async (calls) => {
      await model.methods.sync_apps.execute({}, context);
      assertEquals(calls.length, 2);
    },
  );
  assertEquals(getWrittenResources()[0].data.appCount, 1);

  // POST: a 5xx may land AFTER Laravel Cloud created the deployment, so the
  // request must fail rather than risk a second deployment.
  const { context: postContext } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [
      { status: 502, body: {}, headers: { "Retry-After": "0" } },
      { status: 200, body: { data: rawDeployment("dep-1", "queued") } },
    ],
    async (calls) => {
      await assertRejects(
        () => model.methods.deploy.execute({}, postContext),
        Error,
        "(502)",
      );
      assertEquals(calls.length, 1); // no replay
    },
  );
});

Deno.test("a 429 is retried even for POST — the request never ran", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [
      { status: 429, body: {}, headers: { "Retry-After": "0" } },
      { status: 200, body: { data: rawDeployment("dep-1", "queued") } },
    ],
    async (calls) => {
      await model.methods.deploy.execute({}, context);
      assertEquals(calls.length, 2);
    },
  );
  assertEquals(getWrittenResources()[0].data.id, "dep-1");
});

Deno.test("with no vault token and no env var, methods still refuse", async () => {
  Deno.env.delete("LARAVEL_CLOUD_TOKEN");
  const { context } = createModelTestContext({
    globalArgs: args({ laravelCloudToken: "" }),
  });
  await assertRejects(
    () => model.methods.sync_apps.execute({}, context),
    Error,
    "No Laravel Cloud token",
  );
});

// --- Non-JSON / redirect responses ---

Deno.test("a redirect instead of JSON is reported as a rejection, not a parse error", async () => {
  // upload_avatar hit this live: Laravel Cloud answers a rejected multipart
  // upload with a 302 to an HTML page, which used to surface as
  // "Unexpected token '<'".
  const { context } = createModelTestContext({
    globalArgs: args({ appId: "a-1", avatarPath: "/dev/null" }),
  });
  await withMockedFetch(
    [{ status: 302, body: {}, headers: { location: "/login" } }],
    async () => {
      await assertRejects(
        () => model.methods.upload_avatar.execute({}, context),
        Error,
        "redirected (302)",
      );
    },
  );
});

Deno.test("an HTML body on a 200 is reported with its content type", async () => {
  const { context } = createModelTestContext({ globalArgs: args() });
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response("<!DOCTYPE html><html>nope</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    )) as typeof fetch;
  try {
    await assertRejects(
      () => model.methods.sync_apps.execute({}, context),
      Error,
      "non-JSON body",
    );
  } finally {
    globalThis.fetch = original;
  }
});
