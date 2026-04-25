// <SectionLabel>Members</SectionLabel>
//
// The tiny uppercase tracking-widest label that titles every panel/card
// section. Replaces the eight-or-nine bespoke
// `text-[10px] uppercase tracking-widest text-slate-400 font-bold`
// strings that appear across TeachView, MyClassesBand, InsightsTab.

import * as React from "react";

export type SectionLabelProps = {
  /** Visual emphasis. "subtle" is the default slate-500; "strong" is slate-300. */
  tone?: "subtle" | "strong";
  /** Optional badge / count after the label, e.g. "Members · 12". */
  count?: number | string;
  className?: string;
  children: React.ReactNode;
};

export function SectionLabel({ tone = "subtle", count, className = "", children }: SectionLabelProps) {
  const colorClass = tone === "strong" ? "text-slate-300" : "text-slate-400";
  return (
    <div
      className={`text-[10px] uppercase tracking-widest font-bold ${colorClass} ${className}`}
    >
      {children}
      {count !== undefined && count !== null && count !== "" && (
        <span className="ml-2 font-semibold opacity-70">· {count}</span>
      )}
    </div>
  );
}
