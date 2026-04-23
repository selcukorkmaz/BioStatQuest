// @ts-nocheck
// Home-screen band for class membership surfacing + join-by-code entry.
//
// Shown to all signed-in users. Renders nothing for signed-out users
// (no sign-in pitch here — that lives in the auth button + SignInCard).
//
// Two sub-sections in the band:
//   1. "Your classes" — every active membership, any role, click to
//      open Teach (if instructor/co-instructor) or show class detail
//      in a read-only peek (students in Phase A.2.b; just a chip for now)
//   2. "Join by code" — a small form that posts to /api/classes/join-by-code
//      after confirming consent. Always shown; it's the student-only
//      enrollment path and the "I got a new class code" flow for
//      existing students too.

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  listMyClasses,
  joinByCode,
  type ClassSummary,
} from "../lib/classesApi";
import { Ico } from "./Icons";

export function MyClassesBand({ onOpenTeach }: { onOpenTeach: () => void }) {
  const [signedIn, setSignedIn] = useState<boolean>(
    () => !!(window.BQAuth?.getUser && window.BQAuth.getUser())
  );
  useEffect(() => {
    if (!window.BQAuth?.onAuthChange) return;
    return window.BQAuth.onAuthChange((u: any) => setSignedIn(!!u));
  }, []);

  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const load = useCallback(async () => {
    if (!signedIn) { setClasses([]); return; }
    const r = await listMyClasses();
    if (!r.ok) { setClasses([]); return; }
    setClasses(r.data.classes);
  }, [signedIn]);
  useEffect(() => { load(); }, [load]);

  // Guests see nothing — the home screen already pitches them fine.
  if (!signedIn) return null;

  // While we're still loading, render nothing rather than a spinner; the
  // home screen already has plenty for the user to look at.
  if (classes === null) return null;

  // If they have no classes AND no reason to care (e.g. pure individual
  // learner), we still show the join-by-code form — one input is cheap
  // and anyone an educator hands a code to lands here.
  const hasAny = classes.length > 0;

  return (
    <div className="card rounded-2xl p-5 sm:p-6">
      {hasAny ? (
        <>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
              Your classes
            </div>
            <button onClick={load} className="text-[11px] text-slate-500 hover:text-slate-300 transition">
              ↻ Refresh
            </button>
          </div>
          <ul className="space-y-2">
            {classes.map((c) => (
              <ClassRow key={c.id} c={c} onOpenTeach={onOpenTeach} />
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-slate-700/40">
            <JoinByCodeForm onJoined={load} compact />
          </div>
        </>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">
            Got a class code?
          </div>
          <div className="text-sm text-slate-300 mb-4">
            If an instructor shared a 6-character class code with you, enter it below to enroll.
          </div>
          <JoinByCodeForm onJoined={load} />
        </>
      )}
    </div>
  );
}

function ClassRow({ c, onOpenTeach }: { c: ClassSummary; onOpenTeach: () => void }) {
  const isInstructor = c.role === "instructor" || c.role === "co-instructor";
  return (
    <li className="flex items-center gap-3 p-3 rounded-xl border border-slate-800/60 bg-slate-900/30">
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isInstructor ? "bg-cyan-900/60 text-cyan-100" : "bg-slate-800 text-slate-300"}`}>
        {isInstructor ? <Ico name="user-group" size={14}/> : (c.name[0] || "?").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate">{c.name}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {c.institution_name ? `${c.institution_name} · ` : ""}
          <span className={isInstructor ? "text-cyan-300" : "text-slate-400"}>
            {c.role === "co-instructor" ? "Co-instructor" : c.role === "instructor" ? "Instructor" : "Student"}
          </span>
          {c.subscription_status === "lapsed" && <span className="ml-2 text-amber-400">· Read-only (lapsed)</span>}
        </div>
      </div>
      {isInstructor && (
        <button
          onClick={onOpenTeach}
          className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-500/40 hover:decoration-cyan-300 whitespace-nowrap shrink-0"
        >
          Manage →
        </button>
      )}
    </li>
  );
}

function JoinByCodeForm({ onJoined, compact }: { onJoined: () => void; compact?: boolean }) {
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<string>("");

  async function submit() {
    setErr(""); setOk("");
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(normalized)) { setErr("Enter a 6-character code"); return; }
    if (!consent) { setErr("Please consent to continue"); return; }
    setBusy(true);
    const r = await joinByCode({ code: normalized, consent: true });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setOk(`Joined ${r.data.class_name}.`);
    setCode("");
    setConsent(false);
    onJoined();
  }

  return (
    <div className={compact ? "" : ""}>
      <div className="flex gap-2 items-stretch">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 8))}
          placeholder="CLASS CODE"
          className="flex-1 min-w-0 p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 mono uppercase tracking-wider"
          autoCapitalize="characters"
          maxLength={8}
        />
        <button
          onClick={submit}
          disabled={busy || !code.trim() || !consent}
          className="btn btn-primary px-5 rounded-lg text-sm whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Joining…" : "Join"}
        </button>
      </div>
      <label className="flex items-start gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0 accent-cyan-500"
        />
        <span className="text-[11px] text-slate-400 leading-relaxed">
          I agree that <strong className="text-slate-200">instructors of this class</strong> can see my case-completion and accuracy data for BioStat Quest.
        </span>
      </label>
      {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
      {ok && <div className="text-xs text-emerald-400 mt-2 inline-flex items-center gap-1.5"><Ico name="check" size={12}/> {ok}</div>}
    </div>
  );
}
