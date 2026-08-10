import { assert, assertEquals } from "jsr:@std/assert@1";
import { report } from "./mux_engagement.ts";

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
    modelType: "@craftquest/mux",
    modelId: "test-model",
    methodName: "get_video_views",
    executionStatus: "succeeded",
    dataHandles: handles,
    dataRepository: {
      getContent: (
        _type: string,
        _id: string,
        dataName: string,
        _version?: number,
      ) => {
        const data = produced[dataName];
        return Promise.resolve(
          data === undefined ? null : encoder.encode(JSON.stringify(data)),
        );
      },
    },
  };
}

Deno.test("mux-engagement reports no-data executions quietly", async () => {
  const result = await report.execute(reportContext({}));
  assertEquals(result.json.hasData, false);
  assert(result.markdown.includes("no Mux Data analytics"));
});

Deno.test("mux-engagement summarizes views with top titles", async () => {
  const result = await report.execute(
    reportContext({
      views: {
        views: [
          { id: "v1", videoTitle: "Intro to Craft", watchTime: 120000 },
          { id: "v2", videoTitle: "Intro to Craft", watchTime: 60000 },
          {
            id: "v3",
            videoTitle: "Twig Basics",
            watchTime: 30000,
            playbackFailure: true,
          },
        ],
        totalRowCount: 3,
        timeframe: "7:days",
        syncedAt: "2026-08-09T00:00:00Z",
      },
    }),
  );
  assertEquals(result.json.hasData, true);
  assertEquals(result.json.views.total, 3);
  assertEquals(result.json.views.failures, 1);
  assertEquals(result.json.views.topTitles[0], ["Intro to Craft", 2]);
  assert(result.markdown.includes("**3** views total"));
  assert(result.markdown.includes("| Intro to Craft | 2 |"));
  assert(result.markdown.includes("**4m** watch time")); // 210000ms → 3.5min → rounds to 4
});

Deno.test("mux-engagement renders metric breakdowns and errors", async () => {
  const result = await report.execute(
    reportContext({
      metrics: {
        metricId: "watch_time",
        timeframe: "7:days",
        groupBy: "country",
        overall: { value: 90000, totalViews: 10 },
        breakdown: [{ field: "US", value: 60000, views: 7 }],
        syncedAt: "2026-08-09T00:00:00Z",
      },
      playbackErrors: {
        errors: [{ message: "MEDIA_ERR_NETWORK", count: 2, percentage: 0.5 }],
        errorCount: 1,
        timeframe: "7:days",
        syncedAt: "2026-08-09T00:00:00Z",
      },
    }),
  );
  assert(result.markdown.includes("Metric: watch_time"));
  assert(result.markdown.includes("| US | 60000 | 7 |"));
  assert(result.markdown.includes("MEDIA_ERR_NETWORK"));
  assertEquals(result.json.metric.breakdownRows, 1);
  assertEquals(result.json.errors.count, 1);
});
