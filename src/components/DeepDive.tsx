// @ts-nocheck
// Collapsible "Deep dive" panel shown after an answer is revealed. Shows the
// method's intuition, formula, assumptions, pitfalls, and further reading,
// plus a per-method mastery chip and a link into the glossary. Extracted from
// App.tsx because it's referenced by both CasePlay (inline) and CaseResult
// (post-run wrap-up).
import * as React from "react";
import { useState } from "react";
import { METHODS } from "../data/methods";
import { Ico } from "./Icons";
import { getMethodMastery } from "../lib/mastery";

export function DeepDive({ methodId, compact, srs, onOpenGlossary }) {
  const [open, setOpen] = useState(false);
  const m = methodId && METHODS[methodId];
  if (!m) return null;
  const mastery = getMethodMastery(methodId, srs || {});
  const masteryPct = mastery.total > 0 ? Math.round((mastery.reviewed / mastery.total) * 100) : 0;
  return (
    <div className={`mt-3 rounded-xl border border-slate-700/60 ${compact?"bg-slate-900/30":"bg-slate-900/50"}`}>
      <button
        onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/40 rounded-xl gap-2"
      >
        <span className="text-sm font-semibold text-cyan-300 truncate">Deep dive: {m.title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {mastery.total > 0 && (
            <span
              className="chip bg-slate-800/80 text-cyan-200"
              title={`${mastery.attempted}/${mastery.total} seen · ${mastery.reviewed} reviewed · ${mastery.mastered} mastered`}
            >
              {mastery.mastered > 0 ? (<span className="inline-flex items-center mr-1 align-[-0.1em]"><Ico name="star" size={12}/></span>) : null}{masteryPct}% mastery
            </span>
          )}
          <span className="text-xs text-slate-500">{open?"▲ collapse":"▼ learn more"}</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 text-sm text-slate-200 leading-relaxed fade-in">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Intuition</div>
            <div>{m.intuition}</div>
          </div>
          {m.formula && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Formula</div>
              <div className="mono text-cyan-200 bg-slate-950/60 rounded px-3 py-2 text-xs">{m.formula}</div>
            </div>
          )}
          {m.assumptions && m.assumptions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Assumptions</div>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">{m.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul>
            </div>
          )}
          {m.pitfalls && m.pitfalls.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber-500 font-semibold mb-1">Common pitfalls</div>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">{m.pitfalls.map((a,i)=><li key={i}>{a}</li>)}</ul>
            </div>
          )}
          {m.reading && m.reading.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Further reading</div>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">{m.reading.map((a,i)=><li key={i}>{a}</li>)}</ul>
            </div>
          )}
          {onOpenGlossary && (
            <div className="pt-1">
              <button
                onClick={() => onOpenGlossary({ selectedId: `method:${methodId}` })}
                className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-500/40 hover:decoration-cyan-300"
              >
                Open in glossary →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
