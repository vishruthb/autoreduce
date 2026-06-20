"use client";

import { useEffect, useMemo, useState } from "react";
import { TrafficLights } from "@/components/ui/TrafficLights";

const STEPS = [
  {
    label: "baseline",
    title: "vLLM baseline",
    status: "normalized to 1.00x for this workload",
    progress: 18,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "-", p95: "-", targetCalls: "-", accepted: "-" },
    patch: ["continuous batching", "PagedAttention KV cache", "normalized reference = 1.00x"],
    log: "[baseline] vLLM continuous batching normalized to 1.00x, p95 218ms",
  },
  {
    label: "agent",
    title: "Agent writes method",
    status: "searches adaptive speculative batching",
    progress: 34,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "drafting", p95: "-", targetCalls: "-", accepted: "-" },
    patch: ["bucket by acceptance estimate", "choose draft length 2/4/8", "batch compatible verification calls"],
    log: "[agent-08] proposed adaptive speculative batching on vLLM",
  },
  {
    label: "1 gpu",
    title: "One-GPU probe",
    status: "first sealed measurement",
    progress: 52,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "1.21x", p95: "224 ms", targetCalls: "423", accepted: "2.3" },
    patch: ["2.3 accepted tokens/call", "17% fewer target-model calls", "p95 still inside guardrail"],
    log: "[bench] 1 GPU: 1.21x, p95 224ms",
  },
  {
    label: "4 gpu",
    title: "Scale probe",
    status: "running 4 of 8 GPUs",
    progress: 74,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "1.31x", p95: "245 ms", targetCalls: "391", accepted: "2.8" },
    patch: ["split draft groups across GPUs", "merge compatible verification batches", "p95 under 250ms"],
    log: "[bench] 4 GPU: 1.31x, p95 245ms",
  },
  {
    label: "8 gpu",
    title: "Eight-GPU check",
    status: "latency starts to miss",
    progress: 88,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "1.30x", p95: "269 ms", targetCalls: "394", accepted: "2.8" },
    patch: ["more GPUs did not improve acceptance", "larger batches increased tail latency", "marginal gain went negative"],
    log: "[bench] 8 GPU: 1.30x, p95 269ms",
  },
  {
    label: "decision",
    title: "Planner decision",
    status: "choose 4 of 8, keep searching",
    progress: 100,
    baseline: { throughput: "1.00x", p95: "218 ms", targetCalls: "512", accepted: "1.0" },
    autoreduce: { throughput: "1.31x", p95: "245 ms", targetCalls: "391", accepted: "2.8" },
    patch: ["use 4-GPU policy for this workload", "leave 4 H100s for broad search", "keep vLLM baseline as fallback"],
    log: "[planner] choose 4 of 8 GPUs; return the rest to search",
  },
];

function MetricRows({
  rows,
}: {
  rows: Record<"throughput" | "p95" | "targetCalls" | "accepted", string>;
}) {
  return (
    <div className="mt-lg space-y-sm">
      <Metric label="throughput" value={rows.throughput} />
      <Metric label="p95 latency" value={rows.p95} />
      <Metric label="target calls" value={rows.targetCalls} />
      <Metric label="accepted / call" value={rows.accepted} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-md border-b border-hairline pb-sm last:border-b-0 last:pb-0">
      <span className="text-body-sm text-body">{label}</span>
      <span className="font-mono text-code-sm text-ink">{value}</span>
    </div>
  );
}

export function SpeculativeServingReplay() {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const logs = useMemo(() => STEPS.slice(0, index + 1).map((item) => item.log), [index]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STEPS.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-md lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-md md:grid-cols-2">
        <article className="rounded-lg border border-hairline bg-canvas p-lg">
          <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
            vLLM baseline
          </p>
          <h3 className="mt-sm text-heading-md text-ink">Continuous batching</h3>
          <MetricRows rows={step.baseline} />
          <div className="mt-lg h-[8px] overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full rounded-full bg-hairline-strong" style={{ width: `${Math.min(step.progress, 92)}%` }} />
          </div>
        </article>

        <article className="rounded-lg border border-hairline bg-canvas p-lg">
          <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
            adaptive speculative batching
          </p>
          <h3 className="mt-sm text-heading-md text-ink">Hybrid batching</h3>
          <MetricRows rows={step.autoreduce} />
          <div className="mt-lg h-[8px] overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${step.progress}%` }} />
          </div>
        </article>
      </div>

      <div className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex items-start justify-between gap-md">
          <TrafficLights />
          <span className="rounded-full border border-hairline-strong px-md py-xs font-mono text-code-sm text-charcoal">
            {step.label}
          </span>
        </div>
        <div className="mt-md">
          <h3 className="text-heading-sm text-ink">{step.title}</h3>
          <p className="mt-xs text-body-sm text-body">{step.status}</p>
        </div>
        <div className="mt-md rounded-md border border-hairline bg-surface-soft p-md">
          <div className="text-caption-sm text-mute">what changed</div>
          <ul className="mt-sm space-y-xs text-caption-sm text-charcoal">
            {step.patch.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
        <pre className="mt-md min-h-[160px] overflow-x-auto whitespace-pre-wrap font-mono text-code-sm leading-relaxed text-body">
          {["[demo] replaying 512 serving requests", ...logs].join("\n")}
        </pre>
      </div>
    </div>
  );
}
