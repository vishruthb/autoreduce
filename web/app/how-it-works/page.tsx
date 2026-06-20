import Link from "next/link";
import type { Metadata } from "next";
import { Mascot } from "@/components/chrome/Mascot";
import { InstallSnippet } from "@/components/landing/InstallSnippet";
import { TrafficLights } from "@/components/ui/TrafficLights";

export const metadata: Metadata = {
  title: "Docs - autoreduce",
  description:
    "How autoreduce runs autonomous optimization: planners create ideas, agents write methods, " +
    "sealed benchmarks measure results, and the decoupled scheduler allocates GPU work.",
};

const PIPELINE = [
  {
    title: "Planner",
    body: "Reads the goal and digest, then seeds hypotheses and scale probes.",
  },
  {
    title: "Idea queue",
    body: "Stores algorithmic hypotheses separately from measurements.",
  },
  {
    title: "Agent layer",
    body: "Coding agents think, edit, and request measurements without owning GPUs.",
  },
  {
    title: "Experiment queue",
    body: "Each benchmark request becomes an experiment with a resource and workload shape.",
  },
  {
    title: "GPU scheduler",
    body: "Atomically leases GPU bundles and launches benchmark runners when jobs fit.",
  },
  {
    title: "Results digest",
    body: "Verified metrics, scale curves, followups, and queue pressure feed the planner.",
  },
];

const MODES = [
  {
    name: "Coupled",
    command: "AUTOREDUCE_SCHEDULER_MODE=coupled",
    body:
      "The original safe path. One worker claims one idea and one GPU slot, runs the agent, " +
      "runs the sealed benchmark, and reports the result. This keeps the current demo stable.",
  },
  {
    name: "Decoupled",
    command: "AUTOREDUCE_SCHEDULER_MODE=decoupled",
    body:
      "The elastic path. Agents scale independently from GPU execution. Benchmark jobs own GPUs " +
      "only while measured work is running, so one GPU can support multiple active agents and a " +
      "larger pool can mix wide search with 2/4/8 GPU probes.",
  },
];

const IMPLEMENTATION = [
  ["autoreduce/db.py", "Creates runs, ideas, gpu_slots, experiments, agent_leases, and gpu_leases."],
  ["autoreduce/store.py", "Owns transactional claims, result reporting, leases, scale curves, and resource digests."],
  ["autoreduce/worker.py", "Runs the agent side: claim an idea, prepare a workspace, write method.py, request benchmarks."],
  ["autoreduce/benchmark_worker.py", "Runs the measurement side: claim an experiment bundle, set CUDA_VISIBLE_DEVICES, run the sealed benchmark."],
  ["autoreduce/scheduler.py", "Computes target agent count and keeps the decoupled agent and benchmark pools alive."],
  ["autoreduce/planner.py", "Keeps the queue full and emits scale probes when an idea has promising signal."],
  ["web/app/dashboard/page.tsx", "Shows active agents, benchmark queue, GPU bundle usage, ranked results, and scale curves."],
];

const SOURCES = [
  {
    label: "The AI Scientist",
    href: "https://sakana.ai/ai-scientist/",
    body:
      "A reference point for end-to-end automated research loops: idea generation, experiment execution, analysis, and writeup.",
  },
  {
    label: "The AI Scientist Nature update",
    href: "https://sakana.ai/ai-scientist-nature/",
    body:
      "Shows the broader direction of autonomous scientific discovery and tree-like exploration over research ideas.",
  },
  {
    label: "Modal autoscaling docs",
    href: "https://modal.com/docs/guide/scale",
    body:
      "The infrastructure analogy for this design: scale compute pools based on queued work and idle capacity.",
  },
  {
    label: "Modal GPU docs",
    href: "https://modal.com/docs/guide/gpu",
    body:
      "Useful background for GPU-backed workloads, resource declarations, and elastic execution environments.",
  },
  {
    label: "Claude Agent SDK for Python",
    href: "https://github.com/anthropics/claude-agent-sdk-python",
    body:
      "The agent execution layer used by autoreduce workers when running real coding sessions.",
  },
];

const ARCHITECTURE = [
  "Planner",
  "  -> idea queue",
  "  -> agent workers",
  "  -> benchmark request queue",
  "  -> GPU bundle scheduler",
  "  -> benchmark workers",
  "  -> sealed metrics + scale curves",
  "  -> planner digest",
];

export default function HowItWorks() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        <section className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
          <div>
            <div className="text-ink">
              <Mascot size={72} />
            </div>
            <p className="mt-md font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              autoreduce docs
            </p>
            <h1 className="mt-sm max-w-[760px] text-display-xl text-ink">
              Autonomous optimization with sealed measurement and elastic GPU scheduling.
            </h1>
            <p className="mt-md max-w-[700px] text-body-md text-body">
              Autoreduce takes a goal like "increase accepted tokens per call", generates
              implementation hypotheses, gives each one to a coding agent, and ranks only the
              results that pass a sealed benchmark. The current implementation keeps the original
              coupled worker mode, then adds a decoupled mode where agents and GPU jobs scale as
              separate layers.
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
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <pre className="mt-md overflow-x-auto font-mono text-code-sm leading-relaxed">
              {ARCHITECTURE.map((line, index) => (
                <div key={line} className={index === 0 ? "text-ink" : "text-body"}>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </section>

        <section className="mt-section">
          <div className="rounded-lg bg-surface-dark p-xxl text-on-dark">
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-on-dark-mute">
              core idea
            </p>
            <h2 className="mt-sm text-heading-lg text-on-dark">
              Agents do not own GPUs. Benchmarks do.
            </h2>
            <p className="mt-md max-w-[760px] text-body-md text-on-dark-mute">
              The original system tied one worker, one agent session, one idea, and one GPU slot
              together. That is simple and correct, but it leaves expensive GPUs idle while agents
              think, wait on APIs, and edit files. Decoupled mode keeps the sealed benchmark path
              but moves GPU ownership to benchmark jobs. With 1 GPU, several agents can prepare work
              while one measurement runs. With 4 or 8 GPUs, the scheduler can pack many 1-GPU tests
              or temporarily reserve 2/4/8 GPU bundles for scale probes.
            </p>
          </div>
        </section>

        <section className="mt-section">
          <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                architecture
              </p>
              <h2 className="mt-sm text-display-lg text-ink">The execution loop</h2>
            </div>
            <p className="max-w-[460px] text-body-sm text-body">
              Ideas are hypotheses. Experiments are measurements. Splitting those two concepts is
              what lets the planner build scale curves instead of just a flat ranked table.
            </p>
          </div>
          <ol className="mt-xl grid gap-md md:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((step, index) => (
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

        <section className="mt-section grid gap-md lg:grid-cols-2">
          {MODES.map((mode) => (
            <article key={mode.name} className="rounded-lg border border-hairline bg-canvas p-xl">
              <h2 className="text-heading-md text-ink">{mode.name} mode</h2>
              <code className="mt-md block overflow-x-auto rounded-md bg-surface-soft px-md py-sm font-mono text-code-sm text-charcoal">
                {mode.command}
              </code>
              <p className="mt-md text-body-sm text-body">{mode.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-section">
          <div className="grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                implementation
              </p>
              <h2 className="mt-sm text-display-lg text-ink">What changed in code</h2>
              <p className="mt-md text-body-md text-body">
                The migration is incremental. Coupled endpoints and worker behavior remain in
                place. Decoupled mode adds vocabulary, tables, leases, and workers around the
                original sealed benchmark design.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
              {IMPLEMENTATION.map(([file, body], index) => (
                <div
                  key={file}
                  className={
                    index === 0
                      ? "grid gap-xs p-md md:grid-cols-[230px_minmax(0,1fr)]"
                      : "grid gap-xs border-t border-hairline p-md md:grid-cols-[230px_minmax(0,1fr)]"
                  }
                >
                  <code className="font-mono text-code-sm text-ink">{file}</code>
                  <p className="text-body-sm text-body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-section grid gap-md lg:grid-cols-3">
          <div className="rounded-lg border border-hairline bg-canvas p-xl">
            <h2 className="text-heading-md text-ink">1 GPU</h2>
            <p className="mt-md text-body-sm text-body">
              Parallel thinking, serial measurement. Two to four agents can prepare candidates
              while the benchmark queue runs one GPU job at a time.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-xl">
            <h2 className="text-heading-md text-ink">4 GPUs</h2>
            <p className="mt-md text-body-sm text-body">
              The demo path. The scheduler usually runs broad 1-GPU tests, then reserves a 2-GPU or
              4-GPU bundle when a promising idea deserves a scale probe.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-xl">
            <h2 className="text-heading-md text-ink">8 GPUs</h2>
            <p className="mt-md text-body-sm text-body">
              Wide, mixed, probe, and validate modes become visible: 8 one-GPU jobs, 4 one-GPU jobs
              plus a 4-GPU probe, two 4-GPU probes, or one 8-GPU validation.
            </p>
          </div>
        </section>

        <section className="mt-section">
          <div className="rounded-lg border border-hairline bg-canvas p-xl">
            <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                  trust boundary
                </p>
                <h2 className="mt-sm text-heading-lg text-ink">Measured, not claimed.</h2>
                <p className="mt-md text-body-md text-body">
                  Agents write methods and can ask for feedback, but the score comes from the
                  system running the sealed benchmark against the final method. The benchmark is
                  outside the writable workspace. In decoupled mode, even interactive benchmark
                  calls go through the experiment queue, so the GPU scheduler controls when and
                  where measurement happens.
                </p>
              </div>
              <div className="rounded-md bg-surface-soft p-md">
                <p className="font-mono text-code-sm text-charcoal">
                  AUTOREDUCE_POOL_SIZE=4
                  <br />
                  AUTOREDUCE_SCHEDULER_MODE=decoupled
                  <br />
                  AUTOREDUCE_AGENT_AUTOSCALE=1
                  <br />
                  AUTOREDUCE_MAX_AGENTS=8
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-section">
          <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                references
              </p>
              <h2 className="mt-sm text-display-lg text-ink">Relevant sources</h2>
            </div>
            <p className="max-w-[500px] text-body-sm text-body">
              These are not dependencies. They are the closest public reference points for the
              research-agent loop and elastic compute model behind the pitch.
            </p>
          </div>
          <div className="mt-xl grid gap-md md:grid-cols-2">
            {SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-hairline bg-canvas p-lg hover:border-hairline-strong hover:bg-surface-soft"
              >
                <h3 className="text-heading-sm text-ink">{source.label}</h3>
                <p className="mt-sm text-body-sm text-body">{source.body}</p>
                <p className="mt-md overflow-hidden text-ellipsis whitespace-nowrap font-mono text-code-sm text-mute">
                  {source.href}
                </p>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-section flex flex-col items-center text-center">
          <h2 className="text-heading-lg text-ink">Run the local loop.</h2>
          <p className="mt-xs max-w-[560px] text-body-md text-body">
            Start the app, open the dashboard, and watch ideas, agents, benchmark jobs, GPU leases,
            and scale curves update from the same run.
          </p>
          <div className="mt-lg flex w-full justify-center">
            <InstallSnippet command="python -m autoreduce" />
          </div>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">© 2026 autoreduce</footer>
    </div>
  );
}
