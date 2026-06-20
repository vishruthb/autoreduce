import type { Origin } from "@/lib/api";

// Grayscale pills only — distinction by fill density + border, never hue, and
// never a black pill (that budget belongs to the CTA/planner).
const STYLES: Record<Origin, string> = {
  seed: "bg-surface-soft text-mute",
  explore: "bg-surface-soft text-charcoal border border-hairline",
  exploit: "bg-charcoal/10 text-ink",
};

const GLYPH: Record<Origin, string> = {
  seed: "·",
  explore: "+",
  exploit: "↑",
};

export function OriginTag({ origin }: { origin: Origin }) {
  return (
    <span
      className={`inline-flex items-center gap-xxs rounded-full px-[10px] py-[3px] font-mono text-caption-sm ${STYLES[origin]}`}
    >
      <span aria-hidden>{GLYPH[origin]}</span>
      {origin}
    </span>
  );
}
