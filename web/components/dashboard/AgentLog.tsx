import { TrafficLights } from "@/components/ui/TrafficLights";

/** A nested terminal-card: traffic-lights header + rolling log lines. */
export function AgentLog({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg">
      <TrafficLights />
      <div className="mt-md max-h-40 overflow-auto font-mono text-code-sm leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-mute">no output yet</span>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={
                /^[✓▶💡⚙]/.test(line) ? "text-ink" : "text-mute"
              }
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
