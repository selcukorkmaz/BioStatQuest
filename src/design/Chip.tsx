// <Chip tone="warn">Lapsed</Chip>
//
// Replaces the bespoke `<span className="chip" style={{background: "rgba(...)"}}>`
// pattern that was scattered across components. Tone tokens (info / warn /
// ok / err / neutral) are defined in src/design/tokens.ts and back the CSS
// custom properties in styles-legacy.css.

import * as React from "react";
import { toneStyle, type Tone } from "./tokens";

export type ChipProps = {
  tone?: Tone;
  /** Tighter padding/text for inline-table contexts. */
  size?: "sm" | "md";
  /** Optional icon slot — small SVG or emoji. */
  leading?: React.ReactNode;
  /** Pass-through for click handlers (e.g. filter chips). Plain decorative chips omit. */
  onClick?: React.MouseEventHandler;
  /** Tooltip text. */
  title?: string;
  className?: string;
  children: React.ReactNode;
};

export function Chip({
  tone = "neutral",
  size = "md",
  leading,
  onClick,
  title,
  className = "",
  children,
}: ChipProps) {
  const interactive = !!onClick;
  const sizeClasses = size === "sm"
    ? "text-[10px] px-1.5 py-0.5"
    : "text-[11px] px-2 py-0.5";

  return (
    <span
      onClick={onClick}
      title={title}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`inline-flex items-center gap-1 rounded-md font-semibold border ${sizeClasses} ${interactive ? "cursor-pointer hover:opacity-90" : ""} ${className}`}
      style={{ ...toneStyle(tone), borderWidth: 1, borderStyle: "solid" }}
    >
      {leading && <span className="shrink-0">{leading}</span>}
      {children}
    </span>
  );
}
