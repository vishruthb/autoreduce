/** macOS traffic-light dots — only ever inside a terminal-card. */
export function TrafficLights() {
  return (
    <div className="flex items-center gap-xs">
      <span className="h-3 w-3 rounded-full bg-term-red" />
      <span className="h-3 w-3 rounded-full bg-term-yellow" />
      <span className="h-3 w-3 rounded-full bg-term-green" />
    </div>
  );
}
