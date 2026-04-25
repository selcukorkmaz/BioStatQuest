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
  updateMember,
  setClassArchived,
  getClassInsights,
  errorOf,
  type ClassSummary,
  type ClassMember,
  type InsightsPayload,
  type InsightsMember,
} from "../lib/classesApi";
import { Ico } from "./Icons";
import { METHODS, METHOD_BRANCH } from "../data/methods";
import { BRANCHES } from "../data/branches";
import { fmtNumber, fmtDate, fmtDateMD } from "../lib/format";
import { Chip } from "../design";

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
    if (!r.ok) { setErr(errorOf(r)); setClasses([]); return; }
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
                {/* "Lapsed" chip removed in Phase 3: classes.subscription_status
                    has no code path that flips it to "lapsed" yet (Stripe-to-classes
                    integration is unbuilt), so the chip was always dead UI making
                    a promise the backend can't keep. Restore here when institutional
                    billing ships. */}
                {c.archived_at && <Chip tone="neutral">Archived</Chip>}
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
    if (!r.ok) { setErr(errorOf(r)); return; }
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
function ClassDetail({ classId, onInvite, onArchived }: { classId: string; onInvite: () => void; onArchived?: () => void }) {
  const [cls, setCls] = useState<ClassSummary | null>(null);
  const [members, setMembers] = useState<ClassMember[] | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"roster" | "insights">("roster");

  // Caller identity — needed so we don't offer "remove" on the caller's
  // own row (server would reject but we hide the button preemptively).
  const currentUserId: string | undefined = (() => {
    try { return (window as any).BQAuth?.getUser?.()?.id; } catch { return undefined; }
  })();

  const load = useCallback(async () => {
    setErr("");
    // Fetch both in parallel
    const [classesRes, membersRes] = await Promise.all([
      listMyClasses(),
      listClassMembers(classId),
    ]);
    if (!classesRes.ok) { setErr(errorOf(classesRes)); return; }
    if (!membersRes.ok) { setErr(errorOf(membersRes)); return; }
    const found = classesRes.data.classes.find((c) => c.id === classId) || null;
    setCls(found);
    setMembers(membersRes.data.members);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  // Writability + archive-permission derivations. Co-instructors can
  // manage members in a writable class but cannot archive it — that's
  // a primary-instructor action. Note: subscription_status is no longer
  // consulted here (Phase 3 — see the chip removal above for context).
  const isWritable = !!cls && !cls.archived_at;
  const canManageMembers = isWritable && !!cls && (cls.role === "instructor" || cls.role === "co-instructor");
  const isPrimaryInstructor = !!cls && cls.role === "instructor";

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
          <h2 className="t-title text-white mb-1 truncate inline-flex items-center gap-3">
            {cls?.name}
            {cls?.archived_at && <Chip tone="neutral" size="sm">Archived</Chip>}
            {/* Lapsed chip removed in Phase 3 — see ClassesList for rationale. */}
          </h2>
          {cls?.institution_name && (
            <p className="text-sm text-slate-400">{cls.institution_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isWritable && (
            <button onClick={onInvite} className="btn btn-primary px-5 py-2.5 rounded-xl text-sm">
              + Invite
            </button>
          )}
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

      {/* Tab switcher — Roster | Insights */}
      <div className="mb-4 flex items-center gap-0 border-b border-slate-800">
        <TabButton active={tab === "roster"} onClick={() => setTab("roster")}>
          Roster {members ? `· ${members.length}` : ""}
        </TabButton>
        <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>
          Insights
        </TabButton>
      </div>

      {tab === "roster" && (
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
                <MemberRow
                  key={m.user_id}
                  m={m}
                  classId={classId}
                  canManage={canManageMembers}
                  currentUserId={currentUserId}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "insights" && <InsightsTab classId={classId} />}

      {/* Archive / Unarchive — primary-instructor only. Separated from the
          roster card and visually muted so nobody clicks it by accident. */}
      {isPrimaryInstructor && (
        <ArchiveBlock
          classId={classId}
          archived={!!cls?.archived_at}
          onChanged={() => { load(); onArchived?.(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive block — bottom of ClassDetail, primary-instructor only
// ---------------------------------------------------------------------------
function ArchiveBlock({ classId, archived, onChanged }: { classId: string; archived: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function apply(next: boolean) {
    setBusy(true);
    setErr("");
    const r = await setClassArchived({ class_id: classId, archived: next });
    setBusy(false);
    if (!r.ok) { setErr(errorOf(r)); return; }
    setConfirming(false);
    onChanged();
  }

  return (
    <div className="mt-6 card rounded-2xl p-5 border border-slate-800/60">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Danger zone</div>
      {!archived && !confirming && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm text-slate-200 font-semibold">Archive this class</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Freezes the roster — no new invites, no role changes. Members keep their own progress. You can unarchive later.
            </div>
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="btn btn-ghost px-4 py-2 rounded-lg text-xs whitespace-nowrap border border-amber-600/40 text-amber-300 hover:bg-amber-900/20"
          >
            Archive class
          </button>
        </div>
      )}
      {!archived && confirming && (
        <div>
          <div className="text-sm text-amber-200 mb-3">
            Archive this class? You can unarchive it again from this page.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="btn btn-ghost px-4 py-2 rounded-lg text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => apply(true)}
              disabled={busy}
              className="btn px-4 py-2 rounded-lg text-xs bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
            >
              {busy ? "Archiving…" : "Confirm archive"}
            </button>
          </div>
        </div>
      )}
      {archived && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm text-slate-200 font-semibold">This class is archived</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Unarchiving restores full write access — you can invite, remove members, and change roles again.
            </div>
          </div>
          <button
            onClick={() => apply(false)}
            disabled={busy}
            className="btn btn-ghost px-4 py-2 rounded-lg text-xs whitespace-nowrap border border-emerald-600/40 text-emerald-300 hover:bg-emerald-900/20 disabled:opacity-50"
          >
            {busy ? "Unarchiving…" : "Unarchive"}
          </button>
        </div>
      )}
      {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
    </div>
  );
}

function MemberRow({
  m,
  classId,
  canManage,
  currentUserId,
  onChanged,
}: {
  m: ClassMember;
  classId: string;
  canManage: boolean;
  currentUserId?: string;
  onChanged: () => void;
}) {
  const isInstructor = m.role === "instructor" || m.role === "co-instructor";

  // Show action affordances when:
  //   • the class is writable and caller is an instructor/co-instructor
  //   • target isn't the caller themselves
  //   • target isn't the class's primary instructor (protected)
  const showActions =
    canManage && currentUserId !== m.user_id && m.role !== "instructor";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function act(action: "promote" | "demote" | "remove") {
    setBusy(true);
    setErr("");
    const r = await updateMember({ class_id: classId, user_id: m.user_id, action });
    setBusy(false);
    if (!r.ok) { setErr(errorOf(r)); return; }
    setConfirmRemove(false);
    onChanged();
  }

  return (
    <div className="px-5 py-3 hover:bg-slate-800/30 transition">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-semibold text-white truncate">{m.email || "(email hidden)"}</div>
            <span className={`chip text-[10px] ${isInstructor ? "bg-cyan-950/50 text-cyan-200 border-cyan-900/60" : ""}`} style={isInstructor ? {} : {background:"rgba(148,163,184,0.08)"}}>
              {m.role === "co-instructor" ? "Co-instructor" : m.role === "instructor" ? "Instructor" : "Student"}
            </span>
            {!m.consented && (
              <Chip tone="warn" size="sm" title="Student hasn't consented to progress visibility">No progress visible</Chip>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mono mt-0.5">
            Joined {fmtDate(m.joined_at)}
          </div>
        </div>
        <div className="flex items-center gap-5 text-right shrink-0 text-xs">
          <Stat label="XP" value={fmtNumber(m.xp)} />
          <Stat label="Cases" value={typeof m.cases_completed === "number" ? String(m.cases_completed) : "—"} />
          <Stat label="Streak" value={typeof m.current_streak === "number" ? String(m.current_streak) : "—"} />
        </div>
      </div>

      {showActions && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px]">
          {m.role === "student" && (
            <button
              onClick={() => act("promote")}
              disabled={busy}
              className="px-2.5 py-1 rounded-md border border-cyan-800/50 text-cyan-300 hover:bg-cyan-900/20 disabled:opacity-50"
              title="Grant co-instructor permissions"
            >
              ↑ Promote to co-instructor
            </button>
          )}
          {m.role === "co-instructor" && (
            <button
              onClick={() => act("demote")}
              disabled={busy}
              className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50"
              title="Revoke co-instructor permissions"
            >
              ↓ Demote to student
            </button>
          )}
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="px-2.5 py-1 rounded-md border border-red-900/50 text-red-300/90 hover:bg-red-900/20 disabled:opacity-50 ml-auto"
            >
              Remove
            </button>
          ) : (
            <div className="ml-auto inline-flex items-center gap-2">
              <span className="text-red-300">Remove from class?</span>
              <button
                onClick={() => setConfirmRemove(false)}
                disabled={busy}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/40 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => act("remove")}
                disabled={busy}
                className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                {busy ? "Removing…" : "Confirm"}
              </button>
            </div>
          )}
          {err && <span className="text-red-400">{err}</span>}
        </div>
      )}
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
    if (!r.ok) { setErr(errorOf(r)); return; }
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
            <div className="text-slate-500">Expires {fmtDate(result.expires_at)}</div>
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

// ---------------------------------------------------------------------------
// INSIGHTS TAB — cohort-level analytics, instructor-only
// ---------------------------------------------------------------------------
//
// Four panels, top to bottom:
//   1. Summary stat strip          — total / consented / active-7d / inactive-14d
//   2. Per-branch accuracy bars    — 8 branches, cohort-wide correct / attempts
//   3. Cohort struggles strip      — top 5 lowest-accuracy methods (≥ 10 attempts)
//   4. Per-member mastery table    — one row per student with per-member
//                                    strongest + weakest method (≥ 5 attempts)
//
// Non-consented members appear in the roster panel (as an "x not sharing"
// line); their progress columns are blank. This is the consent contract
// we promised at /join — visible presence, invisible work.

function InsightsTab({ classId }: { classId: string }) {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    const r = await getClassInsights(classId);
    setLoading(false);
    if (!r.ok) { setErr(errorOf(r)); return; }
    setData(r.data);
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="card rounded-2xl p-5 text-slate-500 text-sm">Loading insights…</div>;
  }
  if (err) {
    return (
      <div className="card rounded-xl p-4 border-l-4 border-red-500/60 bg-red-900/10 text-sm text-red-200">
        {err}
      </div>
    );
  }
  if (!data) return null;

  // Per-branch rollup — compute from per_method using METHOD_BRANCH.
  // Why method-based and not case-based: a regression case can contain
  // a CI question whose method is "ci"; under the previous case-based
  // attribution that question's accuracy counted toward "regression"
  // even though it was probing CI knowledge. Method-based attribution
  // matches the pedagogical intent — a student who misses every CI
  // question shows weakness in estimation_inference, regardless of
  // which case the question lived in.
  const branchTotals = new Map<string, { attempts: number; correct: number }>();
  for (const row of data.per_method) {
    const branch = METHOD_BRANCH[row.method];
    if (!branch) continue;
    const cur = branchTotals.get(branch) || { attempts: 0, correct: 0 };
    cur.attempts += row.attempts;
    cur.correct += row.correct;
    branchTotals.set(branch, cur);
  }
  const branchBars = (Object.keys(BRANCHES) as Array<keyof typeof BRANCHES>).map((bid) => {
    const stats = branchTotals.get(bid) || { attempts: 0, correct: 0 };
    const pct = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : null;
    return {
      id: bid,
      name: BRANCHES[bid].name,
      color: BRANCHES[bid].color,
      attempts: stats.attempts,
      correct: stats.correct,
      pct,
    };
  });

  // Cohort struggles — lowest-accuracy methods with enough data to mean
  // something. Threshold (10 attempts) is intentional: on a 5-student class
  // with a few quiz sessions, anything less is noise.
  const struggles = data.per_method
    .filter((m) => m.attempts >= 10)
    .map((m) => ({ ...m, pct: Math.round((m.correct / m.attempts) * 100) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  // Per-member method breakdown → strongest + weakest with ≥ 5 attempts.
  const byMember: Record<string, Array<{ method: string; attempts: number; correct: number; pct: number }>> = {};
  for (const row of data.per_member_method) {
    const pct = row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : 0;
    (byMember[row.user_id] ||= []).push({ ...row, pct });
  }

  return (
    <div className="space-y-5">
      {/* Panel 1: Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Members" value={String(data.summary.total_members)} />
        <SummaryStat
          label="Sharing progress"
          value={`${data.summary.consented_members} / ${data.summary.total_members}`}
          hint={data.summary.consented_members < data.summary.total_members
            ? `${data.summary.total_members - data.summary.consented_members} haven't consented`
            : undefined}
        />
        <SummaryStat label="Active · 7d" value={String(data.summary.active_7d)} tone="ok" />
        <SummaryStat label="Inactive · 14d+" value={String(data.summary.inactive_14d)} tone={data.summary.inactive_14d > 0 ? "warn" : undefined} />
      </div>

      {/* Panel 2: Per-branch accuracy */}
      <div className="card rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">
          Accuracy by branch
        </div>
        {branchBars.every((b) => b.attempts === 0) ? (
          <div className="text-slate-500 text-sm">No attempts yet. Once students answer questions, branch-level accuracy appears here.</div>
        ) : (
          <div className="space-y-2">
            {branchBars.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 text-sm text-slate-200 truncate">{b.name}</div>
                <div className="flex-1 min-w-0 h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
                  {b.pct !== null && (
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, b.pct)}%`, background: b.color }}
                    />
                  )}
                </div>
                <div className="w-24 shrink-0 text-right text-xs">
                  {b.pct === null ? (
                    <span className="text-slate-600">—</span>
                  ) : (
                    <>
                      <span className="text-slate-100 font-semibold mono">{b.pct}%</span>
                      <span className="text-slate-500 mono ml-1.5">· {b.correct}/{b.attempts}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Panel 3: Cohort struggles */}
      {struggles.length > 0 && (
        <div className="card rounded-2xl p-5">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">
            Where the cohort is struggling most
          </div>
          <div className="space-y-1.5">
            {struggles.map((s) => (
              <div key={s.method} className="flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0 text-slate-200 truncate">
                  {METHODS[s.method]?.title || s.method}
                </div>
                <div className="shrink-0 text-xs">
                  <span className="mono text-amber-300 font-semibold">{s.pct}%</span>
                  <span className="mono text-slate-500 ml-1.5">· {s.correct}/{s.attempts}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-3">
            Shown when a method has at least 10 attempts across the cohort — too few and it's noise.
          </div>
        </div>
      )}

      {/* Panel 4: Per-member mastery table */}
      <div className="card rounded-2xl p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/60 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
            Per-student mastery
          </div>
          <button onClick={load} className="text-xs text-slate-400 hover:text-white transition">
            ↻ Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              <tr className="border-b border-slate-800">
                <th className="text-left px-5 py-2.5">Student</th>
                <th className="text-right px-3 py-2.5">Cases</th>
                <th className="text-right px-3 py-2.5">Accuracy</th>
                <th className="text-left px-3 py-2.5">Strongest</th>
                <th className="text-left px-3 py-2.5">Weakest</th>
                <th className="text-right px-5 py-2.5">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.members.map((m) => (
                <MemberMasteryRow key={m.user_id} m={m} byMember={byMember[m.user_id] || []} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MemberMasteryRow({ m, byMember }: { m: InsightsMember; byMember: Array<{ method: string; attempts: number; correct: number; pct: number }> }) {
  // Strongest / weakest require ≥ 5 attempts on that method — fewer and
  // the accuracy number is too noisy to meaningfully call out.
  const qualified = byMember.filter((x) => x.attempts >= 5);
  let strong: typeof qualified[number] | null = null;
  let weak: typeof qualified[number] | null = null;
  if (qualified.length > 0) {
    strong = qualified.slice().sort((a, b) => b.pct - a.pct)[0];
    weak = qualified.slice().sort((a, b) => a.pct - b.pct)[0];
    // If only one qualifying method, don't show it as both strong and weak.
    if (qualified.length === 1) weak = null;
  }

  const accuracyColor =
    m.accuracy_pct === null ? "text-slate-600"
      : m.accuracy_pct >= 80 ? "text-emerald-300"
      : m.accuracy_pct >= 60 ? "text-slate-200"
      : "text-amber-300";

  const lastActiveLabel = fmtDateMD(m.last_active);

  return (
    <tr className="hover:bg-slate-800/20 transition">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-100 truncate">{m.email || "(email hidden)"}</span>
          {m.role === "co-instructor" && (
            <span className="chip text-[9px] bg-cyan-950/50 text-cyan-200 border-cyan-900/60">Co-instructor</span>
          )}
          {m.role === "instructor" && (
            <span className="chip text-[9px] bg-cyan-950/50 text-cyan-200 border-cyan-900/60">Instructor</span>
          )}
          {!m.consented && <Chip tone="warn" size="sm">Not sharing</Chip>}
        </div>
      </td>
      <td className="text-right px-3 py-2.5 mono text-slate-300">
        {m.consented ? m.cases_completed : "—"}
      </td>
      <td className={`text-right px-3 py-2.5 mono font-semibold ${accuracyColor}`}>
        {m.consented && m.accuracy_pct !== null ? `${m.accuracy_pct}%` : "—"}
      </td>
      <td className="px-3 py-2.5 text-xs text-emerald-300/90">
        {strong ? (METHODS[strong.method]?.title || strong.method) : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-2.5 text-xs text-amber-300/90">
        {weak ? (METHODS[weak.method]?.title || weak.method) : <span className="text-slate-600">—</span>}
      </td>
      <td className="text-right px-5 py-2.5 text-xs text-slate-400 mono">
        {m.consented ? lastActiveLabel : "—"}
      </td>
    </tr>
  );
}

function SummaryStat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  const valueColor =
    tone === "ok" ? "text-emerald-300"
      : tone === "warn" ? "text-amber-300"
      : "text-slate-100";
  return (
    <div className="card rounded-xl px-4 py-3">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
      <div className={`text-xl font-bold mono ${valueColor}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition ${
        active
          ? "text-cyan-300 border-cyan-400"
          : "text-slate-400 border-transparent hover:text-slate-200"
      }`}
    >
      {children}
    </button>
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
