import type { HTMLAttributes } from "react";

/** Elevation level 1: 1px hairline, 12px radius, no shadow. */
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-canvas ${className}`}
      {...props}
    />
  );
}
