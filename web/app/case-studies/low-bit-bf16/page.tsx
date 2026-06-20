import type { Metadata } from "next";
import Link from "next/link";
import { TrafficLights } from "@/components/ui/TrafficLights";

export const metadata: Metadata = {
  title: "FP4 Search, BF16 Render - autoreduce",
  description:
    "Autoreduce case study for low-bit diffusion candidate search followed by BF16 final rendering on an 8 H100 GPU pool.",
};

const PROMPT = [
  "We are optimizing inference-time scaling for diffusion models.",
  "",
  "Improve final output quality per unit compute. Instead of spending the entire budget on BF16 best-of-N sampling, search over many low-bit candidates first, score them with cheap verifiers, and only regenerate the most promising candidates in BF16.",
  "",
  "You may change low-bit candidate budget N, BF16 rerender budget M, candidate precision, verifier stack, seed/config search, trajectory branching, adaptive compute per prompt, and multi-GPU candidate parallelism.",
  "",
  "Start with one-GPU experiments. If a method appears candidate-parallel or verifier-bottlenecked, propose 2-GPU or 4-GPU scale probes. Only recommend 8-GPU validation if the 4-GPU result still improves.",
];

const SETUP = [
  ["GPU pool", "8 H100 slots"],
  ["Model", "SANA-style diffusion model"],
  ["Prompt set", "500 prompts"],
  ["Resolution", "1024 x 1024"],
  ["Baseline", "BF16 best-of-N, equal GPU-second budget"],
  ["Primary metric", "quality-adjusted reward score"],
];

const BASELINES = [
  ["BF16 single sample", "0.612", "1.00x", "1.00x"],
  ["BF16 best-of-8", "0.681", "7.8x", "7.8x"],
  ["BF16 best-of-16", "0.704", "15.5x", "15.5x"],
];

const AGENTS = [
  ["A1", "FP8 search + BF16 top-4", "0.703", "4.9x", "54%", "keep"],
  ["A2", "FP4 search + BF16 top-8", "0.728", "6.2x", "63%", "scale candidate"],
  ["A3", "FP4 top-1 render", "0.691", "3.1x", "49%", "discard"],
  ["A4", "Random low-bit select + BF16", "0.676", "5.8x", "44%", "discard"],
  ["A5", "Adaptive prompt difficulty", "0.734", "6.5x", "66%", "scale candidate"],
  ["A6", "Trajectory branching", "0.719", "7.1x", "59%", "later"],
  ["A7", "OCR/spatial verifier routing", "0.721", "6.8x", "61%", "merge"],
  ["A8", "Cheap-first VLM top-k", "0.739", "8.4x", "68%", "scale candidate"],
];

const SCALE_SUMMARY = [
  ["FP4 search + BF16 top-8", "0.728", "0.741", "0.752", "0.754", "4 GPUs"],
  ["Adaptive prompt difficulty", "0.734", "0.751", "0.766", "0.768", "4 GPUs"],
  ["Cheap-first VLM top-k", "0.739", "0.758", "0.771", "0.773", "4 GPUs, verifier-bound"],
];

const CURVES = [
  { label: "FP4 + BF16 top-8", values: [0.728, 0.741, 0.752, 0.754], color: "#f4f4f5" },
  { label: "Adaptive difficulty", values: [0.734, 0.751, 0.766, 0.768], color: "#c9c9d2" },
  { label: "Cheap-first VLM top-k", values: [0.739, 0.758, 0.771, 0.773], color: "#a8a8b2" },
  { label: "BF16 best-of-8", values: [0.681, 0.681, 0.681, 0.681], color: "#71717a" },
  { label: "BF16 best-of-16", values: [0.704, 0.704, 0.704, 0.704], color: "#3f3f46" },
];

const LOG = [
  "[planner] goal: improve quality per compute for diffusion inference-time scaling",
  "[planner] phase: wide search",
  "[agent-03] proposed FP4 search + BF16 top-8 rerender",
  "[agent-05] proposed adaptive prompt difficulty policy",
  "[agent-08] proposed cheap-first verifier + VLM top-k",
  "[bench-01] FP4 top-8: 0.728 reward, 63% win vs BF16-Bo8",
  "[bench-04] adaptive policy: 0.734 reward, 58% win vs BF16-Bo16",
  "[planner] detected scale-sensitive candidate generation",
  "[planner] switching allocation: 4 one-GPU jobs + 1 four-GPU probe",
  "[bench-02] adaptive policy @ 4 GPUs: 0.766 reward, 69% win vs BF16-Bo16",
  "[bench-07] VLM top-k @ 4 GPUs: 0.771 reward, verifier cost 51%",
  "[planner] 8-GPU probe gives <0.3% reward gain",
  "[planner] decision: validate at 4 GPUs, return remaining GPUs to broad search",
];

const SEARCH_SPACE = [
  "N: low-bit candidates",
  "M: BF16 rerenders",
  "precision: FP8 / INT8 / FP4 / NVFP4",
  "verifier: cheap reward / OCR / spatial / VLM",
  "batch size",
  "GPU count",
  "candidate parallelism",
  "trajectory branching depth",
  "prompt difficulty policy",
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

function LineChart() {
  const labels = ["1", "2", "4", "8"];
  const xFor = (index: number) => 58 + index * 150;
  const yFor = (value: number) => 210 - ((value - 0.66) / 0.13) * 160;

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="overflow-x-auto">
        <svg className="min-w-[560px]" viewBox="0 0 570 260" role="img" aria-label="Reward scale curves">
          {[0.68, 0.72, 0.76].map((tick) => (
            <g key={tick}>
              <line x1="45" x2="525" y1={yFor(tick)} y2={yFor(tick)} stroke="#27272a" />
              <text x="0" y={yFor(tick) + 4} fill="#71717a" fontSize="12">
                {tick.toFixed(2)}
              </text>
            </g>
          ))}
          {labels.map((gpu, index) => (
            <text key={gpu} x={xFor(index) - 12} y="238" fill="#71717a" fontSize="12">
              {gpu} GPU
            </text>
          ))}
          {CURVES.map((curve) => {
            const points = curve.values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
            return (
              <g key={curve.label}>
                <polyline
                  fill="none"
                  points={points}
                  stroke={curve.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
                {curve.values.map((value, index) => (
                  <circle
                    key={`${curve.label}-${index}`}
                    cx={xFor(index)}
                    cy={yFor(value)}
                    fill="#0b0b0c"
                    r="4"
                    stroke={curve.color}
                    strokeWidth="2"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-md grid gap-sm md:grid-cols-2 lg:grid-cols-3">
        {CURVES.map((curve) => (
          <div key={curve.label} className="flex items-center gap-sm">
            <span className="h-[3px] w-[28px] rounded-full" style={{ backgroundColor: curve.color }} />
            <span className="text-body-sm text-body">{curve.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ rows, headers }: { rows: string[][]; headers: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-body-sm">
        <thead className="bg-surface-soft text-caption-sm uppercase tracking-[0.12em] text-mute">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-md py-sm font-normal">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")} className="border-t border-hairline">
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
  );
}

export default function LowBitBf16CaseStudyPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-dash flex-col px-lg">
      <main className="flex-1 pb-section pt-xl">
        <section className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              case study 02
            </p>
            <h1 className="mt-sm max-w-[780px] text-display-xl text-ink">
              FP4 search, BF16 render.
            </h1>
            <p className="mt-md max-w-[720px] text-body-md text-body">
              Autoreduce searched for a diffusion inference-time scaling policy that uses low-bit
              candidate generation as a cheap proposal mechanism, then spends BF16 only on selected
              final renders.
            </p>
            <div className="mt-lg rounded-lg border border-hairline-strong bg-surface-soft p-md">
              <p className="text-body-sm text-body">
                The useful result was not maxing out all eight GPUs. The planner found that
                quality improved through four GPUs, then verifier cost started to dominate.
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
          <MetricCard label="baseline to beat" value="0.704" body="BF16 best-of-16 under the equal GPU-second reference." />
          <MetricCard label="best reward" value="0.771" body="The best reward came from 4-GPU VLM top-k, but verifier cost dominated." />
          <MetricCard label="selected point" value="4 GPUs" body="The 8-GPU probe barely moved reward, so extra slots returned to search." />
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
            <div className="border-b border-hairline p-xl">
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                baselines
              </p>
              <h2 className="mt-sm text-heading-lg text-ink">BF16 best-of-N reference points</h2>
            </div>
            <DataTable rows={BASELINES} headers={["Method", "Reward", "Wall-clock", "GPU-sec"]} />
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-xl">
            <h3 className="text-heading-md text-ink">Why search over regimes?</h3>
            <ul className="mt-md space-y-sm text-body-sm text-body">
              {SEARCH_SPACE.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-section">
          <div className="flex flex-col justify-between gap-md md:flex-row md:items-end">
            <div>
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                scale probes
              </p>
              <h2 className="mt-sm text-display-lg text-ink">Quality improved until 4 GPUs, then flattened</h2>
            </div>
            <p className="max-w-[520px] text-body-sm text-body">
              A flat leaderboard says which method won. A scale curve says where it is worth
              running.
            </p>
          </div>
          <div className="mt-xl">
            <LineChart />
          </div>
        </section>

        <section className="mt-section">
          <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
            <div className="border-b border-hairline p-xl">
              <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
                multi-gpu summary
              </p>
              <h2 className="mt-sm text-heading-lg text-ink">Best point by method</h2>
            </div>
            <DataTable rows={SCALE_SUMMARY} headers={["Method", "1 GPU", "2 GPUs", "4 GPUs", "8 GPUs", "Best point"]} />
          </div>
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              problem
            </p>
            <h2 className="mt-sm text-display-lg text-ink">Low-bit search, high-precision render</h2>
            <p className="mt-md text-body-md text-body">
              Diffusion inference-time scaling usually spends extra compute by generating more
              high-precision samples or increasing denoising steps. Autoreduce asked whether cheap
              low-bit candidate rankings transfer well enough to BF16 regenerated outputs to beat
              BF16 best-of-N at equal or lower compute.
            </p>
          </div>
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <pre className="overflow-x-auto font-mono text-code-sm leading-relaxed text-body">
              Prompt{"\n"}
              {"  ->"} generate many low-bit candidates{"\n"}
              {"  ->"} score candidates with verifier{"\n"}
              {"  ->"} select top M candidates{"\n"}
              {"  ->"} regenerate selected candidates in BF16{"\n"}
              {"  ->"} rescore final renders{"\n"}
              {"  ->"} return best output
            </pre>
          </div>
        </section>

        <section className="mt-section grid gap-xl lg:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-code-sm uppercase tracking-[0.16em] text-mute">
              planner prompt
            </p>
            <h2 className="mt-sm text-display-lg text-ink">What the planner optimized</h2>
            <p className="mt-md text-body-md text-body">
              The prompt asks the system to search over candidate count, rerender budget, precision,
              verifier stack, branching policy, and GPU topology.
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
              <h2 className="mt-sm text-display-lg text-ink">Eight agents, eight search policies</h2>
            </div>
            <p className="max-w-[520px] text-body-sm text-body">
              The first round tested low-bit precision, top-M rerender budgets, random controls,
              prompt-aware routing, trajectory branching, and verifier cost tradeoffs.
            </p>
          </div>
          <div className="mt-xl overflow-hidden rounded-lg border border-hairline bg-canvas">
            <DataTable
              rows={AGENTS}
              headers={["Agent", "Method", "Reward", "GPU-sec", "Win vs BF16-Bo8", "Decision"]}
            />
          </div>
        </section>

        <section className="mt-section">
          <div className="rounded-lg border border-hairline bg-canvas p-lg">
            <TrafficLights />
            <pre className="mt-md overflow-x-auto whitespace-pre-wrap font-mono text-code-sm leading-relaxed text-body">
              {LOG.join("\n")}
            </pre>
          </div>
        </section>

        <section className="mt-section flex flex-col items-center text-center">
          <h2 className="text-heading-lg text-ink">Read the companion case study.</h2>
          <p className="mt-xs max-w-[560px] text-body-md text-body">
            The speculative decoding case study shows the same scale-aware search pattern on LLM
            serving and batching.
          </p>
          <Link
            href="/case-studies/speculative-decoding"
            className="mt-lg inline-flex h-btn items-center rounded-full bg-primary px-[20px] text-button-md font-medium text-canvas active:bg-ink-deep"
          >
            Speculative decoding case study
          </Link>
        </section>
      </main>

      <footer className="py-lg text-center text-caption-sm text-mute">© 2026 autoreduce</footer>
    </div>
  );
}
