"use client";

import { useEffect, useState } from "react";
import {
  getReport,
  reportMarkdownUrl,
  type Report,
  type Run,
} from "@/lib/api";
import { OriginTag } from "./OriginTag";
import { formatMetric } from "@/lib/format";

async function download(runId: number) {
  try {
    const r = await fetch(reportMarkdownUrl(runId), { cache: "no-store" });
    const text = await r.text();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autoreduce-run-${runId}-report.md`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(reportMarkdownUrl(runId), "_blank");
  }
}

/** End-of-run findings: the deliverable. Fetches the structured report and
 *  offers the full markdown for download. `refreshKey` re-fetches as more
 *  ideas complete (e.g. while draining). */
export function ReportPanel({ run, refreshKey }: { run: Run; refreshKey: number }) {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let alive = true;
    getReport(run.id)
      .then((r) => alive && setReport(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [run.id, refreshKey]);

  const s = report?.summary;
  const obj = report?.run.objective_name ?? run.objective_name ?? "objective";
  const wins = (report?.findings ?? []).filter((f) => f.status === "done");

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-xl">
      <div className="flex items-center justify-between gap-lg">
        <div>
          <h2 className="text-heading-sm text-ink">Report</h2>
          <p className="mt-xs text-body-sm text-body">
            {run.state === "done"
              ? "Run complete — here's what the workers found."
              : "Wrapping up — findings so far."}
          </p>
        </div>
        <button
          onClick={() => download(run.id)}
          className="rounded-full border border-hairline px-lg py-sm text-button-md text-ink hover:border-ink"
        >
          ↓ Download .md
        </button>
      </div>

      {s && (
        <div className="mt-lg flex flex-wrap gap-x-xl gap-y-sm text-body-sm">
          <span>
            <span className="text-mute">best {obj}: </span>
            <span className="font-mono text-ink">{formatMetric(s.best_metric)}</span>
            {s.baseline != null && (
              <span className="text-mute">
                {" "}
                vs baseline {formatMetric(s.baseline)}
              </span>
            )}
          </span>
          <span className="text-mute">
            {s.done} verified · {s.failed} failed · {s.total} tried
          </span>
        </div>
      )}

      {wins.length > 0 && (
        <ol className="mt-lg space-y-md">
          {wins.slice(0, 5).map((f) => (
            <li key={f.id} className="border-l-2 border-hairline-strong pl-lg">
              <div className="flex items-center gap-sm">
                <span className="font-mono text-code-md text-ink">
                  {formatMetric(f.metric)}
                </span>
                <OriginTag origin={f.origin} />
                <span className="text-caption-sm text-mute">#{f.rank}</span>
              </div>
              <p className="mt-xs text-body-sm text-charcoal">
                {f.method_diff || f.hypothesis}
              </p>
            </li>
          ))}
        </ol>
      )}

      {report?.followups && report.followups.length > 0 && (
        <div className="mt-lg">
          <p className="text-body-sm-strong text-charcoal">Open follow-up ideas</p>
          <ul className="mt-xs list-disc space-y-xxs pl-lg text-body-sm text-body">
            {report.followups.slice(0, 6).map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
