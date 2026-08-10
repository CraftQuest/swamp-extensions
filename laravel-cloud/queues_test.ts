import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createModelTestContext } from "jsr:@systeminit/swamp-testing";
import { model } from "./queues.ts";

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
    environmentId: "",
    instanceId: "",
    confirmInstanceId: "",
    jobId: "",
    confirmJobId: "",
    processId: "",
    confirmProcessId: "",
    createPayload: "",
    updatePayload: "",
    ...overrides,
  };
}

/** A JSON:API instance resource. */
function rawInstance(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: "instances",
    attributes: {
      name: `worker-${id}`,
      type: "managed_queue",
      size: "mq.flex.256mb",
      scaling_type: "fixed",
      min_replicas: 1,
      max_replicas: null,
      queue_status: "active",
      paused: false,
      is_default: false,
      visibility_timeout: 60,
      shutdown_timeout: 10,
      created_at: "2026-08-10T00:00:00Z",
      ...overrides,
    },
  };
}

/** A stored instances list for gate tests. */
function storedInstances(ids: string[]) {
  return {
    environmentId: "env-1",
    instances: ids.map((id) => ({
      id,
      name: `worker-${id}`,
      instanceType: "managed_queue",
    })),
    instanceCount: ids.length,
    syncedAt: "2026-08-10T00:00:00Z",
  };
}

// --- instances ---

Deno.test("list_instances maps the environment's instances", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ environmentId: "env-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: { data: [rawInstance("i-1"), rawInstance("i-2")], links: {} },
    }],
    async (calls) => {
      await model.methods.list_instances.execute({}, context);
      assert(calls[0].url.endsWith("/environments/env-1/instances"));
    },
  );
  const written = getWrittenResources();
  assertEquals(written[0].specName, "instances");
  assertEquals(written[0].data.instanceCount, 2);
});

Deno.test("list_instance_sizes flattens size groups", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args(),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: {
          general: [{
            name: "flex-512mb",
            label: "512 MB",
            cpu_count: 1,
            memory_mib: 512,
          }],
          managed_queue: [{ name: "mq.flex.256mb", label: "256 MB" }],
        },
      },
    }],
    async () => {
      await model.methods.list_instance_sizes.execute({}, context);
    },
  );
  // deno-lint-ignore no-explicit-any
  const sizes = getWrittenResources()[0].data.sizes as any;
  assertEquals(sizes.length, 2);
  assertEquals(sizes[0].group, "general");
  assertEquals(sizes[1].name, "mq.flex.256mb");
});

Deno.test("create_instance posts the payload and stores the detail", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({
      environmentId: "env-1",
      createPayload:
        '{"name": "smoke-queue", "type": "managed_queue", "size": "mq.flex.256mb", "scaling_type": "fixed", "min_replicas": 1, "visibility_timeout": 60, "shutdown_timeout": 10}',
    }),
  });
  await withMockedFetch(
    [{ status: 201, body: { data: rawInstance("i-9") } }],
    async (calls) => {
      await model.methods.create_instance.execute({}, context);
      assertEquals(calls[0].method, "POST");
      assertEquals(calls[0].body.type, "managed_queue");
      assertEquals(calls[0].body.min_replicas, 1);
    },
  );
  assertEquals(getWrittenResources()[0].specName, "instance");
});

Deno.test("delete_instance refuses mismatch and unknown instances", async () => {
  const mismatch = createModelTestContext({
    globalArgs: args({ instanceId: "i-1", confirmInstanceId: "i-2" }),
    storedResources: { instances: storedInstances(["i-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_instance.execute({}, mismatch.context),
      Error,
      "confirmInstanceId does not match",
    );
    assertEquals(calls.length, 0);
  });

  const unknown = createModelTestContext({
    globalArgs: args({ instanceId: "ghost", confirmInstanceId: "ghost" }),
    storedResources: { instances: storedInstances(["i-1"]) },
  });
  await assertRejects(
    () => model.methods.delete_instance.execute({}, unknown.context),
    Error,
    "not in the stored list",
  );
});

// --- queue operations ---

Deno.test("pause and resume are ungated and refresh the instance", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ instanceId: "i-1" }),
  });
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: { data: rawInstance("i-1", { paused: true }) } },
    ],
    async (calls) => {
      await model.methods.pause_queue.execute({}, context);
      assert(calls[0].url.endsWith("/instances/i-1/pause"));
      assertEquals(calls[1].method, "GET");
    },
  );
});

Deno.test("purge_queue is gated like a delete", async () => {
  const noConfirm = createModelTestContext({
    globalArgs: args({ instanceId: "i-1" }),
    storedResources: { instances: storedInstances(["i-1"]) },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.purge_queue.execute({}, noConfirm.context),
      Error,
      "confirmInstanceId does not match",
    );
    assertEquals(calls.length, 0);
  });

  const confirmed = createModelTestContext({
    globalArgs: args({ instanceId: "i-1", confirmInstanceId: "i-1" }),
    storedResources: { instances: storedInstances(["i-1"]) },
  });
  await withMockedFetch(
    [
      { status: 200, body: {} },
      { status: 200, body: { data: rawInstance("i-1") } },
    ],
    async (calls) => {
      await model.methods.purge_queue.execute({}, confirmed.context);
      assert(calls[0].url.endsWith("/instances/i-1/purge"));
    },
  );
});

// --- failed jobs ---

Deno.test("list_failed_jobs truncates exceptions", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: args({ instanceId: "i-1" }),
  });
  await withMockedFetch(
    [{
      status: 200,
      body: {
        data: [{
          id: "job-1",
          type: "managedQueueFailedJobs",
          attributes: {
            name: "App\\Jobs\\SendEmail",
            queue: "default",
            failed_at: "2026-08-10T00:00:00Z",
            attempts: 3,
            exception: "e".repeat(5000),
          },
        }],
        links: {},
      },
    }],
    async () => {
      await model.methods.list_failed_jobs.execute({}, context);
    },
  );
  // deno-lint-ignore no-explicit-any
  const jobs = getWrittenResources()[0].data.jobs as any;
  assertEquals(jobs[0].exception.length, 1000);
});

Deno.test("delete_failed_job requires confirmation and a stored entry", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({
      instanceId: "i-1",
      jobId: "job-1",
      confirmJobId: "nope",
    }),
    storedResources: {
      failedJobs: {
        instanceId: "i-1",
        jobs: [{ id: "job-1" }],
        jobCount: 1,
        syncedAt: "2026-08-10T00:00:00Z",
      },
    },
  });
  await withMockedFetch([], async (calls) => {
    await assertRejects(
      () => model.methods.delete_failed_job.execute({}, context),
      Error,
      "confirmJobId does not match",
    );
    assertEquals(calls.length, 0);
  });
});

Deno.test("retry_failed_job posts to the retry endpoint", async () => {
  const { context } = createModelTestContext({
    globalArgs: args({ instanceId: "i-1", jobId: "job-1" }),
  });
  await withMockedFetch([{ status: 202, body: {} }], async (calls) => {
    await model.methods.retry_failed_job.execute({}, context);
    assert(calls[0].url.endsWith("/instances/i-1/failed-jobs/job-1/retry"));
  });
});

// --- background processes ---

Deno.test("background process lifecycle: create, list, gated delete", async () => {
  const created = createModelTestContext({
    globalArgs: args({
      instanceId: "i-1",
      createPayload: '{"type": "horizon", "processes": 1}',
    }),
  });
  await withMockedFetch(
    [{
      status: 201,
      body: {
        data: {
          id: "bp-1",
          type: "backgroundProcesses",
          attributes: { type: "horizon", processes: 1, command: null },
        },
      },
    }],
    async (calls) => {
      await model.methods.create_background_process.execute(
        {},
        created.context,
      );
      assertEquals(calls[0].body.type, "horizon");
    },
  );

  const gate = createModelTestContext({
    globalArgs: args({ processId: "bp-1", confirmProcessId: "wrong" }),
    storedResources: {
      processes: {
        instanceId: "i-1",
        processes: [{ id: "bp-1", processType: "horizon" }],
        processCount: 1,
        syncedAt: "2026-08-10T00:00:00Z",
      },
    },
  });
  await assertRejects(
    () => model.methods.delete_background_process.execute({}, gate.context),
    Error,
    "confirmProcessId does not match",
  );
});
