import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "soft" | "on-dark";

const VARIANTS: Record<Variant, string> = {
  // the universal CTA pill (light on dark; dark text)
  primary: "bg-primary text-canvas active:bg-ink-deep",
  // outline on light canvas
  secondary: "bg-canvas text-ink border border-hairline-strong",
  // low-emphasis soft pill
  soft: "bg-surface-soft text-charcoal",
  // white pill on a dark surface
  "on-dark": "bg-canvas text-ink",
};

export function Pill({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-btn items-center justify-center rounded-full px-[20px] text-button-md font-medium transition-colors disabled:bg-surface-soft disabled:text-mute ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
