// /join?token=XXX landing page. Consumed by instructors' invite emails.
// Vercel rewrites /join → biostat-quest.html so the React app handles it;
// App.tsx detects location.pathname === "/join" on mount and renders
// this view.
//
// Flow:
//   1. Token missing      → error panel, go-home link
//   2. User not signed in → SignInCard (same pattern as SignInCard
//                           elsewhere); after sign-in, the URL still
//                           has ?token=… so re-render picks it up
//   3. User signed in     → class-context panel + consent checkbox
//                           + Accept button. On success redirect to
//                           /biostat-quest.html so they land on home.

import * as React from "react";
import { useState } from "react";
import { acceptInvite, errorOf } from "../lib/classesApi";
import { SignInCard } from "./AuthButton";
import { Ico } from "./Icons";

export function JoinView() {
  // Extract the token once on mount; URL shouldn't change while on this view.
  const [token] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("token") || "";
    } catch {
      return "";
    }
  });

  const [signedIn, setSignedIn] = useState<boolean>(
    () => !!(window.BQAuth?.getUser && window.BQAuth.getUser())
  );
  React.useEffect(() => {
    if (!window.BQAuth?.onAuthChange) return;
    return window.BQAuth.onAuthChange((u: any) => setSignedIn(!!u));
  }, []);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<null | { class_name: string; role: string }>(null);

  async function accept() {
    if (!consent) { setErr("Please consent to continue"); return; }
    setErr("");
    setBusy(true);
    const r = await acceptInvite({ token, consent: true });
    setBusy(false);
    if (!r.ok) { setErr(errorOf(r)); return; }
    setResult({ class_name: r.data.class_name, role: r.data.role });
  }

  // Already accepted successfully → celebrate + redirect
  if (result) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
        <div className="card premium-border rounded-2xl p-10 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
               style={{background:"rgba(16,185,129,0.15)", color:"#10b981"}}>
            <Ico name="check" size={28}/>
          </div>
          <h1 className="t-title text-white mb-2">You're in.</h1>
          <p className="t-body text-slate-300 mb-6">
            Welcome to <strong className="text-white">{result.class_name}</strong>.
          </p>
          <a href="/biostat-quest.html" className="btn btn-primary px-8 py-3 rounded-xl text-sm">
            Start learning →
          </a>
        </div>
      </div>
    );
  }

  // Missing / malformed token — nothing to accept
  if (!token) {
    return (
      <ErrorShell
        title="Invite link is incomplete."
        body="The link you clicked didn't include a valid token. Ask your instructor to resend the invite."
      />
    );
  }

  // Not signed in — show the same SignInCard used elsewhere. After OTP,
  // the page re-renders signed-in and the accept form appears.
  if (!signedIn) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
                 style={{background:"rgba(139,92,246,0.12)", border:"1px solid rgba(139,92,246,0.3)"}}>
              <span className="tag" style={{color:"#a78bfa"}}>● Class invite</span>
            </div>
            <h1 className="t-title text-white mb-2">Sign in to accept</h1>
            <p className="t-body text-slate-400 text-sm">
              You've been invited to a class on BioStat Quest. Sign in with the email your instructor sent the invite to, or with any account — we'll attach this class to whichever identity you use.
            </p>
          </div>
          <SignInCard
            state={undefined}
            context="join-class"
            onSuccess={() => setSignedIn(true)}
            onCancel={() => { window.location.href = "/"; }}
          />
        </div>
      </div>
    );
  }

  // Signed in, ready to consent + accept
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="card rounded-2xl p-8 max-w-md w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
             style={{background:"rgba(139,92,246,0.12)", border:"1px solid rgba(139,92,246,0.3)"}}>
          <span className="tag" style={{color:"#a78bfa"}}>● Class invite</span>
        </div>
        <h1 className="t-title text-white mb-2">You've been invited to a class.</h1>
        <p className="t-body text-slate-400 text-sm mb-6">
          Accepting this invite adds you to the class and shares your case-completion and accuracy data with your instructor for that class only.
        </p>

        <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-700 bg-slate-950/40 mb-5 cursor-pointer hover:border-slate-600 transition">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-cyan-500"
          />
          <span className="text-sm text-slate-200 leading-relaxed">
            I agree that <strong className="text-white">instructors of this class</strong> can see
            my case completion and accuracy data for BioStat Quest. I can revoke this by leaving
            the class.
          </span>
        </label>

        {err && (
          <div className="mb-4 text-xs text-red-400 p-3 rounded-lg border border-red-500/30 bg-red-900/10">
            {err}
          </div>
        )}

        <div className="flex gap-2">
          <a href="/" className="btn btn-ghost px-5 py-3 rounded-xl text-sm flex-1 text-center">Not now</a>
          <button
            onClick={accept}
            disabled={busy || !consent}
            className="btn btn-primary px-5 py-3 rounded-xl text-sm flex-[2] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Joining…" : "Accept & join →"}
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
          If the link has expired or your instructor already removed it, you'll see an error —
          ask them to resend.
        </p>
      </div>
    </div>
  );
}

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="card rounded-2xl p-8 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
             style={{background:"rgba(239,68,68,0.15)", color:"#ef4444"}}>
          <Ico name="cross" size={28}/>
        </div>
        <h1 className="t-title text-white mb-2">{title}</h1>
        <p className="t-body text-slate-300 mb-6">{body}</p>
        <a href="/" className="btn btn-ghost px-6 py-3 rounded-xl text-sm">Back to home</a>
      </div>
    </div>
  );
}
