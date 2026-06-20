import { TrafficLights } from "@/components/ui/TrafficLights";

const LINES: { text: string; tone: "mute" | "ink" }[] = [
  { text: "$ python -m autoreduce", tone: "ink" },
  { text: "# planner online · objective derived from your prompt · budget 40", tone: "mute" },
  { text: "W0  busy   exploit   batched transform           1.58×  ★ best", tone: "ink" },
  { text: "W1  busy   explore   memory-map + lazy parse     running 0:06", tone: "ink" },
  { text: "W2  busy   exploit   background prefetch queue    1.42×", tone: "ink" },
  { text: "W3  free   —", tone: "mute" },
  { text: "...                                              23 / 40 evaluated", tone: "mute" },
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
