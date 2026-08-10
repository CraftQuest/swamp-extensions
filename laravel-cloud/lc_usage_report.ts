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

/** Format cents as dollars. */
function usd(cents: number | undefined | null): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

/**
 * Spend/usage digest for @craftquest/laravel-cloud. Method-scoped:
 * summarizes the `usage` resource a get_usage execution produced —
 * headline spend, credits and alert headroom, per-application costs, and
 * resource/addon breakdowns. Runs quietly (one line) after executions
 * that produced no usage data.
 */
export const report = {
  name: "@craftquest/laravel-cloud-usage",
  description: "Spend and usage digest for Laravel Cloud organizations",
  scope: "method",
  labels: ["cost", "finops", "laravel-cloud"],
  execute: async (context: ReportContext) => {
    const usage = await readProduced(context, "usage");
    if (!usage) {
      return {
        markdown:
          "# Laravel Cloud spend\n\nThis execution produced no usage data.\n",
        json: { hasData: false },
      };
    }

    const lines: string[] = ["# Laravel Cloud spend"];
    lines.push(
      `\n**Current spend: ${usd(usage.currentSpendCents)}**` +
        (usage.period ? ` (period: ${usage.period})` : ""),
    );
    if (usage.credits) {
      lines.push(
        `- Credits: ${usd(usage.credits.usedCents)} used of ${
          usd(usage.credits.totalCents)
        }`,
      );
    }
    if (usage.alert) {
      lines.push(
        `- Spend alert at ${
          usd(usage.alert.thresholdCents)
        } — ${usage.alert.remainingPercentage}% headroom remaining`,
      );
    }
    if (usage.bandwidth) {
      lines.push(
        `- Bandwidth: ${
          usd(usage.bandwidth.costCents)
        } (${usage.bandwidth.usagePercentage}% of allowance)`,
      );
    }

    if ((usage.applications ?? []).length) {
      lines.push(
        `\n## Applications (${
          usage.applicationCount ?? usage.applications.length
        }, ${usd(usage.applicationTotalCents)} total)\n`,
        "| Application | Cost |",
        "| ----------- | ---- |",
      );
      const sorted = [...usage.applications].sort(
        (a: Json, b: Json) => b.totalCents - a.totalCents,
      );
      for (const a of sorted.slice(0, 15)) {
        lines.push(`| ${a.name} | ${usd(a.totalCents)} |`);
      }
    }

    if ((usage.resourceLines ?? []).length) {
      lines.push(
        `\n## Resources (${usd(usage.resourceTotalCents)} total)\n`,
        "| Kind | Name | Cost |",
        "| ---- | ---- | ---- |",
      );
      for (const r of usage.resourceLines.slice(0, 20)) {
        lines.push(
          `| ${r.kind} | ${r.name ?? ""} | ${
            r.totalCents !== undefined ? usd(r.totalCents) : ""
          } |`,
        );
      }
    }

    if ((usage.addons ?? []).length) {
      lines.push(
        `\n## Add-ons (${usd(usage.addonTotalCents)} total)\n`,
        "| Add-on | Cost |",
        "| ------ | ---- |",
      );
      for (const a of usage.addons) {
        lines.push(`| ${a.name} | ${usd(a.totalCents)} |`);
      }
    }

    return {
      markdown: lines.join("\n") + "\n",
      json: {
        hasData: true,
        currentSpendCents: usage.currentSpendCents,
        credits: usage.credits,
        alert: usage.alert,
        applicationTotalCents: usage.applicationTotalCents,
        resourceTotalCents: usage.resourceTotalCents,
        addonTotalCents: usage.addonTotalCents,
        applicationCount: usage.applicationCount,
      },
    };
  },
};
