"use client";

import type { ResourceState } from "@/lib/api";
import { Card } from "@/components/ui/Card";

export function ResourcePanel({ resources }: { resources?: ResourceState }) {
  if (!resources) return null;

  const gpu = resources.gpu_stats;
  const agents = resources.agent_stats;
  const pct = Math.round(gpu.utilization * 100);

  return (
    <Card className="p-lg">
      <div className="mb-md flex items-baseline justify-between">
        <h2 className="text-heading-sm text-ink">Resource allocation</h2>
        <span className="font-mono text-code-sm text-mute">{pct}% GPU util</span>
      </div>

      <div className="grid gap-md sm:grid-cols-4">
        <Stat
          label="agents active / target"
          value={`${agents.active_agents} / ${agents.target_agents ?? "-"}`}
        />
        <Stat label="running jobs" value={gpu.running_jobs} />
        <Stat label="queued jobs" value={gpu.queued_jobs} />
        <Stat label="free GPUs" value={`${gpu.free_gpus} / ${gpu.total_gpus}`} />
      </div>

      <div className="mt-md flex flex-wrap gap-md text-caption-sm text-mute">
        <span>think avg {formatSeconds(agents.avg_think_s)}</span>
        <span>GPU avg {formatSeconds(agents.avg_gpu_s)}</span>
      </div>

      <div className="mt-md h-[6px] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {gpu.bundles.length > 0 && (
        <div className="mt-md grid gap-sm sm:grid-cols-2">
          {gpu.bundles.map((bundle) => (
            <div
              key={bundle.lease_id}
              className="rounded-md border border-hairline bg-surface-soft px-md py-sm"
            >
              <div className="flex items-center justify-between gap-md">
                <span className="font-mono text-code-sm text-ink">
                  exp {bundle.experiment_id}
                </span>
                <span className="text-caption-sm text-mute">
                  {bundle.gpu_count} GPU{bundle.gpu_count === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-xs font-mono text-code-sm text-charcoal">
                [{bundle.gpu_ids.join(", ")}]
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="font-mono text-code-sm text-ink">{value}</div>
      <div className="mt-xs text-caption-sm text-mute">{label}</div>
    </div>
  );
}

function formatSeconds(value: number | null) {
  if (value == null) return "-";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.round(value / 60)}m`;
}
