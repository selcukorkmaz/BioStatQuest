// <Card padding="md" tone="default" border="left-warn">…</Card>
//
// Wraps the `.card` CSS class (defined in styles-legacy.css) with explicit
// padding scale + optional left-accent border for warn/error/info banners.
// Lets components stop hand-rolling `card rounded-2xl p-5 sm:p-6` strings.

import * as React from "react";
import { type Tone } from "./tokens";

export type CardProps = {
  /** Padding scale. Defaults to "md" which matches the most common p-5 sm:p-6. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Border emphasis. "left-<tone>" adds a 4px left bar in that tone color. */
  border?: "none" | "left-info" | "left-warn" | "left-ok" | "left-err" | "left-neutral";
  /** Round the corners more or less than the default 1rem. */
  radius?: "lg" | "xl" | "2xl";
  /** Pass-through for click handlers when the card is interactive. */
  onClick?: React.MouseEventHandler;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "p-0",
  sm: "p-3 sm:p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

const RADIUS: Record<NonNullable<CardProps["radius"]>, string> = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

const BORDER_TONE: Partial<Record<NonNullable<CardProps["border"]>, Tone>> = {
  "left-info": "info",
  "left-warn": "warn",
  "left-ok": "ok",
  "left-err": "err",
  "left-neutral": "neutral",
};

const TONE_BORDER_COLOR: Record<Tone, string> = {
  neutral: "var(--neutral)",
  info: "var(--info)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  err: "var(--err)",
};

export function Card({
  padding = "md",
  border = "none",
  radius = "2xl",
  onClick,
  className = "",
  style,
  children,
}: CardProps) {
  const tone = border !== "none" ? BORDER_TONE[border] : null;
  const accentStyle: React.CSSProperties | undefined = tone
    ? { borderLeft: `4px solid ${TONE_BORDER_COLOR[tone]}`, ...style }
    : style;

  return (
    <div
      onClick={onClick}
      className={`card ${RADIUS[radius]} ${PADDING[padding]} ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={accentStyle}
    >
      {children}
    </div>
  );
}
