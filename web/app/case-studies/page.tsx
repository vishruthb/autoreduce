import type { Metadata } from "next";
import Link from "next/link";
import { TrafficLights } from "@/components/ui/TrafficLights";

export const metadata: Metadata = {
  title: "Case studies - autoreduce",
  description:
    "Autoreduce case studies showing scale-aware autoresearch across speculative decoding and low-bit diffusion inference.",
};

const CASE_STUDIES = [
  {
    href: "/case-studies/speculative-decoding",
    eyebrow: "case study 01",
    title: "Speculative decoding batching",
    body:
      "An 8 H100 run where Autoreduce searches request grouping, adaptive draft length, KV-aware batching, and multi-GPU candidate parallelism.",
    stats: [
      ["GPU pool", "8 H100"],
      ["best scaled", "1.31x"],
      ["best point", "4 of 8"],
    ],
  },
  {
    href: "/case-studies/low-bit-bf16",
    eyebrow: "case study 02",
    title: "FP4 search, BF16 render",
    body:
      "A diffusion inference-time scaling run where low-bit candidate search feeds BF16 rerenders and the planner learns where 8 GPUs stop paying off.",
    stats: [
      ["GPU pool", "8 H100"],
      ["best scaled", "0.771"],
      ["best point", "4 of 8"],
    ],
  },
];

const LOG = [
  "$ python -m autoreduce",
  "[planner] run digest contains leaderboards, queue pressure, and scale curves",
  "[scheduler] wide search -> mixed probes -> validation",
  "[result] methods are ranked by sealed metrics, not agent claims",
];

export default function CaseStudiesIndexPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        <section className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              case studies
            </p>
            <h1 className="mt-sm max-w-[780px] text-display-xl text-ink">
              Real run narratives for distributed autoresearch.
            </h1>
            <p className="mt-md max-w-[720px] text-body-md text-body">
              Each case study shows the same core loop: broad agent search, sealed measurements,
              multi-GPU probes, scale curves, and a planner decision about where scaling stops
              paying off.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <pre className="mt-md overflow-x-auto whitespace-pre-wrap font-mono text-code-sm leading-relaxed text-body">
              {LOG.join("\n")}
            </pre>
          </div>
        </section>

        <section className="mt-section grid gap-md lg:grid-cols-2">
          {CASE_STUDIES.map((study) => (
            <Link
              key={study.href}
              href={study.href}
              className="rounded-lg border border-hairline bg-canvas p-xl hover:border-hairline-strong hover:bg-surface-soft"
            >
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                {study.eyebrow}
              </p>
              <h2 className="mt-sm text-heading-lg text-ink">{study.title}</h2>
              <p className="mt-md text-body-md text-body">{study.body}</p>
              <div className="mt-lg grid grid-cols-3 gap-sm border-t border-hairline pt-md">
                {study.stats.map(([label, value]) => (
                  <div key={label}>
                    <p className="text-caption-sm text-mute">{label}</p>
                    <p className="font-mono text-code-sm text-ink">{value}</p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-section rounded-lg bg-surface-dark p-xxl text-on-dark">
          <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-on-dark-mute">
            thesis
          </p>
          <h2 className="mt-sm text-heading-lg text-on-dark">
            Most autoresearch systems produce leaderboards. Autoreduce produces scale curves.
          </h2>
          <p className="mt-md max-w-[820px] text-body-md text-on-dark-mute">
            A method is not good or bad in isolation. It is good under a resource regime. These
            case studies show the planner deciding what information is worth buying next, the
            scheduler deciding how to buy it, and the sealed benchmark deciding whether it worked.
          </p>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">© 2026 autoreduce</footer>
    </div>
  );
}
