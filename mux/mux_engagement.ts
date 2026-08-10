/**
 * Engagement summary for @craftquest/mux analytics pulls.
 *
 * Runs after mux model methods and summarizes whatever Mux Data output the
 * execution produced — views, metrics, playback errors — into a readable
 * digest. Executions that produce no analytics data get a short note
 * instead of noise.
 */

// deno-lint-ignore no-explicit-any
type ReportContext = any;
// deno-lint-ignore no-explicit-any
type Json = any;

/** Read and parse a produced resource by spec name, or null. */
async function readProduced(
  context: ReportContext,
  specName: string,
): Promise<Json | null> {
  const handle = context.dataHandles?.find(
    (h: Json) => h.specName === specName,
  );
  if (!handle) return null;
  const raw = await context.dataRepository.getContent(
    context.modelType,
    context.modelId,
    handle.name,
    handle.version,
  );
  if (!raw) return null;
  return JSON.parse(new TextDecoder().decode(raw));
}

/** Format milliseconds of watch time as a human duration. */
function formatWatchTime(ms: number | undefined): string {
  if (!ms || ms <= 0) return "0m";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Views, engagement, and playback-error digest for @craftquest/mux
 * analytics pulls. Method-scoped: summarizes the views, metrics, and
 * playbackErrors resources the execution produced into markdown + JSON;
 * runs quietly (one line) when an execution produced no analytics.
 */
export const report = {
  name: "@craftquest/mux-engagement",
  description:
    "Views, engagement, and playback-error digest for Mux Data pulls",
  scope: "method",
  labels: ["analytics", "mux"],
  execute: async (context: ReportContext) => {
    const views = await readProduced(context, "views");
    const metrics = await readProduced(context, "metrics");
    const errors = await readProduced(context, "playbackErrors");

    if (!views && !metrics && !errors) {
      return {
        markdown:
          "# Mux engagement\n\nThis execution produced no Mux Data analytics output.\n",
        json: { hasData: false },
      };
    }

    const lines: string[] = ["# Mux engagement"];
    const json: Json = { hasData: true };

    if (views) {
      const failures = (views.views ?? []).filter(
        (v: Json) => v.playbackFailure,
      ).length;
      const totalWatch = (views.views ?? []).reduce(
        (sum: number, v: Json) => sum + (v.watchTime ?? 0),
        0,
      );
      lines.push(
        `\n## Views (last ${views.timeframe})\n`,
        `- **${views.totalRowCount}** views total` +
          (views.views.length < views.totalRowCount
            ? ` (${views.views.length} shown)`
            : ""),
        `- **${formatWatchTime(totalWatch)}** watch time across shown views`,
        `- **${failures}** playback failures among shown views`,
      );
      const titles = new Map<string, number>();
      for (const v of views.views ?? []) {
        if (v.videoTitle) {
          titles.set(v.videoTitle, (titles.get(v.videoTitle) ?? 0) + 1);
        }
      }
      const top = [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (top.length) {
        lines.push(`\n### Most-watched titles\n`);
        lines.push("| Title | Views |", "| ----- | ----- |");
        for (const [title, count] of top) {
          lines.push(`| ${title} | ${count} |`);
        }
      }
      json.views = {
        total: views.totalRowCount,
        shown: views.views.length,
        failures,
        watchTimeMs: totalWatch,
        topTitles: top,
      };
    }

    if (metrics) {
      lines.push(
        `\n## Metric: ${metrics.metricId} (last ${metrics.timeframe})\n`,
        `- Overall value: **${metrics.overall?.value ?? "n/a"}**`,
        `- Total views: **${metrics.overall?.totalViews ?? 0}**`,
      );
      if (metrics.groupBy && (metrics.breakdown ?? []).length) {
        lines.push(
          `\n### By ${metrics.groupBy}\n`,
          `| ${metrics.groupBy} | Value | Views |`,
          "| --- | ----- | ----- |",
        );
        for (const b of metrics.breakdown.slice(0, 10)) {
          lines.push(
            `| ${b.field ?? "(none)"} | ${b.value ?? "n/a"} | ${
              b.views ?? ""
            } |`,
          );
        }
      }
      json.metric = {
        id: metrics.metricId,
        overall: metrics.overall,
        groupBy: metrics.groupBy,
        breakdownRows: (metrics.breakdown ?? []).length,
      };
    }

    if (errors) {
      lines.push(`\n## Playback errors (last ${errors.timeframe})\n`);
      if (!errors.errorCount) {
        lines.push("- No playback errors in this window.");
      } else {
        lines.push(
          "| Message | Count | % of views |",
          "| ------- | ----- | ---------- |",
        );
        for (const e of (errors.errors ?? []).slice(0, 10)) {
          lines.push(
            `| ${e.message ?? e.description ?? "unknown"} | ${
              e.count ?? ""
            } | ${e.percentage ?? ""} |`,
          );
        }
      }
      json.errors = { count: errors.errorCount };
    }

    return { markdown: lines.join("\n") + "\n", json };
  },
};
