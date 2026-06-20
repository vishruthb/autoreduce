import Link from "next/link";
import type { Metadata } from "next";
import { Mascot } from "@/components/chrome/Mascot";
import { TrafficLights } from "@/components/ui/TrafficLights";
import { InstallSnippet } from "@/components/landing/InstallSnippet";

export const metadata: Metadata = {
  title: "How it works — autoreduce",
  description:
    "How autoreduce turns a plain-language goal into verified results: a planner " +
    "proposes hypotheses, a pool of agents implements and benchmarks each one, " +
    "and the system measures everything.",
};

const STEPS: { title: string; body: string }[] = [
  {
    title: "You describe a goal",
    body:
      "In plain language, however vague — “make the data loader faster”, “reduce " +
      "p99 latency”, “lift accepted tokens per call”. There's no form to fill in " +
      "and no search space to define; the goal is the whole input.",
  },
  {
    title: "The planner proposes hypotheses",
    body:
      "A planner reads your goal and the results so far, then proposes a batch of " +
      "distinct, implementable methods — some refining the current best (exploit), " +
      "some opening new directions (explore). It keeps the queue full as results " +
      "land, and escalates exploration when the frontier stalls.",
  },
  {
    title: "A pool of agents builds and benchmarks each one",
    body:
      "Every hypothesis goes to a worker: a coding agent that writes a real method, " +
      "runs it on the benchmark, reads the score, and iterates until it beats the " +
      "baseline. Workers run in parallel across the pool, each sandboxed to its own " +
      "workspace — they can write a method, never touch the measurement.",
  },
  {
    title: "You get a ranked report",
    body:
      "Results stream into a best-first table you can expand to watch what each " +
      "agent is doing. When the budget is spent, you get a report — every method, " +
      "its verified score, and what it changed — readable on screen and downloadable " +
      "as markdown.",
  },
];

const LOOP: { text: string; tone: "mute" | "ink" }[] = [
  { text: "$ python -m autoreduce", tone: "ink" },
  { text: "[planner]  goal: “make the data loader faster”  →  8 hypotheses", tone: "mute" },
  { text: "[W0]  write method · benchmark · 1.58×   →  submit ★ best", tone: "ink" },
  { text: "[W1]  write method · benchmark · explore (running 0:06)", tone: "ink" },
  { text: "[W2]  write method · benchmark · 1.42×   →  submit", tone: "ink" },
  { text: "[system]  measured 23 / 40 · best 1.58×", tone: "mute" },
  { text: "[report]  ranked findings ready          →  download .md", tone: "mute" },
];

export default function HowItWorks() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-content flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        {/* hero */}
        <section className="flex flex-col items-center text-center">
          <div className="text-ink">
            <Mascot size={72} />
          </div>
          <h1 className="mt-lg text-display-xl text-ink">How autoreduce works</h1>
          <p className="mt-md max-w-[560px] text-body-md text-body">
            One planner, a pool of coding agents, and a sealed benchmark. You bring a
            goal; it runs the experiments and hands you results that are measured, not
            claimed.
          </p>
        </section>

        {/* the loop, as a terminal preview */}
        <section className="mt-section">
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <pre className="mt-md overflow-x-auto font-mono text-code-sm leading-relaxed">
              {LOOP.map((l, i) => (
                <div key={i} className={l.tone === "ink" ? "text-ink" : "text-mute"}>
                  {l.text}
                </div>
              ))}
            </pre>
          </div>
        </section>

        {/* the four steps, on a pipeline rail */}
        <section className="mt-section">
          <h2 className="text-display-lg text-ink">The loop</h2>
          <ol className="relative mt-xl space-y-xxl border-l border-hairline pl-xl">
            {STEPS.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute left-[-24px] top-0 flex h-[30px] w-[30px] -translate-x-1/2 items-center justify-center rounded-full border border-hairline-strong bg-canvas font-mono text-code-sm text-ink">
                  {i + 1}
                </span>
                <h3 className="text-heading-md text-ink">{s.title}</h3>
                <p className="mt-xs max-w-[600px] text-body-md text-body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* the single inverted "look here" surface: the trust guarantee */}
        <section className="mt-section">
          <div className="rounded-lg bg-surface-dark p-xxl text-on-dark">
            <h2 className="text-heading-lg text-on-dark">Measured, not claimed.</h2>
            <p className="mt-md max-w-[620px] text-body-md text-on-dark-mute">
              Agents write the method; the system owns the measurement. The reported
              score always comes from the system running the sealed benchmark on the
              final method — never from anything the agent says it achieved. The agent
              is boxed into its workspace and cannot read or change the benchmark, so a
              high score has to be earned. That separation is what makes the ranking
              worth trusting.
            </p>
          </div>
        </section>

        {/* close: install + CTA */}
        <section className="mt-section flex flex-col items-center text-center">
          <h2 className="text-heading-lg text-ink">Point it at a goal.</h2>
          <p className="mt-xs max-w-[480px] text-body-md text-body">
            Run it locally and open the dashboard — describe what you want to improve
            and watch the pool go.
          </p>
          <div className="mt-lg flex w-full justify-center">
            <InstallSnippet command="python -m autoreduce" />
          </div>
          <Link
            href="/dashboard"
            className="mt-lg inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
          >
            Open the dashboard →
          </Link>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">
        © 2026 autoreduce
      </footer>
    </div>
  );
}
