// <Stat label="XP" value={1697} />
//
// The label-over-mono-number cluster that appears in every roster row,
// dashboard tile, and analytics panel. Auto-applies fmtNumber when value
// is a number; pass-through string for non-numeric content (em-dash for
// missing data, etc.).

import * as React from "react";
import { fmtNumber } from "../lib/format";

export type StatProps = {
  label: string;
  value: number | string | null | undefined;
  /** Tone affects only the value color. */
  tone?: "default" | "ok" | "warn" | "err";
  /** Optional caption under the value (e.g. "vs last week"). */
  hint?: string;
  className?: string;
};

const TONE_COLOR: Record<NonNullable<StatProps["tone"]>, string> = {
  default: "text-slate-100",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  err: "text-red-300",
};

export function Stat({ label, value, tone = "default", hint, className = "" }: StatProps) {
  const display = typeof value === "number" ? fmtNumber(value) : (value ?? "—");
  return (
    <div className={className}>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm font-semibold mono ${TONE_COLOR[tone]}`}>{display}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}
