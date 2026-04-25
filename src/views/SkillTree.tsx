// @ts-nocheck
// Skill Tree view — collapsible per-branch case browser.
//
// Extracted from App.tsx (Phase 6) so the route is lazy-loadable and
// the monolith shrinks. Behavior is unchanged from the inline version;
// only the file location moved + dependencies are now explicit imports.
//
// Renders 8 branches; each opens to a list of cases with completion
// state, best score, and a per-case Start/Replay/Unlock button. The
// Pro lock chip is currently always-off (see lib/access.ts) — the surface
// is wired so future gating is a one-file flip.

import * as React from "react";
import { useState, useEffect } from "react";
import { CASES } from "../data/cases";
import { BRANCHES } from "../data/branches";
import { BRANCH_ICON, Ico } from "../components/Icons";
import { DIFFICULTIES } from "../lib/difficulty";
import { useSubscription } from "../components/SubscriptionPanel";
import { isCaseLockedForUser } from "../lib/access";

type Props = {
  state: any;
  onStartCase: (caseId: string) => void;
  initialBranch: string | null;
};

export default function SkillTree({ state, onStartCase, initialBranch }: Props) {
  const [openBranch, setOpenBranch] = useState<string | null>(initialBranch || null);
  useEffect(() => { if (initialBranch) setOpenBranch(initialBranch); }, [initialBranch]);
  const { sub } = useSubscription();
  const userType = sub?.user_type;
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 fade-in">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Skill Tree</h2>
        <p className="text-slate-400 text-sm mt-1">8 branches · {CASES.length} cases · {CASES.reduce((s,c)=>s+c.bank.length,0)}+ unique questions. Every replay draws a fresh set.</p>
      </div>
      <div className="space-y-3 sm:space-y-4">
        {Object.entries(BRANCHES).map(([k, b]) => {
          const cases = CASES.filter(c => c.branch === k);
          const done = cases.filter(c => state.completed.includes(c.id)).length;
          const open = openBranch === k;
          return (
            <div key={k} className="card rounded-2xl overflow-hidden transition-all">
              <button onClick={()=>setOpenBranch(open?null:k)}
                className="w-full text-left p-4 sm:p-5 hover:bg-white/5 transition"
                style={{ background: `linear-gradient(145deg, ${b.color}30, transparent)` }}>
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <span className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 inline-block" style={{color: b.color}}>
                      {BRANCH_ICON[k] || <Ico name={b.icon} size={36}/>}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-base sm:text-lg truncate">{b.name}</div>
                      <div className="text-xs text-slate-300 line-clamp-2">{b.desc}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base sm:text-lg font-bold text-white">{done}/{cases.length}</div>
                    <div className="text-xs text-slate-400">{open?"▲":"▼"}</div>
                  </div>
                </div>
                <div className="bar mt-3"><div style={{width: cases.length?(done/cases.length*100)+"%":"0%"}}></div></div>
              </button>
              {open && (
                <div className="p-4 border-t border-purple-900/20 grid md:grid-cols-2 gap-2">
                  {cases.map(c => {
                    const isDone = state.completed.includes(c.id);
                    const best = state.caseScores[c.id];
                    const seen = (state.seenQuestions[c.id]||[]).length;
                    const locked = isCaseLockedForUser(c.id, userType);
                    return (
                      <div key={c.id} className={`rounded-xl p-4 border ${locked ? "bg-slate-950/60 border-slate-800 opacity-80" : isDone ? "bg-emerald-900/10 border-emerald-700/40" : "bg-slate-900/40 border-slate-800"}`}>
                        <div className="flex justify-between items-start gap-3 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                              {isDone && <span className="text-emerald-400 inline-flex items-center"><Ico name="check" size={14}/></span>}
                              <span className={locked ? "text-slate-300" : ""}>{c.title}</span>
                              {locked && <span className="chip text-[10px] bg-amber-900/40 text-amber-300">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline mr-0.5"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                                Pro
                              </span>}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              Min: <span style={{color:(DIFFICULTIES[c.diffMin]||{}).color||"#94a3b8"}}>{(DIFFICULTIES[c.diffMin]||{}).name||c.diffMin}</span>
                              {" · "}{c.bank.length} Q in bank · {c.qPerRun} per run
                              {best!==undefined && <span className="ml-2 text-amber-400">Best: {best}%</span>}
                              {seen > 0 && <span className="ml-2 text-slate-500">({seen}/{c.bank.length} seen)</span>}
                            </div>
                          </div>
                          <button
                            onClick={()=>onStartCase(c.id)}
                            className={`px-4 py-2 rounded-lg text-sm ${locked ? "btn btn-ghost" : "btn btn-primary"}`}>
                            {locked ? "Unlock →" : isDone ? "Replay" : "Start"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
