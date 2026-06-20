/** The only illustration in the system: a line-drawn "reduce/funnel" mark,
 *  stroke-only in ink. Rendered at fixed pixel sizes like a logo. */
export function Mascot({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 10h32" />
      <path d="M8 10 22 27v11l4 3V27L40 10" />
      <circle cx="24" cy="44" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
