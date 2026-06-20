"use client";

import { Fragment, useState } from "react";
import type { Idea } from "@/lib/api";
import { OriginTag } from "./OriginTag";
import { StatusDot } from "@/components/ui/StatusDot";
import { elapsedClock, formatMetric, hypothesisOf } from "@/lib/format";

function timeCell(idea: Idea, now: number): string {
  if (idea.status === "running") return elapsedClock(idea.claimed_at, now);
  if (idea.status === "done" && idea.finished_at && idea.claimed_at)
    return `${(idea.finished_at - idea.claimed_at).toFixed(1)}s`;
  return "—";
}

function Detail({ idea }: { idea: Idea }) {
  return (
    <div className="space-y-sm bg-surface-soft px-lg py-md text-body-sm">
      <p className="text-charcoal">
        <span className="text-mute">hypothesis: </span>
        {hypothesisOf(idea.config)}
      </p>
      {idea.method_diff && (
        <p className="text-charcoal">
          <span className="text-mute">what it built: </span>
          {idea.method_diff}
        </p>
      )}
      {idea.rationale && (
        <p className="text-body">
          <span className="text-mute">why: </span>
          {idea.rationale}
        </p>
      )}
      {idea.followup && (
        <p className="text-body">
          <span className="text-mute">follow-up: </span>
          {idea.followup}
        </p>
      )}
      {idea.status === "failed" && idea.error && (
        <p className="text-body">
          <span className="text-mute">failed: </span>
          {idea.error}
        </p>
      )}
      {idea.baseline != null && (
        <p className="font-mono text-caption-sm text-mute">
          baseline {formatMetric(idea.baseline)}
        </p>
      )}
    </div>
  );
}

export function RankedTable({ ideas, now }: { ideas: Idea[]; now: number }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-hairline text-body-sm-strong text-charcoal">
            <th className="py-md pr-lg font-medium">Rank</th>
            <th className="py-md pr-lg font-medium">Metric</th>
            <th className="py-md pr-lg font-medium">Hypothesis</th>
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
            const isOpen = open.has(idea.id);
            return (
              <Fragment key={idea.id}>
                <tr
                  onClick={() => toggle(idea.id)}
                  className={`cursor-pointer border-b border-hairline hover:bg-surface-soft ${
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
                  <td className="max-w-[34ch] py-md pr-lg text-body-sm text-charcoal">
                    <span className="flex items-start gap-sm">
                      <span className="mt-[2px] text-mute">{isOpen ? "▾" : "▸"}</span>
                      <span className={isOpen ? "" : "line-clamp-1"}>
                        {hypothesisOf(idea.config)}
                      </span>
                    </span>
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
                {isOpen && (
                  <tr className="border-b border-hairline">
                    <td />
                    <td colSpan={6} className="pb-md pr-lg">
                      <Detail idea={idea} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
