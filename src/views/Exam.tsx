// @ts-nocheck
// F9 (Phase 0) — practice exam view. Three states:
//   1. setup    — branch picker + length + start (quota gate)
//   2. run      — linear question runner with countdown timer; NO reveal,
//                 NO FSRS grading; "flag" + "back" optional in v0.1
//   3. results  — overall score + per-branch breakdown + per-question review
//
// All client-side for v0: no DB-backed exam record. Telemetry still flows
// through BQAuth.logQuestionAttempt with run_id = the exam id, so the
// telemetry pipeline picks up exam attempts the same way as case attempts.
//
// Pro vs free: server-enforced quota lands in v0.1; for now it's a
// localStorage-tracked rolling window (2 free / 30 days), surfaced as a
// soft upgrade prompt when blocked.

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { BRANCHES } from "../data/branches";
import {
  pickExamQuestions,
  gradeAnswer,
  scoreExam,
  getBranchBreakdown,
  recordExamStart,
  getExamQuota,
  type ExamQuestion,
  type ExamAnswer,
} from "../lib/exam";
import { effectivelyPro } from "../lib/launchFlags";

const DEFAULT_N = 20;
const DEFAULT_TIME_MIN = 30;

function fmtClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function newExamId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `exam_${crypto.randomUUID()}`;
  } catch {}
  return `exam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function Exam({ onExit }) {
  const [state, setState] = useState("setup"); // 'setup' | 'run' | 'results'
  const [selectedBranches, setSelectedBranches] = useState([]); // empty = all
  const [n, setN] = useState(DEFAULT_N);
  const [questions, setQuestions] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [picks, setPicks] = useState([]); // per-question picked value
  const [shownAt, setShownAt] = useState(0);
  const [examId, setExamId] = useState("");
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState([]); // ExamAnswer[]
  const [isPro, setIsPro] = useState(false);
  // Server-side exam count (last 30d). Loaded on mount + refreshed after
  // a successful start. Drives the free-tier quota gate; localStorage
  // path remains as guest fallback (see getExamQuota in lib/exam.ts).
  const [serverExamCount, setServerExamCount] = useState<number | null>(null);

  // Pull subscription tier + server exam count on mount.
  useEffect(() => {
    let alive = true;
    const auth = (window as any).BQAuth;
    if (auth?.fetchSubscription) {
      auth.fetchSubscription().then((s) => {
        if (alive) setIsPro(effectivelyPro(s?.user_type));
      }).catch(() => {});
    }
    if (auth?.fetchMyExamCount30d) {
      auth.fetchMyExamCount30d().then((n) => {
        if (alive) setServerExamCount(typeof n === "number" ? n : 0);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  // Free-tier quota: server count > localStorage count (server is the
  // source of truth for signed-in users; localStorage is a soft floor
  // for guests / when the API is unreachable). Take the max so the
  // gate is at least as strict as the most pessimistic source.
  const quota = useMemo(() => {
    const local = getExamQuota(isPro);
    if (isPro) return local;
    if (serverExamCount === null) return local;
    const used = Math.max(local.used, serverExamCount);
    const remaining = Math.max(0, local.limit - used);
    return { used, limit: local.limit, remaining, blocked: remaining <= 0 };
  }, [isPro, serverExamCount, state]);

  // Tick clock every second while running.
  useEffect(() => {
    if (state !== "run") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Auto-submit when timer expires.
  const secondsLeft = Math.max(0, Math.floor((endsAt - now) / 1000));
  useEffect(() => {
    if (state === "run" && secondsLeft <= 0) finishExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, secondsLeft]);

  function startExam() {
    if (quota.blocked) return;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const branches = selectedBranches.length > 0 ? selectedBranches : undefined;
    const qs = pickExamQuestions(n, { seed, branches });
    if (qs.length === 0) return;
    const id = newExamId();
    recordExamStart();
    // Optimistically bump the server count so a free user who opens
    // setup again (without finishing the exam) immediately sees the
    // new used/remaining. The actual server count refreshes on next
    // mount via fetchMyExamCount30d.
    setServerExamCount((prev) => (prev === null ? null : prev + 1));
    setQuestions(qs);
    setPicks(new Array(qs.length).fill(null));
    setStepIdx(0);
    setShownAt(Date.now());
    setExamId(id);
    setEndsAt(Date.now() + DEFAULT_TIME_MIN * 60 * 1000);
    setNow(Date.now());
    setAnswers([]);
    setState("run");
  }

  function recordCurrent() {
    const q = questions[stepIdx];
    if (!q) return null;
    const picked = picks[stepIdx];
    const correct = gradeAnswer(q, picked);
    const ans: ExamAnswer = {
      qid: q.qid,
      branch: q.branch,
      picked,
      correct,
      msToAnswer: Math.max(0, Date.now() - shownAt),
    };
    // Telemetry — same hook as CasePlay; run_id ties exam answers together.
    try {
      const auth = (window as any).BQAuth;
      if (auth?.logQuestionAttempt) {
        const chosen = q.type === "numeric"
          ? (picked === null ? null : String(picked))
          : picked;
        void auth.logQuestionAttempt({
          qid: q.qid,
          caseId: q.caseId,
          qType: q.type,
          chosen,
          correct,
          msToAnswer: ans.msToAnswer,
          timedOut: false,
          hintUsed: false,
          deepDiveOpened: false,
          difficulty: "exam",
          runId: examId,
        });
      }
    } catch {}
    return ans;
  }

  function next() {
    const ans = recordCurrent();
    if (ans) setAnswers((a) => [...a, ans]);
    if (stepIdx + 1 >= questions.length) {
      finishExam([...answers, ans].filter(Boolean));
    } else {
      setStepIdx(stepIdx + 1);
      setShownAt(Date.now());
    }
  }

  function finishExam(finalAnswers?: ExamAnswer[]) {
    // Capture the current question if user clicks "Finish" early without next.
    let collected = finalAnswers ?? answers;
    if (!finalAnswers && stepIdx < questions.length && !answers.find((a) => a.qid === questions[stepIdx]?.qid)) {
      const ans = recordCurrent();
      if (ans) collected = [...answers, ans];
    }
    setAnswers(collected);
    setState("results");
  }

  // ---------- render ----------
  if (state === "setup") {
    const branchEntries = Object.entries(BRANCHES);
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="t-title mb-1">Practice Exam</h2>
            <p className="t-body text-slate-400 text-sm">
              {DEFAULT_N} questions · {DEFAULT_TIME_MIN} minutes · no reveal until the end. Closer to a board sitting than the case loop.
            </p>
          </div>
          <button onClick={onExit} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
        </div>

        <div className="card rounded-2xl p-6">
          <div className="mb-5">
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">Number of questions</label>
            <select
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm">
              <option value={10}>10 (quick)</option>
              <option value={20}>20 (standard)</option>
              <option value={40}>40 (long)</option>
            </select>
          </div>

          <div className="mb-5">
            <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">
              Branches <span className="text-slate-600 normal-case">— leave empty for ALL</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {branchEntries.map(([id, b]) => {
                const on = selectedBranches.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedBranches(on
                      ? selectedBranches.filter((x) => x !== id)
                      : [...selectedBranches, id])}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition ${on
                      ? "border-purple-500 bg-purple-900/30 text-white"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"}`}
                    style={on ? { borderColor: (b as any).color } : undefined}>
                    {(b as any).name}
                  </button>
                );
              })}
            </div>
          </div>

          {!isPro && (
            <div className={`mb-5 p-3 rounded-lg border text-sm ${quota.blocked
              ? "border-amber-700/50 bg-amber-950/30 text-amber-200"
              : "border-slate-700 bg-slate-900/40 text-slate-300"}`}>
              {quota.blocked ? (
                <>You've used your {quota.limit} free exams in the last 30 days. Pro removes the limit.</>
              ) : (
                <>Free tier: <span className="mono">{quota.used}/{quota.limit}</span> exams in the last 30 days.</>
              )}
            </div>
          )}

          <button
            onClick={startExam}
            disabled={quota.blocked}
            className="btn btn-primary w-full py-3 rounded-xl text-base disabled:opacity-40 disabled:cursor-not-allowed">
            Start exam
          </button>
        </div>
      </div>
    );
  }

  if (state === "run") {
    const q = questions[stepIdx];
    const picked = picks[stepIdx];
    const progress = ((stepIdx) / questions.length) * 100;
    const isLast = stepIdx === questions.length - 1;
    const hasAnswer = q?.type === "multi"
      ? Array.isArray(picked) && picked.length > 0
      : picked !== null && picked !== "" && picked !== undefined;

    function setPicked(v) {
      const next = picks.slice();
      next[stepIdx] = v;
      setPicks(next);
    }

    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="chip bg-purple-900/40 text-purple-200">Exam</span>
            <span className="text-slate-400 whitespace-nowrap">Q {stepIdx + 1}/{questions.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`mono font-bold ${secondsLeft < 60 ? "text-red-400" : "text-white"}`}>{fmtClock(secondsLeft)}</span>
            <button onClick={() => finishExam()} className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">Finish early →</button>
          </div>
        </div>
        <div className="bar mb-5"><div style={{ width: progress + "%" }} /></div>

        <div className="card rounded-2xl p-5 sm:p-6">
          {q.scenario && (
            <div className="mb-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300/80 font-bold mb-1">Scenario</div>
              <p className="text-sm text-slate-200 leading-relaxed">{q.scenario}</p>
            </div>
          )}
          <h3 className="text-lg sm:text-xl font-bold text-white mb-4 leading-snug">{q.q}</h3>

          {q.type === "mcq" && (
            <div className="space-y-2">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => setPicked(i)}
                  className={`w-full p-3 rounded-xl text-sm text-left ${picked === i ? "option-btn selected" : "option-btn"}`}>
                  <span className="mono text-slate-500 mr-3">{String.fromCharCode(65 + i)}</span>
                  <span className="text-white">{o}</span>
                </button>
              ))}
            </div>
          )}
          {q.type === "multi" && (
            <div className="space-y-2">
              <div className="text-xs text-purple-300 mb-1 font-semibold uppercase tracking-wider">Select all that apply</div>
              {q.options.map((o, i) => {
                const checked = Array.isArray(picked) && picked.includes(i);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      const cur = Array.isArray(picked) ? picked : [];
                      setPicked(checked ? cur.filter((x) => x !== i) : [...cur, i]);
                    }}
                    className={`w-full p-3 rounded-xl text-sm text-left ${checked ? "option-btn selected" : "option-btn"}`}>
                    <span className={`inline-flex items-center justify-center w-5 h-5 mr-3 rounded border-2 ${checked ? "bg-purple-500 border-purple-500" : "border-slate-500"}`}/>
                    <span className="text-white">{o}</span>
                  </button>
                );
              })}
            </div>
          )}
          {q.type === "numeric" && (
            <div>
              <input
                type="number"
                step="any"
                value={picked ?? ""}
                onChange={(e) => setPicked(e.target.value)}
                placeholder="Enter numeric answer..."
                autoFocus
                className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm"/>
            </div>
          )}

          <button
            onClick={next}
            disabled={!hasAnswer}
            className="btn btn-primary w-full py-3 rounded-xl text-base mt-6 disabled:opacity-40">
            {isLast ? "Submit exam" : "Next →"}
          </button>
          <button
            onClick={() => { setPicked(null); next(); }}
            className="btn btn-ghost w-full py-2 rounded-lg text-xs mt-2 text-slate-500">
            Skip (counts as wrong)
          </button>
        </div>
      </div>
    );
  }

  // ---- results ----
  const score = scoreExam(answers);
  const breakdown = getBranchBreakdown(answers);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="t-title">Exam results</h2>
        <button onClick={onExit} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Home</button>
      </div>

      <div className="card rounded-2xl p-6 mb-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="text-5xl font-extrabold text-white">{Math.round(score.accuracy * 100)}%</div>
          <div className="text-sm text-slate-400">{score.correct}/{score.n} correct</div>
        </div>
      </div>

      <h3 className="text-base font-semibold text-white mb-2">By branch</h3>
      <div className="card rounded-xl p-4 mb-5">
        <table className="w-full text-sm">
          <tbody>
            {breakdown.map((r) => {
              const acc = Math.round(r.accuracy * 100);
              const accClass = acc < 50 ? "text-red-300" : acc < 75 ? "text-amber-300" : "text-emerald-300";
              return (
                <tr key={r.branch} className="border-b border-slate-800/50 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-200">{r.branchName}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-500 mono text-xs">{r.correct}/{r.n}</td>
                  <td className={`py-1.5 text-right font-semibold ${accClass}`}>{acc}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="text-base font-semibold text-white mb-2">Review</h3>
      <div className="space-y-2">
        {answers.map((a, i) => {
          const q = questions.find((qq) => qq.qid === a.qid);
          if (!q) return null;
          return (
            <article key={a.qid} className={`rounded-xl border p-3 ${a.correct ? "border-emerald-700/40 bg-emerald-950/20" : "border-red-700/40 bg-red-950/20"}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-slate-400 mono">Q{i + 1} · {q.qid}</span>
                <span className={`text-xs font-semibold ${a.correct ? "text-emerald-400" : "text-red-400"}`}>{a.correct ? "✓ correct" : "✗ wrong"}</span>
              </div>
              <p className="text-sm text-slate-200 mb-2 leading-relaxed">{q.q}</p>
              <p className="text-xs text-slate-300 leading-relaxed">{q.explain}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default Exam;
