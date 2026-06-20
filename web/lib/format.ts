/** Elapsed seconds (epoch float) -> "m:ss". */
export function elapsedClock(sinceEpoch: number | null, nowEpoch: number): string {
  if (sinceEpoch == null) return "—";
  const s = Math.max(0, Math.floor(nowEpoch - sinceEpoch));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Round a metric to a readable precision. */
export function formatMetric(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(4).replace(/\.?0+$/, "");
}

/** Compact one-line mono summary of a config object. */
export function summarizeConfig(config: Record<string, unknown>): string {
  return Object.keys(config)
    .sort()
    .map((k) => `${k}=${formatValue(config[k])}`)
    .join("  ");
}

function formatValue(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  }
  return String(v);
}
