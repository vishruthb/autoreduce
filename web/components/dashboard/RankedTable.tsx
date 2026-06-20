import type { Idea } from "@/lib/api";
import { OriginTag } from "./OriginTag";
import { StatusDot } from "@/components/ui/StatusDot";
import { elapsedClock, formatMetric, summarizeConfig } from "@/lib/format";

function timeCell(idea: Idea, now: number): string {
  if (idea.status === "running") return elapsedClock(idea.claimed_at, now);
  if (idea.status === "done" && idea.finished_at && idea.claimed_at)
    return `${(idea.finished_at - idea.claimed_at).toFixed(1)}s`;
  return "—";
}

export function RankedTable({ ideas, now }: { ideas: Idea[]; now: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline text-body-sm-strong text-charcoal">
            <th className="py-md pr-lg font-medium">Rank</th>
            <th className="py-md pr-lg font-medium">Metric</th>
            <th className="py-md pr-lg font-medium">Config</th>
            <th className="py-md pr-lg font-medium">Origin</th>
            <th className="py-md pr-lg font-medium">Status</th>
            <th className="py-md pr-lg font-medium">Worker</th>
            <th className="py-md font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {ideas.length === 0 && (
            <tr>
              <td colSpan={7} className="py-xl text-center text-body-sm text-mute">
                no ideas yet
              </td>
            </tr>
          )}
          {ideas.map((idea) => {
            const best = idea.rank === 1;
            return (
              <tr
                key={idea.id}
                className={`border-b border-hairline ${
                  best ? "border-t-2 border-t-hairline-strong" : ""
                }`}
              >
                <td className={`py-md pr-lg font-mono text-code-sm ${best ? "text-ink" : "text-charcoal"}`}>
                  {idea.rank ?? "—"}
                </td>
                <td className={`py-md pr-lg font-mono text-code-md ${best ? "font-medium text-ink" : "text-ink"}`}>
                  {formatMetric(idea.metric_value)}
                  {best && (
                    <span className="ml-sm font-mono text-caption-sm text-ink">★ best</span>
                  )}
                </td>
                <td className="max-w-[28ch] truncate py-md pr-lg font-mono text-code-sm text-charcoal">
                  {summarizeConfig(idea.config)}
                </td>
                <td className="py-md pr-lg">
                  <OriginTag origin={idea.origin} />
                </td>
                <td className="py-md pr-lg text-body-sm text-charcoal">
                  <span className="inline-flex items-center gap-sm">
                    {idea.status === "running" && <StatusDot kind="running" />}
                    {idea.status}
                    {idea.status === "running" && idea.gpu_id != null && (
                      <span className="font-mono text-mute">gpu{idea.gpu_id}</span>
                    )}
                  </span>
                </td>
                <td className="py-md pr-lg font-mono text-code-sm text-mute">
                  {idea.agent ?? "—"}
                </td>
                <td className="py-md font-mono text-code-sm text-mute">
                  {timeCell(idea, now)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
