import { TrafficLights } from "@/components/ui/TrafficLights";

const LINES: { text: string; tone: "mute" | "ink" }[] = [
  { text: "$ python -m autoreduce", tone: "ink" },
  { text: "# planner online · objective: maximize tokens_per_second · budget 40", tone: "mute" },
  { text: "GPU0  busy   exploit   nspec=4 bs=32      tps=57.05  ★ best", tone: "ink" },
  { text: "GPU1  busy   explore   nspec=7 bs=8       running 0:06", tone: "ink" },
  { text: "GPU2  busy   exploit   nspec=4 bs=64      tps=54.31", tone: "ink" },
  { text: "GPU3  free   —", tone: "mute" },
  { text: "...                                       23 / 40 evaluated", tone: "mute" },
  { text: "# serving dashboard on http://localhost:8000", tone: "mute" },
];

/** The home page's only product preview — a static terminal-card mock of the
 *  pool, ranked table, and budget the live dashboard shows. */
export function TerminalPreview() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <TrafficLights />
      <pre className="mt-md overflow-x-auto font-mono text-code-sm leading-relaxed">
        {LINES.map((l, i) => (
          <div key={i} className={l.tone === "ink" ? "text-ink" : "text-mute"}>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
