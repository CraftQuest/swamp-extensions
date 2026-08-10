import { assert, assertEquals } from "jsr:@std/assert@1";
import { report } from "./lc_usage_report.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

/** Build a minimal report context with produced resources by spec name. */
function reportContext(produced: Record<string, Json>) {
  const encoder = new TextEncoder();
  const handles = Object.keys(produced).map((specName, i) => ({
    specName,
    name: specName,
    version: 1,
    dataId: `d-${i}`,
    kind: "resource",
  }));
  return {
    modelType: "@craftquest/laravel-cloud/apps",
    modelId: "test-model",
    methodName: "get_usage",
    executionStatus: "succeeded",
    dataHandles: handles,
    dataRepository: {
      getContent: (_t: string, _i: string, dataName: string, _v?: number) => {
        const data = produced[dataName];
        return Promise.resolve(
          data === undefined ? null : encoder.encode(JSON.stringify(data)),
        );
      },
    },
  };
}

Deno.test("usage report is quiet with no data", async () => {
  const result = await report.execute(reportContext({}));
  assertEquals(result.json.hasData, false);
});

Deno.test("usage report renders spend, credits, and tables", async () => {
  const result = await report.execute(
    reportContext({
      usage: {
        currentSpendCents: 1234,
        period: "current",
        credits: { usedCents: 500, totalCents: 2000 },
        alert: { thresholdCents: 5000, remainingPercentage: 75 },
        bandwidth: { costCents: 0, usagePercentage: 3 },
        resourceTotalCents: 400,
        addonTotalCents: 100,
        applicationTotalCents: 734,
        applicationCount: 2,
        applications: [
          { name: "sandbox", totalCents: 34 },
          { name: "craftquest", totalCents: 700 },
        ],
        addons: [{ name: "Extra seats", totalCents: 100 }],
        resourceLines: [{
          kind: "databases",
          name: "main-db",
          totalCents: 400,
        }],
        syncedAt: "2026-08-10T00:00:00Z",
      },
    }),
  );
  assert(result.markdown.includes("**Current spend: $12.34**"));
  assert(result.markdown.includes("$5.00 used of $20.00"));
  assert(result.markdown.includes("75% headroom"));
  // sorted by cost descending
  assert(
    result.markdown.indexOf("| craftquest |") <
      result.markdown.indexOf("| sandbox |"),
  );
  assert(result.markdown.includes("| databases | main-db | $4.00 |"));
  assertEquals(result.json.currentSpendCents, 1234);
});
