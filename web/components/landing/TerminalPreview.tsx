import { TrafficLights } from "@/components/ui/TrafficLights";

const FLOW = [
  "Goal",
  "Planner",
  "Agents",
  "Experiments",
  "GPU Scheduler",
  "Sealed Metrics",
  "Scale Curves",
];

const LINES: { text: string; tone: "mute" | "ink" }[] = [
  { text: "$ python -m autoreduce", tone: "ink" },
  { text: "# 8 H100 pool · elastic agents · sealed benchmark queue", tone: "mute" },
  { text: "agents       active 12       benchmark jobs 8 running", tone: "ink" },
  { text: "scheduler    wide -> mixed   4 x 1-GPU + 1 x 4-GPU probe", tone: "ink" },
  { text: "scale curve  candidate-parallel drafting   1.06x -> 1.41x", tone: "ink" },
  { text: "planner      8-GPU probe flat · use 4-GPU point · keep searching", tone: "mute" },
];

export function TerminalPreview() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <TrafficLights />
      <div className="mt-md flex flex-wrap items-center gap-sm">
        {FLOW.map((step, index) => (
          <div key={step} className="flex items-center gap-sm">
            <span className="rounded-full border border-hairline-strong px-md py-xs text-body-sm text-ink">
              {step}
            </span>
            {index < FLOW.length - 1 ? <span className="text-mute">-&gt;</span> : null}
          </div>
        ))}
      </div>
      <pre className="mt-lg overflow-x-auto font-mono text-code-sm leading-relaxed">
        {LINES.map((l, i) => (
          <div key={i} className={l.tone === "ink" ? "text-ink" : "text-mute"}>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
