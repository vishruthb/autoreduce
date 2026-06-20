"use client";

import type { Experiment, Idea } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { elapsedClock, formatMetric, hypothesisOf } from "@/lib/format";

export function BenchmarkQueue({
  experiments,
  ideasById,
  now,
}: {
  experiments: Experiment[];
  ideasById: Map<number, Idea>;
  now: number;
}) {
  const active = experiments
    .filter((exp) => exp.status === "queued" || exp.status === "running")
    .slice(0, 8);
  const recent = experiments
    .filter((exp) => exp.status === "done" || exp.status === "failed")
    .slice(-6)
    .reverse();

  if (active.length === 0 && recent.length === 0) return null;

  return (
    <section>
      <div className="mb-md flex items-baseline justify-between">
        <h2 className="text-heading-sm text-ink">Benchmark queue</h2>
        <span className="text-caption-sm text-mute">
          {active.length} active · {recent.length} recent
        </span>
      </div>
      <div className={`grid gap-md ${active.length > 0 ? "lg:grid-cols-2" : ""}`}>
        {active.length > 0 && (
          <QueueList title="Active" rows={active} ideasById={ideasById} now={now} />
        )}
        <QueueList title="Recent" rows={recent} ideasById={ideasById} now={now} />
      </div>
    </section>
  );
}

function QueueList({
  title,
  rows,
  ideasById,
  now,
}: {
  title: string;
  rows: Experiment[];
  ideasById: Map<number, Idea>;
  now: number;
}) {
  return (
    <Card className="p-lg">
      <div className="mb-md text-body-sm-strong text-charcoal">{title}</div>
      <div className={rows.length > 3 ? "grid gap-sm lg:grid-cols-2" : "space-y-sm"}>
        {rows.length === 0 ? (
          <div className="text-body-sm text-mute">empty</div>
        ) : (
          rows.map((exp) => (
            <QueueRow key={exp.id} exp={exp} idea={ideasById.get(exp.idea_id)} now={now} />
          ))
        )}
      </div>
    </Card>
  );
}

function QueueRow({
  exp,
  idea,
  now,
}: {
  exp: Experiment;
  idea: Idea | undefined;
  now: number;
}) {
  const gpuCount = exp.resource_shape.gpu_count ?? 1;
  const running = exp.status === "running";
  const time =
    running ? elapsedClock(exp.claimed_at, now) :
    exp.finished_at && exp.claimed_at ? `${(exp.finished_at - exp.claimed_at).toFixed(1)}s` :
    "";

  return (
    <div className="rounded-md border border-hairline bg-surface-soft px-md py-sm">
      <div className="flex items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          {running && <StatusDot kind="running" />}
          <span className="font-mono text-code-sm text-ink">exp {exp.id}</span>
          <span className="text-caption-sm text-mute">{exp.phase}</span>
        </div>
        <div className="font-mono text-code-sm text-charcoal">
          {gpuCount} GPU · {formatMetric(exp.metric_value)}
        </div>
      </div>
      <div className="mt-xs line-clamp-1 text-caption-sm text-mute">
        {idea ? hypothesisOf(idea.config) : `idea ${exp.idea_id}`}
      </div>
      <div className="mt-xs flex items-center justify-between text-caption-sm text-mute">
        <span>{exp.status}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}
