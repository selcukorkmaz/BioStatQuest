// @ts-nocheck
// Instructor surface — the "Teach" tab. Four sub-views, all in this one
// file so App.tsx doesn't grow further:
//
//   list     → list of classes the user owns (is instructor or co-instructor in)
//   new      → "Create a class" form (name + institution + description)
//   detail   → one class's roster + stats + code + invite trigger
//   invite   → invite-by-email form (student or co-instructor)
//
// Sub-views are internal state — no URL routing for Phase A.2.a. Students
// land here only if they're an instructor elsewhere; for pure-student
// access we'll build /join and a "My classes" home chip in A.2.b.

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  createClass,
  inviteToClass,
  listMyClasses,
  listClassMembers,
  type ClassSummary,
  type ClassMember,
} from "../lib/classesApi";
import { Ico } from "./Icons";

type Sub = { kind: "list" } | { kind: "new" } | { kind: "detail"; classId: string } | { kind: "invite"; classId: string };

export function TeachView({ onHome }: { onHome: () => void }) {
  const [sub, setSub] = useState<Sub>({ kind: "list" });

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button
          onClick={() => (sub.kind === "list" ? onHome() : setSub({ kind: "list" }))}
          className="text-slate-400 hover:text-white transition inline-flex items-center gap-1"
        >
          ← {sub.kind === "list" ? "Home" : "Back to classes"}
        </button>
      </div>

      {sub.kind === "list" && <ClassesList onOpenClass={(id) => setSub({ kind: "detail", classId: id })} onNewClass={() => setSub({ kind: "new" })} />}
      {sub.kind === "new" && <NewClassForm onCreated={(id) => setSub({ kind: "detail", classId: id })} />}
      {sub.kind === "detail" && <ClassDetail classId={sub.classId} onInvite={() => setSub({ kind: "invite", classId: sub.classId })} />}
      {sub.kind === "invite" && <InviteForm classId={sub.classId} onBack={() => setSub({ kind: "detail", classId: sub.classId })} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
function ClassesList({ onOpenClass, onNewClass }: { onOpenClass: (id: string) => void; onNewClass: () => void }) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [err, setErr] = useState<string>("");

  const load = useCallback(async () => {
    setErr("");
    const r = await listMyClasses();
    if (!r.ok) { setErr(r.error); setClasses([]); return; }
    setClasses(r.data.classes);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only instructor / co-instructor classes show on the Teach surface.
  // Students-only memberships belong on the home screen's "My classes"
  // chip (Phase A.2.b), not here.
  const mine = (classes || []).filter((c) => c.role === "instructor" || c.role === "co-instructor");

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="t-title text-white mb-1 inline-flex items-center gap-2">
            <span className="text-cyan-400"><Ico name="user-group" size={24}/></span>
            Teach
          </h2>
          <p className="t-body text-slate-400 text-sm max-w-2xl">
            Create and manage classes. Invite students by email or share a class code; watch per-student progress as your cohort works through cases.
          </p>
        </div>
        <button onClick={onNewClass} className="btn btn-primary px-5 py-2.5 rounded-xl text-sm">
          + New class
        </button>
      </div>

      {err && (
        <div className="card rounded-xl p-4 border-l-4 border-red-500/60 bg-red-900/10 text-sm text-red-200 mb-4">
          {err}
        </div>
      )}

      {classes === null && (
        <div className="text-slate-500 text-sm">Loading…</div>
      )}

      {classes !== null && mine.length === 0 && (
        <div className="card rounded-2xl p-8 text-center">
          <div className="text-slate-300 mb-4">You don't have any classes yet.</div>
          <button onClick={onNewClass} className="btn btn-primary px-6 py-3 rounded-xl text-sm">
            Create your first class →
          </button>
        </div>
      )}

      {classes !== null && mine.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {mine.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenClass(c.id)}
              className="card rounded-2xl p-5 text-left hover:border-cyan-500/40 transition group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">
                    {c.role === "co-instructor" ? "Co-instructor" : "Instructor"}
                  </div>
                  <div className="text-lg font-bold text-white truncate">{c.name}</div>
                  {c.institution_name && (
                    <div className="text-xs text-slate-400 truncate">{c.institution_name}</div>
                  )}
                </div>
                {c.subscription_status === "lapsed" && (
                  <span className="chip" style={{background:"rgba(251,191,36,0.10)", color:"#fbbf24", borderColor:"rgba(251,191,36,0.3)"}}>Lapsed</span>
                )}
                {c.archived_at && (
                  <span className="chip" style={{background:"rgba(148,163,184,0.10)", color:"#94a3b8"}}>Archived</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-3">
                {typeof c.member_count === "number" && (
                  <span><span className="text-slate-200 font-semibold">{c.member_count}</span> member{c.member_count === 1 ? "" : "s"}</span>
                )}
                {c.code && (
                  <span className="mono">Code <span className="text-cyan-300">{c.code}</span></span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW CLASS
// ---------------------------------------------------------------------------
function NewClassForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!name.trim()) { setErr("Name is required"); return; }
    setBusy(true);
    const r = await createClass({
      name: name.trim(),
      institution_name: institution.trim() || undefined,
      description: description.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated(r.data.id);
  }

  return (
    <div>
      <h2 className="t-title text-white mb-1">Create a class</h2>
      <p className="t-body text-slate-400 text-sm mb-6 max-w-2xl">
        Pick a name and (optionally) an institution. You'll be listed as the first instructor; invite students after.
      </p>
      <div className="card rounded-2xl p-6 max-w-2xl space-y-4">
        <Field label="Class name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 120))}
            placeholder="e.g. MPH 703 — Biostats Methods (Spring 2026)"
            className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"
          />
        </Field>
        <Field label="Institution (optional)">
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value.slice(0, 120))}
            placeholder="e.g. Trakya University School of Medicine"
            className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="What the class covers, term dates, anything you want students to see."
            className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"
          />
          <div className="text-[10px] text-slate-500 mono text-right mt-1">{description.length}/500</div>
        </Field>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          className="btn btn-primary w-full py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Creating…" : "Create class →"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETAIL
// ---------------------------------------------------------------------------
function ClassDetail({ classId, onInvite }: { classId: string; onInvite: () => void }) {
  const [cls, setCls] = useState<ClassSummary | null>(null);
  const [members, setMembers] = useState<ClassMember[] | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    // Fetch both in parallel
    const [classesRes, membersRes] = await Promise.all([
      listMyClasses(),
      listClassMembers(classId),
    ]);
    if (!classesRes.ok) { setErr(classesRes.error); return; }
    if (!membersRes.ok) { setErr(membersRes.error); return; }
    const found = classesRes.data.classes.find((c) => c.id === classId) || null;
    setCls(found);
    setMembers(membersRes.data.members);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  async function copyCode() {
    if (!cls?.code) return;
    try {
      await navigator.clipboard.writeText(cls.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard API failed */ }
  }

  if (!cls && !err) return <div className="text-slate-500 text-sm">Loading…</div>;

  if (err) {
    return (
      <div className="card rounded-xl p-4 border-l-4 border-red-500/60 bg-red-900/10 text-sm text-red-200">
        {err}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          <h2 className="t-title text-white mb-1 truncate">{cls?.name}</h2>
          {cls?.institution_name && (
            <p className="text-sm text-slate-400">{cls.institution_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onInvite} className="btn btn-primary px-5 py-2.5 rounded-xl text-sm">
            + Invite
          </button>
        </div>
      </div>

      {/* Class-code card — prominent because instructors share it all the time */}
      {cls?.code && (
        <div className="card rounded-2xl p-5 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Class join code</div>
            <div className="mono text-2xl text-cyan-300 font-bold">{cls.code}</div>
            <div className="text-xs text-slate-500 mt-1">Students enter this code at <span className="mono">biostatquest.com/join</span> to enroll.</div>
          </div>
          <button
            onClick={copyCode}
            className="btn btn-ghost px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2"
          >
            {copied ? (
              <><Ico name="check" size={14}/> Copied</>
            ) : (
              <>Copy code</>
            )}
          </button>
        </div>
      )}

      {/* Roster */}
      <div className="card rounded-2xl p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/60 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Members {members && `· ${members.length}`}
          </div>
          <button onClick={load} className="text-xs text-slate-400 hover:text-white transition">
            ↻ Refresh
          </button>
        </div>
        {members === null && <div className="p-5 text-slate-500 text-sm">Loading…</div>}
        {members !== null && members.length === 0 && (
          <div className="p-5 text-slate-500 text-sm">No members yet. Invite your first student.</div>
        )}
        {members !== null && members.length > 0 && (
          <div className="divide-y divide-slate-700/40">
            {members.map((m) => (
              <MemberRow key={m.user_id} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberRow({ m }: { m: ClassMember }) {
  const isInstructor = m.role === "instructor" || m.role === "co-instructor";
  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-slate-800/30 transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-white truncate">{m.email || "(email hidden)"}</div>
          <span className={`chip text-[10px] ${isInstructor ? "bg-cyan-950/50 text-cyan-200 border-cyan-900/60" : ""}`} style={isInstructor ? {} : {background:"rgba(148,163,184,0.08)"}}>
            {m.role === "co-instructor" ? "Co-instructor" : m.role === "instructor" ? "Instructor" : "Student"}
          </span>
          {!m.consented && (
            <span className="chip text-[10px]" title="Student hasn't consented to progress visibility" style={{background:"rgba(251,191,36,0.08)", color:"#fbbf24", borderColor:"rgba(251,191,36,0.25)"}}>No progress visible</span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 mono mt-0.5">
          Joined {new Date(m.joined_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </div>
      </div>
      <div className="flex items-center gap-5 text-right shrink-0 text-xs">
        <Stat label="XP" value={typeof m.xp === "number" ? m.xp.toLocaleString() : "—"} />
        <Stat label="Cases" value={typeof m.cases_completed === "number" ? String(m.cases_completed) : "—"} />
        <Stat label="Streak" value={typeof m.current_streak === "number" ? String(m.current_streak) : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-semibold text-slate-200 mono">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INVITE
// ---------------------------------------------------------------------------
function InviteForm({ classId, onBack }: { classId: string; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"student" | "co-instructor">("student");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { join_url: string; email_sent: boolean; expires_at: string }>(null);
  const [err, setErr] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  async function submit() {
    setErr("");
    setResult(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr("Valid email required"); return; }
    setBusy(true);
    const r = await inviteToClass({ class_id: classId, email: email.trim(), role });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ join_url: r.data.join_url, email_sent: r.data.email_sent, expires_at: r.data.expires_at });
  }

  async function copyLink() {
    if (!result?.join_url) return;
    try {
      await navigator.clipboard.writeText(result.join_url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {}
  }

  return (
    <div>
      <h2 className="t-title text-white mb-1">Invite someone</h2>
      <p className="t-body text-slate-400 text-sm mb-6 max-w-2xl">
        Sends an email with a one-click join link. The link expires in 14 days. If email delivery fails, you can copy the link and share it manually.
      </p>
      <div className="card rounded-2xl p-6 max-w-2xl space-y-4">
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.edu"
            className="w-full p-3 rounded-lg bg-slate-950/60 border border-slate-700 text-slate-100 text-sm placeholder-slate-500"
          />
        </Field>
        <Field label="Role">
          <div className="flex gap-2">
            <RoleChip selected={role === "student"} onClick={() => setRole("student")}>Student</RoleChip>
            <RoleChip selected={role === "co-instructor"} onClick={() => setRole("co-instructor")}>Co-instructor</RoleChip>
          </div>
          {role === "co-instructor" && (
            <p className="text-[11px] text-amber-300/80 mt-2">Co-instructors can invite, remove members, and see everyone's progress. Only invite people you trust as teaching staff.</p>
          )}
        </Field>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex gap-2">
          <button onClick={onBack} className="btn btn-ghost px-5 py-3 rounded-xl text-sm flex-1">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !email.trim()}
            className="btn btn-primary px-5 py-3 rounded-xl text-sm flex-[2] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Sending…" : "Send invite →"}
          </button>
        </div>
      </div>

      {result && (
        <div className="card rounded-2xl p-5 mt-4 max-w-2xl border-l-4 border-emerald-500/60 bg-emerald-900/10">
          <div className="text-sm font-semibold text-emerald-200 mb-2 inline-flex items-center gap-2">
            <Ico name="check" size={16}/> Invite created
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div>
              {result.email_sent
                ? <>Email sent to <span className="mono text-slate-100">{email}</span>.</>
                : <>Email delivery failed — share the link manually below.</>}
            </div>
            <div className="text-slate-500">Expires {new Date(result.expires_at).toLocaleDateString()}</div>
          </div>
          <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-700">
            <code className="flex-1 text-[11px] mono text-slate-300 truncate">{result.join_url}</code>
            <button onClick={copyLink} className="btn btn-ghost px-3 py-1.5 rounded-md text-xs whitespace-nowrap inline-flex items-center gap-1.5">
              {linkCopied ? <><Ico name="check" size={12}/> Copied</> : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </div>
      {children}
    </label>
  );
}

function RoleChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`chip text-xs transition ${selected ? "bg-cyan-900/60 text-cyan-100 border-cyan-700" : ""}`}
    >
      {children}
    </button>
  );
}
