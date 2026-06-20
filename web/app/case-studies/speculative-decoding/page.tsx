import type { Metadata } from "next";
import Link from "next/link";
import { TrafficLights } from "@/components/ui/TrafficLights";
import { SpeculativeServingReplay } from "@/components/case-studies/SpeculativeServingReplay";

export const metadata: Metadata = {
  title: "Case studies - autoreduce",
  description:
    "Case study showing how autoreduce searches batching strategies for speculative decoding on an 8 H100 GPU pool.",
};

const PROMPT = [
  "We are optimizing speculative decoding for high-throughput LLM serving.",
  "",
  "Search for batching and verification strategies that improve quality-adjusted throughput while respecting tail latency.",
  "",
  "You may change draft length selection, request grouping, verification scheduling, candidate batching, acceptance-rate routing, multi-GPU partitioning, prefill/decode interleaving, and precision choices.",
  "",
  "Start with broad one-GPU experiments. If a method appears scale-sensitive, propose 2-GPU or 4-GPU scale probes. Only recommend 8-GPU validation if the scale curve justifies it.",
];

const SETUP = [
  ["GPU pool", "8 H100 slots"],
  ["Initial mode", "wide search"],
  ["Initial allocation", "8 one-GPU experiments"],
  ["Benchmark", "sealed serving benchmark"],
  ["Metric", "quality-adjusted throughput speedup"],
  ["Latency guardrail", "p95 <= 250 ms"],
  ["Baseline", "autoregressive decoding = 1.00x"],
];

const AGENTS = [
  {
    id: "A1",
    name: "Fixed draft-length batching",
    metric: "1.04x",
    p95: "218 ms",
    utilization: "60%",
    status: "baseline",
    body: "Buckets requests by remaining output length and uses draft length 4 for every request.",
  },
  {
    id: "A2",
    name: "Acceptance-aware draft length",
    metric: "1.17x",
    p95: "236 ms",
    utilization: "66%",
    status: "merge",
    body: "Tracks rolling acceptance rate and chooses draft length 2, 4, or 8 per request bucket.",
  },
  {
    id: "A3",
    name: "Verification-maximal batching",
    metric: "1.16x",
    p95: "268 ms",
    utilization: "72%",
    status: "failed p95",
    body: "Delays verification briefly to form larger target-model batches, but violates the latency guardrail.",
  },
  {
    id: "A4",
    name: "Prefill/decode interleaving",
    metric: "1.13x",
    p95: "231 ms",
    utilization: "76%",
    status: "future",
    body: "Uses chunked prefill so decode verification can piggyback on compute-heavy prefill chunks.",
  },
  {
    id: "A5",
    name: "Candidate-parallel drafting",
    metric: "0.98x",
    p95: "247 ms",
    utilization: "57%",
    status: "scale probe",
    body: "Generates multiple draft branches, ranks them cheaply, and verifies the highest-confidence branch.",
  },
  {
    id: "A6",
    name: "KV-cache-aware grouping",
    metric: "1.08x",
    p95: "226 ms",
    utilization: "65%",
    status: "support",
    body: "Groups by KV-cache pressure to reduce memory fragmentation and keep larger batches feasible.",
  },
  {
    id: "A7",
    name: "Latency-class routing",
    metric: "1.07x",
    p95: "198 ms",
    utilization: "59%",
    status: "strict SLO",
    body: "Separates interactive and throughput-oriented traffic, then applies different speculative policies.",
  },
  {
    id: "A8",
    name: "Hybrid adaptive + KV-aware batching",
    metric: "1.21x",
    p95: "224 ms",
    utilization: "74%",
    status: "best 1 GPU",
    body: "Combines acceptance-aware draft lengths with KV-cache-aware request grouping.",
  },
];

const SCALE_CURVES = [
  {
    name: "Candidate-parallel drafting",
    decision: "Scale-sensitive. Validate at 4 GPUs, skip 8-GPU validation.",
    values: [
      { gpu: "1 GPU", speedup: 0.98, latency: 247 },
      { gpu: "2 GPU", speedup: 1.11, latency: 238 },
      { gpu: "4 GPU", speedup: 1.24, latency: 242 },
      { gpu: "8 GPU", speedup: 1.25, latency: 257 },
    ],
  },
  {
    name: "Hybrid adaptive + KV-aware batching",
    decision: "Best general policy. Improves until 4 GPUs, then tail latency degrades.",
    values: [
      { gpu: "1 GPU", speedup: 1.21, latency: 224 },
      { gpu: "2 GPU", speedup: 1.27, latency: 230 },
      { gpu: "4 GPU", speedup: 1.31, latency: 245 },
      { gpu: "8 GPU", speedup: 1.3, latency: 269 },
    ],
  },
];

const SUMMARY = [
  ["Fixed draft-length batching", "1.04x", "-", "-", "-", "baseline only"],
  ["Acceptance-aware draft length", "1.17x", "-", "-", "-", "merged into hybrid"],
  ["Verification-maximal batching", "1.16x", "-", "-", "-", "failed p95"],
  ["Prefill/decode interleaving", "1.13x", "-", "-", "-", "keep for future"],
  ["Candidate-parallel drafting", "0.98x", "1.11x", "1.24x", "1.25x", "best at 4 GPU"],
  ["KV-cache-aware grouping", "1.08x", "-", "-", "-", "support strategy"],
  ["Latency-class routing", "1.07x", "-", "-", "-", "strict SLO regime"],
  ["Hybrid adaptive + KV-aware batching", "1.21x", "1.27x", "1.31x", "1.30x", "best general method"],
];

const BASELINES = [
  ["Autoregressive decoding", "1.00x", "baseline", "reference path"],
  ["Fixed draft-length batching", "1.04x", "+4%", "simple batching baseline"],
  ["Best one-GPU policy", "1.21x", "+21%", "under p95 guardrail"],
  ["Best scaled policy", "1.31x", "+31%", "best at 4 of 8 GPUs"],
];

const CONTEXT = [
  [
    "Standard decode path",
    "vLLM/PagedAttention-style autoregressive serving: continuous batching and paged KV cache, but one accepted token still requires a target-model decode step.",
  ],
  [
    "Published speed context",
    "Speculative decoding papers report roughly 2x-3x or 2x-2.5x acceleration in their settings. This replay uses a more conservative serving-constrained 1.31x result.",
  ],
];

const SOURCES = [
  ["Speculative Decoding", "https://arxiv.org/abs/2211.17192"],
  ["Speculative Sampling", "https://arxiv.org/abs/2302.01318"],
  ["PagedAttention / vLLM", "https://arxiv.org/abs/2309.06180"],
  ["SARATHI", "https://arxiv.org/abs/2308.16369"],
  ["Sarathi-Serve", "https://arxiv.org/abs/2403.02310"],
  ["DeepSpeed-FastGen", "https://arxiv.org/abs/2401.08671"],
];

function MetricCard({ label, value, body }: { label: string; value: string; body: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">{label}</p>
      <p className="mt-sm text-display-lg text-ink">{value}</p>
      <p className="mt-xs text-body-sm text-body">{body}</p>
    </div>
  );
}

function ScaleCurve({
  name,
  decision,
  values,
}: {
  name: string;
  decision: string;
  values: { gpu: string; speedup: number; latency: number }[];
}) {
  return (
    <article className="rounded-lg border border-hairline bg-canvas p-xl">
      <div className="flex flex-col justify-between gap-md md:flex-row md:items-start">
        <div>
          <h3 className="text-heading-md text-ink">{name}</h3>
          <p className="mt-xs max-w-[640px] text-body-sm text-body">{decision}</p>
        </div>
        <span className="w-fit rounded-full border border-hairline-strong px-md py-xs font-mono text-code-sm text-charcoal">
          scale curve
        </span>
      </div>
      <div className="mt-lg grid gap-md md:grid-cols-4">
        {values.map((point) => {
          const width = `${Math.round((point.speedup / 1.55) * 100)}%`;
          const overLatency = point.latency > 250;
          return (
            <div key={point.gpu} className="rounded-md bg-surface-soft p-md">
              <div className="flex items-center justify-between gap-sm">
                <span className="font-mono text-code-sm text-charcoal">{point.gpu}</span>
                <span className="text-body-sm-strong text-ink">{point.speedup.toFixed(2)}x</span>
              </div>
              <div className="mt-md h-[8px] overflow-hidden rounded-full bg-hairline">
                <div className="h-full rounded-full bg-primary" style={{ width }} />
              </div>
              <p className={overLatency ? "mt-sm text-caption-sm text-term-red" : "mt-sm text-caption-sm text-mute"}>
                p95 {point.latency} ms
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ComparisonTable({
  rows,
}: {
  rows: string[][];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-body-sm">
          <thead className="bg-surface-soft text-caption-sm uppercase tracking-[0.12em] text-mute">
            <tr>
              <th className="px-md py-sm font-normal">Reference</th>
              <th className="px-md py-sm font-normal">Metric</th>
              <th className="px-md py-sm font-normal">Gain</th>
              <th className="px-md py-sm font-normal">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-hairline">
                {row.map((cell, index) => (
                  <td key={`${row[0]}-${index}`} className={index === 0 ? "px-md py-sm text-ink" : "px-md py-sm text-body"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CaseStudiesPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        <section className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              case study 01
            </p>
            <h1 className="mt-sm max-w-[780px] text-display-xl text-ink">
              Agentic search for speculative decoding batching.
            </h1>
            <p className="mt-md max-w-[720px] text-body-md text-body">
              An 8 H100 run showing how autoreduce searches over batching policies, dispatches
              subagents, measures with a sealed benchmark, and decides which methods deserve
              multi-GPU scale probes.
            </p>
            <div className="mt-lg rounded-lg border border-hairline-strong bg-surface-soft p-md">
              <p className="text-body-sm text-body">
                The run is framed around a realistic serving target: improve throughput without
                breaking the p95 latency guardrail, then spend extra GPUs only where scale changes
                the decision.
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <div className="mt-md space-y-sm">
              {SETUP.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-lg border-b border-hairline pb-sm last:border-b-0 last:pb-0">
                  <span className="text-body-sm text-body">{label}</span>
                  <span className="text-right font-mono text-code-sm text-ink">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-section grid gap-md md:grid-cols-3">
          <MetricCard label="GPU pool" value="8 H100" body="The run starts with eight H100 slots available to the scheduler." />
          <MetricCard label="best scaled point" value="1.31x" body="Hybrid policy at 4 GPUs before p95 latency degraded." />
          <MetricCard label="planner decision" value="4 of 8" body="The 8-GPU probe flattened, so the planner returned capacity to search." />
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              baseline comparison
            </p>
            <h2 className="mt-sm text-display-lg text-ink">What did it beat?</h2>
            <p className="mt-md text-body-md text-body">
              The metric is speedup over normal autoregressive decoding. A result is useful only if
              it beats the baseline while staying inside the p95 latency guardrail.
            </p>
          </div>
          <ComparisonTable rows={BASELINES} />
        </section>

        <section className="mt-xl grid gap-md lg:grid-cols-2">
          {CONTEXT.map(([title, body]) => (
            <article key={title} className="rounded-lg border border-hairline bg-canvas p-lg">
              <h3 className="text-heading-sm text-ink">{title}</h3>
              <p className="mt-sm text-body-sm text-body">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-section">
          <div className="mb-xl flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                serving replay
              </p>
              <h2 className="mt-sm text-display-lg text-ink">Baseline vs Autoreduce policy</h2>
            </div>
            <p className="max-w-[520px] text-body-sm text-body">
              A deterministic replay of the benchmark summary: same 512-request workload, baseline
              on the left, selected Autoreduce policy on the right.
            </p>
          </div>
          <SpeculativeServingReplay />
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              planner prompt
            </p>
            <h2 className="mt-sm text-display-lg text-ink">What the run optimized</h2>
            <p className="mt-md text-body-md text-body">
              The problem is not just speculative decoding. It is speculative decoding under
              batching, latency, memory, request mix, and GPU-count constraints.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-code-sm leading-relaxed text-body">
              {PROMPT.join("\n")}
            </pre>
          </div>
        </section>

        <section className="mt-section">
          <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                broad search
              </p>
              <h2 className="mt-sm text-display-lg text-ink">Eight agents, eight hypotheses</h2>
            </div>
            <p className="max-w-[500px] text-body-sm text-body">
              The first pass prioritizes breadth. Every agent writes a method, the benchmark worker
              measures it, and the planner keeps or discards it based on sealed metrics.
            </p>
          </div>
          <div className="mt-xl grid gap-md md:grid-cols-2 lg:grid-cols-4">
            {AGENTS.map((agent) => (
              <article key={agent.id} className="rounded-lg border border-hairline bg-canvas p-lg">
                <div className="flex items-center justify-between gap-sm">
                  <span className="font-mono text-code-sm text-mute">{agent.id}</span>
                  <span className="rounded-full border border-hairline px-sm py-xxs font-mono text-code-sm text-charcoal">
                    {agent.status}
                  </span>
                </div>
                <h3 className="mt-md text-heading-sm text-ink">{agent.name}</h3>
                <p className="mt-sm text-body-sm text-body">{agent.body}</p>
                <div className="mt-lg grid grid-cols-3 gap-sm border-t border-hairline pt-md">
                  <div>
                    <p className="text-caption-sm text-mute">speed</p>
                    <p className="font-mono text-code-sm text-ink">{agent.metric}</p>
                  </div>
                  <div>
                    <p className="text-caption-sm text-mute">p95</p>
                    <p className="font-mono text-code-sm text-ink">{agent.p95}</p>
                  </div>
                  <div>
                    <p className="text-caption-sm text-mute">GPU</p>
                    <p className="font-mono text-code-sm text-ink">{agent.utilization}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-section">
          <div className="rounded-lg bg-surface-dark p-xxl text-on-dark">
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-on-dark-mute">
              planner insight
            </p>
            <h2 className="mt-sm text-heading-lg text-on-dark">
              The best one-GPU method was not the most scale-sensitive method.
            </h2>
            <p className="mt-md max-w-[820px] text-body-md text-on-dark-mute">
              Candidate-parallel drafting looked weak at 1 GPU because its branches were serialized.
              The benchmark digest showed candidate generation dominated step time, so the planner
              kept it alive and scheduled 2-GPU and 4-GPU probes. That is the point of resource-aware
              autoresearch: do not judge every algorithm only under the cheapest resource regime.
            </p>
          </div>
        </section>

        <section className="mt-section grid gap-md lg:grid-cols-3">
          <article className="rounded-lg border border-hairline bg-canvas p-xl">
            <h3 className="text-heading-md text-ink">Useful result</h3>
            <p className="mt-md text-body-sm text-body">
              The best policy improved throughput by 31% over autoregressive decoding while staying
              under the latency target at the 4-GPU point.
            </p>
          </article>
          <article className="rounded-lg border border-hairline bg-canvas p-xl">
            <h3 className="text-heading-md text-ink">Research signal</h3>
            <p className="mt-md text-body-sm text-body">
              A weak one-GPU idea became useful only when candidate generation was parallelized. A
              normal one-GPU search would have likely discarded it.
            </p>
          </article>
          <article className="rounded-lg border border-hairline bg-canvas p-xl">
            <h3 className="text-heading-md text-ink">Scaling decision</h3>
            <p className="mt-md text-body-sm text-body">
              The 8-GPU point did not justify its cost. Autoreduce learned where the method stopped
              being worth scaling.
            </p>
          </article>
        </section>

        <section className="mt-section">
          <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                scale probes
              </p>
              <h2 className="mt-sm text-display-lg text-ink">2/4/8 GPU curves</h2>
            </div>
            <p className="max-w-[500px] text-body-sm text-body">
              The scheduler does not give every idea 8 GPUs. It probes only methods with strong
              signal or a parallel bottleneck, then returns capacity to broad search when gains
              flatten.
            </p>
          </div>
          <div className="mt-xl space-y-md">
            {SCALE_CURVES.map((curve) => (
              <ScaleCurve key={curve.name} {...curve} />
            ))}
          </div>
        </section>

        <section className="mt-section">
          <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
            <div className="border-b border-hairline p-xl">
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                summary table
              </p>
              <h2 className="mt-sm text-heading-lg text-ink">Final results</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-body-sm">
                <thead className="bg-surface-soft text-caption-sm uppercase tracking-[0.12em] text-mute">
                  <tr>
                    <th className="px-md py-sm font-normal">Method</th>
                    <th className="px-md py-sm font-normal">1 GPU</th>
                    <th className="px-md py-sm font-normal">2 GPU</th>
                    <th className="px-md py-sm font-normal">4 GPU</th>
                    <th className="px-md py-sm font-normal">8 GPU</th>
                    <th className="px-md py-sm font-normal">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {SUMMARY.map((row) => (
                    <tr key={row[0]} className="border-t border-hairline">
                      {row.map((cell, index) => (
                        <td key={`${row[0]}-${index}`} className={index === 0 ? "px-md py-sm text-ink" : "px-md py-sm text-body"}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              takeaway
            </p>
            <h2 className="mt-sm text-display-lg text-ink">
              Autoreduce searches over algorithms and the resource regimes where they work.
            </h2>
            <p className="mt-md text-body-md text-body">
              The planner chose Hybrid Adaptive + KV-Aware Batching as the default serving policy.
              It also identified Candidate-Parallel Drafting as a high-throughput multi-GPU option
              worth validating at 4 GPUs. Both methods flattened at 8 GPUs, so the system stopped
              scaling them and returned capacity to broad search.
            </p>
            <div className="mt-lg flex flex-wrap gap-sm">
              <Link
                href="/how-it-works"
                className="inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
              >
                Read architecture
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
              >
                Open dashboard
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <h3 className="text-heading-md text-ink">Sources used by agents</h3>
            <div className="mt-md space-y-md">
              {SOURCES.map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-hairline bg-surface-soft p-md hover:border-hairline-strong"
                >
                  <p className="text-body-sm-strong text-ink">{label}</p>
                  <p className="mt-xs overflow-hidden text-ellipsis whitespace-nowrap font-mono text-code-sm text-mute">
                    {href}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">© 2026 autoreduce</footer>
    </div>
  );
}
