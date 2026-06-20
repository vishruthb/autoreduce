type Kind = "free" | "running" | "idle" | "thinking";

/** 6px dot. Grayscale only — no green/amber. The pulse is the one allowed
 *  liveness cue (gated behind prefers-reduced-motion in globals.css). */
export function StatusDot({
  kind,
  onDark = false,
}: {
  kind: Kind;
  onDark?: boolean;
}) {
  if (kind === "free" || kind === "idle") {
    return (
      <span
        className={`inline-block h-[6px] w-[6px] rounded-full border ${
          onDark ? "border-on-dark-mute" : "border-hairline-strong"
        }`}
      />
    );
  }
  return (
    <span
      className={`dot-running inline-block h-[6px] w-[6px] rounded-full ${
        onDark ? "bg-on-dark" : "bg-ink"
      }`}
    />
  );
}
