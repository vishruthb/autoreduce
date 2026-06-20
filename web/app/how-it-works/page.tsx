import Link from "next/link";
import type { Metadata } from "next";
import { InstallSnippet } from "@/components/landing/InstallSnippet";
import { TrafficLights } from "@/components/ui/TrafficLights";

export const metadata: Metadata = {
  title: "Docs - autoreduce",
  description:
    "Autoreduce is distributed autoresearch for ML systems where algorithms, batching, precision, and GPU topology interact.",
};

const PIPELINE = [
  "Goal",
  "Planner",
  "Agents",
  "Experiments",
  "GPU Scheduler",
  "Sealed Metrics",
  "Scale Curves",
];

const ARCHITECTURE = [
  "User Goal",
  "  -> Planner Agent",
  "  -> Idea Queue",
  "  -> Agent Autoscaler",
  "  -> Agent Workers",
  "  -> Experiment Queue",
  "  -> GPU Bundle Scheduler",
  "  -> Benchmark Workers",
  "  -> Sealed Benchmark",
  "  -> Results + Scale Curves",
  "  -> Planner Digest",
  "  -> back to Planner",
];

const AGENT_BARS = [
  { gpus: "1 GPU", agents: 3, benchmarks: 1 },
  { gpus: "2 GPUs", agents: 5, benchmarks: 2 },
  { gpus: "4 GPUs", agents: 8, benchmarks: 4 },
  { gpus: "8 GPUs", agents: 12, benchmarks: 8 },
];

const TIME_BREAKDOWN = [
  { label: "LLM reasoning", value: 45 },
  { label: "Code editing", value: 25 },
  { label: "Queue wait", value: 10 },
  { label: "Benchmark execution", value: 20 },
];

const EXECUTION_STEPS = [
  {
    title: "Planner proposes ideas",
    body:
      "The planner reads the user goal, task interface, previous results, failures, and resource state. It proposes new hypotheses and identifies which ideas may be scale-sensitive.",
  },
  {
    title: "Agents write methods",
    body:
      "Agent workers claim ideas, create workspaces, write method.py, and submit benchmark requests. They do not permanently reserve GPUs.",
  },
  {
    title: "Experiments enter the queue",
    body:
      "Each benchmark request becomes an experiment containing the method, workload shape, resource shape, phase, and priority.",
  },
  {
    title: "GPU scheduler packs jobs",
    body:
      "The scheduler allocates GPU bundles to experiments. It can run many one-GPU tests, reserve a 4-GPU scale probe, or launch an 8-GPU validation.",
  },
  {
    title: "Sealed benchmark measures",
    body:
      "Benchmark workers run the system-owned benchmark. Agents write methods, but they do not own the metric.",
  },
  {
    title: "Planner learns from curves",
    body:
      "Results are reduced into leaderboards, failures, queue stats, and scale curves. The planner uses the digest to decide what to try next.",
  },
];

const ALLOCATION_MODES = [
  { label: "Wide search", units: [1, 1, 1, 1, 1, 1, 1, 1] },
  { label: "Mixed", units: [1, 1, 1, 1, 4] },
  { label: "Scale probe", units: [4, 4] },
  { label: "Validate", units: [8] },
];

const SCALE_CURVES = [
  { label: "Hybrid batching", values: [1.34, 1.44, 1.48, 1.47] },
  { label: "Candidate parallel", values: [1.06, 1.23, 1.41, 1.43] },
  { label: "Fixed draft", values: [1.11, 1.12, 1.12, 1.1] },
];

const PROBLEM_SPACES = [
  {
    title: "Speculative Decoding",
    body:
      "Search over draft length, request grouping, verification scheduling, batch size, concurrency, and GPU count.",
    example:
      "A candidate-parallel method may look weak on one GPU because branches are serialized, then improve on four GPUs when candidate generation is parallelized.",
  },
  {
    title: "Low-Bit Search -> High-Bit Render",
    body:
      "Use FP8 or NVFP4 for cheap candidate exploration, then BF16 for final verification or rendering.",
    example:
      "The useful regime may depend on candidate count, precision format, batch size, and whether verification is reserved for the best candidates.",
  },
  {
    title: "Distributed Training and Scaling Laws",
    body:
      "Search over batch size, tensor parallelism, pipeline parallelism, data parallelism, communication overhead, and scaling efficiency.",
    example:
      "A training change can improve small-scale throughput while losing at larger parallelism because synchronization dominates.",
  },
];

const CONTROL_PLANE = [
  ["Planner", "Generates hypotheses and scale probes from the digest."],
  ["Agent Workers", "Write methods and create benchmarkable experiments."],
  ["Experiment Queue", "Stores method path, resource shape, workload shape, phase, and priority."],
  ["GPU Scheduler", "Leases 1/2/4/8 GPU bundles and applies backpressure."],
  ["Benchmark Workers", "Run sealed benchmarks with assigned CUDA_VISIBLE_DEVICES."],
  ["Result Reducer", "Builds leaderboards, failures, resource stats, and scale curves."],
];

const CASE_STUDIES = [
  {
    href: "/case-studies/speculative-decoding",
    title: "Speculative decoding batching",
    body:
      "Search over adaptive draft lengths, request grouping, KV-cache pressure, and 1/2/4/8 GPU scale probes.",
    metric: "1.31x",
  },
  {
    href: "/case-studies/low-bit-bf16",
    title: "FP4 search, BF16 render",
    body:
      "Search over low-bit candidate generation, verifier routing, BF16 rerender budgets, and scale-aware diffusion inference.",
    metric: "0.771",
  },
];

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
      <div>
        <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">{eyebrow}</p>
        <h2 className="mt-sm max-w-[760px] text-display-lg text-ink">{title}</h2>
      </div>
      {body ? <p className="max-w-[500px] text-body-sm text-body">{body}</p> : null}
    </div>
  );
}

function AgentElasticityChart() {
  return (
    <div className="space-y-md">
      {AGENT_BARS.map((row) => (
        <div key={row.gpus} className="grid gap-sm md:grid-cols-[80px_minmax(0,1fr)] md:items-center">
          <p className="font-mono text-code-sm text-charcoal">{row.gpus}</p>
          <div className="space-y-xs">
            <div className="flex items-center gap-sm">
              <div className="h-[14px] rounded-full bg-primary" style={{ width: `${row.agents * 7}%` }} />
              <span className="font-mono text-code-sm text-ink">{row.agents} agents</span>
            </div>
            <div className="flex items-center gap-sm">
              <div className="h-[14px] rounded-full bg-hairline-strong" style={{ width: `${row.benchmarks * 7}%` }} />
              <span className="font-mono text-code-sm text-charcoal">{row.benchmarks} benchmarks</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AllocationVisual() {
  return (
    <div className="space-y-md">
      {ALLOCATION_MODES.map((mode) => (
        <div key={mode.label} className="grid gap-sm md:grid-cols-[110px_minmax(0,1fr)] md:items-center">
          <p className="font-mono text-code-sm text-charcoal">{mode.label}</p>
          <div className="flex h-[42px] gap-xs rounded-md bg-surface-soft p-xs">
            {mode.units.map((unit, index) => (
              <div
                key={`${mode.label}-${index}`}
                className="flex min-w-0 items-center justify-center rounded-sm border border-hairline-strong bg-canvas font-mono text-code-sm text-ink"
                style={{ flexGrow: unit, flexBasis: 0 }}
              >
                {unit === 1 ? "1" : `${unit} GPU`}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScaleCurveVisual() {
  const gpuLabels = ["1", "2", "4", "8"];
  const xFor = (index: number) => 52 + index * 150;
  const yFor = (value: number) => 198 - ((value - 1) / 0.55) * 144;
  const colors = ["#f4f4f5", "#a8a8b2", "#71717a"];

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="overflow-x-auto">
        <svg
          aria-label="Synthetic scale curves across 1, 2, 4, and 8 GPUs"
          className="min-w-[560px]"
          viewBox="0 0 560 250"
          role="img"
        >
          {[1.0, 1.2, 1.4].map((tick) => (
            <g key={tick}>
              <line x1="40" x2="520" y1={yFor(tick)} y2={yFor(tick)} stroke="#27272a" />
              <text x="0" y={yFor(tick) + 4} fill="#71717a" fontSize="12">
                {tick.toFixed(1)}x
              </text>
            </g>
          ))}
          {gpuLabels.map((gpu, index) => (
            <text key={gpu} x={xFor(index) - 12} y="232" fill="#71717a" fontSize="12">
              {gpu} GPU
            </text>
          ))}
          {SCALE_CURVES.map((curve, curveIndex) => {
            const points = curve.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
            return (
              <g key={curve.label}>
                <polyline
                  fill="none"
                  points={points}
                  stroke={colors[curveIndex]}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
                {curve.values.map((value, index) => (
                  <g key={`${curve.label}-${index}`}>
                    <circle cx={xFor(index)} cy={yFor(value)} fill="#0b0b0c" r="5" stroke={colors[curveIndex]} strokeWidth="3" />
                    <text x={xFor(index) - 15} y={yFor(value) - 10} fill={colors[curveIndex]} fontSize="12">
                      {value.toFixed(2)}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-md grid gap-sm md:grid-cols-3">
        {SCALE_CURVES.map((curve, index) => (
          <div key={curve.label} className="flex items-center gap-sm">
            <span className="h-[3px] w-[28px] rounded-full" style={{ backgroundColor: colors[index] }} />
            <span className="text-body-sm text-body">{curve.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        <section className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              Autoreduce docs
            </p>
            <h1 className="mt-sm max-w-[820px] text-display-xl text-ink">
              Distributed autoresearch.
            </h1>
            <p className="mt-md max-w-[720px] text-body-md text-body">
              Autoreduce uses coding agents, sealed benchmarks, and elastic GPU scheduling to
              search over algorithms, batching strategies, precision regimes, and multi-GPU
              execution plans.
            </p>
            <p className="mt-md max-w-[640px] text-heading-sm text-ink">
              Most autoresearch systems run more experiments. Autoreduce decides how experiments
              should scale.
            </p>
            <div className="mt-lg flex flex-wrap gap-sm">
              <Link
                href="/dashboard"
                className="inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
              >
                Open dashboard
              </Link>
              <a
                href="https://github.com/vishruthb/autoreduce"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
              >
                GitHub
              </a>
              <Link
                href="/case-studies"
                className="inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
              >
                Case study
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <div className="mt-md flex flex-wrap gap-sm">
              {PIPELINE.map((step, index) => (
                <div key={step} className="flex items-center gap-sm">
                  <span className="rounded-full border border-hairline-strong px-md py-xs text-body-sm text-ink">
                    {step}
                  </span>
                  {index < PIPELINE.length - 1 ? <span className="text-mute">-&gt;</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-section" id="why">
          <div className="rounded-lg bg-surface-dark p-xxl text-on-dark">
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-on-dark-mute">
              why distributed autoresearch?
            </p>
            <h2 className="mt-sm max-w-[820px] text-heading-lg text-on-dark">
              Large-scale ML optimization is resource-dependent.
            </h2>
            <p className="mt-md max-w-[860px] text-body-md text-on-dark-mute">
              In inference serving, speculative decoding, distributed training, and mixed-precision
              search, the same method can behave differently at different GPU counts, batch sizes,
              concurrency levels, and precision regimes. A one-GPU benchmark can reject an idea that
              becomes strong at four GPUs. A high-throughput batching policy can look good on average
              but fail p95 latency. Autoreduce searches over both the algorithm and the resource
              regime where the algorithm becomes effective.
            </p>
          </div>
        </section>

        <section className="mt-section" id="layers">
          <SectionHeading
            eyebrow="optimization layers"
            title="Two optimization layers"
            body="Autoreduce separates agent concurrency from GPU measurement, then lets experiments request the resource shape they need."
          />
          <div className="mt-xl grid gap-md lg:grid-cols-2">
            <article className="rounded-lg border border-hairline bg-canvas p-xl">
              <h3 className="text-heading-md text-ink">Layer 1: Agent Elasticity</h3>
              <p className="mt-md text-body-sm text-body">
                Agents do not own GPUs. They think, write code, and prepare benchmarkable methods.
                GPUs are only used when a benchmark runs.
              </p>
              <div className="mt-lg">
                <AgentElasticityChart />
              </div>
              <p className="mt-lg text-caption-sm text-mute">
                Agent concurrency scales with available measurement capacity, not one-to-one with
                GPUs.
              </p>
            </article>

            <article className="rounded-lg border border-hairline bg-canvas p-xl">
              <h3 className="text-heading-md text-ink">Layer 2: Experiment Elasticity</h3>
              <p className="mt-md text-body-sm text-body">
                Some ideas need more than one GPU to be measured correctly. Autoreduce can allocate
                1/2/4/8 GPU bundles to promising experiments and build scale curves.
              </p>
              <div className="mt-lg">
                <AllocationVisual />
              </div>
              <p className="mt-lg text-caption-sm text-mute">
                The scheduler trades breadth for fidelity when the planner detects a scale-sensitive
                idea.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-section" id="architecture">
          <div className="grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                how it works
              </p>
              <h2 className="mt-sm text-display-lg text-ink">Research reasoning is separate from GPU execution.</h2>
              <p className="mt-md text-body-md text-body">
                The planner proposes hypotheses. Agent workers turn them into code. Each method
                becomes an experiment with a resource shape and workload shape. The scheduler decides
                whether to run it as a cheap one-GPU test, a multi-GPU scale probe, or a final
                validation.
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-canvas p-lg">
              <TrafficLights />
              <pre className="mt-md overflow-x-auto font-mono text-code-sm leading-relaxed">
                {ARCHITECTURE.map((line, index) => (
                  <div key={`${line}-${index}`} className={index === 0 ? "text-ink" : "text-body"}>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <section className="mt-section">
          <SectionHeading
            eyebrow="execution loop"
            title="From idea to scale curve"
            body="The system keeps a closed loop between planning, code generation, queued measurement, and verified results."
          />
          <ol className="mt-xl grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {EXECUTION_STEPS.map((step, index) => (
              <li key={step.title} className="rounded-lg border border-hairline bg-canvas p-lg">
                <div className="flex items-center gap-sm">
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-hairline-strong font-mono text-code-sm text-ink">
                    {index + 1}
                  </span>
                  <h3 className="text-heading-sm text-ink">{step.title}</h3>
                </div>
                <p className="mt-md text-body-sm text-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-section">
          <SectionHeading
            eyebrow="agent batching"
            title="Parallel thinking, bounded measurement"
            body="Agents can run ahead of measurement, but the benchmark queue keeps the system bounded."
          />
          <div className="mt-xl grid gap-md lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border border-hairline bg-canvas p-xl">
              <h3 className="text-heading-md text-ink">Agent concurrency is not GPU concurrency</h3>
              <div className="mt-lg">
                <AgentElasticityChart />
              </div>
            </div>
            <div className="rounded-lg border border-hairline bg-canvas p-xl">
              <h3 className="text-heading-md text-ink">Agent session time</h3>
              <div className="mt-lg space-y-md">
                {TIME_BREAKDOWN.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-md">
                      <span className="text-body-sm text-body">{item.label}</span>
                      <span className="font-mono text-code-sm text-ink">{item.value}%</span>
                    </div>
                    <div className="mt-xs h-[8px] overflow-hidden rounded-full bg-surface-soft">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-lg text-caption-sm text-mute">
                Only benchmark execution needs GPUs. The rest can run concurrently without holding
                GPU leases.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-section">
          <SectionHeading
            eyebrow="gpu scheduling"
            title="Wide search vs scale probes"
            body="The same 8-GPU pool can be packed differently depending on the research phase."
          />
          <div className="mt-xl rounded-lg border border-hairline bg-canvas p-xl">
            <AllocationVisual />
            <p className="mt-lg text-caption-sm text-mute">
              Early on, Autoreduce explores broadly. Later it reallocates GPUs toward experiments
              that need scale to be evaluated correctly.
            </p>
          </div>
        </section>

        <section className="mt-section">
          <SectionHeading
            eyebrow="scale curves"
            title="Scale curves, not just leaderboards"
            body="A flat leaderboard hides whether a method only works at a specific GPU count or batching regime."
          />
          <div className="mt-xl">
            <ScaleCurveVisual />
          </div>
          <p className="mt-md text-caption-sm text-mute">
            The best one-GPU method is not always the best scaled method.
          </p>
        </section>

        <section className="mt-section" id="problem-spaces">
          <SectionHeading
            eyebrow="problem spaces"
            title="Where this matters"
            body="Autoreduce is designed for optimization problems where algorithmic choices and systems choices interact."
          />
          <div className="mt-xl grid gap-md lg:grid-cols-3">
            {PROBLEM_SPACES.map((space) => (
              <article key={space.title} className="rounded-lg border border-hairline bg-canvas p-xl">
                <h3 className="text-heading-md text-ink">{space.title}</h3>
                <p className="mt-md text-body-sm text-body">{space.body}</p>
                <p className="mt-lg border-t border-hairline pt-md text-body-sm text-charcoal">
                  {space.example}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-section" id="case-studies">
          <SectionHeading
            eyebrow="case studies"
            title="Run narratives"
            body="Each case study has its own link and shows how the planner moves from broad search to scale probes."
          />
          <div className="mt-xl grid gap-md lg:grid-cols-2">
            {CASE_STUDIES.map((study) => (
              <Link
                key={study.href}
                href={study.href}
                className="rounded-lg border border-hairline bg-canvas p-xl hover:border-hairline-strong hover:bg-surface-soft"
              >
                <div className="flex items-start justify-between gap-md">
                  <h3 className="text-heading-md text-ink">{study.title}</h3>
                  <span className="rounded-full border border-hairline-strong px-md py-xs font-mono text-code-sm text-charcoal">
                    {study.metric}
                  </span>
                </div>
                <p className="mt-md text-body-sm text-body">{study.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-section">
          <div className="rounded-lg bg-surface-dark p-xxl text-on-dark">
            <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-on-dark-mute">
                  trust boundary
                </p>
                <h2 className="mt-sm text-heading-lg text-on-dark">Measured, not claimed</h2>
                <p className="mt-md text-body-md text-on-dark-mute">
                  Agents write methods. The system owns measurement. Every result is produced by a
                  sealed benchmark outside the agent's writable workspace. No agent-reported metrics
                  enter the leaderboard.
                </p>
              </div>
              <div className="rounded-md border border-hairline-strong bg-canvas p-md">
                <pre className="font-mono text-code-sm leading-relaxed text-body">
                  Agent Worker{"\n"}
                  {"  "}writes method.py{"\n"}
                  {"  "}{"->"} Experiment Queue{"\n"}
                  {"  "}{"->"} Benchmark Worker{"\n"}
                  {"  "}{"->"} Verified Metric
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-section">
          <SectionHeading
            eyebrow="control plane"
            title="Built as a distributed control plane"
            body="The implementation is intentionally modular: planning, agents, queues, scheduling, benchmarking, and result reduction are separate roles."
          />
          <div className="mt-xl grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {CONTROL_PLANE.map(([title, body]) => (
              <article key={title} className="rounded-lg border border-hairline bg-canvas p-lg">
                <h3 className="text-heading-sm text-ink">{title}</h3>
                <p className="mt-sm text-body-sm text-body">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-section flex flex-col items-center text-center" id="demo">
          <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">local demo</p>
          <h2 className="mt-sm text-heading-lg text-ink">Run the loop and watch the scheduler.</h2>
          <p className="mt-xs max-w-[560px] text-body-md text-body">
            Start the app, open the dashboard, and watch ideas, agents, benchmark jobs, GPU leases,
            and scale curves update from one run.
          </p>
          <div className="mt-lg flex w-full justify-center">
            <InstallSnippet command="python -m autoreduce" />
          </div>
          <Link
            href="/case-studies"
            className="mt-lg inline-flex h-btn items-center rounded-full border border-hairline-strong px-[20px] text-button-md font-medium text-ink hover:bg-surface-soft"
          >
            View case study
          </Link>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">© 2026 autoreduce</footer>
    </div>
  );
}
