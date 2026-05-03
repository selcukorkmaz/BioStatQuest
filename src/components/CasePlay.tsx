// @ts-nocheck
// Primary gameplay surface — single-question play loop with timer, answer
// reveal, narrative act intros, inline DeepDive, and FSRS grading. Also
// exports the small helpers tightly coupled to the play loop:
//   - ReportQuestionLink (per-question issue report)
//   - FSRSGradeBar       (Again/Hard/Good/Easy after reveal)
import * as React from "react";
import { useState, useEffect } from "react";
import { CASES } from "../data/cases";
import { getNarrative, getActForQid } from "../data/caseNarratives";
import { gradeCard as srsGradeCard } from "../lib/srs";
import { DIFFICULTIES, REVIEW_CASE_ID } from "../lib/difficulty";
import { fmtDate } from "../lib/format";
import { METHODS } from "../data/methods";
import { createClient } from "@supabase/supabase-js";
import { getHint } from "../lib/methodHints";
import { Ico } from "./Icons";
import { DeepDive } from "./DeepDive";

// Reaches into the active Supabase session for the access token. We can't
// pull from BQAuth (it doesn't expose getSession), so build a transient
// client just to read the cached session — same pattern as billing.ts.
async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const w = window as any;
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || w.__SUPABASE_URL || "";
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || w.__SUPABASE_ANON_KEY || "";
    if (!url || !key) return null;
    const c = createClient(url, key);
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

// F3 — HintPanel: pre-reveal layered hint affordance scoped to the
// question's `method`. Layer 1 (orienting) is free; layers 2 and 3
// (structural / partial walkthrough) are Pro-only and degrade to a
// soft upgrade prompt for free users. Calling `onHintRevealed()` once
// per question lets the parent flag hint_used=true on telemetry.
function HintPanel({ method, isPro, onHintRevealed }) {
  const hint = React.useMemo(() => getHint(method), [method]);
  const [shown, setShown] = useState(0);   // 0 = none, 1/2/3 = layers shown
  const [pinged, setPinged] = useState(false);

  useEffect(() => {
    setShown(0); setPinged(false);
  }, [method]);

  if (!hint.layer1) return null;

  function reveal(layer) {
    if (layer === 1 || isPro || (hint as any)[`layer${layer}`] === undefined) {
      // Free Layer 1 (always allowed) or Pro user (any layer) — reveal.
      setShown(Math.max(shown, layer));
      if (!pinged) { setPinged(true); onHintRevealed?.(); }
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold inline-flex items-center gap-1.5">
          <Ico name="orb" size={11}/> Hint
        </div>
        <div className="text-[10px] text-slate-600 mono">layered · pro unlocks deeper layers</div>
      </div>

      {shown === 0 ? (
        <button
          onClick={() => reveal(1)}
          className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">
          Show first hint →
        </button>
      ) : (
        <div className="space-y-2 text-sm text-slate-200">
          {shown >= 1 && hint.layer1 && (
            <div className="leading-relaxed">
              <span className="text-[10px] uppercase tracking-widest text-cyan-300 mr-2">L1</span>
              {hint.layer1}
            </div>
          )}
          {shown >= 2 && hint.layer2 && (
            <div className="leading-relaxed">
              <span className="text-[10px] uppercase tracking-widest text-purple-300 mr-2">L2</span>
              {hint.layer2}
            </div>
          )}
          {shown >= 3 && hint.layer3 && (
            <div className="leading-relaxed">
              <span className="text-[10px] uppercase tracking-widest text-amber-300 mr-2">L3</span>
              {hint.layer3}
            </div>
          )}

          {/* Next-layer affordance — gated by Pro for layers 2 and 3 */}
          {shown < 3 && (hint as any)[`layer${shown + 1}`] && (
            isPro ? (
              <button
                onClick={() => reveal((shown + 1) as any)}
                className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs mt-2">
                Show layer {shown + 1} →
              </button>
            ) : (
              <div className="mt-2 text-[11px] text-slate-500 italic">
                Layer {shown + 1} (and beyond) is a Pro feature — structural and partial-walkthrough hints.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// F15 — AskTutor: scoped, single-turn AI explainer that opens a modal
// from the reveal panel. POSTs the bounded question context to
// /api/ai/explain and renders the reply. Disabled for guests; the
// server enforces quota for free-tier users.
function AskTutor({ step, current, caseId }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState("");
  const [quotaHit, setQuotaHit] = useState(false);

  const signedIn = !!(window as any).BQAuth?.getUser?.();

  async function ask() {
    if (!msg.trim()) return;
    setBusy(true); setErr(""); setReply(""); setQuotaHit(false);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Please sign in first.");
      const methodTitle = step.method ? (METHODS as any)[step.method]?.title : undefined;
      const r = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qid:          step.qid,
          caseId,
          stem:         step.q,
          options:      step.options,
          correctIndex: step.answer,
          pickedIndex:  current,
          baseExplain:  step.explain,
          methodTitle,
          userMessage:  msg.trim().slice(0, 500),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setQuotaHit(true);
        setErr(j?.error || "Weekly quota reached.");
      } else if (!r.ok) {
        setErr(j?.error || `Request failed (${r.status})`);
      } else {
        setReply(String(j.reply || "").trim() || "(no reply)");
      }
    } catch (e: any) {
      setErr(e?.message || "Could not reach the tutor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-3">
        <button
          onClick={() => { setOpen(true); setMsg(""); setReply(""); setErr(""); setQuotaHit(false); }}
          className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
          title={signedIn ? "Ask a one-question AI tutor (free tier limited)" : "Sign in to use the tutor"}>
          <Ico name="orb" size={12}/> Ask the tutor
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background: "rgba(2,6,23,0.7)"}}>
          <div className="card premium-border rounded-2xl max-w-lg w-full p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white inline-flex items-center gap-2"><Ico name="orb" size={16}/> Ask the tutor</h3>
              <button onClick={()=>setOpen(false)} className="text-slate-400 hover:text-white inline-flex items-center"><Ico name="close" size={16}/></button>
            </div>

            {!signedIn ? (
              <div className="text-sm text-slate-300">
                <p className="mb-3">Sign in to use the AI tutor. Free accounts get 5 questions per week; Pro is unlimited.</p>
                <button onClick={()=>setOpen(false)} className="btn btn-ghost px-5 py-2 rounded-lg text-sm">Close</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-2 leading-relaxed">
                  Scoped to <span className="mono text-slate-300">{step.qid}</span>. Off-topic questions will be declined.
                </p>
                <textarea
                  value={msg}
                  onChange={e => setMsg(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="e.g. why is the CI not a probability about the parameter?"
                  className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"
                  disabled={busy}/>
                <div className="text-[10px] text-slate-500 mono text-right mt-1">{msg.length}/500</div>

                {err && (
                  <div className={`text-xs mt-2 ${quotaHit ? "text-amber-300" : "text-red-400"}`}>
                    {err}
                    {quotaHit && (
                      <span className="ml-1 text-slate-400">
                        Pro tier removes the limit.
                      </span>
                    )}
                  </div>
                )}

                {reply && (
                  <div className="mt-4 p-3 rounded-lg bg-cyan-950/30 border border-cyan-700/40">
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-1">Tutor</div>
                    <div className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">{reply}</div>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button onClick={()=>setOpen(false)} className="btn btn-ghost px-4 py-2 rounded-lg text-sm flex-1">Close</button>
                  <button
                    onClick={ask}
                    disabled={busy || !msg.trim()}
                    className="btn btn-primary px-4 py-2 rounded-lg text-sm flex-1 disabled:opacity-40">
                    {busy ? "Asking…" : reply ? "Ask again" : "Ask"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Small, unobtrusive "Report an issue" link shown after an answer is revealed.
// Opens a modal where signed-in users can flag a question (wrong answer key,
// wrong explanation, typo, ambiguous wording, other). Guests see a hint to sign in.
// Writes to public.question_reports (RLS: users can only read their own).
function ReportQuestionLink({ qid, caseId }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("wrong_answer");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());

  async function submit() {
    setBusy(true); setErr("");
    try {
      await window.BQAuth.submitQuestionReport({ qid, caseId, reason, comment });
      window.BQAuth?.logEvent?.("report_filed", { qid, caseId, data: { reason } });
      setDone(true);
    } catch (e) {
      setErr((e && e.message) || "Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] uppercase tracking-widest text-slate-500 mono">qid: {qid}</div>
        <button
          onClick={() => { setOpen(true); setDone(false); setErr(""); setComment(""); setReason("wrong_answer"); }}
          className="text-xs text-slate-400 hover:text-white underline underline-offset-2">
          Report an issue with this question
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background: "rgba(2,6,23,0.7)"}}>
          <div className="card premium-border rounded-2xl max-w-md w-full p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Report a question</h3>
              <button onClick={()=>setOpen(false)} className="text-slate-400 hover:text-white inline-flex items-center"><Ico name="close" size={16}/></button>
            </div>
            {done ? (
              <div className="text-sm text-slate-200">
                <p className="mb-3">Thanks — flagged for review. Typical triage within 72 hours.</p>
                <p className="text-xs text-slate-400 mono">qid: {qid}</p>
                <button onClick={()=>setOpen(false)} className="btn btn-primary px-5 py-2 rounded-lg mt-4 text-sm">Close</button>
              </div>
            ) : !signedIn ? (
              <div className="text-sm text-slate-300">
                <p className="mb-3">Sign in to flag a question — it lets us follow up if needed and prevents spam.</p>
                <button onClick={()=>setOpen(false)} className="btn btn-ghost px-5 py-2 rounded-lg text-sm">Close</button>
              </div>
            ) : (
              <div className="text-sm">
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">What's wrong?</label>
                <div className="space-y-1.5 mb-4">
                  {[
                    ["wrong_answer", "The answer key is wrong"],
                    ["wrong_explain", "The explanation is wrong or misleading"],
                    ["typo", "Typo or formatting issue"],
                    ["ambiguous", "Ambiguous — more than one option fits"],
                    ["other", "Something else"],
                  ].map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 p-2 rounded hover:bg-slate-800/40 cursor-pointer">
                      <input type="radio" name="report-reason" value={val} checked={reason===val} onChange={()=>setReason(val)}/>
                      <span className="text-slate-200">{label}</span>
                    </label>
                  ))}
                </div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">Optional: what should it be?</label>
                <textarea
                  value={comment} onChange={e=>setComment(e.target.value.slice(0, 1000))}
                  rows={3} placeholder="e.g. the correct option is B, not C, because…"
                  className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"/>
                <div className="text-[10px] text-slate-500 mono text-right mt-1">{comment.length}/1000</div>
                {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
                <div className="flex gap-2 mt-4">
                  <button onClick={()=>setOpen(false)} className="btn btn-ghost px-4 py-2 rounded-lg text-sm flex-1">Cancel</button>
                  <button onClick={submit} disabled={busy} className="btn btn-primary px-4 py-2 rounded-lg text-sm flex-1 disabled:opacity-40">
                    {busy ? "Sending…" : "Send report"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Distractor-specific feedback panel. When the learner picks a wrong option
// that has a per-option explanation defined on the question, surface it here
// — placed *above* the generic `step.explain` so feedback first addresses
// the specific misconception they fell into. Silent when the answer is
// correct or no per-option content is authored. (F1 — v2.0 plan.)
//
// `misconceptionCounts` (F8) is an optional tag→count map of how many times
// the learner has matched each misconception in the last 60 days. When the
// chosen distractor's tag appears with count ≥ REPEAT_THRESHOLD, we surface
// a "× N times" repeat-offender chip alongside the generic badge.
const REPEAT_THRESHOLD = 3;

export function DistractorFeedback({ step, correct, current, misconceptionCounts = {} }) {
  if (correct) return null;
  if (!step.optionExplanations && !step.misconceptionTag) return null;

  const tagged = (idx) => {
    const why = step.optionExplanations?.[idx];
    const tag = step.misconceptionTag?.[idx];
    if (!why && !tag) return null;
    const letter = String.fromCharCode(65 + idx);
    const repeatCount = (tag && misconceptionCounts?.[tag]?.count) || 0;
    return (
      <div key={idx} className="mb-3 rounded-lg border border-red-700/40 bg-red-950/30 p-3">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-red-300 font-bold mono">Your pick · {letter}</span>
          {tag && (
            <span className="chip bg-amber-900/40 text-amber-200 text-[10px] inline-flex items-center gap-1">
              <Ico name="warning" size={10}/> Common misconception
            </span>
          )}
          {tag && repeatCount >= REPEAT_THRESHOLD && (
            <span className="chip bg-rose-900/50 text-rose-200 text-[10px] inline-flex items-center gap-1" title="How many times you've matched this misconception in the last 60 days">
              <Ico name="refresh" size={10}/> × {repeatCount} times
            </span>
          )}
        </div>
        {why && <div className="text-sm text-slate-200 leading-relaxed">{why}</div>}
      </div>
    );
  };

  if (step.type === "mcq" && typeof current === "number") {
    return tagged(current);
  }
  if (step.type === "multi" && Array.isArray(current)) {
    const ans = step.answer;
    // Show feedback for any option the learner checked that isn't in the answer.
    const wronglyChecked = current.filter((i) => !ans.includes(i));
    const items = wronglyChecked.map(tagged).filter(Boolean);
    return items.length ? <div>{items}</div> : null;
  }
  return null;
}

export function CasePlay({ caseId, difficulty, questions, onFinish, onExit, srs, onOpenGlossary }) {
  const isReview = caseId === REVIEW_CASE_ID;
  const c = isReview
    ? { id: REVIEW_CASE_ID, title: "Daily Review", branch: "foundations", bank: questions, qPerRun: questions.length, story: "" }
    : CASES.find(x => x.id === caseId);
  const narrative = isReview ? null : getNarrative(caseId);
  const diff = DIFFICULTIES[difficulty];
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [current, setCurrent] = useState(null);
  const [showExplain, setShowExplain] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [timeLeft, setTimeLeft] = useState(diff.time);
  const [streak, setStreak] = useState(0);
  const [totalTimeBonus, setTotalTimeBonus] = useState(0);
  // When the current question is the first of a new act, we pause the play
  // loop and show an act-intro card until the user clicks through. The first
  // question naturally starts Act 1 so this is true on mount.
  const [showActIntro, setShowActIntro] = useState(!!narrative);
  // F2 telemetry: a stable per-run id groups the attempts of one case run,
  // and a per-question shown-at timestamp lets us compute ms_to_answer.
  const [runId] = useState(() => {
    try { return (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`; }
    catch { return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`; }
  });
  const [shownAt, setShownAt] = useState(() => Date.now());
  // F8 — per-learner misconception counts loaded once on mount. Drives the
  // "× N times" repeat chip in DistractorFeedback. Empty map for guests or
  // fetch failures; the UI degrades silently (no chip) without it.
  const [misconceptionCounts, setMisconceptionCounts] = useState({});
  // F3 — Pro flag drives hint-layer gating + per-question "hint used" flag
  // for telemetry. Reset on each new question.
  const [isPro, setIsPro] = useState(false);
  const [hintUsedThisQ, setHintUsedThisQ] = useState(false);
  useEffect(() => {
    let alive = true;
    const auth = (window as any).BQAuth;
    if (auth?.fetchMyMisconceptions) {
      auth.fetchMyMisconceptions()
        .then((m) => { if (alive) setMisconceptionCounts(m || {}); })
        .catch(() => {});
    }
    if (auth?.fetchSubscription) {
      auth.fetchSubscription()
        .then((s) => { if (alive) setIsPro(s?.user_type === "pro" || s?.user_type === "institutional"); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, []);
  useEffect(() => { setHintUsedThisQ(false); }, [stepIdx]);

  const step = questions[stepIdx];
  const isLast = stepIdx === questions.length - 1;
  // Narrative act metadata for the current question. `indexInAct === 0`
  // means this is the first question of that act — time for an intro card.
  const actInfo = narrative && step ? getActForQid(caseId, step.qid) : null;

  useEffect(() => {
    if (showExplain || showActIntro) return;   // Pause the timer during act intros.
    if (timeLeft <= 0) { checkAnswer(true); return; }
    const t = setTimeout(()=>setTimeLeft(timeLeft-1), 1000);
    return ()=>clearTimeout(t);
  }, [timeLeft, showExplain, showActIntro]);

  useEffect(() => { setTimeLeft(diff.time); setShownAt(Date.now()); }, [stepIdx]);

  const checkAnswer = (timedOut=false) => {
    let ok = false;
    if (!timedOut) {
      if (step.type === "mcq") ok = current === step.answer;
      else if (step.type === "multi") {
        const a = (current||[]).slice().sort().join(",");
        const b = step.answer.slice().sort().join(",");
        ok = a === b;
      } else if (step.type === "numeric") {
        ok = current !== null && current !== "" && Math.abs(parseFloat(current) - step.answer) <= (step.tol||0);
      }
    }
    setCorrect(ok);
    setShowExplain(true);
    const bonusFromTime = ok ? Math.round(timeLeft / 3) : 0;
    setTotalTimeBonus(t => t + bonusFromTime);
    setStreak(ok ? streak+1 : 0);
    setAnswers([...answers, { qid: step.qid, q: step.q, user: current, correct: ok, explain: step.explain, method: step.method, timedOut, timeBonus: bonusFromTime }]);

    // F2 telemetry — fire-and-forget per-attempt log. Captures the picked
    // distractor's misconception tag (if any) so the misconception ledger
    // (F8) and instructor item analysis (F10) can read it directly.
    try {
      const auth = (window as any).BQAuth;
      if (auth && typeof auth.logQuestionAttempt === "function") {
        let tag = null;
        if (!ok && !timedOut && step.type === "mcq" && typeof current === "number") {
          tag = step.misconceptionTag?.[current] ?? null;
        }
        const chosen = timedOut ? null
          : step.type === "numeric" ? (current === null ? null : String(current))
          : current;
        const ms = timedOut ? null : Math.max(0, Date.now() - shownAt);
        void auth.logQuestionAttempt({
          qid: step.qid,
          caseId: c.id,
          qType: step.type,
          chosen,
          correct: ok,
          msToAnswer: ms,
          timedOut: !!timedOut,
          hintUsed: hintUsedThisQ,
          deepDiveOpened: false,  // wire in a later slice when DeepDive exposes a callback
          misconceptionTag: tag,
          difficulty,
          runId,
        });
      }
    } catch { /* telemetry must never break play */ }
  };

  const nextStep = () => {
    if (isLast) onFinish(caseId, difficulty, answers, totalTimeBonus);
    else {
      const nextIdx = stepIdx + 1;
      // If the next question is the first of a new act, pause and show the
      // act-intro card before the question appears.
      let showIntro = false;
      if (narrative) {
        const nextQ = questions[nextIdx];
        const nextActInfo = nextQ ? getActForQid(caseId, nextQ.qid) : null;
        if (nextActInfo && nextActInfo.indexInAct === 0) showIntro = true;
      }
      setStepIdx(nextIdx); setCurrent(null); setShowExplain(false); setCorrect(null);
      setShowActIntro(showIntro);
    }
  };

  const progress = ((stepIdx) / questions.length) * 100;
  const timePct = (timeLeft / diff.time) * 100;

  const renderInput = () => {
    if (step.type === "mcq") {
      return (
        <div className="space-y-2">
          {step.options.map((o, i) => {
            const cls = showExplain
              ? i===step.answer ? "option-btn correct" : current===i ? "option-btn incorrect" : "option-btn opacity-50"
              : current===i ? "option-btn selected" : "option-btn";
            return (
              <button key={i} onClick={()=>!showExplain && setCurrent(i)} disabled={showExplain}
                className={`w-full p-3 sm:p-4 rounded-xl text-sm sm:text-base ${cls}`}>
                <span className="mono text-slate-500 mr-3 text-sm">{String.fromCharCode(65+i)}</span>
                <span className="text-white">{o}</span>
                {showExplain && i===step.answer && <span className="ml-2 text-emerald-400 inline-flex items-center"><Ico name="check" size={14}/></span>}
              </button>
            );
          })}
        </div>
      );
    }
    if (step.type === "multi") {
      const sel = current || [];
      return (
        <div className="space-y-2">
          <div className="text-xs text-purple-300 mb-1 font-semibold uppercase tracking-wider">Select all that apply</div>
          {step.options.map((o, i) => {
            const checked = sel.includes(i);
            const cls = showExplain
              ? step.answer.includes(i) ? "option-btn correct" : checked ? "option-btn incorrect" : "option-btn opacity-50"
              : checked ? "option-btn selected" : "option-btn";
            return (
              <button key={i} onClick={()=>{ if(!showExplain) setCurrent(checked?sel.filter(x=>x!==i):[...sel,i]); }} disabled={showExplain}
                className={`w-full p-3 sm:p-4 rounded-xl text-sm sm:text-base ${cls}`}>
                <span className={`inline-flex items-center justify-center w-5 h-5 mr-3 rounded border-2 ${checked?"bg-purple-500 border-purple-500 text-white":"border-slate-500"}`}>{checked ? <Ico name="check" size={12}/> : null}</span>
                <span className="text-white">{o}</span>
              </button>
            );
          })}
        </div>
      );
    }
    if (step.type === "numeric") {
      return (
        <div>
          <input type="number" step="any" value={current??""} onChange={e=>setCurrent(e.target.value)} disabled={showExplain}
            placeholder="Enter numeric answer..." autoFocus />
          <div className="text-xs text-slate-500 mt-2 mono">Tolerance: ± {step.tol}</div>
        </div>
      );
    }
  };

  const hasAnswer = step.type === "multi" ? (current||[]).length > 0 : current !== null && current !== "" && current !== undefined;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 text-sm flex-wrap min-w-0">
          <button onClick={onExit} className="text-slate-500 hover:text-white">← Exit</button>
          <span className="text-slate-700">|</span>
          <span className="chip" style={{background: diff.color+"25", color: diff.color}}>{diff.name}</span>
          <span className="text-slate-400 whitespace-nowrap">Q {stepIdx+1}/{questions.length}</span>
          {streak >= 3 && <span className="chip bg-orange-900/40 text-orange-300 bounce-in inline-flex items-center gap-1.5"><Ico name="flame" size={12}/> {streak}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <svg width="40" height="40" className="timer-ring">
            <circle cx="20" cy="20" r="16" fill="none" stroke="#334155" strokeWidth="3"/>
            <circle cx="20" cy="20" r="16" fill="none"
              stroke={timeLeft < 10 ? "#ef4444" : timeLeft < 20 ? "#f59e0b" : "#8b5cf6"}
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={2*Math.PI*16}
              strokeDashoffset={2*Math.PI*16*(1 - timePct/100)}/>
          </svg>
          <span className={`mono font-bold ${timeLeft<10?"text-red-400":"text-white"}`}>{timeLeft}s</span>
        </div>
      </div>
      <div className="bar mb-5 sm:mb-6"><div style={{width: progress+"%"}}></div></div>

      {/* Act-intro card — renders only for narrative cases, at the first
          question of each act. Timer is paused while it's shown. */}
      {narrative && showActIntro && actInfo && (
        <div className="card premium-border rounded-2xl p-6 sm:p-8 mb-4" style={{background: "linear-gradient(145deg, rgba(22,28,54,0.55), rgba(12,16,36,0.65))"}}>
          <div className="tag text-violet-300 mb-3">{actInfo.act.title}</div>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed mb-4" dangerouslySetInnerHTML={{__html: actInfo.act.hook.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')}}/>
          {actInfo.act.reveal && (
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 mb-5">
              <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1.5">New information</div>
              <p className="text-sm text-amber-100/90 leading-relaxed">{actInfo.act.reveal}</p>
            </div>
          )}
          <button onClick={() => setShowActIntro(false)} className="btn btn-primary px-6 py-3 rounded-xl text-base">
            {actInfo.actIndex === 0 ? "Begin the case →" : "Continue →"}
          </button>
        </div>
      )}

      <div className={`card rounded-2xl p-5 sm:p-6 md:p-8 ${showActIntro ? "hidden" : ""}`}>
        <div className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-2">{c.title}</div>
        {/* Context stack for the stem, in order of specificity:
            1. Per-question `scenario` (cyan)  — set explicitly on ~40 items
            2. Case-level `story`     (slate)  — shown in regular play
               so learners can reference case facts while reasoning,
               UNLESS the question is flagged `standalone: true` (the
               stem introduces its own numbers that would contradict
               the case story).
            Daily Review stays clean (no per-run case story) per the earlier
            product decision to avoid double context panels there. */}
        {step.scenario ? (
          <div className="mb-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300/80 font-bold mb-1">Scenario</div>
            <p className="text-sm text-slate-200 leading-relaxed">{step.scenario}</p>
          </div>
        ) : !isReview && !step.standalone && c.story ? (
          <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Case context</div>
            <p className="text-sm text-slate-300 leading-relaxed">{c.story}</p>
          </div>
        ) : null}
        <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-4 leading-snug">{step.q}</h3>
        {step.output && (
          <div className="mb-6 rounded-xl border border-slate-700 bg-slate-950/80 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-700">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-400 mono">R console {step.outputLang?`· ${step.outputLang}`:""}</span>
            </div>
            <pre className="mono text-[12px] leading-relaxed text-slate-200 p-4 overflow-x-auto whitespace-pre">{step.output}</pre>
          </div>
        )}
        {renderInput()}

        {!showExplain && step.method && (
          <HintPanel
            method={step.method}
            isPro={isPro}
            onHintRevealed={() => setHintUsedThisQ(true)}/>
        )}

        {showExplain && (
          <div className={`mt-6 p-5 rounded-xl border-l-4 bounce-in ${correct?"bg-emerald-900/20 border-emerald-500":"bg-red-900/20 border-red-500"}`}>
            <div className={`font-bold mb-2 text-lg ${correct?"text-emerald-400":"text-red-400"}`}>
              {answers[answers.length-1]?.timedOut ? (<span className="inline-flex items-center gap-2"><Ico name="alarm-clock" size={16}/> Time's up!</span>) : correct ? (<span className="inline-flex items-center gap-2"><Ico name="check" size={16}/> Correct!</span>) : (<span className="inline-flex items-center gap-2"><Ico name="cross" size={16}/> Not quite.</span>)}
              {correct && totalTimeBonus > 0 && <span className="ml-2 text-amber-400 text-sm">+{answers[answers.length-1]?.timeBonus||0} time bonus</span>}
            </div>
            <DistractorFeedback step={step} correct={correct} current={current} misconceptionCounts={misconceptionCounts} />
            <div className="text-sm text-slate-200 leading-relaxed">{step.explain}</div>
            {step.method && <DeepDive methodId={step.method} srs={srs} onOpenGlossary={onOpenGlossary}/>}
            <AskTutor step={step} current={current} caseId={c.id}/>
            <ReportQuestionLink qid={step.qid} caseId={c.id}/>
          </div>
        )}

        <div className="mt-6">
          {!showExplain ? (
            <button onClick={()=>checkAnswer(false)} disabled={!hasAnswer}
              className="btn btn-primary w-full py-4 rounded-xl text-lg disabled:opacity-40 disabled:cursor-not-allowed">
              Submit Answer
            </button>
          ) : (
            <FSRSGradeBar
              qid={step.qid}
              isLast={isLast}
              correct={!!correct}
              timedOut={!!answers[answers.length-1]?.timedOut}
              onAdvance={nextStep}/>
          )}
        </div>
      </div>
    </div>
  );
}

// FSRS-6 grading bar. Shown after an answer is revealed. Writes to
// public.reviews and advances to the next question. For signed-in users,
// picks one of Again/Hard/Good/Easy. For guests, collapses to a plain
// "Next Question" since server scheduling requires an account.
//
// Wrong answers and timeouts still show all four so a user who "knew it
// but misclicked" can mark Good. Anki convention.
function FSRSGradeBar({ qid, isLast, correct, timedOut, onAdvance }) {
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState(null);
  const [nextDue, setNextDue] = React.useState(null);
  const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());

  // Suggested default for quick-advance: wrong/timeout → Again; correct → Good.
  const defaultRating = correct && !timedOut ? 3 : 1; // Rating: 1=Again 2=Hard 3=Good 4=Easy

  async function grade(rating) {
    if (busy) return;
    setBusy(true); setPicked(rating);
    try {
      const due = await srsGradeCard(qid, rating);
      if (due) setNextDue(due);
    } catch {}
    setBusy(false);
    onAdvance();
  }

  if (!signedIn) {
    // Guests: no server-side FSRS, just advance.
    return (
      <button onClick={onAdvance} className="btn btn-primary w-full py-4 rounded-xl text-lg">
        {isLast ? "Finish Case →" : "Next Question →"}
      </button>
    );
  }

  const buttons = [
    { rating: 1, label: "Again",  hint: "Didn't know",       cls: "bg-red-900/30 hover:bg-red-800/50 text-red-200 border border-red-700/40" },
    { rating: 2, label: "Hard",   hint: "Struggled",         cls: "bg-amber-900/30 hover:bg-amber-800/50 text-amber-200 border border-amber-700/40" },
    { rating: 3, label: "Good",   hint: "Got it",            cls: "bg-emerald-900/30 hover:bg-emerald-800/50 text-emerald-200 border border-emerald-700/40" },
    { rating: 4, label: "Easy",   hint: "Trivial",           cls: "bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-200 border border-cyan-700/40" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">How well did you know that?</div>
        <div className="text-[10px] text-slate-600 mono hidden sm:block">schedules next review</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {buttons.map(b => (
          <button
            key={b.rating}
            onClick={() => grade(b.rating)}
            disabled={busy}
            title={b.hint}
            className={`rounded-xl py-3 text-center transition disabled:opacity-40 ${b.cls} ${picked === b.rating ? "ring-2 ring-white/40" : ""} ${b.rating === defaultRating && !picked ? "ring-1 ring-slate-500/50" : ""}`}>
            <div className="font-semibold text-sm">{b.label}</div>
            <div className="text-[10px] opacity-70 mt-0.5">{b.hint}</div>
          </button>
        ))}
      </div>
      {nextDue && (
        <div className="mt-2 text-[11px] text-slate-500 text-center mono">
          Next review · {fmtDate(nextDue)}
        </div>
      )}
      <div className="mt-3 text-center">
        <button onClick={onAdvance} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
          Skip grading · {isLast ? "Finish case" : "Next question"}
        </button>
      </div>
    </div>
  );
}
