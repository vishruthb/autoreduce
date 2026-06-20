"use client";

import type { ResourceState, Run } from "@/lib/api";
import { Card } from "@/components/ui/Card";

export function TopologyPanel({
  run,
  resources,
}: {
  run: Run;
  resources?: ResourceState;
}) {
  if (!resources) return null;

  const agents = resources.agent_stats;
  const gpu = resources.gpu_stats;
  const mode = gpu.total_gpus === 0 ? "waiting" : "decoupled";
  const complete = run.state === "done";

  return (
    <Card className="p-lg">
      <div className="mb-md flex items-baseline justify-between">
        <h2 className="text-heading-sm text-ink">Execution topology</h2>
        <span className="font-mono text-code-sm text-mute">{mode}</span>
      </div>

      <div className="grid gap-md md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
        <Stage
          title="Agent layer"
          value={
            complete
              ? `${agents.active_agents} active`
              : `${agents.active_agents} / ${agents.target_agents ?? "-"} active`
          }
          detail={complete ? "budget complete" : "thinking + writing"}
        />
        <Arrow />
        <Stage
          title="Benchmark queue"
          value={`${gpu.queued_jobs} queued`}
          detail={complete ? "no active jobs" : `${gpu.running_jobs} running jobs`}
        />
        <Arrow />
        <Stage
          title="GPU execution"
          value={`${gpu.busy_gpus} / ${gpu.total_gpus} busy`}
          detail={`${gpu.free_gpus} free slots`}
        />
      </div>

      <div className="mt-md text-caption-sm text-mute">
        budget {run.budget_spent} / {run.budget_total}
      </div>
    </Card>
  );
}

function Stage({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-soft p-md">
      <div className="text-caption-sm text-mute">{title}</div>
      <div className="mt-xs font-mono text-code-md text-ink">{value}</div>
      <div className="mt-xs text-caption-sm text-charcoal">{detail}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden text-center font-mono text-code-sm text-mute md:block">
      -&gt;
    </div>
  );
}
