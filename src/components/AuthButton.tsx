// @ts-nocheck
// Auth UI tree. Extracted from App.tsx so the monolithic root module stays
// focused on game logic. Entry point is <AuthButton/> — the header affordance
// that toggles a modal hosting either <SignInCard/> (OTP + Google) or
// <AccountCard/> (profile + billing + sign-out).
//
// All sub-components (EmailField, OtpInput, GoogleButton, ProgressPreview) are
// kept in this file because they're tightly coupled to the sign-in flow and
// aren't reused elsewhere.
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Ico } from "./Icons";
import { Confetti } from "./Confetti";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { levelFromXP } from "../lib/xp";

function GoogleButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-medium flex items-center justify-center gap-2 border border-slate-300 transition"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18A10.99 10.99 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
      </svg>
      {label || "Continue with Google"}
    </button>
  );
}

// Length of the OTP code Supabase emails. Must match
// Supabase Dashboard → Authentication → Settings → OTP Length.
const OTP_LENGTH = 6;

// N-slot OTP input. Length is controlled via the `length` prop (defaulting
// to OTP_LENGTH). Auto-advances on digit entry, auto-backspaces, handles paste.
function OtpInput({ value, onChange, onComplete, disabled, autoFocus, length = OTP_LENGTH }) {
  const inputsRef = React.useRef([]);
  const digits = value.padEnd(length, " ").slice(0, length).split("");

  React.useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (i, ch) => {
    const next = value.padEnd(length, " ").slice(0, length).split("");
    next[i] = ch;
    const joined = next.join("").replace(/\s+$/, "");
    onChange(joined);
    if (ch && joined.length === length && onComplete) onComplete(joined);
  };

  const handleChange = (i, raw) => {
    const ch = raw.replace(/\D/g, "").slice(-1);
    if (!ch) { setAt(i, " "); return; }
    setAt(i, ch);
    if (i < length - 1) inputsRef.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i].trim() && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) inputsRef.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    if (pasted.length === length && onComplete) onComplete(pasted);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  // Narrower slots when there are many, to keep the row fitting on mobile.
  const slotCls =
    length >= 8
      ? "w-9 h-12 sm:w-10 sm:h-14 text-xl sm:text-2xl"
      : "w-11 h-14 sm:w-12 sm:h-16 text-2xl";

  return (
    <div className="flex gap-1.5 sm:gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          disabled={disabled}
          value={d.trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          className={`${slotCls} text-center font-bold mono rounded-xl bg-slate-800 border-2 border-slate-700 text-white focus:outline-none focus:border-cyan-500 focus:bg-slate-900 transition disabled:opacity-50`}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

// Live-validating email input. Green check when valid, soft grey while typing.
// Enter submits via form submission — parent controls <form>.
function EmailField({ value, onChange, disabled, autoFocus }) {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const touched = value.length > 2;
  return (
    <div className="relative">
      <input
        type="email"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="you@example.com"
        autoComplete="email"
        className={`w-full px-4 py-3 pr-10 rounded-xl bg-slate-800 border text-white placeholder-slate-500 focus:outline-none transition ${
          touched && !valid
            ? "border-red-500/60 focus:border-red-500"
            : touched && valid
            ? "border-emerald-500/60 focus:border-emerald-500"
            : "border-slate-700 focus:border-cyan-500"
        }`}
      />
      {touched && valid && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" aria-hidden><Ico name="check" size={18}/></span>
      )}
    </div>
  );
}

// Premium "this syncs when you sign in" block.
// Shown to guests: either their real progress ("here's what we'll save") or,
// if they have none yet, a three-point value pitch explaining what sync unlocks.
function ProgressPreview({ state }) {
  const xp = state?.xp || 0;
  const badges = (state?.badges || []).length;
  const completed = (state?.completed || []).length;
  const streak = state?.bestStreak || 0;
  const hasProgress = xp > 0 || badges > 0 || completed > 0;

  // No progress yet → show *why* sign-in matters (loss-aversion > feature list).
  if (!hasProgress) {
    const perks = [
      { label: "Sync across devices",   desc: "Pick up on your phone, finish on your laptop." },
      { label: "Never lose a streak",   desc: "Your daily streak survives cleared cookies and new browsers." },
      { label: "Join the leaderboard",  desc: "Opt-in, display-name only — no real name required." },
    ];
    return (
      <div className="relative rounded-2xl border border-cyan-900/30 bg-gradient-to-br from-cyan-950/25 via-slate-900/40 to-violet-950/20 p-4 mb-5 overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }} />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-3">What you unlock</div>
          <ul className="space-y-2.5">
            {perks.map((p) => (
              <li key={p.label} className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-slate-100 leading-tight">{p.label}</div>
                  <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{p.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // Has progress → show concrete stats with "don't lose this" framing.
  const lvl = levelFromXP(xp);
  const pills = [
    { label: "Level", value: lvl },
    { label: "XP", value: xp },
    badges > 0 ? { label: "Badges", value: badges } : null,
    completed > 0 ? { label: "Cases", value: completed } : null,
    streak >= 5 ? { label: "Best streak", value: streak } : null,
  ].filter(Boolean).slice(0, 4);
  return (
    <div className="relative rounded-2xl border border-cyan-900/40 bg-gradient-to-br from-cyan-950/35 via-slate-900/40 to-violet-950/25 p-4 mb-5 overflow-hidden">
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-25" style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold">Your progress, safely synced</div>
          <div className="text-[10px] text-slate-500 mono">locally only →</div>
        </div>
        <div className={`grid gap-2 ${pills.length === 2 ? "grid-cols-2" : pills.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {pills.map((p) => (
            <div key={p.label} className="text-center py-1">
              <div className="text-xl sm:text-2xl font-extrabold stat-number mono leading-none">{p.value}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Unified sign-in card — used by TopBar modal and SoftWallModal alike.
// Handles: Google OAuth, email → OTP verification, resend countdown,
// rate-limit errors, inline validation, and a brief welcome-back celebration.
// Last successfully signed-in email, remembered across sign-outs so the
// user doesn't retype it every time. Cleared only when user picks "Use a
// different email" explicitly.
const LAST_EMAIL_KEY = "bq_last_email";
const readLastEmail = () => {
  try { return localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch { return ""; }
};
const writeLastEmail = (v) => {
  try { if (v) localStorage.setItem(LAST_EMAIL_KEY, v); else localStorage.removeItem(LAST_EMAIL_KEY); } catch {}
};

export function SignInCard({ state, context = "general", onSuccess, onCancel }) {
  const remembered = readLastEmail();
  // "remembered" stage short-circuits the email form when we already know the user.
  const [stage, setStage] = React.useState(remembered ? "remembered" : "start");
  const [email, setEmail] = React.useState(remembered);
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState(""); // '' | 'sending' | 'verifying' | 'error'
  const [errMsg, setErrMsg] = React.useState("");
  const [resendAt, setResendAt] = React.useState(0); // epoch ms when resend is allowed
  const [now, setNow] = React.useState(Date.now());
  // Show Google button only when the provider is actually configured in Supabase.
  // Flip VITE_GOOGLE_AUTH_ENABLED=true in your Vercel env (and local .env.local)
  // once Google OAuth is set up, otherwise users hit a Supabase error page.
  const googleAvailable = String(import.meta.env.VITE_GOOGLE_AUTH_ENABLED || "").toLowerCase() === "true";

  // 1Hz tick while a resend countdown is active.
  React.useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  const resendSecs = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function sendCode(e) {
    if (e) e.preventDefault();
    if (!emailValid) { setStatus("error"); setErrMsg("Enter a valid email."); return; }
    setStatus("sending"); setErrMsg("");
    try {
      await window.BQAuth.signInWithEmail(email.trim());
      setStage("code");
      setStatus("");
      setResendAt(Date.now() + 60_000);
      setNow(Date.now());
    } catch (err) {
      setStatus("error");
      const msg = err?.message || "Could not send code. Try again.";
      if (/rate|too many/i.test(msg)) {
        setErrMsg("Too many requests — wait a minute, then try again.");
        setResendAt(Date.now() + 60_000);
        setNow(Date.now());
      } else {
        setErrMsg(msg);
      }
    }
  }

  async function verify(fullCode) {
    const token = (fullCode ?? code).replace(/\D/g, "");
    if (token.length !== OTP_LENGTH) { setStatus("error"); setErrMsg(`Enter the ${OTP_LENGTH}-digit code.`); return; }
    setStatus("verifying"); setErrMsg("");
    try {
      await window.BQAuth.verifyEmailCode(email.trim(), token);
      writeLastEmail(email.trim());
      setStage("success");
      setStatus("");
      // Let the celebration play; parent dismisses.
      setTimeout(() => onSuccess && onSuccess(), 1900);
    } catch (err) {
      setStatus("error");
      setErrMsg(err?.message || "That code didn't work. Double-check the email.");
    }
  }

  function useDifferentEmail() {
    writeLastEmail("");
    setEmail("");
    setStage("start");
    setStatus("");
    setErrMsg("");
  }

  async function googleSignIn() {
    setStatus("sending"); setErrMsg("");
    try { await window.BQAuth.signInWithGoogle(); }
    catch (err) {
      setStatus("error");
      setErrMsg(err?.message || "Google sign-in failed.");
    }
  }

  // ------- REMEMBERED (returning user, one-tap send) -------
  if (stage === "remembered") {
    const maskedLocal = email.split("@")[0];
    const domain = email.split("@")[1] || "";
    return (
      <div>
        <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-1">
          {context === "post-case" ? "Save your run" : "Welcome back"}
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Continue as the account you used last time, or switch.
        </p>
        {state && <ProgressPreview state={state} />}
        <button
          onClick={async () => { await sendCode(); }}
          disabled={status === "sending"}
          className="w-full btn btn-primary py-3 rounded-xl text-left px-4 flex items-center justify-between gap-3 disabled:opacity-50"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-8 h-8 rounded-full bg-cyan-900/40 border border-cyan-700 flex items-center justify-center text-cyan-300 font-bold text-sm shrink-0">
              {(maskedLocal[0] || "?").toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold truncate">Continue as {maskedLocal}</span>
              <span className="block text-[11px] opacity-80 truncate">@{domain}</span>
            </span>
          </span>
          <span className="shrink-0">{status === "sending" ? "…" : "→"}</span>
        </button>
        {status === "error" && errMsg && (
          <div className="text-xs text-red-400 mt-2 text-center">{errMsg}</div>
        )}
        {googleAvailable && (
          <>
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-slate-700"></div>
              <span className="text-xs text-slate-500">or</span>
              <div className="flex-1 h-px bg-slate-700"></div>
            </div>
            <GoogleButton onClick={googleSignIn} />
          </>
        )}
        <button
          onClick={useDifferentEmail}
          className="w-full mt-3 text-xs text-slate-400 hover:text-white py-2"
        >Use a different email</button>
        {onCancel && (
          <button onClick={onCancel} className="w-full mt-1 text-xs text-slate-500 hover:text-slate-300">
            Cancel — keep playing as guest
          </button>
        )}
      </div>
    );
  }

  // ------- SUCCESS -------
  if (stage === "success") {
    const lvl = levelFromXP(state?.xp || 0);
    const isReturning = !!remembered;
    return (
      <div className="relative text-center py-6">
        <Confetti count={80} />
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-60" style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }} />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center bounce-in shadow-2xl shadow-cyan-500/40">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <h3 className="text-2xl font-extrabold text-white mb-1">{isReturning ? "Welcome back" : "You're in"}</h3>
        <p className="text-slate-300 text-sm">
          {(state?.xp || 0) > 0
            ? <>Level <span className="mono font-bold text-cyan-300">{lvl}</span> · <span className="mono font-bold text-cyan-300">{state?.xp || 0}</span> XP synced</>
            : "Your progress will sync across every device."}
        </p>
        <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Syncing to the cloud
        </p>
      </div>
    );
  }

  // ------- CODE ENTRY -------
  if (stage === "code") {
    return (
      <div>
        <button
          type="button"
          onClick={() => { setStage("start"); setCode(""); setStatus(""); setErrMsg(""); }}
          className="text-xs text-slate-400 hover:text-white mb-4 inline-flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Different email
        </button>
        <div className="text-center mb-6">
          <div className="relative inline-flex items-center justify-center mb-3">
            <div className="absolute inset-0 rounded-2xl blur-xl opacity-50" style={{ background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)" }} />
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-1.5 tracking-tight">Check your inbox</h3>
          <p className="text-sm text-slate-400">We sent a {OTP_LENGTH}-digit code to</p>
          <p className="text-sm text-cyan-300 font-semibold mt-0.5 break-all">{email}</p>
        </div>
        <OtpInput
          value={code}
          onChange={(v) => { setCode(v); if (status === "error") setErrMsg(""); }}
          onComplete={(full) => verify(full)}
          disabled={status === "verifying"}
          autoFocus
        />
        {status === "error" && errMsg && (
          <div className="text-xs text-red-400 mt-3 text-center">{errMsg}</div>
        )}
        {status === "verifying" && (
          <div className="text-xs text-cyan-300 mt-3 text-center flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Verifying…
          </div>
        )}
        <button
          onClick={() => verify()}
          disabled={code.length !== OTP_LENGTH || status === "verifying"}
          className="btn btn-primary w-full py-3.5 rounded-xl mt-5 disabled:opacity-40 text-sm"
        >{status === "verifying" ? "Verifying…" : "Verify & sign in →"}</button>
        <div className="text-center mt-4">
          {resendSecs > 0 ? (
            <span className="text-xs text-slate-500">Resend available in {resendSecs}s</span>
          ) : (
            <button
              type="button"
              onClick={() => sendCode()}
              className="text-xs text-cyan-300 hover:text-cyan-200 font-semibold"
            >Resend code</button>
          )}
        </div>
        <p className="text-[10px] text-slate-600 text-center mt-3">Can't find it? Check spam — or use the magic link in the email.</p>
      </div>
    );
  }

  // ------- START (email entry) -------
  // Value-led headings. Context-aware: post-case leans on the run they just
  // completed; general pitch leads with cross-device sync — the single biggest
  // reason a guest should care about signing in.
  const heading = context === "post-case" ? "Save this run" : "Your progress, everywhere";
  const sub = context === "post-case"
    ? "Add this run to your permanent history — and sync across every device."
    : "Sync XP, streaks, and mastery across every device you study on.";

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-tight leading-tight">{heading}</h3>
        <p className="text-sm text-slate-400 mt-1.5 leading-snug">{sub}</p>
      </div>
      {state && <ProgressPreview state={state} />}
      {googleAvailable && (
        <>
          <GoogleButton onClick={googleSignIn} label={context === "post-case" ? "Save with Google" : "Continue with Google"} />
          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-slate-700/70"></div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">or email</span>
            <div className="flex-1 h-px bg-slate-700/70"></div>
          </div>
        </>
      )}
      <form onSubmit={sendCode}>
        <EmailField value={email} onChange={setEmail} disabled={status === "sending"} autoFocus />
        {status === "error" && errMsg && (
          <div className="text-xs text-red-400 mt-2">{errMsg}</div>
        )}
        <button
          type="submit"
          disabled={!emailValid || status === "sending"}
          className="mt-3 w-full btn btn-primary py-3.5 rounded-xl disabled:opacity-40 text-sm"
        >{status === "sending" ? "Sending…" : `Send ${OTP_LENGTH}-digit code`}</button>
      </form>
      <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          No password
        </span>
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span>~10 seconds</span>
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span>No spam</span>
      </div>
      <div className="text-[10px] text-slate-600 mt-4 text-center">
        By continuing, you agree to our{" "}
        <a href="/privacy.html" className="underline hover:text-slate-400">privacy policy</a>.
      </div>
      {onCancel && (
        <button onClick={onCancel} className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300 py-1.5">
          Keep playing as guest
        </button>
      )}
    </div>
  );
}

// Signed-in-only account settings: display name, leaderboard opt-in, sign out.
// Deliberately separate from SignInCard — keeps both screens single-purpose.
function AccountCard({ state, setState, user, onClose }) {
  const [nameDraft, setNameDraft] = React.useState(state?.display_name || "");
  const [saveStatus, setSaveStatus] = React.useState(""); // '' | 'saving' | 'saved'
  React.useEffect(() => { setNameDraft(state?.display_name || ""); }, [state?.display_name]);
  const lvl = levelFromXP(state?.xp || 0);

  async function handleSignOut() {
    // Clear remembered email so the next user on this browser doesn't see it
    // pre-filled in the Welcome Back screen.
    writeLastEmail("");
    await window.BQAuth.signOut();
    onClose?.();
  }

  async function handleSaveName() {
    const next = { ...state, display_name: trimmed.slice(0, 24), showOnLeaderboard: trimmed ? state.showOnLeaderboard : false };
    setState(next);
    setSaveStatus("saving");
    try {
      await window.BQAuth.saveRemoteStateNow(next);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch {
      setSaveStatus("");
    }
  }

  const trimmed = (nameDraft || "").trim();
  const dirty = trimmed !== (state?.display_name || "");

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-xl font-extrabold text-white truncate">{user.email?.split("@")[0] || "Your account"}</h3>
          <div className="text-xs text-slate-500 truncate">{user.email}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold stat-number">Lv {lvl}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{state?.xp || 0} XP</div>
        </div>
      </div>

      <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-white text-sm">Public leaderboard</div>
          <span className="chip bg-slate-900/60 text-slate-400 text-[10px]">optional</span>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Display name</div>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={nameDraft}
              maxLength={24}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="e.g. epi-owl"
              className="flex-1 min-w-[140px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            />
            <button
              onClick={handleSaveName}
              disabled={!dirty || saveStatus === "saving"}
              className="btn btn-primary px-3 py-2 rounded-lg text-sm disabled:opacity-40 min-w-[64px]"
            >{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? (<span className="inline-flex items-center gap-1.5">Saved <Ico name="check" size={14}/></span>) : "Save"}</button>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Up to 24 chars. Blank = hidden from the leaderboard.</div>
        </div>
        <label className="flex items-start gap-2 cursor-pointer select-none text-sm text-slate-200">
          <input
            type="checkbox"
            checked={!!state?.showOnLeaderboard}
            disabled={!state?.display_name}
            onChange={() => state?.display_name && setState({ ...state, showOnLeaderboard: !state.showOnLeaderboard })}
            className="mt-1"
          />
          <span>
            Show me on the public leaderboard
            {!state?.display_name && <span className="text-[11px] text-slate-500 block">Set a display name first.</span>}
          </span>
        </label>
      </div>

      <SubscriptionPanel/>

      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700">Close</button>
        <button onClick={handleSignOut} className="flex-1 py-2 rounded-lg bg-red-900/50 text-red-200 hover:bg-red-900/80 border border-red-800">Sign out</button>
      </div>
    </div>
  );
}

export function AuthButton({ state, setState }) {
  const [user, setUser] = React.useState(null);
  // Track whether this mount opened the modal via ?auth=1 (i.e. the user
  // arrived here from the landing-page "Sign in" link). We use this to send
  // them back to "/" if they close the modal without signing in.
  const openedViaAuthParamRef = React.useRef(false);
  const [open, setOpen] = React.useState(() => {
    try {
      const via = new URLSearchParams(window.location.search).get("auth") === "1";
      openedViaAuthParamRef.current = via;
      return via;
    } catch { return false; }
  });

  // Strip ?auth=1 from the URL once we've consumed it, so refreshing or
  // navigating back doesn't keep re-opening the modal.
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("auth")) {
        url.searchParams.delete("auth");
        const qs = url.searchParams.toString();
        window.history.replaceState(null, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
      }
    } catch {}
  }, []);

  // Close handler: if the modal was opened because the user clicked "Sign in"
  // on the landing page (?auth=1) and they're closing without having signed
  // in, honor the "cancel" intent and return them to the landing page.
  const closeModal = React.useCallback(() => {
    const cameFromLanding = openedViaAuthParamRef.current;
    // Consume the flag — any subsequent open from inside the app is a normal
    // modal close and should stay on the current view.
    openedViaAuthParamRef.current = false;
    setOpen(false);
    if (cameFromLanding && !user) {
      try { window.location.href = "/"; } catch {}
    }
  }, [user]);

  React.useEffect(() => {
    if (!window.BQAuth) return;
    const unsub = window.BQAuth.onAuthChange(u => setUser(u));
    return unsub;
  }, []);

  const authConfigured = window.BQAuth && window.BQAuth.enabled;

  const trigger = !authConfigured ? (
    <button
      onClick={() => setOpen(true)}
      className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
      title="Accounts not yet configured"
    >Sign in</button>
  ) : user ? (
    <button
      onClick={() => setOpen(true)}
      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60 border border-emerald-800"
    >
      <span className="hidden sm:inline-flex items-center mr-1.5"><Ico name="check" size={12}/></span>{user.email?.split("@")[0] || "Account"}
    </button>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-white hover:from-cyan-400 hover:to-violet-500 font-semibold shadow-lg shadow-cyan-900/40"
    >Sign in</button>
  );

  if (!open) return trigger;

  return (
    <>
      {trigger}
      {ReactDOM.createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 fade-in"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="premium-border rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: "linear-gradient(180deg, #0a0f1e 0%, #07091a 100%)" }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
            <div className="p-6 sm:p-7 relative">
              {!authConfigured ? (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">Accounts are coming soon</h3>
                  <p className="text-sm text-slate-400 mb-4">Progress currently saves in this browser only. Sign-in is being set up — check back shortly to sync your XP and streaks across devices.</p>
                  <button onClick={() => setOpen(false)} className="btn btn-primary w-full py-2 rounded-lg">Keep playing as guest</button>
                </>
              ) : user ? (
                <AccountCard state={state} setState={setState} user={user} onClose={() => setOpen(false)} />
              ) : (
                <SignInCard
                  state={state}
                  context="general"
                  onSuccess={() => setOpen(false)}
                  onCancel={closeModal}
                />
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
