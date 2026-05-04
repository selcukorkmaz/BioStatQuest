// @ts-nocheck
import * as React from "react";
import * as ReactDOM from "react-dom";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import "./lib/auth";
import { gradeCard as srsGradeCard, getDueCount as srsGetDueCount, getDueQids as srsGetDueQids, getMasteryByMethod as srsGetMasteryByMethod } from "./lib/srs";
import { billing } from "./lib/billing";
import { SubscriptionPanel, useSubscription } from "./components/SubscriptionPanel";
import { NAV_ICON, BRANCH_ICON, LESSON_ICON, UI_ICON, ICON_MARKUP, renderIconMarkup, iconSvgFragment, Ico, BranchGlyph } from "./components/Icons";
import { Confetti } from "./components/Confetti";
import { AuthButton, SignInCard } from "./components/AuthButton";
import { DeepDive } from "./components/DeepDive";
import { CasePlay } from "./components/CasePlay";
import { TeachView } from "./components/TeachView";
import { JoinView } from "./components/JoinView";
import { MyClassesBand } from "./components/MyClassesBand";
import { hasAnyInstructorRole } from "./lib/classesApi";
import { levelFromXP, xpForLevel } from "./lib/xp";
import { DIFFICULTIES, REVIEW_CASE_ID } from "./lib/difficulty";
import { getMethodMastery } from "./lib/mastery";
import { adaptiveOrder } from "./lib/adaptive";
import { effectivelyPro, OPEN_BETA_PRO } from "./lib/launchFlags";

// ============================================================
// BILLING / GATING (Phase 3a — consumer Pro tier)
// Free tier: first FREE_CASES_LIMIT cases in catalog order.
// Pro tier (and institutional): all 50 cases.
// Admin gets Pro by default too (so you can test gated content).
// ============================================================
const FREE_CASES_LIMIT = 20;
const PRO_PRICE_MONTHLY_USD = 9;
const PRO_PRICE_YEARLY_USD = 60;

// isCaseLockedForUser moved to src/lib/access.ts. Re-imported below.

// Hook: current subscription state. Returns null while loading. Auto-refreshes
// on auth change and when the app refocuses (covers the Stripe-return roundtrip).
import { BRANCHES } from "./data/branches";
import { METHODS } from "./data/methods";
import { CASES } from "./data/cases";
import { DIAGNOSTIC } from "./data/diagnostic";
import { getNarrative, getNarrativeQids, getActForQid } from "./data/caseNarratives";
import { GLOSSARY, GLOSSARY_BY_ID, GLOSSARY_KIND_META, normalizeGlossaryText } from "./data/glossary";
import { MyMisconceptions } from "./views/MyMisconceptions";
import { Exam } from "./views/Exam";
import { Competency } from "./views/Competency";
import { Upgrade } from "./views/Upgrade";
import { fmtNumber, fmtDate, fmtDateTime, fmtTime } from "./lib/format";
import { buildStudyPath, recommendedDifficultyFromBand, bandLabel } from "./lib/diagnostic";
import { useUrlPath } from "./lib/useUrlPath";
import { viewFromPath, pathFromView, viewHasUrl } from "./lib/viewRoutes";
import { useFocusTrap } from "./lib/useFocusTrap";


// ============================================================
// MASSIVE QUESTION BANK — organized by case.
// Each question has a stable qid so we can track "seen" and never repeat on replay.
// ============================================================

// Helper to auto-add qids

// ============================================================
// BADGES
// ============================================================
// Simulator ids used by the Interactive Lab page. Kept here so the
// "Simulator Scout" badge can compute its target without importing Lab.
const LAB_SIM_IDS = ["power","clt","roc","bayes","reg","boot"];

// Badge categories. Order here drives the order on the Badges page.
const BADGE_CATEGORIES = [
  { id: "cases",      label: "Cases",       blurb: "Case-playthrough milestones." },
  { id: "mastery",    label: "Mastery",     blurb: "Depth across topics and perfect runs." },
  { id: "difficulty", label: "Difficulty",  blurb: "Earned by leveling the challenge up." },
  { id: "streak",     label: "Streaks",     blurb: "Consecutive correct answers." },
  { id: "rlab",       label: "R Lab",       blurb: "Hands-on R in the browser." },
  { id: "engagement", label: "Engagement",  blurb: "Study habits and coverage." },
  { id: "accuracy",   label: "Accuracy",    blurb: "Precision across your entire run." },
  { id: "milestone",  label: "Milestones",  blurb: "Level-ups and time rewards." },
];

// Each badge: id, name, icon (emoji for reward character), cat (category id),
// desc, check(state) → boolean, and optional progress(state) → [n, target]
// used to render a progress bar on locked, measurable badges.
const BADGES = [
  // CASES
  { id:"first_case",   name:"First Blood",           icon:"droplet", cat:"cases",    desc:"Complete your first case",
    check: s => s.completed.length >= 1 },
  { id:"five_cases",   name:"Case Closer",           icon:"folder", cat:"cases",    desc:"Complete 5 cases",
    check: s => s.completed.length >= 5,
    progress: s => [Math.min(s.completed.length, 5), 5] },
  { id:"ten_cases",    name:"Veteran Investigator",  icon:"medal-ribbon", cat:"cases",    desc:"Complete 10 cases",
    check: s => s.completed.length >= 10,
    progress: s => [Math.min(s.completed.length, 10), 10] },
  { id:"all_cases",    name:"Full Dossier",          icon:"books", cat:"cases",    desc:"Complete every case at least once",
    check: s => s.completed.length >= CASES.length,
    progress: s => [Math.min(s.completed.length, CASES.length), CASES.length] },

  // MASTERY
  { id:"perfectionist",name:"Perfectionist",         icon:"hundred", cat:"mastery",  desc:"Achieve 100% on a case",
    check: s => s.perfectRuns >= 1 },
  { id:"triple_perf",  name:"Triple Threat",         icon:"flame", cat:"mastery",  desc:"3 perfect runs",
    check: s => s.perfectRuns >= 3,
    progress: s => [Math.min(s.perfectRuns, 3), 3] },
  { id:"branched",     name:"Well-Rounded",          icon:"tree", cat:"mastery",  desc:"Complete cases in 4 branches",
    check: s => new Set(s.completed.map(c => CASES.find(k=>k.id===c)?.branch)).size >= 4,
    progress: s => [Math.min(new Set(s.completed.map(c => CASES.find(k=>k.id===c)?.branch)).size, 4), 4] },
  { id:"all_branches", name:"Polymath",              icon:"globe", cat:"mastery",  desc:"Cases in ALL 8 branches",
    check: s => new Set(s.completed.map(c => CASES.find(k=>k.id===c)?.branch)).size >= 8,
    progress: s => [Math.min(new Set(s.completed.map(c => CASES.find(k=>k.id===c)?.branch)).size, 8), 8] },
  { id:"bayesian",     name:"Bayesian Convert",      icon:"orb", cat:"mastery",  desc:"Complete a Bayesian case",
    check: s => s.completed.includes("b1") },
  { id:"p_hacker",     name:"P-Value Police",        icon:"shield", cat:"mastery",  desc:"Complete the P-Value Courtroom",
    check: s => s.completed.includes("t2") },

  // DIFFICULTY
  { id:"hard_mode",    name:"Rising Fellow",         icon:"swords", cat:"difficulty", desc:"Complete on Fellow+ with ≥70%",
    check: s => s.hardWins >= 1 },
  { id:"pi_mode",      name:"Peer Reviewer",         icon:"magnifier", cat:"difficulty", desc:"Complete on PI difficulty",
    check: s => s.piWins >= 1 },

  // STREAKS
  { id:"streak3",      name:"Hot Streak",            icon:"bolt", cat:"streak",   desc:"Answer 10 in a row correctly",
    check: s => s.bestStreak >= 10,
    progress: s => [Math.min(s.bestStreak, 10), 10] },
  { id:"streak5",      name:"Unstoppable",           icon:"burst", cat:"streak",   desc:"Answer 25 in a row correctly",
    check: s => s.bestStreak >= 25,
    progress: s => [Math.min(s.bestStreak, 25), 25] },

  // R LAB (new)
  { id:"rlab_first",   name:"First Line",            icon:"laptop", cat:"rlab",     desc:"Run R code successfully for the first time",
    check: s => (s.rLabRunsOk || 0) >= 1 },
  { id:"rlab_5",       name:"Lab Rat",               icon:"dna", cat:"rlab",     desc:"Complete the quiz on 5 R Lab lessons",
    check: s => (s.rLabCompleted || []).length >= 5,
    progress: s => [Math.min((s.rLabCompleted || []).length, 5), 5] },
  { id:"rlab_all",     name:"R Fluent",              icon:"diamond", cat:"rlab",     desc:"Complete every R Lab lesson",
    check: s => (s.rLabCompleted || []).length >= R_LESSONS.length,
    progress: s => [Math.min((s.rLabCompleted || []).length, R_LESSONS.length), R_LESSONS.length] },
  { id:"rlab_perf",    name:"Statistics Savant",     icon:"brain", cat:"rlab",     desc:"Score perfect on 3 R Lab lesson quizzes",
    check: s => (s.rLabPerfect || []).length >= 3,
    progress: s => [Math.min((s.rLabPerfect || []).length, 3), 3] },

  // ENGAGEMENT (new)
  { id:"sims_all",     name:"Simulator Scout",       icon:"beaker", cat:"engagement", desc:"Open every Interactive Lab simulator",
    check: s => (s.labSimsSeen || []).length >= LAB_SIM_IDS.length,
    progress: s => [Math.min((s.labSimsSeen || []).length, LAB_SIM_IDS.length), LAB_SIM_IDS.length] },
  { id:"diagnostic_done", name:"Self-Aware",         icon:"compass", cat:"engagement", desc:"Complete the diagnostic assessment",
    check: s => !!s.onboardingCompletedAt },
  { id:"daily_3",      name:"Disciplined",           icon:"calendar", cat:"engagement", desc:"Study on 3 consecutive days",
    check: s => Math.max(s.dailyStreak || 0, s.dailyStreakBest || 0) >= 3,
    progress: s => [Math.min(Math.max(s.dailyStreak || 0, s.dailyStreakBest || 0), 3), 3] },
  { id:"daily_7",      name:"Consistent",            icon:"calendar-week", cat:"engagement", desc:"Study on 7 consecutive days",
    check: s => Math.max(s.dailyStreak || 0, s.dailyStreakBest || 0) >= 7,
    progress: s => [Math.min(Math.max(s.dailyStreak || 0, s.dailyStreakBest || 0), 7), 7] },
  { id:"srs_first",    name:"Spaced Apprentice",     icon:"recycle", cat:"engagement", desc:"Complete your first Daily Review",
    check: s => (s.srsReviewsDone || 0) >= 1 },

  // ACCURACY (new)
  { id:"sharpshooter", name:"Sharpshooter",          icon:"target", cat:"accuracy", desc:"Hold 90% overall accuracy (with ≥50 answers)",
    check: s => s.stats.totalAnswered >= 50 && (s.stats.totalCorrect / s.stats.totalAnswered) >= 0.90,
    progress: s => [Math.min(s.stats.totalAnswered, 50), 50] },

  // MILESTONES
  { id:"level_5",      name:"Senior Scientist",      icon:"cap", cat:"milestone", desc:"Reach level 5",
    check: s => levelFromXP(s.xp) >= 5,
    progress: s => [Math.min(levelFromXP(s.xp), 5), 5] },
  { id:"level_10",     name:"Principal Investigator",icon:"trophy", cat:"milestone", desc:"Reach level 10",
    check: s => levelFromXP(s.xp) >= 10,
    progress: s => [Math.min(levelFromXP(s.xp), 10), 10] },
  { id:"level_20",     name:"World-Class",           icon:"star-shine", cat:"milestone", desc:"Reach level 20",
    check: s => levelFromXP(s.xp) >= 20,
    progress: s => [Math.min(levelFromXP(s.xp), 20), 20] },
  { id:"speed",        name:"Fast Thinker",          icon:"stopwatch", cat:"milestone", desc:"Finish a case with time bonus",
    check: s => s.speedRuns >= 1 },
];

// Streak helpers — extracted to src/lib/streak.ts for testability. Same
// semantics, re-exported here so existing call sites continue to work.
import { bumpDailyStreak, bumpReviewStreak, ymdToday, ymdYesterday } from "./lib/streak";

// Run every badge.check(state) and return the state with any newly-qualifying
// badges appended to state.badges, plus the list of badges newly awarded.
function applyBadgeChecks(state) {
  const badges = [...(state.badges || [])];
  const newly = [];
  for (const b of BADGES) {
    if (!badges.includes(b.id)) {
      try {
        if (b.check(state)) { badges.push(b.id); newly.push(b); }
      } catch { /* badge's check threw — skip gracefully */ }
    }
  }
  return { state: { ...state, badges }, newly };
}


// ============================================================
// STORAGE
// ============================================================
const STATE_KEY = "biostatquest_v2";
const DEFAULT_STATE = {
  xp: 0, completed: [], perfectRuns: 0, hardWins: 0, piWins: 0, speedRuns: 0,
  badges: [], caseScores: {}, seenQuestions: {}, // caseId -> Set of qids seen (store as array)
  currentStreak: 0, bestStreak: 0,
  // Review-specific streak (FSRS Phase 1): consecutive days with ≥1 review
  // session. Stricter than dailyStreak; used on Home to reward discipline.
  reviewStreak: 0, reviewStreakBest: 0, lastReviewDate: "",
  stats: { totalAnswered: 0, totalCorrect: 0, byBranch: {} }, // byBranch: { branch: {answered, correct} }
  srs: {}, // qid -> {ef, interval (days), reps, lapses, due (ms epoch), last (ms)}
  // Phase 3 additions
  display_name: "",             // public handle for the leaderboard; empty = hidden
  showOnLeaderboard: false,     // opt-in toggle (requires display_name to appear)
  streakLastActiveMs: 0,        // ms-epoch of last correct answer — drives the streak-at-risk nudge
  sharedAchievements: [],       // achievement IDs the user already dismissed/shared (don't re-prompt)
  // Trust-first diagnostic onboarding (Phase 1). If neither *At field is set,
  // a zero-progress user is routed through the diagnostic on first visit.
  onboardingVersion: 0,         // schema version — bump to re-trigger when we update the diagnostic bank
  onboardingCompletedAt: 0,     // ms-epoch when the user finished the diagnostic
  onboardingSkippedAt: 0,       // ms-epoch when the user skipped — we respect their choice
  learnerGoal: "",              // "exams" | "reading" | "research" — lightweight intent signal
  diagnosticAnswers: [],        // [{ id, branch, method, correct, picked }]
  diagnosticProfile: null,      // { byBranch: {k: {correct,total}}, overallPct, band, totalCorrect, totalAnswered }
  studyPath: [],                // [{ caseId, branch, reason }] — curated 3-case path from diagnostic

  // Engagement counters for the new badges (R Lab / simulators / streaks).
  // Synced from the R Lab persisted state and simulator tab visits.
  rLabCompleted: [],            // lesson ids where every quiz question has been revealed
  rLabPerfect: [],              // lesson ids where every quiz answer was correct on the first try
  rLabRunsOk: 0,                // cumulative count of successful R code runs
  labSimsSeen: [],              // interactive-lab simulator ids the user has opened
  srsReviewsDone: 0,            // number of Daily Review sessions completed
  dailyStreak: 0,               // consecutive-days active (today inclusive)
  dailyStreakBest: 0,           // best daily streak ever reached
  lastActivityDate: "",         // YYYY-MM-DD of the most recent "active" day
};

const ONBOARDING_VERSION_CURRENT = 1;

function loadState() {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (!v) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...v,
      seenQuestions: v.seenQuestions || {},
      srs: v.srs || {},
      stats: { ...DEFAULT_STATE.stats, ...(v.stats||{}), byBranch: {...(v.stats?.byBranch||{})} }
    };
  } catch { return structuredClone(DEFAULT_STATE); }
}
function saveState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
  // Sync to cloud if signed in (debounced inside BQAuth).
  try { if (window.BQAuth && window.BQAuth.getUser()) window.BQAuth.saveRemoteState(s); } catch {}
}

// Boot auth once; when user signs in, merge local → remote and reload app state.
if (window.BQAuth) {
  window.BQAuth.init().then(async () => {
    if (window.BQAuth.getUser()) {
      const local = loadState();
      const merged = await window.BQAuth.mergeLocalIntoRemote(local);
      if (merged) { try { localStorage.setItem(STATE_KEY, JSON.stringify(merged)); } catch {} }
    }
  });
  window.BQAuth.onAuthChange(async (user) => {
    if (user) {
      const remote = await window.BQAuth.loadRemoteState();
      if (remote) {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(remote)); } catch {}
        // Trigger a soft reload so React picks up new state.
        window.dispatchEvent(new Event("bq-state-reload"));
      }
    } else {
      // Sign-out: wipe the in-browser copy of this user's progress so the
      // next person on this device starts clean. Their data is safe in
      // Supabase and will re-hydrate on sign-in.
      try { localStorage.removeItem(STATE_KEY); } catch {}
      window.dispatchEvent(new Event("bq-state-reload"));
    }
  });
}

// ============================================================
// QUESTION SELECTION — never repeats on replay until bank exhausted
// ============================================================
// Shuffle a question's options uniformly and remap the answer index/array.
// Leaves numeric questions untouched. Never mutates the original bank entry.
function shuffleQuestionOptions(q) {
  if (!q.options || !Array.isArray(q.options)) return q;
  const perm = q.options.map((_,i)=>i);
  for (let i=perm.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [perm[i],perm[j]]=[perm[j],perm[i]]; }
  const newOptions = perm.map(i=>q.options[i]);
  let newAnswer;
  if (q.type === "mcq") {
    newAnswer = perm.indexOf(q.answer);
  } else if (q.type === "multi") {
    const setA = new Set(q.answer);
    newAnswer = perm.map((orig,newIdx)=>setA.has(orig)?newIdx:-1).filter(x=>x>=0);
  } else {
    newAnswer = q.answer;
  }
  // Distractor-keyed maps (optionExplanations, misconceptionTag) are stored
  // by ORIGINAL index; remap them through `perm` so the right text reaches
  // the right (post-shuffle) option. Without this, after shuffle the wrong
  // explanation surfaces for the wrong distractor.
  const remapByOption = (m) => {
    if (!m) return m;
    const out = {};
    for (const k of Object.keys(m)) {
      const oldIdx = Number(k);
      const newIdx = perm.indexOf(oldIdx);
      if (newIdx >= 0) out[newIdx] = m[k];
    }
    return out;
  };
  return {
    ...q,
    options: newOptions,
    answer: newAnswer,
    optionExplanations: remapByOption(q.optionExplanations),
    misconceptionTag: remapByOption(q.misconceptionTag),
  };
}

// SM-2-lite spaced repetition update. quality: 1 = wrong, 4 = correct.
function updateSRS(srs, qid, quality) {
  const prev = srs[qid] || { ef: 2.5, interval: 0, reps: 0, lapses: 0 };
  let { ef, interval, reps, lapses } = prev;
  if (quality < 3) {
    reps = 0; interval = 1; lapses += 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = Math.max(1, Math.round(interval * ef));
    reps += 1;
    ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  }
  const now = Date.now();
  // Lapses re-surface in ~10 minutes so the review queue works within a session.
  // Correct answers use the full SM-2 interval in days.
  const dueMs = quality < 3 ? 10 * 60 * 1000 : interval * 86400000;
  return { ...srs, [qid]: { ef, interval, reps, lapses, due: now + dueMs, last: now } };
}

function countDueSRS(srs, bankQids) {
  const now = Date.now();
  let n = 0;
  for (const qid of bankQids) {
    const s = srs[qid];
    if (s && s.due <= now) n++;
  }
  return n;
}

// Review mode — collect every due question across every case, sorted most-overdue first.
// Returns questions with `_caseId` and `_branch` fields so finishCase can attribute
// stats to the original branch even though the session spans multiple cases.
function getDueQuestionsAcrossCases(srs, limit = 20) {
  const now = Date.now();
  const due = [];
  for (const c of CASES) {
    for (const q of c.bank) {
      const s = srs[q.qid];
      if (s && s.due <= now) {
        due.push({ ...q, _caseId: c.id, _branch: c.branch, _due: s.due });
      }
    }
  }
  due.sort((a, b) => a._due - b._due);
  return due.slice(0, limit);
}



// ============================================================
// DIAGNOSTIC scoring + study-path generation
// Coarse, deterministic, and explainable — no fake precision.
// ============================================================

function scoreDiagnostic(answers) {
  const byBranch = {};
  for (const a of answers) {
    byBranch[a.branch] = byBranch[a.branch] || { correct: 0, total: 0 };
    byBranch[a.branch].total++;
    if (a.correct) byBranch[a.branch].correct++;
  }
  const totalAnswered = answers.length;
  const totalCorrect = answers.filter((a) => a.correct).length;
  const overallPct = totalAnswered > 0 ? totalCorrect / totalAnswered : 0;
  const band = overallPct < 0.4 ? "emerging" : overallPct < 0.7 ? "developing" : "strong";
  return { byBranch, overallPct, band, totalCorrect, totalAnswered };
}

// buildStudyPath / recommendedDifficultyFromBand / bandLabel were moved to
// src/lib/diagnostic.ts for testability and are imported at the top of
// this file. scoreDiagnostic kept in-place above for now (App.tsx's
// finishDiagnostic still calls it locally).

function pickQuestions(caseObj, seenArr, srs) {
  const n = caseObj.qPerRun;
  const bank = caseObj.bank;

  // Narrative cases use a fixed canonical path — the order chosen by the
  // author to carry the 4-act arc. Randomising would break the pacing and
  // the reveal placement, so we bypass the SRS/unseen heuristic entirely.
  const narrativeQids = getNarrativeQids(caseObj.id);
  if (narrativeQids.length > 0) {
    const byQid = new Map(bank.map((q) => [q.qid, q]));
    const ordered = narrativeQids.map((qid) => byQid.get(qid)).filter(Boolean);
    if (ordered.length === narrativeQids.length) {
      return ordered.map(shuffleQuestionOptions);
    }
    // If a qid is missing from the bank we fall through rather than ship a
    // broken authored run — the test harness also asserts this doesn't happen.
  }

  const seenSet = new Set(seenArr || []);
  const now = Date.now();
  const srsMap = srs || {};
  const shuf = (arr) => { for (let i=arr.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };
  // Priority 1: items due for review (seen before, SRS says due)
  const due = shuf(bank.filter(q => srsMap[q.qid] && srsMap[q.qid].due <= now));
  // Priority 2: unseen items — biased by F4 adaptive order so weaker
  // methods bubble to the top of the queue. Within methods, ordering
  // remains random (Efraimidis-Spirakis weighted reservoir handles ties).
  const unseenSet = new Set();
  const unseenRaw = bank.filter(q => { if (seenSet.has(q.qid) || srsMap[q.qid]) return false; unseenSet.add(q.qid); return true; });
  const unseen = adaptiveOrder(unseenRaw, srsMap);
  // Priority 3: not-yet-due seen items (fillers)
  const rest = shuf(bank.filter(q => !unseenSet.has(q.qid) && !(srsMap[q.qid] && srsMap[q.qid].due <= now)));
  let picked = [...due, ...unseen, ...rest].slice(0, n);
  if (picked.length < n) picked = shuf(bank.slice()).slice(0, n);
  return picked.map(shuffleQuestionOptions);
}

// ============================================================
// UI COMPONENTS
// ============================================================

function TopBar({ state, setState, onReset, onNav, current }) {
  const level = levelFromXP(state.xp);
  const nextXP = xpForLevel(level+1);
  const prevXP = xpForLevel(level);
  const pct = Math.min(100, ((state.xp - prevXP) / (nextXP - prevXP)) * 100);
  const acc = state.stats.totalAnswered>0 ? Math.round(state.stats.totalCorrect/state.stats.totalAnswered*100) : 0;
  // Admin-only nav: triage queue for question reports. Shown only if signed in
  // as admin (email-gated). Re-checked on auth changes via a render tick.
  const [isAdminNow, setIsAdminNow] = React.useState(() => window.BQAuth?.isAdmin?.() ?? false);
  React.useEffect(() => {
    if (!window.BQAuth?.onAuthChange) return;
    return window.BQAuth.onAuthChange(() => setIsAdminNow(window.BQAuth.isAdmin()));
  }, []);

  // Instructor nav: "Teach" tab, shown only when the signed-in user has at
  // least one instructor/co-instructor membership. Checked once on mount
  // and whenever the auth user changes (sign-in / sign-out). Failure mode
  // is "hide the tab" — we never show Teach speculatively.
  const [isInstructorNow, setIsInstructorNow] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const yes = await hasAnyInstructorRole();
      if (!cancelled) setIsInstructorNow(yes);
    };
    check();
    if (window.BQAuth?.onAuthChange) {
      const off = window.BQAuth.onAuthChange(check);
      return () => { cancelled = true; off?.(); };
    }
    return () => { cancelled = true; };
  }, []);

  // Pro tier visibility — hide the "Upgrade" nav button for users who
  // already have Pro (or institutional) so the chrome stays clean.
  const [isProNow, setIsProNow] = React.useState(() => effectivelyPro(undefined));
  React.useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const s = await window.BQAuth?.fetchSubscription?.();
        if (!cancelled) setIsProNow(effectivelyPro(s?.user_type));
      } catch { /* leave as false */ }
    };
    check();
    if (window.BQAuth?.onAuthChange) {
      const off = window.BQAuth.onAuthChange(check);
      return () => { cancelled = true; off?.(); };
    }
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/70 border-b border-purple-900/30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <a
          href="/"
          className="flex items-center gap-2 sm:gap-3 min-w-0 group"
          title="Back to biostatquest.com"
        >
          <div className="float relative shrink-0 transition-transform group-hover:scale-105" style={{width:'44px',height:'38px'}}>
            <svg width="44" height="38" viewBox="0 0 52 44" fill="none" style={{overflow:'visible'}}>
              <defs>
                <linearGradient id="bqStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#c084fc"/>
                  <stop offset="35%" stopColor="#8b5cf6"/>
                  <stop offset="65%" stopColor="#06b6d4"/>
                  <stop offset="100%" stopColor="#34d399"/>
                </linearGradient>
                <linearGradient id="bqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55"/>
                  <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"/>
                </linearGradient>
                <radialGradient id="bqPeakGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fde68a" stopOpacity="0.95"/>
                  <stop offset="60%" stopColor="#fbbf24" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity="0"/>
                </radialGradient>
                <filter id="bqGlow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="1.8" result="b"/>
                  <feMerge>
                    <feMergeNode in="b"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* soft axis with tick marks */}
              <line x1="4" y1="36" x2="48" y2="36" stroke="#334155" strokeWidth="0.8" strokeLinecap="round"/>
              <line x1="14" y1="36" x2="14" y2="38" stroke="#334155" strokeWidth="0.8"/>
              <line x1="26" y1="36" x2="26" y2="38.5" stroke="#475569" strokeWidth="1"/>
              <line x1="38" y1="36" x2="38" y2="38" stroke="#334155" strokeWidth="0.8"/>
              {/* peak glow behind */}
              <circle cx="26" cy="8" r="9" fill="url(#bqPeakGlow)"/>
              {/* filled bell */}
              <path d="M 4 36
                       C 11 36, 15 35.5, 18 29
                       C 20.5 22, 22.5 12, 26 8
                       C 29.5 12, 31.5 22, 34 29
                       C 37 35.5, 41 36, 48 36 Z"
                    fill="url(#bqFill)"/>
              {/* main bell stroke with glow */}
              <path d="M 4 36
                       C 11 36, 15 35.5, 18 29
                       C 20.5 22, 22.5 12, 26 8
                       C 29.5 12, 31.5 22, 34 29
                       C 37 35.5, 41 36, 48 36"
                    stroke="url(#bqStroke)" strokeWidth="2.3" fill="none"
                    strokeLinecap="round" filter="url(#bqGlow)"/>
              {/* σ-bands: subtle dashed verticals */}
              <line x1="20" y1="19" x2="20" y2="36" stroke="#64748b" strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.55"/>
              <line x1="32" y1="19" x2="32" y2="36" stroke="#64748b" strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.55"/>
              {/* mean line μ */}
              <line x1="26" y1="10" x2="26" y2="36" stroke="#fbbf24" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.85"/>
              {/* peak dot */}
              <circle cx="26" cy="8" r="2.3" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8"/>
              <circle cx="26" cy="8" r="0.9" fill="#fff"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-base sm:text-lg text-white tracking-tight leading-none transition-colors group-hover:text-cyan-200">BioStat <span className="gold-text">Quest</span></div>
          </div>
        </a>
        {/* Nav: primary items always visible; secondary items collapse into
            a "More ▾" dropdown to keep the chrome from feeling like a
            kitchen sink. Upgrade moved to the right-side account block
            (Pro CTA deserves prominence next to identity). */}
        <NavBar current={current} onNav={onNav} isInstructorNow={isInstructorNow} isAdminNow={isAdminNow} />
        <div className="order-2 md:order-3 flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Single compact progress block: Lv · XP. Accuracy moved off the
              shell — it lives on /stats where it belongs. */}
          <div className="text-right min-w-0 hidden sm:block">
            <div className="flex items-center gap-1.5 justify-end whitespace-nowrap text-xs text-slate-300">
              <span className="font-semibold text-white">Lv {level}</span>
              <span className="text-slate-600">·</span>
              <span className="mono text-slate-400">{fmtNumber(state.xp)} XP</span>
            </div>
            <div className="bar w-32 sm:w-40 mt-1.5 ml-auto"><div style={{width: pct+"%"}}></div></div>
          </div>
          {!isProNow && (
            <button
              onClick={()=>onNav("upgrade")}
              aria-label="Upgrade to Pro"
              title="Upgrade — see what Pro unlocks"
              aria-current={current==="upgrade" ? "page" : undefined}
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition border whitespace-nowrap shrink-0 ${current==="upgrade"
                ? "bg-amber-500/30 border-amber-400 text-amber-100"
                : "bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25 hover:border-amber-400"}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4 L 12 14"/>
                <path d="M8 8 L 12 4 L 16 8"/>
                <path d="M5 18 L 12 14 L 19 18 L 17 21 L 12 19 L 7 21 z" fill="currentColor" stroke="none"/>
              </svg>
              {/* Text only at lg+ — keeps the right block tight on mid-widths
                  so the AuthButton's username doesn't push the nav into a wrap. */}
              <span className="hidden lg:inline">Upgrade</span>
            </button>
          )}
          <AuthButton state={state} setState={setState} />
          <button onClick={onReset} className="text-xs text-slate-600 hover:text-red-400 transition hidden sm:inline">Reset</button>
        </div>
      </div>
    </div>
  );
}

// Slim launch banner shown beneath the TopBar while open-beta mode is on.
// Visible to everyone (signed-in or guest); the message owns expectations
// during the window before paid plans go live. Disappears the moment
// VITE_OPEN_BETA_PRO is unset/false in env.
function OpenBetaBanner() {
  if (!OPEN_BETA_PRO) return null;
  return (
    <div className="bg-gradient-to-r from-emerald-900/50 via-emerald-800/40 to-emerald-900/50 border-b border-emerald-700/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-1.5 text-xs text-emerald-100 flex items-center justify-center gap-2 text-center flex-wrap">
        <span className="font-semibold">🎉 Open beta</span>
        <span className="text-emerald-200/80">—</span>
        <span>All Pro features are free for signed-in users while paid plans launch.</span>
        <a href="/upgrade" className="underline hover:text-white whitespace-nowrap">See what's included →</a>
      </div>
    </div>
  );
}

// Primary nav items (always visible) + secondary in a "More ▾" dropdown.
// Reordering is fine; the order here defines what surfaces first to a
// new visitor. Five primary keeps the bar visually clean while leaving
// breathing room for Upgrade on the right and the more dropdown.
const PRIMARY_NAV: Array<[string, string]> = [
  ["home",       "Home"],
  ["tree",       "Skill Tree"],
  ["exam",       "Exam"],
  ["competency", "Competency"],
  ["glossary",   "Glossary"],
];
const SECONDARY_NAV: Array<[string, string]> = [
  ["lab",            "Lab"],
  ["rlab",           "R Lab"],
  ["misconceptions", "Misconceptions"],
  ["badges",         "Badges"],
  ["board",          "Leaders"],
  ["stats",          "Stats"],
];

function NavBar({ current, onNav, isInstructorNow, isAdminNow }) {
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{top: number; left: number} | null>(null);
  const moreBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Compute menu position from the button's bounding rect when opening.
  // Portal renders the menu at <body> level, so a fixed-position element
  // with explicit (top, left) escapes any overflow/clip context the
  // header chrome might impose.
  function openMenu() {
    if (moreBtnRef.current) {
      const r = moreBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left });
    }
    setMoreOpen(true);
  }

  React.useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    const onResize = () => setMoreOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [moreOpen]);

  const inSecondary = SECONDARY_NAV.some(([k]) => k === current);

  return (
    <div className="order-3 w-full md:order-2 md:w-auto hscroll md:overflow-visible -mx-3 sm:-mx-6 md:mx-0 px-3 sm:px-6 md:px-0">
      <div className="flex gap-1 items-center md:flex-wrap">
        {PRIMARY_NAV.map(([k,l]) => (
          <button
            key={k}
            onClick={()=>onNav(k)}
            aria-label={l}
            title={l}
            aria-current={current===k ? "page" : undefined}
            className={`nav-btn ${current===k?"active":""}`}>
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0" aria-hidden="true">{NAV_ICON[k]}</span>
            <span className="hidden md:inline">{l}</span>
          </button>
        ))}
        {/* More ▾ dropdown — secondary nav items. The menu is portaled to
            <body> with computed coords so no header overflow / stacking
            context can hide it. */}
        <button
          ref={moreBtnRef}
          type="button"
          onClick={(e)=>{ e.stopPropagation(); moreOpen ? setMoreOpen(false) : openMenu(); }}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More"
          title="More"
          className={`nav-btn ${inSecondary || moreOpen ? "active" : ""}`}>
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="12" r="1.4" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
              <circle cx="18" cy="12" r="1.4" fill="currentColor"/>
            </svg>
          </span>
          <span className="hidden md:inline">More</span>
          {inSecondary && <span className="hidden md:inline w-1.5 h-1.5 rounded-full bg-purple-400" aria-hidden="true"/>}
        </button>
        {moreOpen && menuPos && ReactDOM.createPortal(
          <>
            <div
              onClick={()=>setMoreOpen(false)}
              className="fixed inset-0 z-[200]"
              aria-hidden="true"/>
            <div
              role="menu"
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
              className="z-[201] min-w-[200px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
              {SECONDARY_NAV.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  onClick={()=>{ setMoreOpen(false); onNav(k); }}
                  aria-current={current===k ? "page" : undefined}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition ${current===k ? "bg-purple-900/40 text-white" : "text-slate-200 hover:bg-slate-800"}`}>
                  <span className="inline-flex items-center justify-center w-[16px] h-[16px] shrink-0 text-slate-400" aria-hidden="true">{NAV_ICON[k]}</span>
                  {l}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
        {isInstructorNow && (
          <button onClick={()=>onNav("teach")} className={`nav-btn ${current==="teach"?"active":""}`} aria-label="Teach" title="Teach — manage classes you instruct" aria-current={current==="teach" ? "page" : undefined}>
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3"/>
                <path d="M3 20c.6-3 3-5 6-5s5.4 2 6 5"/>
                <circle cx="17" cy="9" r="2.3"/>
                <path d="M14.5 20c.4-2 1.8-3.5 3.5-3.5s3.1 1.5 3.5 3.5"/>
              </svg>
            </span>
            <span className="hidden md:inline">Teach</span>
          </button>
        )}
        {isAdminNow && (
          <button onClick={()=>onNav("admin")} className={`nav-btn ${current==="admin"?"active":""}`} aria-label="Admin" title="Admin — question reports" aria-current={current==="admin" ? "page" : undefined}>
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </span>
            <span className="hidden md:inline">Admin</span>
          </button>
        )}
      </div>
    </div>
  );
}





// Soft prompt that replaces the old onboarding interstitial for signed-in
// users with zero progress. Renders nothing for guests (the interstitial
// still handles them), nothing for users who completed or skipped, and
// nothing for users who already have any progress. "Maybe later" sets
// onboardingSkippedAt so this never reappears for the account.
function DiagnosticPromptCard({ state, setState, onStart }) {
  const isSignedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
  const neverDecided = !state.onboardingCompletedAt && !state.onboardingSkippedAt;
  const zeroProgress = (state.completed || []).length === 0 && (state.xp || 0) === 0;
  if (!isSignedIn || !neverDecided || !zeroProgress) return null;

  const dismiss = () => {
    setState((s) => ({ ...s, onboardingSkippedAt: Date.now() }));
    try { window.BQAuth?.logEvent?.("diagnostic_skipped"); } catch {}
  };

  return (
    <div className="card rounded-2xl p-5 sm:p-6 border-l-4 border-violet-500/50">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-1">New here?</div>
          <div className="text-base font-semibold text-white mb-1">Take a 6-minute diagnostic for a personalized study path.</div>
          <div className="text-sm text-slate-400">
            Eight short questions across the core branches. We'll pick the right cases for you to start with — and explain why.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={dismiss} className="btn btn-ghost px-3 py-2 rounded-lg text-xs">
            Maybe later
          </button>
          <button onClick={onStart} className="btn btn-primary px-4 py-2 rounded-lg text-sm whitespace-nowrap">
            Start diagnostic →
          </button>
        </div>
      </div>
    </div>
  );
}

function Home({ state, setState, onStartCase, onNav, onOpenBranch, onReview }) {
  const level = levelFromXP(state.xp);
  const title = level < 3 ? "Intern" : level < 6 ? "Resident" : level < 10 ? "Fellow" : "Principal Investigator";
  const srs = state.srs || {};
  const dueByCase = CASES.map(c => ({ c, due: countDueSRS(srs, c.bank.map(q=>q.qid)) }));
  const localDue = dueByCase.reduce((s,x)=>s+x.due, 0);
  const completed = state.completed || [];

  // Server-backed FSRS due count for signed-in users. Falls back to 0 for
  // guests — they continue using the local SM-2 totals above. Refreshed on
  // auth change and when the Home view mounts.
  const [fsrsDue, setFsrsDue] = React.useState(null); // null = not loaded yet
  React.useEffect(() => {
    let alive = true;
    async function load() {
      const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
      if (!signedIn) { if (alive) setFsrsDue(0); return; }
      try {
        const n = await srsGetDueCount();
        if (alive) setFsrsDue(n);
      } catch { if (alive) setFsrsDue(0); }
    }
    load();
    const unsub = window.BQAuth?.onAuthChange?.(() => load());
    return () => { alive = false; if (typeof unsub === "function") unsub(); };
  }, []);

  // Effective due: FSRS if signed in & loaded, else local SM-2.
  const isSignedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
  const totalDue = isSignedIn && fsrsDue !== null ? fsrsDue : localDue;

  // Pick the ONE thing the user should do next, ranked by time-sensitivity
  // and where they are in the journey. Premium products feel opinionated —
  // we pick the single highest-leverage action and commit to it.
  //
  // Priority: review queue → diagnostic study path → first run → continue → mastered.
  // Study-path recommendations beat the generic "first unplayed case" because
  // they carry a *reason* ("biggest gap: Causal Inference") the user earned
  // by taking the diagnostic.
  const studyPath = Array.isArray(state.studyPath) ? state.studyPath : [];
  const nextPathStep = studyPath.find(s => !completed.includes(s.caseId));
  const primary = (() => {
    if (totalDue > 0) {
      const cases = dueByCase.filter(x => x.due > 0).length;
      const schedulerTag = isSignedIn && fsrsDue !== null ? "FSRS-6 scheduler" : "Spaced repetition";
      const caseCopy = isSignedIn && fsrsDue !== null
        ? `${schedulerTag} catches items right when you're about to forget them. Most overdue first, capped at 20 per session.`
        : `${schedulerTag} catches items right when you're about to forget them. ${cases} case${cases===1?"":"s"} to refresh — most overdue first, capped at 20 per session.`;
      return {
        mode: "review",
        eyebrow: "Due today",
        eyebrowColor: "text-cyan-300",
        heading: `${totalDue} ${totalDue === 1 ? "card" : "cards"} ready to review`,
        sub: caseCopy,
        cta: `Review ${Math.min(totalDue, 20)} →`,
        onClick: onReview,
      };
    }
    if (nextPathStep) {
      const c = CASES.find(x => x.id === nextPathStep.caseId);
      if (c) {
        const remaining = studyPath.filter(s => !completed.includes(s.caseId)).length;
        return {
          mode: "path",
          eyebrow: `Your study path · ${studyPath.length - remaining + 1} of ${studyPath.length}`,
          eyebrowColor: "text-cyan-300",
          heading: c.title,
          sub: nextPathStep.reason + ". " + c.story,
          cta: "Continue your path →",
          onClick: () => onStartCase(c.id),
          contextCase: c,
        };
      }
    }
    if (completed.length === 0) {
      const first = CASES.find(c => c.branch === "foundations") || CASES[0];
      return {
        mode: "diagnostic",
        eyebrow: "First run",
        eyebrowColor: "text-violet-300",
        heading: "Start with the fundamentals",
        sub: `A ${first.qPerRun}-question warm-up in ${BRANCHES[first.branch].name}. Builds the vocabulary you'll use everywhere else — about five minutes.`,
        cta: "Take your first case →",
        onClick: () => onStartCase(first.id),
        contextCase: first,
      };
    }
    const next = CASES.find(c => !completed.includes(c.id));
    if (next) {
      return {
        mode: "continue",
        eyebrow: "Up next",
        eyebrowColor: "text-cyan-300",
        heading: next.title,
        sub: next.story,
        cta: "Continue learning →",
        onClick: () => onStartCase(next.id),
        contextCase: next,
      };
    }
    return {
      mode: "mastered",
      eyebrow: "All cases completed",
      eyebrowColor: "text-amber-300",
      heading: "You're caught up — impressive.",
      sub: "Review items resurface automatically as you forget them. Until then, revisit any case to deepen mastery.",
      cta: "Browse the skill tree →",
      onClick: () => onNav("tree"),
    };
  })();

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 fade-in">
      {/* Compact greeting — stats live in chips, no sprawling hero */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="tag text-purple-400 mb-1">Welcome back, {title}</div>
          <div className="text-xs sm:text-sm text-slate-400">
            {completed.length} of {CASES.length} cases · {fmtNumber(state.xp)} XP
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {(state.reviewStreak || 0) > 0 && (
            <span className="chip bg-cyan-900/40 text-cyan-200" title={`Consecutive days with ≥1 review · best ${state.reviewStreakBest || 0}`}>
              ◆ {state.reviewStreak}d review streak
            </span>
          )}
          <span className="chip bg-purple-900/40 text-purple-200">Lv {level}</span>
        </div>
      </header>

      {/* THE one opinionated action — single emphasis mechanism (premium-border)
          rather than stacking card-glow + pulse on top. */}
      <div className="premium-border rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10" style={{background: "linear-gradient(145deg, rgba(22,28,54,0.55), rgba(12,16,36,0.65))"}}>
        <div className={`tag ${primary.eyebrowColor} mb-3`}>{primary.eyebrow}</div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3 leading-tight">
          {primary.heading}
        </h1>
        {primary.contextCase && (
          <div className="text-xs sm:text-sm text-slate-400 mb-3 flex items-center gap-2 flex-wrap">
            <BranchGlyph k={primary.contextCase.branch} />
            <span>{BRANCHES[primary.contextCase.branch].name}</span>
            <span className="text-slate-600">·</span>
            <span>{primary.contextCase.qPerRun} questions per run</span>
          </div>
        )}
        <p className="text-sm sm:text-base text-slate-300 mb-6 max-w-2xl">{primary.sub}</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <button
            onClick={primary.onClick}
            className="btn btn-primary w-full sm:w-auto px-8 py-4 rounded-xl text-base"
          >
            {primary.cta}
          </button>
          {primary.mode !== "review" && primary.mode !== "mastered" && (
            <button
              onClick={() => onNav("tree")}
              className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700 hover:decoration-slate-400"
            >
              or choose a case yourself →
            </button>
          )}
        </div>
      </div>

      {/* Diagnostic prompt — shown to signed-in users who never decided AND
          have zero progress. Replaces the old interstitial gate, so it's a
          suggestion they can take or dismiss without losing the home screen.
          Auto-hidden once they start, finish, or click "Maybe later". */}
      <DiagnosticPromptCard state={state} setState={setState} onStart={() => onNav("diagnostic")} />

      {/* Class memberships band — shows every active membership (any role)
          plus a "Join by code" form. Invisible to guests. */}
      <MyClassesBand onOpenTeach={() => onNav("teach")} />

      {/* Contextual nudge — only renders if the streak is at risk */}
      <StreakBanner state={state} onStartCase={onStartCase} />

      {/* Tertiary: the curated path, only when it exists and the user didn't
          start with generic "Up next". Shown calm and compact — the point
          is context, not a second CTA. */}
      {primary.mode === "path" && studyPath.length > 0 && (
        <div className="card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Your path this week</div>
              <div className="text-sm text-slate-300">Three cases, curated from your diagnostic.</div>
            </div>
            {state.diagnosticProfile && (
              <span className="chip bg-slate-800 text-slate-300">{bandLabel(state.diagnosticProfile.band)}</span>
            )}
          </div>
          <ol className="space-y-2">
            {studyPath.map((s, i) => {
              const c = CASES.find(x => x.id === s.caseId);
              if (!c) return null;
              const done = completed.includes(s.caseId);
              const isNext = !done && nextPathStep && nextPathStep.caseId === s.caseId;
              return (
                <li key={s.caseId} className={`flex items-start gap-3 rounded-lg p-3 border ${isNext ? "border-cyan-900/60 bg-cyan-950/20" : "border-slate-800/60 bg-slate-900/30"}`}>
                  <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-900/40 text-emerald-300" : isNext ? "bg-cyan-900/60 text-cyan-100" : "bg-slate-800 text-slate-400"}`}>
                    {done ? <Ico name="check" size={14}/> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BranchGlyph k={s.branch} className="w-3.5 h-3.5" />
                      <span className={`text-sm font-semibold ${done ? "text-slate-500 line-through" : "text-white"}`}>{c.title}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.reason}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}


function StatCard({ label, value, gradient }) {
  return (
    <div className="bg-slate-900/40 backdrop-blur rounded-xl p-3 sm:p-4 border border-slate-800 min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{label}</div>
      <div className={`text-xl sm:text-2xl md:text-3xl font-extrabold leading-tight break-words ${gradient ? "stat-number" : "text-white"}`}>{value}</div>
    </div>
  );
}

// ============================================================
// ONBOARDING — trust-first diagnostic flow (Phase 1 MVP)
// Intro → 8-question diagnostic → results with curated study path.
// Goal: the app tells the user what to do, and *why*, in under 6 minutes.
// ============================================================

const LEARNER_GOALS = [
  { id: "exams",    label: "Studying for an exam",     desc: "USMLE, board review, MPH comps, qualifying exams" },
  { id: "reading",  label: "Reading journal articles", desc: "Understanding methods sections and critiquing papers" },
  { id: "research", label: "Doing research",           desc: "Designing a study, analyzing data, or writing a paper" },
];

function OnboardingIntro({ onStart, onSkip, state, setState }) {
  const [goal, setGoal] = React.useState(state?.learnerGoal || "");

  function start() {
    // Persist the goal but don't force it — user can still proceed without.
    if (goal && goal !== state?.learnerGoal) {
      setState({ ...state, learnerGoal: goal });
    }
    onStart();
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 fade-in">
      <div className="premium-border rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10" style={{background: "linear-gradient(145deg, rgba(22,28,54,0.55), rgba(12,16,36,0.65))"}}>
        <div className="tag text-violet-300 mb-3">Welcome</div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3 leading-tight">
          Find your statistical weak spots in 6 minutes.
        </h1>
        <p className="text-sm sm:text-base text-slate-300 mb-6 max-w-lg">
          Not a grade. Just a starting point for your study path — eight short questions across the core branches of biostatistics. We'll use your answers to pick the right cases for you to start with, and explain why.
        </p>

        <div className="mb-7">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">Optional · what brings you here?</div>
          <div className="space-y-2">
            {LEARNER_GOALS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoal(goal === g.id ? "" : g.id)}
                className={`w-full text-left rounded-xl p-3 sm:p-4 border transition ${
                  goal === g.id
                    ? "border-cyan-500 bg-cyan-900/20"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                }`}
              >
                <div className="font-semibold text-white text-sm">{g.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={start} className="btn btn-primary w-full sm:w-auto px-8 py-4 rounded-xl text-base">
            Start the diagnostic →
          </button>
          <button onClick={onSkip} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700 hover:decoration-slate-400">
            Skip for now
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-3 gap-3 sm:gap-4 text-center">
          <div className="min-w-0">
            <div className="text-base sm:text-xl font-extrabold stat-number leading-tight break-words">8</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Questions</div>
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-xl font-extrabold stat-number leading-tight break-words">~6 min</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Time</div>
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-xl font-extrabold stat-number leading-tight break-words">3 cases</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Curated path</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticPlay({ onFinish, onExit }) {
  const [stepIdx, setStepIdx] = React.useState(0);
  const [picked, setPicked] = React.useState(null);
  const [answers, setAnswers] = React.useState([]);

  const step = DIAGNOSTIC[stepIdx];
  const isLast = stepIdx === DIAGNOSTIC.length - 1;
  const progress = ((stepIdx) / DIAGNOSTIC.length) * 100;

  function submit() {
    if (picked === null) return;
    const correct = picked === step.answer;
    const nextAnswers = [
      ...answers,
      { id: step.id, branch: step.branch, method: step.method, picked, correct },
    ];
    if (isLast) {
      onFinish(nextAnswers);
      return;
    }
    setAnswers(nextAnswers);
    setStepIdx(stepIdx + 1);
    setPicked(null);
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-4 gap-3">
        <button onClick={onExit} className="text-slate-500 hover:text-white text-sm">← Exit</button>
        <div className="text-xs text-slate-400">Question {stepIdx + 1} of {DIAGNOSTIC.length}</div>
      </div>
      <div className="bar mb-6"><div style={{ width: progress + "%" }}></div></div>

      <div className="card rounded-2xl sm:rounded-3xl p-6 sm:p-8">
        <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-3">Diagnostic</div>
        <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-white mb-5 leading-snug">{step.q}</h3>
        <div className="space-y-2 mb-6">
          {step.options.map((o, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPicked(i)}
              className={`w-full text-left p-3 sm:p-4 rounded-xl text-sm sm:text-base option-btn ${picked === i ? "selected" : ""}`}
            >
              <span className="mono text-slate-500 mr-3 text-sm">{String.fromCharCode(65 + i)}</span>
              <span className="text-white">{o}</span>
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={picked === null}
          className="btn btn-primary w-full py-4 rounded-xl text-base disabled:opacity-40"
        >
          {isLast ? "See my results →" : "Next question →"}
        </button>
        <p className="text-xs text-slate-500 text-center mt-4">No timer. No grade. We're just getting a read on where to start you.</p>
      </div>
    </div>
  );
}

// Inline signup card shown on the diagnostic results page — the highest-intent
// moment for a guest to create an account. Self-contained: handles email →
// 6-digit code → verify, and auto-hides once BQAuth reports a signed-in user.
function PostDiagnosticSavePrompt() {
  const DISMISS_KEY = "bq_postdiag_signup_dismissed";
  const [user, setUser] = React.useState(null);
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [stage, setStage] = React.useState("email"); // email | code | success
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [status, setStatus] = React.useState(""); // '' | sending | verifying | error
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!window.BQAuth) return;
    const unsub = window.BQAuth.onAuthChange?.(u => setUser(u));
    return unsub;
  }, []);

  if (!window.BQAuth?.enabled || user || dismissed) return null;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const codeClean = code.replace(/\D/g, "");

  async function sendCode(e) {
    if (e) e.preventDefault();
    if (!emailValid) { setStatus("error"); setErr("Enter a valid email."); return; }
    setStatus("sending"); setErr("");
    try {
      await window.BQAuth.signInWithEmail(email.trim());
      setStage("code");
      setStatus("");
      window.BQAuth.logEvent?.("postdiag_code_sent");
    } catch (e2) {
      setStatus("error");
      setErr(e2?.message || "Could not send code. Try again.");
    }
  }

  async function verify(e) {
    if (e) e.preventDefault();
    if (codeClean.length !== OTP_LENGTH) {
      setStatus("error"); setErr(`Enter the ${OTP_LENGTH}-digit code.`); return;
    }
    setStatus("verifying"); setErr("");
    try {
      await window.BQAuth.verifyEmailCode(email.trim(), codeClean);
      writeLastEmail(email.trim());
      setStage("success");
      setStatus("");
      window.BQAuth.logEvent?.("postdiag_signup_success");
    } catch (e2) {
      setStatus("error");
      setErr(e2?.message || "That code didn't work. Double-check your email.");
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
    window.BQAuth.logEvent?.("postdiag_signup_dismiss");
  }

  return (
    <div className="premium-border rounded-2xl p-5 sm:p-6" style={{background: "linear-gradient(145deg, rgba(16,185,129,0.10), rgba(22,28,54,0.70))"}}>
      {stage === "success" ? (
        <div className="flex items-start gap-3">
          <span className="text-emerald-300 leading-none inline-flex items-center"><Ico name="check" size={24}/></span>
          <div>
            <div className="text-white font-semibold text-sm sm:text-base">You're signed in.</div>
            <div className="text-xs text-slate-400 mt-0.5">Your study path is synced. Pick it up on any device.</div>
          </div>
        </div>
      ) : stage === "code" ? (
        <form onSubmit={verify} className="space-y-3">
          <div>
            <div className="text-white font-semibold text-sm sm:text-base mb-1">Enter the 6-digit code</div>
            <div className="text-xs text-slate-400">We sent it to <span className="text-slate-200">{email}</span>. Check spam if it's slow.</div>
          </div>
          <div className="flex gap-2">
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={OTP_LENGTH}
              value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base tracking-widest font-mono"
            />
            <button
              type="submit"
              disabled={codeClean.length !== OTP_LENGTH || status === "verifying"}
              className="btn btn-primary px-4 py-2.5 rounded-lg text-sm disabled:opacity-40 shrink-0"
            >{status === "verifying" ? "Verifying…" : "Verify"}</button>
          </div>
          {status === "error" && <div className="text-xs text-rose-400">{err}</div>}
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={() => { setStage("email"); setStatus(""); setErr(""); setCode(""); }} className="text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700">Use a different email</button>
            <span className="text-slate-700">·</span>
            <button type="button" onClick={dismiss} className="text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700">Maybe later</button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-3">
          <div>
            <div className="tag text-emerald-300 mb-1.5">Don't lose this</div>
            <h3 className="text-lg sm:text-xl font-bold text-white leading-tight">Save your study path</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">Sync XP and streaks across devices. Resume any case. One email, no password.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <button
              type="submit"
              disabled={!emailValid || status === "sending"}
              className="btn btn-primary px-5 py-2.5 rounded-lg text-sm disabled:opacity-40 shrink-0"
            >{status === "sending" ? "Sending…" : "Save my progress"}</button>
          </div>
          {status === "error" && <div className="text-xs text-rose-400">{err}</div>}
          <button type="button" onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700">Maybe later</button>
        </form>
      )}
    </div>
  );
}

function DiagnosticResults({ profile, studyPath, onStartCase, onNav, learnerGoal }) {
  if (!profile) return null;

  const rankedBranches = Object.entries(profile.byBranch)
    .map(([branch, { correct, total }]) => ({ branch, pct: total > 0 ? correct / total : 0, correct, total }))
    .sort((a, b) => a.pct - b.pct);

  const weakest = rankedBranches.slice(0, 2);
  const strongest = rankedBranches[rankedBranches.length - 1];
  const nextCase = studyPath.length > 0 ? CASES.find((c) => c.id === studyPath[0].caseId) : null;
  const recDiff = recommendedDifficultyFromBand(profile.band);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 fade-in">
      {/* Summary band */}
      <div className="premium-border rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-10" style={{background: "linear-gradient(145deg, rgba(22,28,54,0.55), rgba(12,16,36,0.65))"}}>
        <div className="tag text-violet-300 mb-3">Your diagnostic</div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-3 leading-tight">
          You're {bandLabel(profile.band).toLowerCase()} — {profile.totalCorrect} of {profile.totalAnswered} correct.
        </h1>
        <p className="text-sm sm:text-base text-slate-300 mb-6 max-w-xl">
          {profile.band === "strong"
            ? "You have solid judgment across most areas. The path below sharpens two gaps and adds one confidence-building case."
            : profile.band === "developing"
            ? "You have the core vocabulary. The path below targets the two areas where you're most likely to slip in practice."
            : "The fundamentals are where we'll spend most of our early time together. The path below starts with the biggest gaps."}
        </p>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 sm:p-4 text-center min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Level</div>
            <div className="text-base sm:text-xl md:text-2xl font-extrabold stat-number leading-tight break-words">{bandLabel(profile.band)}</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 sm:p-4 text-center min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Start difficulty</div>
            <div className="text-base sm:text-xl md:text-2xl font-extrabold text-white leading-tight break-words" style={{ color: DIFFICULTIES[recDiff].color }}>{DIFFICULTIES[recDiff].name}</div>
          </div>
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 sm:p-4 text-center min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Your path</div>
            <div className="text-base sm:text-xl md:text-2xl font-extrabold gold-text leading-tight break-words">{studyPath.length} cases</div>
          </div>
        </div>
      </div>

      {/* Strengths & risks */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="card rounded-2xl p-5 sm:p-6">
          <div className="tag text-cyan-300 mb-2">Strongest area</div>
          <div className="flex items-center gap-2 mb-2">
            {strongest && <BranchGlyph k={strongest.branch} />}
            <div className="font-bold text-white text-sm sm:text-base">{strongest && BRANCHES[strongest.branch].name}</div>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">{strongest && BRANCHES[strongest.branch].desc}</p>
        </div>
        <div className="card rounded-2xl p-5 sm:p-6">
          <div className="tag text-rose-300 mb-2">Biggest risks</div>
          <div className="space-y-2">
            {weakest.map((w) => (
              <div key={w.branch} className="flex items-center gap-2">
                <BranchGlyph k={w.branch} />
                <div className="font-semibold text-white text-sm">{BRANCHES[w.branch].name}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">Where the misconceptions most commonly hurt.</p>
        </div>
      </div>

      {/* Study path */}
      <div className="card rounded-2xl p-5 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-1">Your study path</h2>
        <p className="text-xs text-slate-400 mb-4">Three cases, in this order, with a reason.</p>
        <div className="space-y-3">
          {studyPath.map((step, i) => {
            const c = CASES.find((x) => x.id === step.caseId);
            if (!c) return null;
            return (
              <div key={step.caseId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-start gap-3 sm:gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm text-white">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <BranchGlyph k={step.branch} />
                    <span className="text-xs text-slate-400">{BRANCHES[step.branch].name}</span>
                    {step.kind === "gap" && <span className="chip bg-rose-900/40 text-rose-300 text-[10px]">gap</span>}
                    {step.kind === "strength" && <span className="chip bg-cyan-900/40 text-cyan-200 text-[10px]">strength</span>}
                  </div>
                  <div className="font-semibold text-white text-sm sm:text-base">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{step.reason}</div>
                </div>
                {i === 0 && (
                  <button
                    onClick={() => onStartCase(c.id)}
                    className="btn btn-primary px-4 py-2 rounded-lg text-xs sm:text-sm shrink-0"
                  >Start →</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline signup — highest-intent moment for guests */}
      <PostDiagnosticSavePrompt />

      {/* CTA */}
      {nextCase && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <button onClick={() => onStartCase(nextCase.id)} className="btn btn-primary w-full sm:w-auto px-8 py-4 rounded-xl text-base">
            Start your first case →
          </button>
          <button onClick={() => onNav("home")} className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4 decoration-slate-700 hover:decoration-slate-400">
            or go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}

// SkillTree extracted to src/views/SkillTree.tsx (Phase 6) and now
// lazy-loaded — see the React.lazy() at the bottom of this file. The
// route render arm uses <Suspense fallback> for the brief network/parse
// window before the chunk is ready.

function CaseSelect({ caseId, onStart, onBack, state }) {
  const c = CASES.find(x => x.id === caseId);
  const narrative = getNarrative(caseId);
  const [diff, setDiff] = useState(c.diffMin);
  const minIdx = Object.keys(DIFFICULTIES).indexOf(c.diffMin);
  const seen = (state.seenQuestions[c.id]||[]).length;
  const fresh = c.bank.length - seen;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
      <button onClick={onBack} className="text-slate-400 hover:text-white text-sm mb-4">← Back</button>
      <div className="card rounded-2xl sm:rounded-3xl p-5 sm:p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="tag text-purple-400 inline-flex items-center gap-1.5"><BranchGlyph k={c.branch} className="w-3.5 h-3.5" /> {BRANCHES[c.branch].name}</span>
          {narrative && <span className="chip bg-violet-900/40 text-violet-200 text-[10px]">Authored case</span>}
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 leading-tight">{c.title}</h2>

        {narrative ? (
          <div className="mb-6 space-y-3 text-sm sm:text-base text-slate-300">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-1.5">Your role</div>
              <div className="text-white leading-snug">{narrative.role}</div>
              <div className="text-xs text-slate-400 mt-1.5">{narrative.setting}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1.5">What's at stake</div>
              <div className="leading-relaxed">{narrative.stakes}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5">The decision</div>
              <div className="text-white font-semibold leading-snug">{narrative.decisionPrompt}</div>
              <div className="text-xs text-slate-500 mt-1.5">{narrative.arcSummary}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm sm:text-base text-slate-300 mb-6 leading-relaxed">{c.story}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <InfoPill label="Bank" value={`${c.bank.length} Q`}/>
          <InfoPill label="Per Run" value={c.qPerRun}/>
          <InfoPill label="Fresh" value={fresh>0?fresh:"Recycled"} color={fresh>0?"#10b981":"#fbbf24"}/>
          <InfoPill label="Best" value={state.caseScores[c.id]?`${state.caseScores[c.id]}%`:"—"}/>
        </div>
        <div className="mb-6">
          <div className="text-sm font-semibold text-white mb-2">Select Difficulty</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(DIFFICULTIES).map(([k,d],i) => {
              const locked = i < minIdx;
              const selected = diff === k;
              return (
                <button key={k} disabled={locked} onClick={()=>setDiff(k)}
                  className={`p-4 rounded-xl text-left transition border-2 ${selected?"border-purple-500 bg-purple-900/20":"border-slate-800 bg-slate-900/40 hover:border-slate-600"} ${locked?"opacity-40 cursor-not-allowed":""}`}>
                  <div className="font-bold" style={{color: d.color}}>{d.name}</div>
                  <div className="text-xs text-slate-400 mt-1">{d.label} · {d.xpMult}× XP</div>
                  <div className="text-[10px] text-slate-500 mt-2 leading-snug">{d.desc}</div>
                  <div className="text-[10px] text-slate-600 mt-1">⏱ {d.time}s / Q</div>
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={()=>onStart(caseId, diff)} className="btn btn-primary w-full py-4 rounded-xl text-lg">
          Begin Mission →
        </button>
        {fresh > 0 && fresh < c.qPerRun && (
          <div className="text-xs text-amber-400 mt-3 text-center">Only {fresh} unseen questions left — questions will start recycling after this run.</div>
        )}
      </div>
      {caseId === "r3" && <WebRPane/>}
    </div>
  );
}

// ============================================================
// WebR Live Lab — real R running in the browser via WebAssembly
// ============================================================
// ---- Lesson catalog ----------------------------------------------------
// Each lesson may include: dataset, hint, challenge, takeaways, related.
// These power the premium UI (dataset card, key-takeaways, next-lesson CTA).
const R_LESSONS = [
  // ============================ STARTER ============================
  {
    id: "desc", icon: "desc", title: "Descriptive statistics", level: "Starter",
    objective: "Summarize a continuous variable with central tendency, spread, and a histogram.",
    concepts: ["summary()", "mean / median / sd", "hist()"],
    dataset: { name: "mtcars", desc: "32 cars from 1974 Motor Trend — fuel economy, weight, cylinders." },
    hint: "When the distribution is skewed, report median + IQR — the mean and SD get pulled by the tail.",
    challenge: "Compute the IQR with IQR(mtcars$mpg) and overlay it on the histogram with abline().",
    takeaways: [
      "sd() uses n − 1 (Bessel's correction), not n.",
      "summary() returns Min · Q1 · Median · Mean · Q3 · Max.",
      "Median + IQR resist single extreme points; mean + SD do not.",
    ],
    related: ["correlation","ttest","anova"],
    packages: [],
    code:
`# mtcars is a built-in dataset (32 cars, 1974 Motor Trend)
data(mtcars)
head(mtcars, 4)

cat("n =", nrow(mtcars), "\\n")
cat("mean mpg =", round(mean(mtcars$mpg), 2), "\\n")
cat("sd mpg   =", round(sd(mtcars$mpg), 2), "\\n")
cat("median   =", median(mtcars$mpg), "\\n")
cat("IQR      =", IQR(mtcars$mpg), "\\n\\n")

summary(mtcars$mpg)

hist(mtcars$mpg, breaks = 10, col = "#22d3ee",
     border = "white", main = "MPG distribution",
     xlab = "Miles per gallon")
abline(v = median(mtcars$mpg), col = "#fbbf24", lwd = 2, lty = 2)`,
    quiz: [
      { q: "Which statistic is MOST robust to a single extreme outlier?",
        options: ["The sample mean of the values","The sample median of the values","The sample variance of the values","The sample range of the values"], correct: 1,
        explain: "The median depends only on ranks — one extreme value shifts it at most by one position." },
      { q: "R's sd() function uses which denominator?",
        options: ["n, the raw sample size","n − 1, Bessel's correction","n + 1, an inflated count","the reciprocal 1 / n"], correct: 1,
        explain: "sd() computes the Bessel-corrected sample SD: √(Σ(x − x̄)² / (n − 1))." },
      { q: "For a right-skewed cost distribution, the best summary pair is:",
        options: ["Mean with the standard deviation","Median with the interquartile range","Mode with the raw min and max","Range with the sample variance"], correct: 1,
        explain: "Median + IQR resist the influence of the long tail; mean + SD are pulled upward." },
      { q: "summary() on a numeric vector in R returns:",
        options: ["Just the mean and the sample SD","Min, Q1, median, mean, Q3, max","Counts of each unique value","The full sorted sequence of values"], correct: 1,
        explain: "summary() returns the six-number summary: Min, 1st quartile, Median, Mean, 3rd quartile, Max." },
    ]
  },
  {
    id: "correlation", icon: "correlation", title: "Correlation (Pearson & Spearman)", level: "Starter",
    objective: "Quantify the strength of a monotonic relationship, two ways, and test it.",
    concepts: ["cor()", "cor.test()", "Pearson vs Spearman"],
    dataset: { name: "mtcars", desc: "Weight (wt, 1000 lb) vs fuel economy (mpg) for 32 cars." },
    hint: "Spearman = Pearson on the ranks. It handles monotonic but nonlinear relationships and is robust to outliers.",
    challenge: "Repeat with log(hp) vs mpg and compare Pearson and Spearman — which changes more, and why?",
    takeaways: [
      "Pearson r measures linear association; Spearman ρ measures monotonic association.",
      "cor.test() gives the test statistic, CI, and p-value against H₀: ρ = 0.",
      "A strong r tells you nothing about causation — confounding can flip the sign.",
    ],
    related: ["desc","lm","ttest"],
    packages: [],
    code:
`x <- mtcars$wt
y <- mtcars$mpg

cat("Pearson r  =", round(cor(x, y, method = "pearson"),  3), "\\n")
cat("Spearman ρ =", round(cor(x, y, method = "spearman"), 3), "\\n\\n")

# Pearson test with 95% CI for r
ct <- cor.test(x, y)
print(ct)

plot(x, y, pch = 19, col = "#22d3ee",
     xlab = "Weight (1000 lb)", ylab = "MPG",
     main = "Weight vs MPG (mtcars)")
abline(lm(y ~ x), col = "#fbbf24", lwd = 2)`,
    quiz: [
      { q: "Spearman's ρ is essentially Pearson's r applied to:",
        options: ["The raw values without change","The centered values (xi − x̄)","The ranks of the values","The squared residuals"], correct: 2,
        explain: "Spearman converts x and y to ranks, then computes Pearson — so it captures monotone but nonlinear ties." },
      { q: "A Pearson r of −0.87 indicates:",
        options: ["A weak positive linear association","A strong positive linear association","A strong negative linear association","A perfect monotone but nonlinear link"], correct: 2,
        explain: "Sign is direction, magnitude is strength; |r| near 1 = strong linear; negative = inverse." },
      { q: "cor.test() returns a 95% CI for r computed via:",
        options: ["The central limit theorem on r directly","Fisher's z transformation","The non-parametric bootstrap","The delta method on ρ²"], correct: 1,
        explain: "The default CI uses Fisher's z = atanh(r), which is approximately normal even when r is not." },
      { q: "Which statement is TRUE about correlation and causation?",
        options: ["r > 0 implies a causal relationship","r = 0 implies no relationship of any kind","High r can arise from a shared confounder","cor.test() controls for confounders"], correct: 2,
        explain: "Confounding, selection, and reverse causation can all generate high correlations without a direct causal link." },
    ]
  },
  {
    id: "ttest", icon: "ttest", title: "Two-sample t-test", level: "Starter",
    objective: "Compare MPG between automatic and manual transmission cars.",
    concepts: ["t.test()", "Welch degrees of freedom", "Cohen's d"],
    dataset: { name: "mtcars", desc: "MPG split by transmission (am = 0 automatic, 1 manual)." },
    hint: "R defaults to Welch's t-test (unequal variances). Set var.equal = TRUE only if variances are genuinely similar.",
    challenge: "Compute Hedges' g by multiplying d by the small-sample correction (1 − 3/(4(n₁+n₂)−9)).",
    takeaways: [
      "95% CI excluding 0 ⇔ two-sided p < 0.05 — they are equivalent.",
      "Welch's t-test is the safe default — no assumption of equal variances.",
      "Effect size (Cohen's d) is just as important as p-value: report both.",
    ],
    related: ["paired","wilcoxon","anova"],
    packages: [],
    code:
`# am: 0 = automatic, 1 = manual
tt <- t.test(mpg ~ am, data = mtcars)
print(tt)

# Effect size (Cohen's d, pooled SD)
g <- split(mtcars$mpg, mtcars$am)
s2 <- ((length(g[[1]])-1)*var(g[[1]]) + (length(g[[2]])-1)*var(g[[2]])) /
      (length(g[[1]]) + length(g[[2]]) - 2)
d <- (mean(g[[2]]) - mean(g[[1]])) / sqrt(s2)
cat("\\nCohen's d =", round(d, 2), "\\n")

boxplot(mpg ~ am, data = mtcars, col = c("#64748b","#22d3ee"),
        names = c("automatic","manual"), ylab = "MPG",
        main = "MPG by transmission")`,
    quiz: [
      { q: "A 95% CI for the mean difference that excludes zero implies:",
        options: ["p > 0.05 in the two-sided test","p < 0.05 in the two-sided test","The two group means are equal","Nothing reliable about the p-value"], correct: 1,
        explain: "The 95% CI and the two-sided 5% test are duality-equivalent: CI excludes 0 ⇔ p < 0.05." },
      { q: "Welch's t-test differs from Student's because it:",
        options: ["Assumes the two variances are equal","Does not assume variances are equal","Works only for one-tailed tests","Requires strictly normal outcomes"], correct: 1,
        explain: "Welch adjusts the degrees of freedom (Satterthwaite) and does not require equal variances." },
      { q: "Cohen's d ≈ 1.5 in this output would be considered:",
        options: ["A negligible effect size","A small effect size","A medium effect size","A large effect size"], correct: 3,
        explain: "Cohen's rough cutoffs: 0.2 small, 0.5 medium, 0.8 large; d ≈ 1.5 is a very large effect." },
      { q: "Doubling the sample size (constant means and SDs) will:",
        options: ["Leave the p-value exactly unchanged","Increase the standard error proportionally","Shrink the standard error and the p-value","Invert the sign of the t-statistic"], correct: 2,
        explain: "SE scales as 1/√n; bigger n shrinks SE, inflates |t|, and pushes p-values downward." },
    ]
  },
  {
    id: "paired", icon: "paired", title: "Paired t-test (within-subject)", level: "Starter",
    objective: "Analyze pre/post or crossover data by modeling the within-subject difference.",
    concepts: ["t.test(..., paired = TRUE)", "within-subject difference", "stripchart()"],
    dataset: { name: "sleep", desc: "Student's classic 1908 sleep data — 10 patients, 2 soporific drugs, hours of extra sleep." },
    hint: "Paired analysis removes between-subject variance. The effective sample size is the number of PAIRS, not observations.",
    challenge: "Re-run the analysis as an UNPAIRED t-test — does the p-value go up or down, and why?",
    takeaways: [
      "Pairing converts two samples into one vector of within-subject differences.",
      "Paired tests are usually more powerful when within-subject correlation is positive.",
      "With n pairs, df = n − 1, not 2n − 2.",
    ],
    related: ["ttest","wilcoxon","anova"],
    packages: [],
    code:
`# sleep: same 10 patients measured on two drugs
# extra = extra hours of sleep vs control
head(sleep)

# Paired t-test on within-subject differences
pt <- t.test(extra ~ group, data = sleep, paired = TRUE)
print(pt)

# Always look at the paired differences, not just group means
d <- sleep$extra[sleep$group == 2] - sleep$extra[sleep$group == 1]
cat("\\nmean difference =", round(mean(d), 2), "\\n")
cat("sd(diff)        =", round(sd(d), 2), "\\n")

stripchart(d, method = "jitter", vertical = FALSE, pch = 19,
           col = "#22d3ee", cex = 1.4,
           main = "Within-subject differences (drug2 − drug1)",
           xlab = "Hours of extra sleep")
abline(v = 0, lty = 2, col = "#94a3b8")
abline(v = mean(d), col = "#fbbf24", lwd = 2)`,
    quiz: [
      { q: "The paired t-test operates on which quantity?",
        options: ["The two group means separately","The within-subject differences d_i","The ranks of all 2n observations","The pooled within-group variance"], correct: 1,
        explain: "Paired t-test reduces data to one sample of differences d_i = y_i − x_i and tests H₀: μ_d = 0." },
      { q: "With 10 matched pairs, the paired t-test uses how many degrees of freedom?",
        options: ["9","10","18","19"], correct: 0,
        explain: "df = n_pairs − 1 = 10 − 1 = 9. Not 2n − 2, because pairing exploits the within-subject structure." },
      { q: "Pairing tends to increase power MOST when:",
        options: ["Within-subject correlation is near zero","Within-subject correlation is strongly positive","Within-subject correlation is strongly negative","Subjects have very different baselines"], correct: 1,
        explain: "Positive within-subject correlation shrinks Var(d), so the paired test has a smaller SE than the unpaired test." },
      { q: "Applying an UNPAIRED t-test to truly paired data typically:",
        options: ["Is more conservative but still valid","Ignores dependence, usually inflating the SE","Is always equivalent to the paired test","Violates the normality assumption only"], correct: 1,
        explain: "Ignoring pairing wastes the variance-reducing information; SE and p-value get larger than they should be." },
    ]
  },
  {
    id: "wilcoxon", icon: "wilcoxon", title: "Wilcoxon / Mann-Whitney rank test", level: "Starter",
    objective: "Use a non-parametric alternative to the t-test when normality is doubtful.",
    concepts: ["wilcox.test()", "rank-based", "Hodges-Lehmann location shift"],
    dataset: { name: "mtcars", desc: "MPG by transmission — same data as the t-test lesson, tested rank-wise." },
    hint: "Mann-Whitney = Wilcoxon rank-sum. Under the shift-only model, it tests equal medians; more generally, it tests stochastic equivalence.",
    challenge: "Set exact = FALSE and compare with the default — how does ties-handling change the p-value?",
    takeaways: [
      "Wilcoxon is based on ranks, so a single extreme value can't pull the test statistic far.",
      "When normality holds, Wilcoxon has ~95% the asymptotic efficiency of the t-test.",
      "Report the Hodges-Lehmann estimate and its CI, not just the p-value.",
    ],
    related: ["ttest","paired","chisq"],
    packages: [],
    code:
`# Rank-based two-sample test with Hodges-Lehmann location shift + CI
wt <- wilcox.test(mpg ~ am, data = mtcars, conf.int = TRUE)
print(wt)

# Compare parametric vs non-parametric p-values
p_param <- t.test(mpg ~ am, data = mtcars)$p.value
p_rank  <- wt$p.value
cat("\\nt-test p     =", signif(p_param, 3), "\\n")
cat("Wilcoxon p   =", signif(p_rank,  3), "\\n")

# Visualize the two group distributions
boxplot(mpg ~ am, data = mtcars, col = c("#64748b","#22d3ee"),
        names = c("automatic","manual"), ylab = "MPG",
        main = "MPG by transmission — ranks don't care about scale")`,
    quiz: [
      { q: "The Mann-Whitney / Wilcoxon rank-sum test compares groups based on:",
        options: ["Group means on the raw scale","Group variances directly","Ranks pooled across both groups","Bootstrap resamples of the median"], correct: 2,
        explain: "All observations are pooled and ranked; the statistic sums ranks from one group." },
      { q: "Under the location-shift model, the Wilcoxon test is interpreted as a test of equal:",
        options: ["Means on the raw scale","Medians across groups","Variances across groups","Skewness across groups"], correct: 1,
        explain: "If distributions differ only by a shift, H₀ of stochastic equality reduces to equal medians." },
      { q: "A key advantage of rank-based tests is that they are:",
        options: ["More powerful than t-tests under strict normality","Invariant to monotone transformations of y","Always exact regardless of ties","Free of any distributional assumptions at all"], correct: 1,
        explain: "Ranks are preserved by any strictly monotone transformation (log, sqrt, …), so the test is too." },
      { q: "Which scenario most favors the Wilcoxon test over the t-test?",
        options: ["Large n and a clean bell-shaped sample","Small n with a heavy-tailed / skewed sample","A 2 × 2 contingency table of counts","Exactly paired before / after measurements"], correct: 1,
        explain: "With heavy tails or skew, Welch's t can be badly biased; ranks cap the influence of extremes." },
    ]
  },
  {
    id: "chisq", icon: "chisq", title: "Chi-square test of independence", level: "Starter",
    objective: "Test whether two categorical variables are associated.",
    concepts: ["table()", "chisq.test()", "expected vs observed"],
    dataset: { name: "mtcars", desc: "Cross-tab of cylinders (4 / 6 / 8) against transmission (auto / manual)." },
    hint: "If any expected count < 5, chisq.test() will warn — switch to fisher.test() or simulate.p.value = TRUE.",
    challenge: "Run fisher.test(tab) and compare with the chi-square p-value — do they agree?",
    takeaways: [
      "Expected count E_ij = (row_i × col_j) / N, under independence.",
      "Standardized residuals outside ±2 flag the cells that drive the association.",
      "χ² is omnibus: it tells you there's association, not its direction or magnitude.",
    ],
    related: ["logit","diagnostic","wilcoxon"],
    packages: [],
    code:
`# Cross-tabulate cylinders by transmission
tab <- table(cyl = mtcars$cyl, am = mtcars$am)
print(tab)

ct <- chisq.test(tab)
print(ct)

# Standardized residuals show which cells drive the association
round(ct$stdres, 2)`,
    quiz: [
      { q: "Standardized residuals with |value| > ~2 suggest:",
        options: ["A near-perfect fit to independence","Cells driving the observed association","A likely modeling or coding error","Insufficient power in the dataset"], correct: 1,
        explain: "Residuals outside ±2 flag cells that deviate meaningfully from the independence expectation." },
      { q: "The chi-square approximation becomes unreliable when:",
        options: ["The total sample size exceeds 1000","Any expected cell count is below 5","There are three or more levels","All observed counts are integers"], correct: 1,
        explain: "Small expected counts break the asymptotic χ² approximation — use Fisher's exact test instead." },
      { q: "Expected cell counts under independence equal:",
        options: ["The mean of all observed cell counts","(row total × column total) / grand total","The sampling-weighted row median","The largest observed count in that row"], correct: 1,
        explain: "Under independence, E_ij = (row_i × col_j) / N." },
      { q: "A significant chi-square test of independence shows:",
        options: ["Perfect independence between variables","Evidence of association (direction unknown)","The direction of the association","Causation from one variable to the other"], correct: 1,
        explain: "χ² tests are omnibus — they detect association without telling you its sign, shape, or causal direction." },
    ]
  },
  {
    id: "lm", icon: "lm", title: "Linear regression", level: "Core",
    objective: "Fit and diagnose a multiple regression model.",
    concepts: ["lm()", "summary.lm()", "diagnostics"],
    dataset: { name: "mtcars", desc: "Predict mpg from weight, horsepower, and number of cylinders." },
    hint: "The four base-R diagnostic plots (Residuals vs Fitted, Q-Q, Scale-Location, Residuals vs Leverage) are worth more than any single summary statistic.",
    challenge: "Add an interaction wt:hp and run anova(fit_no, fit_with) — does it significantly improve fit?",
    takeaways: [
      "Each β in multiple regression is a partial slope — adjusted for every other predictor.",
      "Adjusted R² penalizes extra predictors; R² always rises when you add columns.",
      "Residuals-vs-Fitted funnels ⇒ heteroscedasticity; Q-Q curves ⇒ non-normal tails.",
    ],
    related: ["logit","anova","correlation"],
    packages: [],
    code:
`fit <- lm(mpg ~ wt + hp + factor(cyl), data = mtcars)
summary(fit)

cat("\\nAdj R^2 =", round(summary(fit)$adj.r.squared, 3), "\\n")

par(mfrow = c(2, 2))
plot(fit)`,
    quiz: [
      { q: "Adjusted R² is usually preferred over R² because it:",
        options: ["Is always higher than plain R²","Penalizes adding useless predictors","Directly measures causal effects","Equals a p-value for the model"], correct: 1,
        explain: "Adjusted R² subtracts a penalty proportional to the number of predictors, discouraging overfitting." },
      { q: "A residuals-vs-fitted plot with a clear funnel shape suggests:",
        options: ["Linearity and equal variance hold","Non-constant variance (heteroscedasticity)","Perfectly normal model residuals","No bias in the fitted parameters"], correct: 1,
        explain: "Fan/funnel patterns indicate variance grows with fitted values — consider transformation or robust SEs." },
      { q: "The coefficient on wt in this multiple model represents:",
        options: ["Raw marginal correlation of wt with mpg","Change in mpg per unit wt, unadjusted","Change in mpg per wt unit, adjusted for others","Share of mpg variance explained by weight"], correct: 2,
        explain: "In multiple regression, each β is a partial slope — holding all other predictors constant." },
      { q: "A heavy-tailed Normal-QQ plot of residuals suggests:",
        options: ["Residuals are perfectly Normal","Residuals have heavier tails than Normal","There is no heteroscedasticity issue","There are no influential observations"], correct: 1,
        explain: "Points curving away from the QQ line at the extremes indicate tails heavier than Normal." },
    ]
  },
  {
    id: "logit", icon: "logit", title: "Logistic regression", level: "Core",
    objective: "Model a binary outcome with logistic regression and interpret odds ratios.",
    concepts: ["glm(..., family = binomial)", "odds ratio = exp(β)"],
    dataset: { name: "mtcars", desc: "Model transmission type (am) from mpg and weight." },
    hint: "Wald CIs (confint.default) are fast; likelihood-ratio CIs (confint) are more accurate near parameter boundaries.",
    challenge: "Predict P(am = 1) for a car with mpg = 25, wt = 2.8 using predict(fit, ..., type = \"response\").",
    takeaways: [
      "exp(β) is an odds ratio — not a risk ratio, not a hazard ratio, not a probability.",
      "With common outcomes, OR overstates the RR (further from 1).",
      "Logistic regression assumes linearity on the log-odds scale — not on the probability scale.",
    ],
    related: ["lm","diagnostic","poisson"],
    packages: [],
    code:
`# Predict whether a car has manual transmission from mpg and weight
fit <- glm(am ~ mpg + wt, data = mtcars, family = binomial)
summary(fit)

# Odds ratios with 95% CI (Wald)
OR  <- exp(coef(fit))
CI  <- exp(confint.default(fit))
round(cbind(OR, CI), 3)`,
    quiz: [
      { q: "exp(β) from a logistic regression model is the:",
        options: ["Absolute risk of the outcome","Risk ratio for the outcome","Odds ratio for the outcome","Hazard ratio for the outcome"], correct: 2,
        explain: "Logistic coefficients exponentiate to odds ratios — not risk ratios, hazards, or absolute risks." },
      { q: "An estimated odds ratio equal to 1 means:",
        options: ["Perfect prediction of the outcome","No association with the outcome","Strong negative association present","Data contain missing outcome values"], correct: 1,
        explain: "OR = 1 ⇔ log-odds change of zero ⇔ no association between predictor and outcome." },
      { q: "When the outcome is common (e.g., ~30%), odds ratios:",
        options: ["Equal the true risk ratio exactly","Overstate the true risk ratio","Understate the true risk ratio","Are mathematically undefined"], correct: 1,
        explain: "ORs and RRs diverge when the outcome is common; OR exaggerates the RR (further from 1)." },
      { q: "Logistic regression assumes linearity on which scale?",
        options: ["Linearity on the raw probability scale","Linearity on the log-odds (logit) scale","Linearity on the squared risk scale","Linearity on the untransformed odds scale"], correct: 1,
        explain: "Logistic regression assumes logit(p) = Xβ — linearity holds on the log-odds scale." },
    ]
  },
  {
    id: "anova", icon: "anova", title: "One-way ANOVA + Tukey HSD", level: "Core",
    objective: "Compare means across 3+ groups and follow up with pairwise tests.",
    concepts: ["aov()", "TukeyHSD()", "family-wise error"],
    dataset: { name: "mtcars", desc: "MPG across three cylinder classes (4 / 6 / 8)." },
    hint: "If omnibus F is not significant, do NOT peek at pairwise tests — the family-wise error guarantee assumes a stopping rule.",
    challenge: "Swap TukeyHSD for pairwise.t.test(..., p.adjust.method = \"bonferroni\") — which pairs lose significance?",
    takeaways: [
      "F-test is omnibus: it flags 'at least one mean differs', not which.",
      "Tukey HSD controls the family-wise error rate (FWER) across all pairs.",
      "Kruskal-Wallis is the rank-based non-parametric fallback when assumptions fail.",
    ],
    related: ["ttest","lm","wilcoxon"],
    packages: [],
    code:
`mtcars$cyl_f <- factor(mtcars$cyl)
fit <- aov(mpg ~ cyl_f, data = mtcars)
summary(fit)

TukeyHSD(fit)

boxplot(mpg ~ cyl_f, data = mtcars, col = c("#22d3ee","#8b5cf6","#fbbf24"),
        main = "MPG by # cylinders", xlab = "cyl", ylab = "MPG")`,
    quiz: [
      { q: "Tukey HSD adjusts p-values in order to control:",
        options: ["The Type II error rate","The family-wise error rate","The total residual variance","The required sample size"], correct: 1,
        explain: "Tukey's HSD controls FWER across all pairwise group comparisons." },
      { q: "A significant overall ANOVA F-test tells you:",
        options: ["Exactly which pairs of groups differ","At least one group mean is different","All group means must be equal","That all ANOVA assumptions hold"], correct: 1,
        explain: "The F-test is omnibus — post-hoc tests (Tukey, Bonferroni, …) reveal which groups differ." },
      { q: "ANOVA partitions variance into which two components?",
        options: ["Signal variance and Bayesian prior","Between-group and within-group","Systematic bias and censoring","Measurement error and bootstrap"], correct: 1,
        explain: "F = (between-group MS) / (within-group MS); large F indicates signal over noise." },
      { q: "If ANOVA assumptions clearly fail, a reasonable alternative is:",
        options: ["Student's paired t-test","Kruskal-Wallis rank test","Linear regression with Gaussian errors","Chi-square test of independence"], correct: 1,
        explain: "Kruskal-Wallis is the non-parametric rank analogue when normality or equal variances fail." },
    ]
  },
  {
    id: "diagnostic", icon: "diagnostic", title: "Diagnostic test accuracy", level: "Core",
    objective: "Build a 2×2 table and compute sensitivity, specificity, PPV, and NPV.",
    concepts: ["sensitivity / specificity", "PPV / NPV", "prevalence-dependence"],
    dataset: { name: "simulated", desc: "Binary screening test vs true disease status (n = 500, prevalence 20%)." },
    hint: "Sensitivity and specificity are intrinsic to the test. PPV and NPV shift dramatically with prevalence — same test, new population, new post-test probability.",
    challenge: "Change prevalence from 0.20 to 0.02 and re-run — how does PPV change even though sensitivity/specificity don't?",
    takeaways: [
      "Sensitivity = P(test+ | disease+); Specificity = P(test− | disease−).",
      "PPV = P(disease+ | test+), which depends on prevalence via Bayes' rule.",
      "Likelihood ratios (LR+ = sens/(1−spec)) are prevalence-free and stackable.",
    ],
    related: ["logit","chisq","poisson"],
    packages: [],
    code:
`# Simulated screening test vs gold-standard disease status
set.seed(1)
n  <- 500
prev <- 0.20                                   # population prevalence
disease <- rbinom(n, 1, prev)
test    <- rbinom(n, 1, ifelse(disease == 1, 0.90, 0.15))   # sens=0.90, 1-spec=0.15

tab <- table(Test    = factor(test,    0:1, c("-","+")),
             Disease = factor(disease, 0:1, c("-","+")))
print(tab)

TP <- tab["+","+"]; FN <- tab["-","+"]
FP <- tab["+","-"]; TN <- tab["-","-"]

sens <- TP / (TP + FN)
spec <- TN / (TN + FP)
ppv  <- TP / (TP + FP)
npv  <- TN / (TN + FN)
LRp  <- sens / (1 - spec)
LRn  <- (1 - sens) / spec

cat(sprintf("\\nSensitivity = %.3f\\nSpecificity = %.3f\\nPPV         = %.3f\\nNPV         = %.3f\\nLR+         = %.2f\\nLR-         = %.2f\\n",
            sens, spec, ppv, npv, LRp, LRn))`,
    quiz: [
      { q: "Sensitivity is defined as:",
        options: ["P(disease+ | test+)","P(test+ | disease+)","P(test− | disease−)","P(disease− | test−)"], correct: 1,
        explain: "Sensitivity (true positive rate) is the probability the test is positive given the disease is present." },
      { q: "Which quantity depends directly on prevalence?",
        options: ["Sensitivity","Specificity","Positive predictive value (PPV)","Likelihood ratio positive (LR+)"], correct: 2,
        explain: "PPV and NPV are post-test probabilities — they shift with prevalence via Bayes' rule. Sens/spec/LRs do not." },
      { q: "A highly SPECIFIC test is useful for:",
        options: ["Ruling disease IN when it is positive","Ruling disease OUT when it is negative","Screening a low-prevalence population","Replacing the gold-standard test"], correct: 0,
        explain: "'SpPin': high SPecificity + positive result → rules diseases IN. Mnemonic counterpart: 'SnNout'." },
      { q: "A likelihood ratio positive (LR+) much greater than 1 means:",
        options: ["The test is uninformative","A positive result shifts post-test odds up","A positive result shifts post-test odds down","Prevalence must be very high"], correct: 1,
        explain: "post-test odds = LR+ × pre-test odds. LR+ > 1 ⇒ a positive result increases the odds of disease." },
    ]
  },
  {
    id: "power", icon: "power", title: "Sample size & power analysis", level: "Core",
    objective: "Plan a study: compute the sample size needed to detect a pre-specified effect.",
    concepts: ["power.t.test()", "power.prop.test()", "MDE"],
    dataset: { name: "none (planning)", desc: "Enter the effect size, SD, α, and desired power — no data needed." },
    hint: "Fix any 3 of { n, delta, sd, sig.level, power } and R will solve for the 4th. Set the one you don't know to NULL.",
    challenge: "Sweep power from 0.70 → 0.95 in steps of 0.05 and plot n vs power — see the cost of high power.",
    takeaways: [
      "Power = 1 − β = P(reject H₀ | H₁ is true). The community default is 0.80.",
      "n is quadratic in 1/δ: halving the detectable effect quadruples the sample.",
      "For proportions near 0.50, more people are needed than near 0 or 1 (variance is maximal).",
    ],
    related: ["ttest","diagnostic","logit"],
    packages: [],
    code:
`# Scenario 1: two-sample t-test
# Question: how many per arm to detect a 5-mpg difference (SD = 6) at 80% power?
p1 <- power.t.test(delta = 5, sd = 6, sig.level = 0.05, power = 0.80,
                   type = "two.sample", alternative = "two.sided")
print(p1)
cat("\\nn per arm =", ceiling(p1$n),
    " | total n =", 2 * ceiling(p1$n), "\\n\\n")

# Scenario 2: two-proportion test (response 50% vs 35%)
p2 <- power.prop.test(p1 = 0.50, p2 = 0.35,
                      sig.level = 0.05, power = 0.80)
print(p2)
cat("\\nn per arm (proportions) =", ceiling(p2$n), "\\n\\n")

# Curve: n vs detectable delta at fixed power = 0.80
deltas <- seq(2, 10, by = 0.5)
ns <- sapply(deltas, function(d)
  ceiling(power.t.test(delta = d, sd = 6,
                       sig.level = 0.05, power = 0.80,
                       type = "two.sample")$n))
plot(deltas, ns, type = "b", pch = 19, col = "#22d3ee",
     xlab = "Detectable effect (delta)", ylab = "n per arm",
     main = "Sample size vs detectable effect (power = 0.80)")`,
    quiz: [
      { q: "Statistical power is best described as:",
        options: ["P(H₀ true | reject H₀)","P(reject H₀ | H₀ true)","P(reject H₀ | H₁ true)","P(H₀ true | fail to reject H₀)"], correct: 2,
        explain: "Power = 1 − β = probability of correctly rejecting H₀ when the alternative is true." },
      { q: "Halving the effect size you want to detect (same α and power) changes the required n by roughly:",
        options: ["A factor of 1/2","A factor of 2×","A factor of 4×","No change at all"], correct: 2,
        explain: "For t-type tests, n ∝ (σ/δ)², so halving δ quadruples n." },
      { q: "A study with 40% power means that IF the effect is real, you will:",
        options: ["Detect it 40% of the time","Fail to detect it 40% of the time","Make a Type I error 40% of the time","Control the false-discovery rate at 40%"], correct: 0,
        explain: "40% power = 40% chance of rejecting H₀ given H₁. β = 60% Type II rate." },
      { q: "Post-hoc power computed from the observed effect size is:",
        options: ["A useful sanity check","A deterministic function of the p-value","A reliable guide to future replication","Required by most regulators"], correct: 1,
        explain: "Observed-effect 'power' is just a 1-1 rescaling of the p-value and adds no information beyond it." },
    ]
  },
  {
    id: "cox", icon: "cox", title: "Cox proportional hazards", level: "Advanced",
    objective: "Fit a Cox model on the built-in lung dataset and interpret HRs.",
    concepts: ["coxph()", "hazard ratio", "Schoenfeld residuals"],
    dataset: { name: "lung", desc: "NCCTG lung cancer study — 228 patients, days to death or censoring." },
    hint: "cox.zph tests proportional hazards via scaled Schoenfeld residuals. A tiny p-value means the HR is changing over time — consider stratification or a time interaction.",
    challenge: "Stratify by ph.ecog and re-fit — strata(ph.ecog) lets its baseline hazard vary freely.",
    takeaways: [
      "Cox is semi-parametric: it never estimates the baseline hazard — only HRs.",
      "HR = 1 no effect; HR < 1 protective; HR > 1 harmful. It is multiplicative, not additive.",
      "Proportional hazards and non-informative censoring are the two key assumptions.",
    ],
    related: ["km","logit","poisson"],
    packages: ["survival"],
    code:
`library(survival)

# lung: NCCTG lung cancer study (228 patients)
# time = days to event/censor, status = 2 (death) / 1 (censored)
fit <- coxph(Surv(time, status) ~ age + sex + ph.ecog, data = lung)
summary(fit)

# Check PH assumption
zph <- cox.zph(fit)
print(zph)`,
    quiz: [
      { q: "The exp(coef) value returned by coxph() is the:",
        options: ["Odds ratio for the covariate","Risk ratio for the covariate","Hazard ratio for the covariate","Relative survival for the covariate"], correct: 2,
        explain: "Cox regression returns hazard ratios — multiplicative effects on the instantaneous hazard." },
      { q: "A cox.zph() p-value near 1 for a covariate indicates:",
        options: ["Strong evidence the PH assumption fails","No evidence against the PH assumption","A serious sign of model overfitting","Insufficient sample size for inference"], correct: 1,
        explain: "Large p-values ⇒ no detectable departure from proportional hazards for that covariate." },
      { q: "A Cox HR of 0.58 for sex (female vs male) means females have:",
        options: ["58% higher hazard than males on average","About 42% lower instantaneous hazard","58% longer mean survival than males","58% absolute risk over follow-up"], correct: 1,
        explain: "HR = 0.58 ⇒ hazard is 0.58× that of the reference (males) ⇒ ~42% lower instantaneous hazard." },
      { q: "Cox regression does NOT require which parametric assumption?",
        options: ["A specified shape of the baseline hazard","Independence of observations in the data","Non-informative censoring of subjects","Proportional hazards across the follow-up"], correct: 0,
        explain: "Cox is semi-parametric: the baseline hazard is left unspecified; only PH and non-informative censoring are required." },
    ]
  },
  {
    id: "km", icon: "km", title: "Kaplan-Meier & log-rank", level: "Advanced",
    objective: "Estimate survival curves by group and test their equality.",
    concepts: ["survfit()", "survdiff()", "median survival"],
    dataset: { name: "lung", desc: "Survival by sex on the NCCTG lung dataset (1 = male, 2 = female)." },
    hint: "Two KM curves crossing ⇒ non-proportional hazards. Log-rank still tests equality but loses power, and Cox HRs lose their clean interpretation.",
    challenge: "Add a dashed horizontal line at 0.5 to read median survival directly off the curves.",
    takeaways: [
      "KM handles right-censoring by keeping subjects at-risk until their censoring time.",
      "Median survival = smallest t with S(t) ≤ 0.5 — undefined if the curve never reaches there.",
      "Log-rank weights observed vs expected events across the whole follow-up.",
    ],
    related: ["cox","boot","ttest"],
    packages: ["survival"],
    code:
`library(survival)

km <- survfit(Surv(time, status) ~ sex, data = lung)
print(km)

survdiff(Surv(time, status) ~ sex, data = lung)

plot(km, col = c("#64748b","#22d3ee"), lwd = 3,
     xlab = "Days", ylab = "S(t)",
     main = "Kaplan-Meier by sex (lung)")
legend("bottomleft", c("male","female"),
       col = c("#64748b","#22d3ee"), lwd = 3, bty = "n")`,
    quiz: [
      { q: "The log-rank test formally compares:",
        options: ["Only the median survival times","Only the mean times to event","The full survival curves across groups","The estimated hazard ratios directly"], correct: 2,
        explain: "Log-rank: weighted comparison of observed vs expected events across the entire follow-up window." },
      { q: "Kaplan-Meier curves handle right-censoring by:",
        options: ["Dropping all censored subjects from the dataset","Imputing a plausible event time for each","Keeping them at-risk until their censoring time","Analyzing only complete-case observed events"], correct: 2,
        explain: "Censored subjects contribute to the at-risk denominator until their censoring time, then drop out without counting as events." },
      { q: "Median survival from a KM curve is defined as:",
        options: ["The mean of all observed event times","The time when S(t) first drops to 0.5","The largest uncensored event time","The first time any event occurs"], correct: 1,
        explain: "Median survival = t such that Ŝ(t) = 0.5; undefined if the curve never drops that far." },
      { q: "If two KM curves cross each other noticeably, you should:",
        options: ["Rely on the log-rank p-value alone","Suspect non-proportional hazards","Conclude survival is identical","Stop reporting any survival analysis"], correct: 1,
        explain: "Crossing curves are a red flag for non-PH — Cox HRs become hard to interpret and log-rank loses power." },
    ]
  },
  {
    id: "poisson", icon: "poisson", title: "Poisson regression for counts", level: "Advanced",
    objective: "Model a count outcome and interpret incidence rate ratios.",
    concepts: ["glm(..., family = poisson)", "IRR = exp(β)", "overdispersion"],
    dataset: { name: "warpbreaks", desc: "Number of warp breaks per loom by wool type (A / B) and tension (L / M / H)." },
    hint: "If residual deviance ≫ degrees of freedom, the Poisson is too tight. Switch to quasipoisson or negative binomial rather than ignoring it.",
    challenge: "Refit with family = quasipoisson() — how do the SEs and p-values change while coefficients stay put?",
    takeaways: [
      "Poisson regression assumes mean = variance. Most real count data violate this.",
      "exp(β) is an incidence rate ratio (IRR), not an odds ratio.",
      "For rates, add offset(log(person_time)) — not log(person_time) as a covariate.",
    ],
    related: ["logit","cox","lm"],
    packages: [],
    code:
`# warpbreaks: count of warp breaks per loom by wool type and tension
fit <- glm(breaks ~ wool + tension, family = poisson, data = warpbreaks)
summary(fit)

# Incidence rate ratios with 95% Wald CI
IRR <- exp(coef(fit))
CI  <- exp(confint.default(fit))
round(cbind(IRR, CI), 3)

# Overdispersion check
dev_ratio <- fit$deviance / fit$df.residual
cat("\\nDispersion =", round(dev_ratio, 2),
    "  (>> 1 ⇒ consider quasipoisson or negative binomial)\\n")

# Observed vs fitted counts
plot(warpbreaks$breaks, fitted(fit), pch = 19, col = "#22d3ee",
     xlab = "Observed breaks", ylab = "Fitted mean",
     main = "Poisson fit: observed vs fitted")
abline(0, 1, col = "#fbbf24", lwd = 2, lty = 2)`,
    quiz: [
      { q: "In Poisson regression, exp(β) for a covariate is interpreted as:",
        options: ["An odds ratio","A hazard ratio","An incidence rate ratio","A relative survival"], correct: 2,
        explain: "Poisson coefficients exponentiate to IRRs — multiplicative effects on the event rate." },
      { q: "Poisson regression makes which assumption about the conditional distribution?",
        options: ["Mean equals variance","Variance is twice the mean","Mean is exactly zero at baseline","Counts are always ≤ 10"], correct: 0,
        explain: "The Poisson has Var(Y|X) = E(Y|X). Overdispersion (Var > Mean) breaks this." },
      { q: "When modeling rates over unequal follow-up, the correct way to include person-time is:",
        options: ["As a regular right-hand-side covariate","As offset(log(time)) with coefficient fixed at 1","By dividing y by time and using gaussian()","It should be ignored entirely"], correct: 1,
        explain: "offset(log(time)) forces coefficient = 1 on person-time, so y is modeled as a rate." },
      { q: "A residual deviance of 210 on 51 degrees of freedom most likely indicates:",
        options: ["Perfect fit to the data","Overdispersion — the Poisson is too tight","Underdispersion — variance less than mean","A numerical problem in the optimizer"], correct: 1,
        explain: "dev/df ≫ 1 signals overdispersion — SEs are too small and p-values too optimistic." },
    ]
  },
  {
    id: "boot", icon: "boot", title: "Bootstrap confidence intervals", level: "Advanced",
    objective: "Use resampling to build a non-parametric CI for a statistic.",
    concepts: ["sample()", "percentile CI", "bias"],
    dataset: { name: "mtcars", desc: "Bootstrap the mean MPG (statistic with no closed-form CI needed)." },
    hint: "Percentile bootstrap is simple and popular, but BCa corrects for bias and skewness and is usually better for non-symmetric statistics.",
    challenge: "Bootstrap the median instead of the mean — compare the width of the two CIs.",
    takeaways: [
      "Bootstrap replaces distributional assumptions with resampling from the sample itself.",
      "More resamples (B) reduces Monte-Carlo noise — not the true sampling variance.",
      "Bootstrap is unreliable for non-smooth statistics (max, min, quantile extremes).",
    ],
    related: ["ttest","km","lm"],
    packages: [],
    code:
`set.seed(42)
x <- mtcars$mpg
B <- 2000
boot_means <- replicate(B, mean(sample(x, length(x), replace = TRUE)))

ci <- quantile(boot_means, c(0.025, 0.975))
cat("point estimate  :", round(mean(x), 2), "\\n")
cat("bootstrap 95% CI:", round(ci, 2), "\\n")

hist(boot_means, breaks = 40, col = "#8b5cf6", border = "white",
     main = "Bootstrap distribution of mean MPG",
     xlab = "mean(x*)")
abline(v = ci, col = "#fbbf24", lwd = 2, lty = 2)`,
    quiz: [
      { q: "The percentile bootstrap CI is built directly from:",
        options: ["Normal theory with pooled variance","Jackknife residuals of the statistic","The 2.5% and 97.5% resample quantiles","The analytic t-distribution table"], correct: 2,
        explain: "Percentile CI: empirical 2.5% and 97.5% quantiles of the bootstrap distribution." },
      { q: "Bootstrap resampling in this example is done:",
        options: ["From the data without replacement","From the data with replacement","From a fitted normal distribution","Directly from the true population"], correct: 1,
        explain: "Sampling n values with replacement from the observed data mimics drawing a fresh sample of size n." },
      { q: "Increasing the number of resamples B from 200 to 2000 mainly:",
        options: ["Reduces the real sampling variance","Reduces Monte-Carlo error of the CI","Corrects bias in the point estimate","Fixes non-random sampling issues"], correct: 1,
        explain: "More resamples reduce Monte-Carlo noise in the bootstrap estimate, not the underlying sampling variance." },
      { q: "Bootstrap methods break down most severely when:",
        options: ["The sample size is large, say n ≥ 100","The statistic is the sample median","The statistic is highly non-smooth in x","The population is approximately normal"], correct: 2,
        explain: "Non-smooth statistics (e.g., the maximum) have pathological bootstrap distributions — alternatives are needed." },
    ]
  },
];

// ============================================================
// WebR Live Lab — full IDE with lesson catalog + plots
// ============================================================
const WEBR_LS_KEY = "webrlab_v1";
function loadLS() { try { return JSON.parse(localStorage.getItem(WEBR_LS_KEY) || "{}"); } catch { return {}; } }
function saveLS(obj) { try { localStorage.setItem(WEBR_LS_KEY, JSON.stringify(obj)); } catch {} }

// XP scoring: +10 pts per quiz question answered correctly on the first try
// (i.e., answered === correct before reveal). Cached from quizState each render.
function computeXP(quizState) {
  let xp = 0;
  for (const lid of Object.keys(quizState || {})) {
    const lesson = R_LESSONS.find(l => l.id === lid);
    if (!lesson) continue;
    const qs = quizState[lid] || {};
    (lesson.quiz || []).forEach((q, qi) => {
      if (qs.revealed?.[qi] && qs.answered?.[qi] === q.correct) xp += 10;
    });
  }
  return xp;
}

function WebRPane({ onProgress } = {}) {
  const persisted = loadLS();
  const [status, setStatus] = useState("idle"); // idle | loading | ready | running | error
  const [webR, setWebR] = useState(null);
  const [lessonId, setLessonId] = useState(R_LESSONS[0].id);
  const [code, setCode] = useState(R_LESSONS[0].code);
  const [messages, setMessages] = useState([]); // {type, text}
  const [plots, setPlots] = useState([]); // dataURLs
  const [installed, setInstalled] = useState(new Set());
  const [quizState, setQuizState] = useState(persisted.quiz || {}); // {lessonId: {answered, revealed}}
  const [runMs, setRunMs] = useState(null);
  const [history, setHistory] = useState(persisted.history || []);
  const [showObjective, setShowObjective] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [levelFilter, setLevelFilter] = useState("All"); // All | Starter | Core | Advanced
  const [search, setSearch] = useState("");
  const [lastRunOk, setLastRunOk] = useState(false); // gates the "Key takeaways" card
  const [copied, setCopied] = useState(false);
  const taRef = useRef(null);

  // Refs to avoid stale-closure bugs inside async handlers
  const installedRef = useRef(installed);
  const runTokenRef = useRef(0);       // increment on each run; abandon stale results
  const runningRef = useRef(false);    // guard rapid double-clicks before setStatus propagates
  const shelterRef = useRef(null);     // so we can purge if unmounted mid-run
  const lessonIdRef = useRef(lessonId);
  useEffect(() => { installedRef.current = installed; }, [installed]);
  useEffect(() => { lessonIdRef.current = lessonId; }, [lessonId]);

  // Persist quiz + history
  useEffect(() => { saveLS({ ...loadLS(), quiz: quizState }); }, [quizState]);
  useEffect(() => { saveLS({ ...loadLS(), history }); }, [history]);

  // Report progress back to the app-level state so badges can unlock.
  // Emits: completed lesson ids, perfect-quiz lesson ids, and successful runs.
  useEffect(() => {
    if (typeof onProgress !== "function") return;
    const completed = [];
    const perfect = [];
    for (const l of R_LESSONS) {
      const q = quizState[l.id];
      if (!q) continue;
      const revealed = Object.keys(q.revealed || {}).length;
      if (revealed < l.quiz.length) continue;
      completed.push(l.id);
      const correct = l.quiz.reduce(
        (n, qq, qi) => n + (q.revealed?.[qi] && q.answered?.[qi] === qq.correct ? 1 : 0),
        0
      );
      if (correct === l.quiz.length) perfect.push(l.id);
    }
    const runsOk = history.filter(h => h.ok).length;
    onProgress({ completed, perfect, runsOk });
  }, [quizState, history, onProgress]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (shelterRef.current) { try { shelterRef.current.purge(); } catch {} }
  }, []);

  const lesson = R_LESSONS.find(l => l.id === lessonId);
  const qs = quizState[lessonId] || { answered: {}, revealed: {} };

  useEffect(() => {
    setCode(lesson.code);
    setMessages([]);
    setPlots([]);
    setRunMs(null);
    setLastRunOk(false);
    setShowHint(false);
  }, [lessonId]);

  const appendMsg = (type, text) => setMessages(m => [...m, { type, text }]);

  const init = async () => {
    if (status !== "idle" && status !== "error") return;
    setStatus("loading");
    setMessages([{ type: "info", text: "Downloading WebR (~30 MB; cached after first load)…" }]);
    try {
      const dynImport = new Function('u', 'return import(u)');
      const mod = await dynImport('https://webr.r-wasm.org/latest/webr.mjs');
      const w = new mod.WebR();
      await w.init();
      setWebR(w);
      setStatus("ready");
      appendMsg("ok", "R is ready. Select a lesson and press Run (or ⌘/Ctrl + Enter).");
    } catch (e) {
      console.error(e);
      setStatus("error");
      appendMsg("err", (e && e.message ? e.message : String(e)));
    }
  };

  const ensurePackages = async (pkgs) => {
    const missing = (pkgs || []).filter(p => !installedRef.current.has(p));
    if (!missing.length) return;
    appendMsg("info", `Installing package${missing.length>1?"s":""}: ${missing.join(", ")} (one-time)…`);
    await webR.installPackages(missing, true);
    // Update both ref (sync) and state (render)
    const next = new Set(installedRef.current);
    missing.forEach(p => next.add(p));
    installedRef.current = next;
    setInstalled(next);
    appendMsg("ok", `Installed ${missing.join(", ")}`);
  };

  const run = async () => {
    if (!webR || runningRef.current) return;
    runningRef.current = true;
    const myToken = ++runTokenRef.current;
    const startLesson = lessonIdRef.current;
    setStatus("running");
    setMessages([]);
    setPlots([]);
    setRunMs(null);
    const t0 = performance.now();
    let shelter = null;
    try {
      await ensurePackages(lesson.packages);
      shelter = await new webR.Shelter();
      shelterRef.current = shelter;
      const result = await shelter.captureR(code, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: true,
        captureGraphics: { width: 700, height: 450 },
      });

      // If the user switched lessons or hit run again, discard this result
      if (myToken !== runTokenRef.current || lessonIdRef.current !== startLesson) return;

      const msgs = [];
      (result.output || []).forEach(m => {
        if (m.type === "stdout") msgs.push({ type: "stdout", text: m.data });
        else if (m.type === "stderr") msgs.push({ type: "stderr", text: m.data });
        else if (m.type === "message") msgs.push({ type: "info", text: (m.data && m.data.message) || String(m.data) });
        else if (m.type === "warning") msgs.push({ type: "stderr", text: "Warning: " + ((m.data && m.data.message) || String(m.data)) });
        else if (m.type === "error") msgs.push({ type: "err", text: "Error: " + ((m.data && m.data.message) || String(m.data)) });
      });
      if (!msgs.length) msgs.push({ type: "info", text: "(no text output — check Plots pane)" });
      setMessages(msgs);

      const imgs = [];
      for (const img of (result.images || [])) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext("2d").drawImage(img, 0, 0);
          imgs.push(canvas.toDataURL("image/png"));
        } catch (imgErr) {
          console.warn("plot render failed", imgErr);
        }
      }
      setPlots(imgs);

      const ms = Math.round(performance.now() - t0);
      setRunMs(ms);
      const hadError = msgs.some(x => x.type === "err");
      setLastRunOk(!hadError);
      setHistory(h => [{ lessonId: startLesson, ok: !hadError, ms, at: Date.now() }, ...h].slice(0, 20));
    } catch (e) {
      console.error(e);
      if (myToken === runTokenRef.current) {
        appendMsg("err", (e && e.message ? e.message : String(e)));
        setHistory(h => [{ lessonId: startLesson, ok: false, ms: 0, at: Date.now() }, ...h].slice(0, 20));
      }
    } finally {
      if (shelter) { try { await shelter.purge(); } catch {} }
      shelterRef.current = null;
      runningRef.current = false;
      if (myToken === runTokenRef.current) setStatus("ready");
    }
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const before = code.slice(0, s), after = code.slice(en);
      const next = before + "  " + after;
      setCode(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
  };

  const pickAnswer = (qi, oi) => {
    setQuizState(s => {
      const cur = s[lessonId] || { answered: {}, revealed: {} };
      return { ...s, [lessonId]: { ...cur, answered: { ...cur.answered, [qi]: oi } } };
    });
  };
  const reveal = (qi) => {
    setQuizState(s => {
      const cur = s[lessonId] || { answered: {}, revealed: {} };
      return { ...s, [lessonId]: { ...cur, revealed: { ...cur.revealed, [qi]: true } } };
    });
  };

  const statusColor = status === "ready" ? "#10b981" :
                      status === "running" ? "#fbbf24" :
                      status === "error" ? "#ef4444" :
                      status === "loading" ? "#22d3ee" : "#94a3b8";
  const statusBg = {
    ready: "rgba(16,185,129,0.12)", running: "rgba(251,191,36,0.14)",
    error: "rgba(239,68,68,0.14)", loading: "rgba(34,211,238,0.14)",
    idle: "rgba(148,163,184,0.10)"
  }[status];

  // Derived progress / gamification
  const xp = computeXP(quizState);
  const isLessonDone = (l) => {
    const q = quizState[l.id];
    return !!(q && Object.keys(q.revealed || {}).length === l.quiz.length);
  };
  const doneCount = R_LESSONS.filter(isLessonDone).length;
  const donePct   = Math.round(100 * doneCount / R_LESSONS.length);

  const quizAllRevealed = lesson.quiz.every((_, qi) => !!qs.revealed?.[qi]);
  const quizScore = lesson.quiz.reduce(
    (n, q, qi) => n + (qs.revealed?.[qi] && qs.answered?.[qi] === q.correct ? 1 : 0), 0
  );

  // Lessons filtered by level + search for the sidebar
  const filteredLessons = R_LESSONS.filter(l => {
    if (levelFilter !== "All" && l.level !== levelFilter) return false;
    if (!search.trim()) return true;
    const hay = (l.title + " " + (l.concepts || []).join(" ") + " " + (l.objective || "")).toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  const nextLesson = (() => {
    const idx = R_LESSONS.findIndex(l => l.id === lessonId);
    if (idx < 0 || idx >= R_LESSONS.length - 1) return null;
    return R_LESSONS[idx + 1];
  })();

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false), 1200); }
    catch { /* clipboard may be blocked; swallow */ }
  };

  const exportNotebook = () => {
    const header = `# =====================================================================
# BiostatQuest · R Lab notebook export
# Generated ${new Date().toISOString()}
# ${R_LESSONS.length} lessons — run each block individually or source() the file.
# =====================================================================

`;
    const body = R_LESSONS.map(l => (
`# ---------------------------------------------------------------------
# ${l.title}  [${l.level}]
# Objective : ${l.objective}
# Concepts  : ${(l.concepts || []).join(", ")}
${l.dataset ? `# Dataset   : ${l.dataset.name} — ${l.dataset.desc}\n` : ""}# ---------------------------------------------------------------------

${l.code}

`
    )).join("\n");
    const blob = new Blob([header + body], { type: "text/x-r" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `biostatquest_rlab_notebook.R`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resetCurrent = () => {
    setQuizState(s => { const n = { ...s }; delete n[lessonId]; return n; });
    setCode(lesson.code);
    setMessages([]); setPlots([]); setRunMs(null); setLastRunOk(false);
  };

  // ---------- render ----------
  return (
    <div className="mt-6 card rounded-2xl overflow-hidden">
      {/* header */}
      <div className="px-4 sm:px-5 md:px-6 py-3 sm:py-4 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2 sm:gap-3"
           style={{background: "linear-gradient(90deg, rgba(34,211,238,0.10), rgba(139,92,246,0.05) 40%, transparent 80%)"}}>
        <div className="min-w-0">
          <div className="t-eyebrow flex items-center gap-1.5" style={{color:"#22d3ee"}}><Ico name="terminal" size={14}/><span>R Studio · powered by WebR · {R_LESSONS.length} lessons</span></div>
          <div className="t-title mt-1" style={{fontSize:"clamp(1.1rem,3.5vw,1.35rem)"}}>Interactive biostatistics lab</div>
          <div className="t-caption mt-1">real R in your browser · no data leaves this device · base graphics inline</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="chip mono" style={{background: statusBg, color: statusColor}}>
            {status === "idle" ? "● not loaded" :
             status === "loading" ? "◐ loading R…" :
             status === "running" ? "◐ running" :
             status === "error" ? "● error" : "● R ready"}
          </span>
          {runMs !== null && status === "ready" && (
            <span className="chip mono" style={{background:"rgba(148,163,184,0.08)", color:"#94a3b8"}}>{runMs} ms</span>
          )}
          {xp > 0 && (
            <span className="chip mono inline-flex items-center gap-1.5" style={{background:"rgba(251,191,36,0.12)", color:"#fbbf24"}}><Ico name="star" size={12}/> {xp} XP</span>
          )}
          {doneCount > 0 && (
            <span className="chip mono inline-flex items-center gap-1.5" style={{background:"rgba(16,185,129,0.12)", color:"#10b981"}}><Ico name="check" size={12}/> {doneCount}/{R_LESSONS.length}</span>
          )}
        </div>
      </div>

      {status === "idle" && (
        <div className="p-4 sm:p-6">
          <div className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-4 sm:p-5 text-sm text-slate-300 leading-relaxed">
            <div className="t-subtitle mb-2 text-white">First-time setup</div>
            WebR is a full R interpreter compiled to WebAssembly. Launching downloads ~30 MB (browser-cached on future visits). Everything then runs locally — your code and data never leave this tab.
            <ul className="list-disc pl-5 mt-3 space-y-1 text-slate-400 text-[12px] sm:text-[13px]">
              <li><span className="text-slate-200">{R_LESSONS.length} curated lessons</span> spanning Starter → Core → Advanced biostatistics</li>
              <li>Descriptives, correlation, t-/Wilcoxon tests, χ², ANOVA, linear &amp; logistic regression</li>
              <li>Diagnostic accuracy, sample-size / power, Poisson, Cox, Kaplan-Meier, bootstrap</li>
              <li>Real <span className="mono text-cyan-300">base graphics</span> rendered inline as PNG</li>
              <li>Auto-installed packages: <span className="mono">survival</span> (on first Cox / KM run)</li>
              <li>Keyboard: <span className="mono text-slate-300">⌘/Ctrl + Enter</span> to run · <span className="mono text-slate-300">Tab</span> to indent</li>
            </ul>
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={init} className="btn btn-primary px-5 py-3 rounded-xl inline-flex items-center gap-2">
                <Ico name="bolt" size={16}/> Launch R environment
              </button>
              <button onClick={exportNotebook} className="btn btn-ghost px-4 py-3 rounded-xl text-sm inline-flex items-center gap-2">
                <Ico name="notebook" size={15}/> Download notebook (.R)
              </button>
            </div>
          </div>
        </div>
      )}

      {status !== "idle" && (
        <div className="grid md:grid-cols-[280px_1fr] gap-0">
          {/* lesson sidebar */}
          <aside className="border-b md:border-b-0 md:border-r border-slate-800/70 bg-slate-950/40 p-3 md:min-h-[640px]">
            <div className="flex items-center justify-between px-2 py-2">
              <div className="t-eyebrow text-slate-500">Lessons</div>
              <div className="text-[10px] mono text-slate-500">{filteredLessons.length}/{R_LESSONS.length}</div>
            </div>
            {/* level filter */}
            <div className="flex gap-1 mb-2 px-1">
              {["All","Starter","Core","Advanced"].map(lv => (
                <button key={lv} onClick={()=>setLevelFilter(lv)}
                  className={`flex-1 text-[10px] uppercase tracking-wider py-1.5 rounded-md mono transition ${levelFilter===lv ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" : "text-slate-500 hover:text-slate-200 border border-transparent"}`}>
                  {lv}
                </button>
              ))}
            </div>
            {/* search */}
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search lessons…"
              className="w-full mb-2 px-3 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 text-[12px] text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-500/50"/>

            <div className="space-y-1">
              {filteredLessons.length === 0 && (
                <div className="text-slate-500 text-[12px] px-3 py-4 text-center">no matches</div>
              )}
              {filteredLessons.map(l => {
                const active = l.id === lessonId;
                const done = isLessonDone(l);
                const lvColor = l.level === "Starter" ? "#67e8f9" : l.level === "Core" ? "#a78bfa" : "#fbbf24";
                return (
                  <button key={l.id} onClick={()=>setLessonId(l.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-start gap-2 ${active ? "bg-cyan-500/10 border border-cyan-500/30" : "hover:bg-slate-800/40 border border-transparent"}`}>
                    <span className="mt-0.5" style={{color: lvColor}}><Ico name={l.icon} size={18}/></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1">
                        <span className="block text-[13px] font-semibold text-slate-100 truncate">{l.title}</span>
                        {done && <span className="text-emerald-400 inline-flex items-center"><Ico name="check" size={10}/></span>}
                      </span>
                      <span className="block text-[10px] uppercase tracking-wider mono" style={{color: lvColor}}>
                        {l.level}{l.packages?.length ? ` · ${l.packages.join(",")}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 px-2">
              <div className="t-eyebrow text-slate-500 mb-2">Installed packages</div>
              <div className="flex flex-wrap gap-1">
                <span className="chip mono" style={{background:"rgba(148,163,184,0.1)", color:"#cbd5e1"}}>base · stats</span>
                {[...installed].map(p => (
                  <span key={p} className="chip mono" style={{background:"rgba(16,185,129,0.12)", color:"#10b981"}}>{p}</span>
                ))}
              </div>
              <div className="mt-4 t-eyebrow text-slate-500 mb-2">Progress</div>
              <div className="text-[13px] text-slate-200 mb-1"><span className="mono font-bold text-cyan-300">{doneCount}</span> / {R_LESSONS.length} lessons · <span className="mono text-amber-400">{xp} XP</span></div>
              <div className="bar"><div style={{width: donePct + "%"}}></div></div>
              <button onClick={exportNotebook}
                className="mt-3 w-full text-[11px] mono text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 rounded-md py-1.5 transition inline-flex items-center justify-center gap-1.5">
                <Ico name="notebook" size={12}/> Export notebook
              </button>
              {doneCount > 0 && (
                <button onClick={()=>{ if(confirm("Reset all R Lab quiz progress?")) { setQuizState({}); setHistory([]); }}}
                  className="mt-2 w-full text-[11px] text-slate-500 hover:text-rose-400 mono">reset all progress</button>
              )}
            </div>
          </aside>

          {/* main */}
          <section className="p-3 sm:p-4 md:p-5 space-y-4 min-w-0">
            {/* objective */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-cyan-300"><Ico name={lesson.icon} size={22}/></span>
                    <span className="t-subtitle text-white">{lesson.title}</span>
                    <span className="chip mono" style={{background:"rgba(34,211,238,0.14)", color:"#22d3ee"}}>{lesson.level}</span>
                    {lesson.packages?.length > 0 && (
                      <span className="chip mono" style={{background:"rgba(139,92,246,0.14)", color:"#a78bfa"}}>pkg: {lesson.packages.join(", ")}</span>
                    )}
                  </div>
                  {showObjective && (
                    <>
                      <div className="t-body text-slate-200">{lesson.objective}</div>
                      {lesson.dataset && (
                        <div className="mt-2 text-[12px] text-slate-400">
                          <span className="mono text-cyan-300">{lesson.dataset.name}</span>
                          <span className="text-slate-500"> — {lesson.dataset.desc}</span>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lesson.concepts.map(c => (
                          <span key={c} className="chip mono" style={{background:"rgba(148,163,184,0.08)", color:"#cbd5e1"}}>{c}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={()=>setShowObjective(v=>!v)}
                  className="text-slate-400 hover:text-white text-xs mono flex-shrink-0">{showObjective ? "[hide]" : "[show]"}</button>
              </div>
              {/* hint reveal */}
              {lesson.hint && showObjective && (
                <div className="mt-3 pt-3 border-t border-cyan-500/10">
                  {!showHint ? (
                    <button onClick={()=>setShowHint(true)} className="text-[12px] mono text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5">
                      <Ico name="bulb" size={13}/> Show pro tip
                    </button>
                  ) : (
                    <div className="text-[12.5px] text-amber-100/90 leading-relaxed flex gap-2">
                      <span className="text-amber-400 mt-0.5 flex-shrink-0"><Ico name="bulb" size={14}/></span>
                      <span>{lesson.hint}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* editor */}
            <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-700/60">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-400 mono">
                  {lesson.id}.R · {code.split("\n").length} lines
                </span>
                <span className="ml-auto text-[10px] mono text-slate-500">⌘/Ctrl + ⏎</span>
              </div>
              <textarea
                ref={taRef}
                value={code}
                onChange={e=>setCode(e.target.value)}
                onKeyDown={onKey}
                spellCheck={false}
                className="w-full bg-transparent mono text-[12.5px] leading-[1.55] text-slate-100 p-3 sm:p-4 outline-none resize-y"
                style={{minHeight: 240, fontFamily: "'JetBrains Mono', monospace"}}
              />
            </div>

            {/* actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={run} disabled={status!=="ready"}
                className="btn btn-primary px-5 py-2.5 rounded-lg text-sm disabled:opacity-40 inline-flex items-center gap-2">
                {status === "running"
                  ? <><Ico name="hourglass" size={14}/> Running…</>
                  : <><Ico name="play" size={12}/> Run</>}
              </button>
              <button onClick={()=>setCode(lesson.code)} disabled={status==="running"}
                className="btn btn-ghost px-3 py-2.5 rounded-lg text-sm disabled:opacity-40 inline-flex items-center gap-1.5"><Ico name="reset" size={13}/> Reset code</button>
              <button onClick={()=>{ setMessages([]); setPlots([]); setRunMs(null); setLastRunOk(false); }} disabled={status==="running"}
                className="btn btn-ghost px-3 py-2.5 rounded-lg text-sm disabled:opacity-40">Clear</button>
              <button onClick={copyCode}
                className="btn btn-ghost px-3 py-2.5 rounded-lg text-sm inline-flex items-center gap-1.5">
                {copied
                  ? <><Ico name="check" size={13}/> Copied</>
                  : <><Ico name="copy" size={13}/> Copy</>}
              </button>
              <button onClick={()=>{ const blob = new Blob([code], {type:"text/x-r"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${lesson.id}.R`; a.click(); URL.revokeObjectURL(a.href); }}
                className="btn btn-ghost px-3 py-2.5 rounded-lg text-sm inline-flex items-center gap-1.5"><Ico name="download" size={13}/> Save .R</button>
            </div>

            {/* Key takeaways — shown after a successful run */}
            {lastRunOk && lesson.takeaways?.length > 0 && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 fade-in">
                <div className="t-eyebrow mb-2 inline-flex items-center gap-1.5" style={{color:"#10b981"}}><Ico name="check" size={12}/> Key takeaways</div>
                <ul className="space-y-1.5">
                  {lesson.takeaways.map((t,i) => (
                    <li key={i} className="text-[13px] text-emerald-50/90 leading-relaxed flex gap-2">
                      <span className="text-emerald-400 mono flex-shrink-0">{String(i+1).padStart(2,"0")}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Challenge */}
            {lesson.challenge && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="t-eyebrow mb-2 inline-flex items-center gap-1.5" style={{color:"#fbbf24"}}><Ico name="target" size={13}/> Stretch challenge</div>
                <div className="text-[13px] text-amber-50/90 leading-relaxed">{lesson.challenge}</div>
              </div>
            )}

            {/* console + plots */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-700/60">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-400 mono">R console</span>
                  <span className="ml-auto text-[10px] mono text-slate-500">{messages.length ? `${messages.length} blocks` : ""}</span>
                </div>
                <div className="p-4 max-h-96 overflow-auto mono text-[12px] leading-relaxed whitespace-pre-wrap">
                  {messages.length === 0 && <span className="text-slate-500">(no output yet — press Run)</span>}
                  {messages.map((m, i) => {
                    const color = m.type === "stderr" ? "#fca5a5"
                                : m.type === "err" ? "#f87171"
                                : m.type === "ok" ? "#34d399"
                                : m.type === "info" ? "#67e8f9"
                                : "#e2e8f0";
                    return <div key={i} style={{color, whiteSpace:"pre-wrap"}}>{m.text}</div>;
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-slate-700/70 bg-slate-950/80 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-700/60">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-400 mono">Plots</span>
                  <span className="ml-auto text-[10px] mono text-slate-500">{plots.length} figure{plots.length===1?"":"s"}</span>
                </div>
                <div className="p-4 max-h-96 overflow-auto bg-white/[0.03]">
                  {plots.length === 0 ? (
                    <div className="text-slate-500 text-sm text-center py-10">No plots. Try a lesson that calls <span className="mono">hist()</span>, <span className="mono">plot()</span>, or <span className="mono">boxplot()</span>.</div>
                  ) : (
                    <div className="space-y-3">
                      {plots.map((src,i) => (
                        <img key={i} src={src} alt={`plot-${i}`} className="w-full rounded-lg border border-slate-800 bg-white" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* comprehension quiz */}
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4">
              <div className="t-eyebrow mb-3 flex items-center gap-2" style={{color:"#22d3ee"}}>
                <Ico name="book" size={13}/>
                <span>Comprehension check</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{lesson.quiz.length} questions</span>
                {quizAllRevealed && (
                  <span className="ml-auto chip mono" style={{background:"rgba(16,185,129,0.12)", color:"#10b981"}}>
                    {quizScore}/{lesson.quiz.length} correct
                  </span>
                )}
              </div>
              <div className="space-y-5">
                {lesson.quiz.map((q, qi) => {
                  const picked = qs.answered?.[qi] ?? null;
                  const shown = !!qs.revealed?.[qi];
                  return (
                    <div key={qi}>
                      <div className="text-slate-100 text-sm mb-2 font-medium">Q{qi+1}. {q.q}</div>
                      <div className="space-y-2">
                        {q.options.map((o, oi) => {
                          const isCorrect = oi === q.correct;
                          const cls = shown
                            ? isCorrect ? "option-btn correct" : picked === oi ? "option-btn incorrect" : "option-btn opacity-50"
                            : picked === oi ? "option-btn selected" : "option-btn";
                          return (
                            <button key={oi} disabled={shown} onClick={()=>pickAnswer(qi, oi)}
                              className={`w-full p-3 rounded-lg text-sm ${cls}`}>
                              <span className="mono text-slate-500 mr-2">{String.fromCharCode(65+oi)}</span>
                              <span className="text-white">{o}</span>
                            </button>
                          );
                        })}
                      </div>
                      {!shown ? (
                        <button onClick={()=>reveal(qi)} disabled={picked === null}
                          className="btn btn-primary mt-2 px-4 py-1.5 rounded-lg text-xs disabled:opacity-40">Check</button>
                      ) : (
                        <div className={`mt-2 p-3 rounded-lg text-sm ${picked===q.correct?"bg-emerald-900/25 text-emerald-200":"bg-rose-900/25 text-rose-200"}`}>
                          <span className="inline-flex items-center mr-1 align-[-0.1em]">{picked===q.correct ? <Ico name="check" size={12}/> : <Ico name="cross" size={12}/>}</span>{q.explain}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* next-lesson CTA */}
              {quizAllRevealed && (
                <div className="mt-5 pt-4 border-t border-cyan-500/15 flex items-center gap-3 flex-wrap">
                  <div className="text-[12.5px] text-slate-300 flex-1 min-w-0">
                    <span className="mono text-emerald-400 inline-flex items-center gap-1.5"><Ico name="check" size={14}/> Lesson complete</span>
                    {quizScore === lesson.quiz.length && <span className="ml-2 text-amber-400 mono">· perfect score!</span>}
                  </div>
                  <button onClick={resetCurrent} className="btn btn-ghost text-xs px-3 py-1.5 rounded-md inline-flex items-center gap-1.5"><Ico name="reset" size={13}/> Retry</button>
                  {nextLesson && (
                    <button onClick={()=>setLessonId(nextLesson.id)}
                      className="btn btn-primary text-sm px-4 py-2 rounded-md inline-flex items-center gap-2">
                      <span>Next:</span>
                      <Ico name={nextLesson.icon} size={16}/>
                      <span>{nextLesson.title}</span>
                      <span>→</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Related lessons */}
            {lesson.related?.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="t-eyebrow mb-2 text-slate-500">Related lessons</div>
                <div className="flex flex-wrap gap-2">
                  {lesson.related.map(rid => {
                    const rl = R_LESSONS.find(l => l.id === rid);
                    if (!rl) return null;
                    const done = isLessonDone(rl);
                    return (
                      <button key={rid} onClick={()=>setLessonId(rid)}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-cyan-500/40 bg-slate-900/50 hover:bg-slate-900/80 transition text-[12px]">
                        <span className="text-slate-400 group-hover:text-cyan-300"><Ico name={rl.icon} size={14}/></span>
                        <span className="text-slate-200 group-hover:text-cyan-300">{rl.title}</span>
                        <span className="mono text-[10px] text-slate-600">{rl.level}</span>
                        {done && <span className="text-emerald-400 inline-flex items-center"><Ico name="check" size={10}/></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* run history */}
            {history.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="t-eyebrow mb-2 text-slate-500">Recent runs</div>
                <div className="space-y-1 text-[12px] mono text-slate-400 max-h-40 overflow-auto">
                  {history.map((h,i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="inline-flex items-center" style={{color: h.ok ? "#10b981" : "#ef4444"}}><Ico name={h.ok ? "check" : "cross"} size={12}/></span>
                      <span className="text-slate-500">{fmtTime(h.at)}</span>
                      <span className="text-slate-200">{(R_LESSONS.find(l=>l.id===h.lessonId)||{}).title}</span>
                      {h.ok && <span className="ml-auto">{h.ms} ms</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function InfoPill({ label, value, color }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-3 text-center border border-slate-800">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className="text-lg font-bold" style={{color: color||"#fff"}}>{value}</div>
    </div>
  );
}

// Paywall modal. Shown when a free-tier user tries to open a Pro-only case,
// or when they hit an in-app "Upgrade" affordance. Hosted Stripe Checkout
// handles the actual payment UI — we just present pricing and hand off.
function PaywallModal({ reason, onClose, caseTitle }) {
  const [plan, setPlan] = React.useState("yearly"); // default yearly — better LTV + saves money for user
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
  // Phase 5.7 — focus trap + Esc to close. Restores focus to whatever
  // the user clicked to open this on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  async function subscribe() {
    setBusy(true); setErr("");
    try {
      await billing.startCheckout(plan);
      // billing.startCheckout redirects — we won't return here on success.
    } catch (e) {
      setErr(e?.message || "Could not start checkout.");
      setBusy(false);
    }
  }

  const monthly = PRO_PRICE_MONTHLY_USD;
  const yearly = PRO_PRICE_YEARLY_USD;
  const yearlyPerMonth = (yearly / 12).toFixed(2);
  const savings = Math.max(0, monthly * 12 - yearly);

  return ReactDOM.createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 fade-in" style={{background: "rgba(2,6,23,0.78)"}} role="dialog" aria-modal="true" aria-labelledby="paywall-title" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="card premium-border rounded-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto outline-none" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="tag text-amber-300 mb-1">Pro — unlock everything</div>
            <h3 id="paywall-title" className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
              {reason === "locked_case" && caseTitle
                ? <>This case — <span className="gold-text">{caseTitle}</span> — is part of Pro.</>
                : "Unlock all 50 cases."}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0 inline-flex items-center" aria-label="Close"><Ico name="close" size={18}/></button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Free for the first {FREE_CASES_LIMIT} cases. Pro unlocks the remaining {CASES.length - FREE_CASES_LIMIT} — including advanced regression, survival analysis, causal inference, Bayesian methods, and every future case we ship. The FSRS-6 scheduler works across all of them.
        </p>

        <div className="space-y-3 mb-5">
          <button onClick={() => setPlan("yearly")} className={`w-full rounded-xl p-4 text-left transition border ${plan === "yearly" ? "border-cyan-500/60 bg-cyan-950/30" : "border-slate-700 bg-slate-900/40 hover:bg-slate-900/70"}`}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${plan === "yearly" ? "border-cyan-400 bg-cyan-400" : "border-slate-500"}`}/>
                <span className="text-white font-semibold">Yearly</span>
                {savings > 0 && <span className="chip text-[10px] bg-emerald-900/40 text-emerald-300">Save ${savings}/yr</span>}
              </div>
              <div className="text-right">
                <div className="text-white font-bold">${yearly}<span className="text-xs text-slate-400 font-normal">/yr</span></div>
                <div className="text-[11px] text-slate-500">≈ ${yearlyPerMonth}/mo</div>
              </div>
            </div>
          </button>
          <button onClick={() => setPlan("monthly")} className={`w-full rounded-xl p-4 text-left transition border ${plan === "monthly" ? "border-cyan-500/60 bg-cyan-950/30" : "border-slate-700 bg-slate-900/40 hover:bg-slate-900/70"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${plan === "monthly" ? "border-cyan-400 bg-cyan-400" : "border-slate-500"}`}/>
                <span className="text-white font-semibold">Monthly</span>
              </div>
              <div className="text-right">
                <div className="text-white font-bold">${monthly}<span className="text-xs text-slate-400 font-normal">/mo</span></div>
              </div>
            </div>
          </button>
        </div>

        <ul className="text-xs text-slate-400 space-y-1.5 mb-5">
          <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 inline-flex items-center mt-0.5"><Ico name="check" size={14}/></span> All 50 cases unlocked — advanced regression, survival, causal, Bayesian</li>
          <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 inline-flex items-center mt-0.5"><Ico name="check" size={14}/></span> FSRS-6 scheduling across every card</li>
          <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 inline-flex items-center mt-0.5"><Ico name="check" size={14}/></span> Per-method mastery analytics</li>
          <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 inline-flex items-center mt-0.5"><Ico name="check" size={14}/></span> All future content included</li>
          <li className="flex items-start gap-2"><span className="text-emerald-400 shrink-0 inline-flex items-center mt-0.5"><Ico name="check" size={14}/></span> Cancel anytime from your account — no long-term lock-in</li>
        </ul>

        {err && <div className="text-xs text-red-400 mb-3">{err}</div>}
        {!signedIn ? (
          <div className="text-sm text-slate-300 bg-slate-900/60 rounded-lg p-3 mb-3">
            Please sign in first — then we can sync your subscription across devices.
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={onClose} className="btn btn-ghost w-full sm:w-auto px-5 py-3 rounded-xl text-sm">Not now</button>
          <button onClick={subscribe} disabled={busy || !signedIn} className="btn btn-primary flex-1 py-3 rounded-xl text-sm disabled:opacity-40">
            {busy ? "Opening Stripe…" : `Subscribe — $${plan === "yearly" ? yearly + "/yr" : monthly + "/mo"}`}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 text-center mt-3">
          Payments securely handled by Stripe. We never see your card number.
        </p>
      </div>
    </div>
  ), document.body);
}




function SoftWallModal({ state, totalXP, onClose }) {
  const authConfigured = window.BQAuth && window.BQAuth.enabled;

  function dismiss() {
    try { localStorage.setItem("bq_softwall_dismissed", String(Date.now())); } catch {}
    onClose();
  }

  return ReactDOM.createPortal((
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 fade-in" onClick={dismiss} role="dialog" aria-modal="true">
      <div className="premium-border bg-slate-900 border border-cyan-600/40 rounded-2xl p-5 sm:p-7 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-3">
          <div className="mb-1 text-cyan-300 inline-flex items-center justify-center"><Ico name="confetti" size={56}/></div>
          <p className="text-cyan-300 font-semibold">+{totalXP} XP just earned</p>
        </div>
        {authConfigured ? (
          <SignInCard
            state={state}
            context="post-case"
            onSuccess={onClose}
            onCancel={dismiss}
          />
        ) : (
          <>
            <h3 className="text-xl font-bold text-white mb-2 text-center">Accounts coming soon</h3>
            <p className="text-sm text-slate-400 mb-4 text-center">Your XP is safe in this browser for now — sync-across-devices is shipping shortly.</p>
            <button onClick={onClose} className="btn btn-primary w-full py-3 rounded-xl">Keep playing</button>
          </>
        )}
      </div>
    </div>
  ), document.body);
}

// ============================================================
// QUOTES — curated by branch. Shown on the CaseResult screen.
// Pick is deterministic (seeded by caseId + attempt count) so
// a replay can rotate the quote naturally.
// ============================================================
const QUOTES = {
  foundations: [
    { q: "In God we trust; all others must bring data.", a: "W. Edwards Deming" },
    { q: "Without data, you're just another person with an opinion.", a: "W. Edwards Deming" },
    { q: "Statistics is the grammar of science.", a: "Karl Pearson" },
    { q: "Errors using inadequate data are much less than those using no data at all.", a: "Charles Babbage" },
    { q: "The plural of anecdote is data.", a: "Raymond Wolfinger" },
  ],
  probability: [
    { q: "The theory of probability is at bottom nothing but common sense reduced to calculation.", a: "Pierre-Simon Laplace" },
    { q: "Chance favors only the prepared mind.", a: "Louis Pasteur" },
    { q: "The most important questions of life are, for the most part, really only problems of probability.", a: "Pierre-Simon Laplace" },
    { q: "Probability is the very guide of life.", a: "Bishop Joseph Butler" },
    { q: "When it is not in our power to determine what is true, we ought to follow what is most probable.", a: "René Descartes" },
  ],
  estimation_inference: [
    { q: "Far better an approximate answer to the right question, which is often vague, than an exact answer to the wrong question, which can always be made precise.", a: "John Tukey" },
    { q: "To consult the statistician after an experiment is finished is often merely to ask him to conduct a post mortem examination. He can perhaps say what the experiment died of.", a: "R.A. Fisher" },
    { q: "The combination of some data and an aching desire for an answer does not ensure that a reasonable answer can be extracted from a given body of data.", a: "John Tukey" },
    { q: "Statistical thinking will one day be as necessary for efficient citizenship as the ability to read and write.", a: "H.G. Wells" },
    { q: "The best thing about being a statistician is that you get to play in everyone's backyard.", a: "John Tukey" },
  ],
  regression: [
    { q: "All models are wrong, but some are useful.", a: "George E.P. Box" },
    { q: "Statisticians, like artists, have the bad habit of falling in love with their models.", a: "George E.P. Box" },
    { q: "Essentially, all models are approximations. The practical question is how wrong do they have to be to not be useful.", a: "George E.P. Box" },
    { q: "The model is a lens, not a verdict.", a: "Andrew Gelman (paraphrased)" },
    { q: "If you torture the data long enough, it will confess to anything.", a: "Ronald Coase" },
  ],
  design_bias: [
    { q: "Block what you can, randomize what you cannot.", a: "George E.P. Box" },
    { q: "The peculiar function of randomization is to give a known probability distribution to the difference between treatment and control.", a: "R.A. Fisher" },
    { q: "If your experiment needs statistics, you ought to have done a better experiment.", a: "Ernest Rutherford" },
    { q: "Nature, to be commanded, must be obeyed.", a: "Francis Bacon" },
    { q: "The worth of a study is decided at its design, not its analysis.", a: "Austin Bradford Hill (paraphrased)" },
  ],
  missing_measurement: [
    { q: "Measure what is measurable, and make measurable what is not so.", a: "Galileo Galilei" },
    { q: "Not everything that counts can be counted, and not everything that can be counted counts.", a: "William Bruce Cameron" },
    { q: "Absence of evidence is not evidence of absence.", a: "Martin Rees" },
    { q: "The first principle is that you must not fool yourself — and you are the easiest person to fool.", a: "Richard Feynman" },
    { q: "What gets measured gets managed — so measure what matters.", a: "Peter Drucker (paraphrased)" },
  ],
  causal: [
    { q: "Behind every causal conclusion there must lie some causal assumption that is not testable in observational studies.", a: "Judea Pearl" },
    { q: "A cause cannot be understood without imagining what would have happened without it.", a: "Judea Pearl" },
    { q: "Correlation does not imply causation — but it is a big hint.", a: "Edward Tufte" },
    { q: "No causation without manipulation.", a: "Paul Holland" },
    { q: "Experiments are the only means for answering questions of causation.", a: "R.A. Fisher" },
  ],
  advanced_bayesian: [
    { q: "When the facts change, I change my mind. What do you do, sir?", a: "John Maynard Keynes" },
    { q: "Bayesian statistics is difficult in the sense that thinking is difficult.", a: "Don Berry" },
    { q: "It is remarkable that a science which began with the consideration of games of chance should have become the most important object of human knowledge.", a: "Pierre-Simon Laplace" },
    { q: "Uncertainty is an uncomfortable position. But certainty is an absurd one.", a: "Voltaire" },
    { q: "Probability theory is nothing but common sense reduced to calculation.", a: "Pierre-Simon Laplace" },
  ],
};

function pickQuote(branch, seed) {
  const pool = (QUOTES && QUOTES[branch]) || QUOTES.foundations;
  const s = String(seed == null ? "" : seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

function QuoteCard({ branch, seed }) {
  const quote = pickQuote(branch, seed);
  const branchName = (BRANCHES && BRANCHES[branch] && BRANCHES[branch].name) || "Biostatistics";
  return (
    <div className="mb-6 p-5 sm:p-6 rounded-2xl card border border-cyan-900/40 text-left">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold">
          Words from the field
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          On {branchName}
        </div>
      </div>
      <blockquote className="text-white text-base sm:text-lg leading-relaxed italic mb-3">
        &ldquo;{quote.q}&rdquo;
      </blockquote>
      <div className="text-sm text-slate-400">— {quote.a}</div>
    </div>
  );
}

// Per-method mastery panel, shown on CaseResult for signed-in users. Pulls
// FSRS stability per-qid from public.reviews, aggregates by method, and
// renders a sorted list. "Mastery" is a normalized scale: stability in days
// clamped to a 30-day horizon (after which we consider a method well-known).
// Methods not yet reviewed don't appear — this is a snapshot, not a TODO list.
function MasteryPanel() {
  const [data, setData] = React.useState(null); // null = loading, {} = loaded
  React.useEffect(() => {
    let alive = true;
    (async () => {
      const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
      if (!signedIn) { if (alive) setData({}); return; }
      try {
        const m = await srsGetMasteryByMethod();
        if (alive) setData(m || {});
      } catch { if (alive) setData({}); }
    })();
    return () => { alive = false; };
  }, []);

  if (data === null) return null;
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  // Sort: strongest mastery first, tie-break by practice count.
  entries.sort((a, b) => (b[1].stability - a[1].stability) || (b[1].count - a[1].count));
  const top = entries.slice(0, 8);

  // Look up the display name from METHODS if available, else humanize the id.
  const nameFor = (id) => {
    const m = METHODS?.[id];
    if (m?.name) return m.name;
    return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const MASTERY_HORIZON_DAYS = 30;

  return (
    <div className="text-left bg-slate-900/40 rounded-2xl p-4 sm:p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-white">Your mastery · by method</div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">top {top.length}</div>
      </div>
      <div className="space-y-2.5">
        {top.map(([method, { stability, count }]) => {
          const pct = Math.max(4, Math.min(100, Math.round((stability / MASTERY_HORIZON_DAYS) * 100)));
          const isStrong = stability >= 14;
          const color = isStrong ? "from-emerald-500 to-cyan-400" : stability >= 3 ? "from-amber-500 to-amber-300" : "from-rose-500 to-rose-400";
          return (
            <div key={method}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-200 truncate pr-2">{nameFor(method)}</span>
                <span className="mono text-slate-500 shrink-0">
                  {stability < 1 ? "<1d" : `${stability.toFixed(1)}d`} · {count} {count === 1 ? "card" : "cards"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }}/>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        Mastery = memory stability in days from the spaced-repetition scheduler. More grading (Again / Hard / Good / Easy) → better estimate.
      </div>
    </div>
  );
}

function CaseResult({ result, onHome, onReplay, onNext, onShare, srs, state, onOpenGlossary }) {
  const isReview = result.caseId === REVIEW_CASE_ID;
  const c = isReview
    ? { id: REVIEW_CASE_ID, title: "Daily Review", branch: "foundations" }
    : CASES.find(x => x.id === result.caseId);
  const narrative = isReview ? null : getNarrative(result.caseId);
  const correctCount = result.answers.filter(a=>a.correct).length;
  const score = Math.round((correctCount/result.answers.length)*100);
  const baseXP = Math.round(correctCount * 30 * DIFFICULTIES[result.difficulty].xpMult);
  const timeXP = Math.round(result.timeBonus * DIFFICULTIES[result.difficulty].xpMult);
  const totalXP = baseXP + timeXP;
  const nextCase = isReview ? null : CASES.find(x => !result.completedBefore.includes(x.id) && x.id !== c.id);

  // Soft-wall: show on 1st and 2nd case completion, only for guests, and respect dismissal cooldown.
  const [showSoftWall, setShowSoftWall] = React.useState(false);
  React.useEffect(() => {
    const isGuest = !(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
    const completedCount = (result.completedBefore?.length || 0) + 1;
    const isEarlyCompletion = completedCount <= 2;
    let cooldownOK = true;
    try {
      const d = parseInt(localStorage.getItem("bq_softwall_dismissed") || "0", 10);
      // Re-show only if dismissed >24h ago
      if (d && Date.now() - d < 24*60*60*1000) cooldownOK = false;
    } catch {}
    if (isGuest && isEarlyCompletion && cooldownOK) {
      const t = setTimeout(() => setShowSoftWall(true), 900); // let the XP animation land first
      return () => clearTimeout(t);
    }
  }, []);

  // Confetti + bounce is reserved for *rare* milestones: first-ever case,
  // a badge unlock, or a level-up. Routine 100% runs get a calmer result
  // screen — the reward is the XP + the next case, not fireworks every time.
  const prevLevel = levelFromXP(result.prevXp || 0);
  const newLevel = levelFromXP(result.newXp || 0);
  const isLevelUp = newLevel > prevLevel;
  const isFirstCase = (result.completedBefore?.length || 0) === 0;
  const hasNewBadge = (result.newBadges?.length || 0) > 0;
  const isMilestone = isLevelUp || isFirstCase || hasNewBadge;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 fade-in">
      {showSoftWall && <SoftWallModal state={state} totalXP={totalXP} onClose={()=>setShowSoftWall(false)} />}
      {isMilestone && <Confetti/>}
      <div className="card premium-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 text-center">
        <div className={`mb-3 sm:mb-4 inline-flex items-center justify-center ${score === 100 ? "text-amber-300" : score >= 80 ? "text-cyan-300" : score >= 60 ? "text-emerald-300" : "text-slate-300"} ${isMilestone ? "bounce-in" : ""}`}>
          <Ico name={score === 100 ? "trophy" : score >= 80 ? "confetti" : score >= 60 ? "thumbs-up" : "books"} size={72}/>
        </div>
        <h2 className="text-2xl sm:text-4xl font-extrabold text-white mb-1 leading-tight">
          {score === 100 ? "Flawless Victory!" : score >= 80 ? "Excellent!" : score >= 60 ? "Case Closed" : "Keep Going"}
        </h2>
        <div className="text-slate-400 mb-5 sm:mb-6 text-sm sm:text-base">{c.title}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
          <StatCard label="Score" value={`${score}%`} gradient/>
          <StatCard label="Correct" value={`${correctCount}/${result.answers.length}`}/>
          <StatCard label="XP" value={`+${totalXP}`}/>
          <StatCard label="Time Bonus" value={`+${result.timeBonus}`}/>
        </div>

        {/* Authored resolution — appears for narrative cases above the quote
            and answer-review blocks. Written in the voice of closing a chart:
            what happened, what the right move was, what a wrong call would
            have cost. Keeps the case feeling resolved, not scored-and-gone. */}
        {narrative && narrative.closingResolution && (
          <div className="text-left rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-2">Resolution</div>
            <div className="text-base sm:text-lg font-bold text-white mb-4 leading-snug">{narrative.closingResolution.headline}</div>
            <div className="space-y-4 text-sm text-slate-200 leading-relaxed">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">What happened</div>
                <p dangerouslySetInnerHTML={{__html: narrative.closingResolution.whatHappened.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')}}/>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-semibold mb-1">The correct move</div>
                <p dangerouslySetInnerHTML={{__html: narrative.closingResolution.correctMove.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')}}/>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-rose-300 font-semibold mb-1">Cost of the wrong call</div>
                <p dangerouslySetInnerHTML={{__html: narrative.closingResolution.costOfError.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')}}/>
              </div>
            </div>
          </div>
        )}

        {result.newBadges && result.newBadges.length > 0 && (
          <div className="mb-6 p-5 rounded-2xl card card-glow bounce-in">
            <div className="gold-text font-bold text-lg mb-3 inline-flex items-center gap-2"><Ico name="medal" size={20}/> New Badge{result.newBadges.length>1?"s":""} Unlocked!</div>
            <div className="flex justify-center gap-2 flex-wrap">
              {result.newBadges.map(b => (
                <button
                  key={b.id}
                  onClick={() => onShare && onShare({ id: "badge:"+b.id, icon: b.icon, kindLabel: "Badge", title: b.name, subtitle: b.desc })}
                  className="badge bg-amber-600/30 text-amber-200 hover:bg-amber-600/50 transition text-sm py-2 px-3"
                  title="Share this badge"
                ><span className="inline-flex items-center gap-1.5"><Ico name={b.icon} size={14}/> {b.name} <span className="text-amber-300/70 text-[10px] ml-1 inline-flex items-center gap-0.5">share <Ico name="arrow-up-right" size={10}/></span></span></button>
              ))}
            </div>
          </div>
        )}

        {score === 100 && (
          <div className="mb-4 flex justify-center">
            <button
              onClick={() => onShare && onShare({
                id: `perfect:${result.caseId}:${result.difficulty}:${Date.now()}`,
                icon: "hundred", kindLabel: "Flawless Victory",
                title: "Perfect run",
                subtitle: `${c.title} · ${DIFFICULTIES[result.difficulty].name}`
              })}
              className="btn btn-ghost py-2 px-4 rounded-lg text-xs inline-flex items-center gap-2"
            ><Ico name="camera" size={14}/> Create share card</button>
          </div>
        )}

        <QuoteCard branch={c.branch} seed={`${result.caseId}:${result.completedBefore?.length || 0}`} />

        <MasteryPanel/>

        <div className="text-left bg-slate-900/40 rounded-2xl p-4 sm:p-5 mb-6 scrollbar" style={{maxHeight:"400px", overflowY:"auto"}}>
          <div className="font-bold text-white mb-3 inline-flex items-center gap-2"><Ico name="clipboard" size={16}/> Debrief — Full Solutions</div>
          {result.answers.map((a,i)=>(
            <div key={i} className="mb-3 pb-3 border-b border-slate-800 last:border-0">
              <div className="text-sm flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${a.correct?"bg-emerald-500/20 text-emerald-400":"bg-red-500/20 text-red-400"}`}><Ico name={a.correct?"check":"cross"} size={12}/></span>
                <div>
                  <div className="text-slate-200 font-medium">{a.q}</div>
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">{a.explain}</div>
                  {a.method && <DeepDive methodId={a.method} compact srs={srs} onOpenGlossary={onOpenGlossary}/>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={onReplay} className="btn btn-ghost py-3 rounded-xl inline-flex items-center justify-center gap-2"><Ico name="reset" size={14}/> Replay (new Qs)</button>
          {nextCase && <button onClick={()=>onNext(nextCase.id)} className="btn btn-primary py-3 rounded-xl">Next Case →</button>}
          <button onClick={onHome} className="btn btn-ghost py-3 rounded-xl inline-flex items-center justify-center gap-2"><Ico name="home" size={14}/> Home</button>
        </div>
      </div>
    </div>
  );
}

function Badges({ state, onShare }) {
  const [filter, setFilter] = useState("all"); // all | earned | locked
  const earnedSet = useMemo(() => new Set(state.badges || []), [state.badges]);

  // Group badges by category in the order declared by BADGE_CATEGORIES.
  const grouped = useMemo(() => {
    const g = {};
    for (const cat of BADGE_CATEGORIES) g[cat.id] = [];
    for (const b of BADGES) {
      if (!g[b.cat]) g[b.cat] = [];
      g[b.cat].push(b);
    }
    return g;
  }, []);

  const totalEarned = earnedSet.size;
  const overallPct  = Math.round(100 * totalEarned / BADGES.length);

  const matchesFilter = (b) => {
    const isEarned = earnedSet.has(b.id);
    if (filter === "earned") return isEarned;
    if (filter === "locked") return !isEarned;
    return true;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 fade-in">
      {/* Header + overall progress */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Badges</h2>
            <p className="text-slate-400 text-sm mt-1">
              <span className="gold-text font-bold">{totalEarned}</span> / {BADGES.length} unlocked ·
              click an unlocked badge to share it
            </p>
          </div>
          <div className="flex gap-1 p-1 bg-slate-900/60 rounded-lg border border-slate-800 text-[11px] mono">
            {[["all","All"],["earned","Earned"],["locked","Locked"]].map(([k,l]) => (
              <button key={k} onClick={()=>setFilter(k)}
                className={`px-3 py-1.5 rounded-md transition ${filter===k ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="bar bar-gold mt-3 max-w-md"><div style={{width: overallPct + "%"}}></div></div>
      </div>

      {/* Per-category sections */}
      <div className="space-y-8">
        {BADGE_CATEGORIES.map(cat => {
          const list = (grouped[cat.id] || []).filter(matchesFilter);
          if (list.length === 0) return null;
          const catEarned = (grouped[cat.id] || []).filter(b => earnedSet.has(b.id)).length;
          const catTotal  = (grouped[cat.id] || []).length;
          return (
            <section key={cat.id}>
              <header className="flex items-end justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">{cat.label}</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{cat.blurb}</p>
                </div>
                <div className="text-[11px] mono text-slate-500">
                  <span className="text-amber-400 font-bold">{catEarned}</span>
                  <span className="text-slate-600"> / {catTotal}</span>
                </div>
              </header>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {list.map(b => {
                  const isEarned = earnedSet.has(b.id);
                  const prog = !isEarned && typeof b.progress === "function" ? b.progress(state) : null;
                  const pct  = prog ? Math.round(100 * prog[0] / prog[1]) : 0;
                  const baseCls = `relative rounded-2xl p-4 sm:p-5 border-2 transition text-left w-full ${
                    isEarned
                      ? "bg-gradient-to-br from-amber-900/25 to-orange-900/10 border-amber-600/60 hover:border-amber-400 hover:-translate-y-0.5"
                      : prog && pct > 0
                        ? "card border-slate-700/70 hover:border-slate-500"
                        : "card border-slate-800 opacity-70"
                  }`;
                  const content = (
                    <>
                      <div className={`mb-3 inline-flex items-center justify-center ${isEarned ? "text-amber-300" : "text-slate-500 opacity-70"}`}>
                        <Ico name={isEarned ? b.icon : "lock"} size={40}/>
                      </div>
                      <div className="font-bold text-white text-sm sm:text-base leading-tight">{b.name}</div>
                      <div className="text-xs text-slate-400 mt-1 leading-snug">{b.desc}</div>
                      {isEarned && (
                        <div className="text-xs gold-text mt-2 font-semibold inline-flex items-center gap-1"><Ico name="check" size={10}/> Unlocked · share <Ico name="arrow-up-right" size={10}/></div>
                      )}
                      {!isEarned && prog && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[10.5px] mono text-slate-500 mb-1">
                            <span>Progress</span>
                            <span className="text-slate-300">{prog[0]} / {prog[1]}</span>
                          </div>
                          <div className="bar"><div style={{width: pct + "%"}}></div></div>
                        </div>
                      )}
                    </>
                  );
                  return isEarned && onShare
                    ? <button key={b.id} className={baseCls} onClick={()=>onShare(b)}>{content}</button>
                    : <div key={b.id} className={baseCls}>{content}</div>;
                })}
              </div>
            </section>
          );
        })}
        {BADGE_CATEGORIES.every(cat => (grouped[cat.id] || []).filter(matchesFilter).length === 0) && (
          <div className="text-center text-slate-500 text-sm py-12">
            {filter === "earned" ? "You haven't unlocked any badges yet — complete a case to begin." :
             filter === "locked" ? "You've unlocked every badge." : "No badges to show."}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// PHASE 3 — SHARE CARDS
// Client-side generation: build an SVG, rasterise via canvas, export PNG.
// No backend, no OG unfurling, but instant + offline-safe.
// ============================================================

// Escape for safe embedding inside SVG text nodes.
function svgEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Build an SVG string for an achievement. 1200×630 is the canonical OG ratio.
function buildShareCardSVG({ icon, kindLabel, title, subtitle, xp, level, streak, tagline }) {
  const iconName = icon && ICON_MARKUP[icon] ? icon : "medal";
  const iconFragment = iconSvgFragment(iconName, 72, 238, 108, "#fbbf24", 1.6);
  const safeKind = svgEscape((kindLabel || "Achievement").toUpperCase());
  const safeTitle = svgEscape(title || "");
  const safeSub   = svgEscape(subtitle || "");
  const safeTag   = svgEscape(tagline || "BioStat Quest · biostat-quest.vercel.app");
  const xpStr     = fmtNumber(xp ?? 0);
  const lvlStr    = `LV ${level ?? 1}`;
  const streakNum = streak ? String(streak) : "";
  const streakIcon = streak ? iconSvgFragment("flame", 524, 52, 28, "#fbbf24", 2) : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0f1e"/>
      <stop offset="1" stop-color="#05070f"/>
    </linearGradient>
    <radialGradient id="glow1" cx="15%" cy="10%" r="60%">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="95%" r="55%">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fbbf24"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#0891b2"/>
    </linearGradient>
    <linearGradient id="bell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#06b6d4" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow1)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>

  <!-- Logo: the bell curve from the nav -->
  <g transform="translate(72,64)">
    <path d="M 0 36 C 11 36, 15 35.5, 18 29 C 20.5 22, 22.5 12, 26 8 C 29.5 12, 31.5 22, 34 29 C 37 35.5, 41 36, 48 36 Z"
          transform="scale(1.4)" fill="url(#bell)"/>
    <path d="M 0 36 C 11 36, 15 35.5, 18 29 C 20.5 22, 22.5 12, 26 8 C 29.5 12, 31.5 22, 34 29 C 37 35.5, 41 36, 48 36"
          transform="scale(1.4)" stroke="url(#cyan)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="36.4" cy="11.2" r="3.2" fill="#fde68a" stroke="#f59e0b" stroke-width="1"/>
    <text x="90" y="40" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="800" fill="#f1f5f9">
      BioStat <tspan fill="url(#gold)">Quest</tspan>
    </text>
  </g>

  <!-- Eyebrow -->
  <text x="72" y="230" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700"
        letter-spacing="4" fill="#22d3ee">${safeKind}</text>

  <!-- Icon + title -->
  ${iconFragment}
  <text x="220" y="330" font-family="Inter, system-ui, sans-serif" font-size="72" font-weight="800"
        fill="#f1f5f9">${safeTitle}</text>
  <text x="220" y="385" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="500"
        fill="#cbd5e1">${safeSub}</text>

  <!-- Stat chips -->
  <g transform="translate(72,460)">
    <rect x="0" y="0" width="280" height="96" rx="20" ry="20"
          fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.35)" stroke-width="1"/>
    <text x="24" y="38" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700"
          letter-spacing="2" fill="#94a3b8">TOTAL XP</text>
    <text x="24" y="78" font-family="JetBrains Mono, monospace" font-size="36" font-weight="700"
          fill="url(#cyan)">${xpStr}</text>

    <rect x="300" y="0" width="180" height="96" rx="20" ry="20"
          fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.35)" stroke-width="1"/>
    <text x="324" y="38" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700"
          letter-spacing="2" fill="#94a3b8">LEVEL</text>
    <text x="324" y="78" font-family="JetBrains Mono, monospace" font-size="36" font-weight="700"
          fill="#c4b5fd">${lvlStr}</text>

    ${streak ? `<rect x="500" y="0" width="220" height="96" rx="20" ry="20"
          fill="rgba(251,191,36,0.08)" stroke="rgba(251,191,36,0.35)" stroke-width="1"/>
    <text x="524" y="38" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="700"
          letter-spacing="2" fill="#94a3b8">STREAK</text>
    ${streakIcon}
    <text x="560" y="78" font-family="JetBrains Mono, monospace" font-size="36" font-weight="700"
          fill="url(#gold)">${svgEscape(streakNum)}</text>` : ""}
  </g>

  <!-- Footer -->
  <text x="72" y="595" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="500"
        fill="#64748b">${safeTag}</text>
</svg>`;
}

// Render the SVG string onto a canvas and return a PNG blob (+ data URL).
function svgToPng(svgString, width = 1200, height = 630) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("PNG encode failed"));
          const dataUrl = canvas.toDataURL("image/png");
          resolve({ blob, dataUrl });
        }, "image/png", 0.95);
      } catch (err) {
        URL.revokeObjectURL(url); reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG rasterise failed")); };
    img.src = url;
  });
}

function ShareCardModal({ achievement, state, onClose, onDismiss }) {
  const [preview, setPreview] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  const [err, setErr] = React.useState("");
  const blobRef = React.useRef(null);

  const data = React.useMemo(() => ({
    icon: achievement.icon || "medal",
    kindLabel: achievement.kindLabel || "Achievement",
    title: achievement.title,
    subtitle: achievement.subtitle,
    xp: state.xp,
    level: levelFromXP(state.xp),
    streak: state.bestStreak,
    tagline: "BioStat Quest · biostat-quest.vercel.app",
  }), [achievement, state.xp, state.bestStreak]);

  React.useEffect(() => {
    let cancelled = false;
    const svg = buildShareCardSVG(data);
    svgToPng(svg).then(({ blob, dataUrl }) => {
      if (cancelled) return;
      blobRef.current = blob;
      setPreview(dataUrl);
    }).catch(e => { if (!cancelled) setErr(e.message || String(e)); });
    return () => { cancelled = true; };
  }, [data]);

  const fileName = `biostatquest-${(achievement.id || "achievement").replace(/[^a-z0-9_-]+/gi, "_")}.png`;

  const download = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const copyImage = async () => {
    setErr("");
    try {
      if (!navigator.clipboard || !window.ClipboardItem || !blobRef.current) {
        throw new Error("Image clipboard not supported in this browser");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobRef.current })]);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch (e) { setErr(e.message || "Copy failed"); }
  };

  const shareLink = () => {
    const text = `I just unlocked "${achievement.title}" on BioStat Quest — Lv ${levelFromXP(state.xp)} · ${state.xp} XP`;
    const url = "https://biostat-quest.vercel.app";
    if (navigator.share) {
      navigator.share({ title: "BioStat Quest", text, url }).catch(()=>{});
    } else {
      const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(tweet, "_blank", "noopener");
    }
  };

  const close = () => { if (onDismiss) onDismiss(achievement.id); onClose(); };

  return ReactDOM.createPortal((
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
         onClick={close}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-300 inline-flex items-center"><Ico name={achievement.icon || "medal"} size={24}/></span>
          <h3 className="text-xl font-extrabold text-white">Share your win</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Drop it in a group chat, tweet it, or save it for the thesis defence celebration.
        </p>

        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[1200/630] mb-4 flex items-center justify-center">
          {preview
            ? <img src={preview} alt="Share card preview" className="w-full h-full object-contain"/>
            : err
              ? <div className="text-xs text-red-400 p-4 text-center">{err}</div>
              : <div className="text-xs text-slate-500">Rendering…</div>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button onClick={download} disabled={!preview}
                  className="btn btn-primary py-2.5 rounded-lg text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2">
            <Ico name="download" size={14}/> Download PNG
          </button>
          <button onClick={copyImage} disabled={!preview}
                  className="btn btn-ghost py-2.5 rounded-lg text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {copied ? <><Ico name="check" size={14}/> Copied</> : <><Ico name="image" size={14}/> Copy image</>}
          </button>
          <button onClick={shareLink}
                  className="btn btn-ghost py-2.5 rounded-lg text-sm inline-flex items-center justify-center gap-2">
            <Ico name="link" size={14}/> Share link
          </button>
        </div>
        {err && !preview && (
          <div className="text-xs text-red-400 mt-2">{err}</div>
        )}
        <button onClick={close} className="w-full mt-4 text-xs text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>
    </div>
  ), document.body);
}

// Pick the most "impressive" new achievement to prompt the user to share.
// Priority: highest-level up > perfect run > first badge of this result.
function selectAchievementForSharing(result, newState, prevXp) {
  const pool = [];
  if (result && result.newBadges) {
    result.newBadges.forEach(b => pool.push({
      id: "badge:" + b.id, icon: b.icon, kindLabel: "Badge unlocked",
      title: b.name, subtitle: b.desc, rank: 2,
    }));
  }
  if (result) {
    const correct = result.answers.filter(a => a.correct).length;
    const score = Math.round((correct / result.answers.length) * 100);
    if (score === 100) {
      const c = CASES.find(x => x.id === result.caseId);
      pool.push({
        id: `perfect:${result.caseId}:${result.difficulty}:${Date.now()}`,
        icon: "hundred", kindLabel: "Flawless Victory",
        title: "Perfect run",
        subtitle: `${c ? c.title : "Case"} · ${DIFFICULTIES[result.difficulty].name}`,
        rank: 3,
      });
    }
  }
  const prevLvl = levelFromXP(prevXp || 0);
  const newLvl  = levelFromXP(newState.xp || 0);
  if (newLvl > prevLvl) {
    pool.push({
      id: `level:${newLvl}`, icon: "cap", kindLabel: "Level up",
      title: `Level ${newLvl}`,
      subtitle: newLvl >= 10 ? "Principal Investigator" : newLvl >= 6 ? "Fellow" : newLvl >= 3 ? "Resident" : "Intern",
      rank: newLvl >= 5 ? 4 : 1,
    });
  }
  if (!pool.length) return null;
  pool.sort((a, b) => b.rank - a.rank);
  // Suppress achievements the user already dismissed (e.g. a badge they chose not to share).
  const already = new Set(newState.sharedAchievements || []);
  return pool.find(a => !already.has(a.id)) || null;
}

// ============================================================
// PHASE 3 — STREAK-AT-RISK BANNER (in-app nudge, no email)
// Warns when >20h since last correct answer and a streak is alive.
// ============================================================
function StreakBanner({ state, onDismiss, onStartCase }) {
  const [dismissedAt, setDismissedAt] = React.useState(() => {
    try { return parseInt(localStorage.getItem("bq_streak_nudge_dismissed") || "0", 10); } catch { return 0; }
  });
  if (!state.currentStreak || state.currentStreak < 2) return null;
  const last = state.streakLastActiveMs || 0;
  if (!last) return null;
  const hours = (Date.now() - last) / 3600000;
  if (hours < 20) return null;                 // not at risk yet
  if (hours > 30) return null;                 // already broken; banner would be a lie
  if (Date.now() - dismissedAt < 6*3600000) return null;  // respect 6h dismissal
  const hoursLeft = Math.max(0, Math.round(30 - hours));
  const next = CASES.find(c => !state.completed.includes(c.id)) || CASES[0];
  const dismiss = () => {
    const now = Date.now();
    try { localStorage.setItem("bq_streak_nudge_dismissed", String(now)); } catch {}
    setDismissedAt(now);
    if (onDismiss) onDismiss();
  };
  return (
    <div className="card rounded-2xl p-4 sm:p-5 flex items-start sm:items-center justify-between gap-3 sm:gap-4 flex-wrap border border-amber-800/40"
         style={{background:"linear-gradient(90deg, rgba(251,191,36,0.10), rgba(239,68,68,0.04))"}}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="tag text-amber-300 inline-flex items-center gap-1.5"><Ico name="flame" size={12}/> Streak at risk</span>
          <span className="chip bg-amber-900/40 text-amber-200">{state.currentStreak}-in-a-row</span>
        </div>
        <div className="text-white font-semibold">
          Don't break your streak — ~{hoursLeft}h left to land another correct answer.
        </div>
        <div className="text-xs text-slate-400 mt-1">
          One case is enough. Your best streak so far is {state.bestStreak}.
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>onStartCase(next.id)} className="btn btn-primary px-5 py-2.5 rounded-xl">Save it →</button>
        <button onClick={dismiss} className="btn btn-ghost px-3 py-2.5 rounded-xl text-sm">Later</button>
      </div>
    </div>
  );
}

// ============================================================
// PHASE 3 — LEADERBOARD (live from Supabase when configured)
// Falls back to the simulated cohort when offline / not wired up.
// Surfaces a call-to-action to opt in with a display name.
// ============================================================
const SIMULATED_COHORT = [
  { name: "Dr. Fisher",       xp: 5400, level: 11, cases: 14, streak: 12 },
  { name: "A. Bradford-Hill", xp: 3600, level: 9,  cases: 13, streak: 9  },
  { name: "K. Pearson",       xp: 2600, level: 8,  cases: 11, streak: 7  },
  { name: "F. Nightingale",   xp: 1750, level: 6,  cases: 9,  streak: 5  },
  { name: "J. Neyman",        xp: 1250, level: 6,  cases: 8,  streak: 4  },
  { name: "B. Efron",         xp:  900, level: 5,  cases: 7,  streak: 3  },
  { name: "W. Student",       xp:  620, level: 4,  cases: 6,  streak: 3  },
  { name: "MedStudent42",     xp:  380, level: 3,  cases: 4,  streak: 2  },
  { name: "EpiPhD",           xp:  180, level: 2,  cases: 2,  streak: 1  },
];

function Leaderboard({ state, setState, onNav }) {
  const [rows, setRows] = React.useState(null);  // null = loading, array = result, false = failed/offline
  const [live, setLive] = React.useState(false);
  const [user, setUser] = React.useState(null);
  const [savingName, setSavingName] = React.useState(false);
  const [nameInput, setNameInput] = React.useState(state.display_name || "");
  const [editing, setEditing] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Refetch when refreshKey changes — bumped on manual refresh and after
  // successful display-name/opt-in saves so the board never looks stale.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!(window.BQAuth && window.BQAuth.enabled && window.BQAuth.fetchLeaderboard)) {
          if (!cancelled) { setRows(false); setLive(false); }
          return;
        }
        const data = await window.BQAuth.fetchLeaderboard(50);
        if (cancelled) return;
        if (Array.isArray(data)) { setRows(data); setLive(true); }
        else { setRows(false); setLive(false); }
      } catch (e) {
        if (!cancelled) { setRows(false); setLive(false); }
      }
    }
    load();
    const unsub = window.BQAuth ? window.BQAuth.onAuthChange(u => !cancelled && setUser(u)) : () => {};
    return () => { cancelled = true; try { unsub && unsub(); } catch(e){} };
  }, [refreshKey]);

  // Re-fetch whenever the user's opt-in state changes — gives the server a
  // moment to propagate the updated row, then pulls it fresh.
  React.useEffect(() => {
    if (!state.showOnLeaderboard || !state.display_name) return;
    const t = setTimeout(() => setRefreshKey(k => k + 1), 1800);
    return () => clearTimeout(t);
  }, [state.showOnLeaderboard, state.display_name]);

  const meXp = state.xp || 0;
  const optedIn = !!(state.showOnLeaderboard && state.display_name);
  const isPublicallyVisible = optedIn && meXp > 0;

  // Build the displayed rows: merge live (or simulated) with "You" so the user always sees their position.
  const displayRows = React.useMemo(() => {
    const me = {
      name: state.display_name || "You",
      xp: meXp,
      level: levelFromXP(meXp),
      cases: state.completed.length,
      streak: state.currentStreak,
      isMe: true,
    };
    // Once Supabase has responded (even with zero rows), ALWAYS use the real data.
    // Only fall back to the simulated cohort when the fetch itself failed / Supabase isn't wired.
    const base = Array.isArray(rows)
      ? rows.map(r => ({
          name: r.name,
          xp: r.xp|0,
          // Level is derived from XP on the client so it always matches levelFromXP,
          // even if the view hasn't been migrated yet.
          level: levelFromXP(r.xp|0),
          cases: r.cases|0,
          streak: r.streak|0,
        }))
      : SIMULATED_COHORT.slice();
    // Ensure we appear only once if our public row is already in base (by name match when opted in)
    const serverHasMe = isPublicallyVisible && base.some(r => r.name === state.display_name);
    const merged = serverHasMe
      ? base.map(r => r.name === state.display_name ? { ...r, isMe: true } : r)
      : [...base, me];
    merged.sort((a,b) => b.xp - a.xp);
    return merged.slice(0, 100);
  }, [rows, meXp, state.display_name, state.showOnLeaderboard, state.completed.length, state.currentStreak, isPublicallyVisible]);

  // Rank is meaningful only when the user is actually comparable to others on
  // the same board. In live mode that means they're publicly visible (opted in
  // + XP > 0); otherwise they're only in the local-merge shim and any number
  // we show is fiction ("#1 with 0 XP"). Offline/simulated mode always shows
  // a rank — the whole cohort is fake anyway.
  const meIdx = displayRows.findIndex(r => r.isMe);
  const myRank = (live ? isPublicallyVisible : true) && meIdx >= 0 ? meIdx + 1 : 0;

  const saveName = () => {
    setSavingName(true);
    const name = (nameInput || "").trim().slice(0, 24);
    setState({ ...state, display_name: name, showOnLeaderboard: name.length > 0 ? state.showOnLeaderboard : false });
    setTimeout(() => setSavingName(false), 500);
  };
  const toggleOptIn = () => {
    if (!state.display_name) return;   // can't opt in without a name
    setState({ ...state, showOnLeaderboard: !state.showOnLeaderboard });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 fade-in space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-1 inline-flex items-center gap-2.5"><span className="text-amber-300"><Ico name="trophy" size={26}/></span> Leaderboard</h2>
          <p className="text-slate-400 text-sm">
            {!live ? (
              <>Supabase isn't wired up here — showing a simulated cohort of legendary statisticians.</>
            ) : Array.isArray(rows) && rows.length === 0 ? (
              isPublicallyVisible
                ? <>You're the first on the board — every case you complete widens your lead.</>
                : optedIn && meXp === 0
                ? <>You've opted in — earn your first XP and you'll appear here.</>
                : <>No one has climbed the board yet — play a case, earn XP, and claim #1.</>
            ) : (
              <>Top BioStat Quest players who opted in with a display name.</>
            )}
          </p>
        </div>
        <div className="chip bg-slate-800 text-slate-300">
          {live ? <><span className="text-emerald-400">●</span> Live</> : <><span className="text-slate-500">●</span> Offline</>}
        </div>
      </div>

      {/* Opt-in panel */}
      {live && (
        <div className="card rounded-2xl p-4 sm:p-5 border border-cyan-900/40">
          {!user ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-white">Sign in to appear on the leaderboard</div>
                <div className="text-xs text-slate-400 mt-1">Your progress will sync across devices automatically.</div>
              </div>
              <button onClick={()=>onNav && onNav("home")} className="btn btn-ghost px-4 py-2 rounded-lg text-sm">Go sign in →</button>
            </div>
          ) : (state.display_name && state.showOnLeaderboard && !editing) ? (
            // Already set up — compact summary with Edit affordance
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-slate-300">
                You're on the board as <span className="font-semibold text-white">⭐ {state.display_name}</span>
              </div>
              <button onClick={()=>setEditing(true)} className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">Edit</button>
            </div>
          ) : (
            // Setup flow — or explicit edit
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Display name</div>
                <div className="flex gap-2 flex-wrap">
                  <input type="text" value={nameInput} maxLength={24}
                         onChange={e=>setNameInput(e.target.value)}
                         placeholder="e.g. epi-owl"
                         className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"/>
                  <button onClick={saveName}
                          disabled={savingName || (nameInput||"").trim() === (state.display_name||"")}
                          className="btn btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                    {savingName ? (<span className="inline-flex items-center gap-1.5">Saved <Ico name="check" size={14}/></span>) : "Save"}
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-1">Up to 24 characters. Visible on the public leaderboard only when the toggle below is on.</div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input type="checkbox"
                       checked={!!state.showOnLeaderboard}
                       disabled={!state.display_name}
                       onChange={toggleOptIn}
                       className="mt-1"/>
                <span className="text-sm text-slate-200">
                  Show me on the public leaderboard
                  {!state.display_name && <span className="text-xs text-slate-500 block">Set a display name first to enable this.</span>}
                </span>
              </label>
              {state.display_name && state.showOnLeaderboard && editing && (
                <div className="pt-1">
                  <button onClick={()=>setEditing(false)} className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">Done</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* The board */}
      <div className="card rounded-2xl overflow-hidden">
        <div className="hscroll">
          <table className="w-full text-left min-w-[480px]">
            <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3 sm:p-4">#</th>
                <th className="p-3 sm:p-4">Player</th>
                <th className="p-3 sm:p-4">Level</th>
                <th className="p-3 sm:p-4 hidden sm:table-cell">Cases</th>
                <th className="p-3 sm:p-4 hidden sm:table-cell">Streak</th>
                <th className="p-3 sm:p-4 text-right">XP</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan="6" className="p-6 text-center text-slate-500">Loading…</td></tr>
              ) : displayRows.map((p,i)=>(
                <tr key={`${p.name}-${p.xp}-${i}${p.isMe?"-me":""}`} className={`border-t border-slate-800/50 ${p.isMe?"bg-purple-900/20":""}`}>
                  <td className="p-3 sm:p-4 font-bold text-slate-500">
                    {i<3 ? (<span className={i===0?"text-amber-300":i===1?"text-slate-300":"text-orange-400"}><Ico name={i===0?"medal-1":i===1?"medal-2":"medal-3"} size={20}/></span>) : (i+1)}
                  </td>
                  <td className="p-3 sm:p-4 font-semibold text-white whitespace-nowrap">{p.isMe ? <span className="inline-flex items-center gap-1.5 text-amber-300"><Ico name="star" size={12}/><span className="text-white">{p.name}</span></span> : p.name}</td>
                  <td className="p-3 sm:p-4 text-slate-300">Lv {p.level}</td>
                  <td className="p-3 sm:p-4 text-slate-300 hidden sm:table-cell">{p.cases}</td>
                  <td className="p-3 sm:p-4 text-slate-300 hidden sm:table-cell">{p.streak ? (<span className="inline-flex items-center gap-1.5 text-orange-300"><Ico name="flame" size={12}/> {p.streak}</span>) : "—"}</td>
                  <td className="p-3 sm:p-4 text-right gold-text font-extrabold text-base sm:text-lg">{fmtNumber(p.xp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-slate-500 text-center">
        {myRank > 0 ? (
          <>
            Your rank: <span className="text-cyan-300 font-semibold">#{myRank}</span>
            {!live && <span className="text-slate-600"> · among a simulated cohort</span>}
          </>
        ) : live && optedIn && meXp === 0 ? (
          <>Rank: <span className="text-slate-400">—</span> · complete your first case to appear publicly</>
        ) : live && !optedIn ? (
          <>Rank: <span className="text-slate-400">—</span> · opt in above to appear on the public board</>
        ) : null}
      </div>
    </div>
  );
}

function Stats({ state }) {
  const totalQ = CASES.reduce((s,c)=>s+c.bank.length, 0);
  const seen = Object.values(state.seenQuestions).reduce((s,a)=>s+a.length, 0);
  const acc = state.stats.totalAnswered>0 ? Math.round(state.stats.totalCorrect/state.stats.totalAnswered*100) : 0;
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 fade-in space-y-4 sm:space-y-6">
      <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Your Stats</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Answered" value={state.stats.totalAnswered}/>
        <StatCard label="Accuracy" value={`${acc}%`} gradient/>
        <StatCard label="Questions Seen" value={`${seen}/${totalQ}`}/>
        <StatCard label="Best Streak" value={state.bestStreak}/>
        <StatCard label="Perfect Runs" value={state.perfectRuns}/>
        <StatCard label="Hard-mode Wins" value={state.hardWins}/>
        <StatCard label="Expert Wins" value={state.piWins}/>
        <StatCard label="Speed Runs" value={state.speedRuns}/>
      </div>
      <div className="card rounded-2xl p-5 sm:p-6">
        <h3 className="font-bold text-white mb-4">Accuracy by Branch</h3>
        <div className="space-y-3">
          {Object.entries(BRANCHES).map(([k,b])=>{
            const d = state.stats.byBranch[k] || {answered:0, correct:0};
            const a = d.answered>0 ? Math.round(d.correct/d.answered*100) : 0;
            return (
              <div key={k}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300 inline-flex items-center gap-2">
                    <BranchGlyph k={k} className="w-4 h-4"/>
                    {b.name}
                  </span>
                  <span className="mono text-slate-400">{d.correct}/{d.answered} · {a}%</span>
                </div>
                <div className="bar"><div style={{width: a+"%", background: `linear-gradient(90deg, ${b.color}, ${b.color}aa)`}}></div></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// GLOSSARY_HASH_PREFIX moved to src/lib/glossaryHash.ts in Phase 6 round 2
// so the App's view resolver can parse the hash without pulling in the
// Glossary view chunk.

// Letters shown in the mobile A–Z ribbon (with "#" for non-alphabetic heads).
const GM_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","#"];

function groupGlossaryByLetter(entries) {
  const out = {};
  for (const e of entries) {
    const first = (e.term?.[0] || "#").toUpperCase();
    const key = /[A-Z]/.test(first) ? first : "#";
    if (!out[key]) out[key] = [];
    out[key].push(e);
  }
  // Sort each bucket by term so the list reads cleanly; desktop ordering still wins
  // in the filtered array (relevance → featured → kind), but alphabetical is the
  // right primary sort inside a letter section.
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => a.term.localeCompare(b.term));
  }
  return out;
}

// ============================================================
// GlossaryMobile — the <=767px experience. Desktop path in Glossary() is
// never entered when this renders (isMobileGlossary early-returns there).
// Two views: list (with sticky search + A–Z ribbon) and detail (with prev/next).
// No bottom-sheet modal for primary browsing; filters live behind one tap.
// ============================================================
function GlossaryMobile(ctx) {
  const {
    search, setSearch,
    filtered, suggestions,
    selected, selectedId, setSelectedId,
    kind, branch,
    relatedTerms, relatedMethods, relatedCases,
    aliasPreview,
    hasActiveFilters, resetFilters,
    onStartCase,
    searchFilterControls,
  } = ctx;

  const [view, setView] = React.useState(selectedId && selected ? "detail" : "list");
  const [showFilters, setShowFilters] = React.useState(false);
  const [showExtras, setShowExtras] = React.useState(false);

  const activeFilterCount = (kind !== "all" ? 1 : 0) + (branch !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);
  const groups = React.useMemo(() => groupGlossaryByLetter(filtered), [filtered]);
  const lettersInView = React.useMemo(() => new Set(Object.keys(groups)), [groups]);

  // Prev / next in the currently-filtered list — the axis the user is browsing.
  const idx = filtered.findIndex((e) => e.id === selectedId);
  const prevEntry = idx > 0 ? filtered[idx - 1] : null;
  const nextEntry = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;

  function openDetail(entryId) {
    setSelectedId(entryId);
    setView("detail");
    setShowExtras(false);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }
  function gotoEntry(entryId) {
    setSelectedId(entryId);
    setShowExtras(false);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }
  function backToList() {
    setView("list");
  }
  function scrollToLetter(letter) {
    if (typeof document === "undefined") return;
    const el = document.getElementById(`gm-letter-${letter}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // If filters change and the selected entry is no longer visible, fall back to list.
  React.useEffect(() => {
    if (view === "detail" && !selected) setView("list");
  }, [view, selected]);

  // ─────────────────────────────────────────── DETAIL ───────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <div className="fade-in">
        {/* Sticky top: back + position + prev/next */}
        <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60 px-3 py-2 flex items-center gap-1">
          <button
            onClick={backToList}
            className="px-3 py-2 rounded-lg text-sm text-slate-200 active:bg-slate-800/40 flex items-center gap-1.5 -ml-1"
            aria-label="Back to glossary list"
          >
            <span className="text-lg leading-none">←</span>
            <span className="font-medium">Back</span>
          </button>
          <div className="flex-1 min-w-0 text-center text-[11px] text-slate-500">
            {idx >= 0 ? `${idx + 1} of ${filtered.length}` : ""}
          </div>
          <button
            onClick={() => prevEntry && gotoEntry(prevEntry.id)}
            disabled={!prevEntry}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-200 disabled:text-slate-700 disabled:opacity-50 active:bg-slate-800/40 text-xl"
            aria-label="Previous term"
          >‹</button>
          <button
            onClick={() => nextEntry && gotoEntry(nextEntry.id)}
            disabled={!nextEntry}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-200 disabled:text-slate-700 disabled:opacity-50 active:bg-slate-800/40 text-xl"
            aria-label="Next term"
          >›</button>
        </div>

        <div className="px-4 py-5 space-y-6" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}>
          {/* Title + meta */}
          <div>
            <h1 className="text-2xl font-extrabold text-white leading-tight mb-2 tracking-tight">{selected.term}</h1>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
              <BranchGlyph k={selected.branch} className="w-3.5 h-3.5" />
              <span>{BRANCHES[selected.branch]?.name}</span>
              <span className="text-slate-700">·</span>
              <span>{GLOSSARY_KIND_META[selected.kind]?.label || selected.kind}</span>
              {selected.questionCount ? (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="mono text-cyan-300/80">{selected.questionCount} questions</span>
                </>
              ) : null}
            </div>
            {aliasPreview.length > 0 && (
              <div className="text-xs text-slate-500 mt-2 leading-relaxed">
                Also: <span className="text-slate-300">{aliasPreview.join(", ")}</span>
              </div>
            )}
          </div>

          {/* One-line definition as lede */}
          <p className="text-[16px] text-slate-100 leading-relaxed font-medium">{selected.oneLine}</p>

          {/* Sectioned body (was four separate cards on desktop) */}
          <div className="space-y-5">
            {selected.plainEnglish && (
              <section>
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold mb-2">Plain English</div>
                <p className="text-[15px] text-slate-300 leading-relaxed">{selected.plainEnglish}</p>
              </section>
            )}
            {selected.whenToUse && (
              <section>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">When to use</div>
                <p className="text-[15px] text-slate-300 leading-relaxed">{selected.whenToUse}</p>
              </section>
            )}
            {selected.commonMistake && (
              <section>
                <div className="text-[10px] uppercase tracking-[0.18em] text-amber-400 font-bold mb-2">Common mistake</div>
                <p className="text-[15px] text-slate-300 leading-relaxed">{selected.commonMistake}</p>
              </section>
            )}
            {selected.example && (
              <section>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">Example</div>
                <p className="text-[15px] text-slate-300 leading-relaxed">{selected.example}</p>
              </section>
            )}
          </div>

          {/* Collapsed extras — hidden by default to keep the page short */}
          {(selected.assumptions?.length || selected.pitfalls?.length || selected.reading?.length) ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
              <button
                onClick={() => setShowExtras((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-sm text-slate-200 active:bg-slate-800/30"
                aria-expanded={showExtras}
              >
                <span className="font-medium">Assumptions, pitfalls, reading</span>
                <span className="text-slate-500 text-xs">{showExtras ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showExtras && (
                <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-800/60">
                  {selected.assumptions?.length ? (
                    <section>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">Key assumptions</div>
                      <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-slate-300">
                        {selected.assumptions.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </section>
                  ) : null}
                  {selected.pitfalls?.length ? (
                    <section>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-amber-400 font-bold mb-2">Common pitfalls</div>
                      <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-slate-300">
                        {selected.pitfalls.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </section>
                  ) : null}
                  {selected.reading?.length ? (
                    <section>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">Further reading</div>
                      <ul className="list-disc pl-5 space-y-1.5 text-[14px] text-slate-400">
                        {selected.reading.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {/* Related terms + methods as chips */}
          {(relatedTerms.length > 0 || relatedMethods.length > 0) && (
            <section>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 font-bold mb-2">Related</div>
              <div className="flex flex-wrap gap-1.5">
                {relatedTerms.map((entry) => (
                  <button key={entry.id}
                    onClick={() => gotoEntry(entry.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/80 text-slate-200 text-[13px] font-medium active:bg-slate-700"
                  >{entry.term}</button>
                ))}
                {relatedMethods.map((entry) => (
                  <button key={entry.id}
                    onClick={() => gotoEntry(entry.id)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-200 text-[13px] font-medium active:bg-cyan-500/20"
                  >{entry.term}</button>
                ))}
              </div>
            </section>
          )}

          {/* Related cases — compact rows */}
          {relatedCases.length > 0 && (
            <section>
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold mb-2">Practice in context</div>
              <div className="space-y-2">
                {relatedCases.map(({ caseObj, reason, done }) => (
                  <div key={caseObj.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1">
                      <BranchGlyph k={caseObj.branch} className="w-3 h-3" />
                      <span>{BRANCHES[caseObj.branch].name}</span>
                      <span className="text-slate-700">·</span>
                      <span>{caseObj.qPerRun} Q</span>
                    </div>
                    <div className="font-semibold text-white text-[15px] leading-snug mb-1">{caseObj.title}</div>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-snug">{caseObj.story}</p>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="text-[11px] text-slate-500 truncate">{reason}</span>
                      <button
                        onClick={() => onStartCase && onStartCase(caseObj.id)}
                        className="btn btn-primary px-3 py-1.5 rounded-lg text-xs shrink-0"
                      >
                        {done ? "Replay" : "Start"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── LIST ───────────────────────────────────────────
  return (
    <div className="fade-in">
      {/* Compact page header (non-sticky, scrolls away) */}
      <div className="px-4 pt-4 pb-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold mb-1">Knowledge base</div>
        <h2 className="text-xl font-extrabold text-white">Glossary</h2>
        <p className="text-xs text-slate-500 mt-0.5">{GLOSSARY.length} entries · tap a letter or search</p>
      </div>

      {/* Sticky: search + filter button (the full primary control surface) */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60 px-4 py-2.5">
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Search p-value, cox, ROC, sensitivity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            className="flex-1 min-w-0 bg-slate-900/70 text-white rounded-xl px-3.5 py-2.5 border border-slate-700 focus:border-cyan-500 outline-none text-sm"
          />
          <button
            onClick={() => setShowFilters(true)}
            className={`shrink-0 px-3.5 py-2.5 rounded-xl border text-sm font-medium transition inline-flex items-center gap-1.5 ${
              activeFilterCount > 0
                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-100"
                : "bg-slate-900/70 border-slate-700 text-slate-300"
            }`}
          >
            <span>Filter</span>
            {activeFilterCount > 0 && <span className="font-bold">{activeFilterCount}</span>}
          </button>
        </div>
        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-3 mt-2 text-[11px] text-slate-500">
            <div className="truncate">
              {filtered.length} {filtered.length === 1 ? "term" : "terms"} matching
            </div>
            <button onClick={resetFilters} className="text-cyan-300 active:text-cyan-200 font-medium shrink-0">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Sticky: A–Z letter ribbon */}
      {filtered.length > 0 && (
        <div className="sticky top-[66px] z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/60">
          <div className="hscroll px-4 py-2">
            <div className="flex gap-0.5 min-w-max">
              {GM_LETTERS.map((letter) => {
                const active = lettersInView.has(letter);
                return (
                  <button
                    key={letter}
                    onClick={() => active && scrollToLetter(letter)}
                    disabled={!active}
                    className={`w-7 h-7 rounded-md text-xs font-semibold shrink-0 flex items-center justify-center transition ${
                      active ? "text-cyan-300 active:bg-cyan-500/20" : "text-slate-700"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Body: empty state or letter-grouped list */}
      {filtered.length === 0 ? (
        <div className="px-4 py-8">
          <div className="rounded-xl border border-dashed border-slate-700 p-5 space-y-3">
            <div className="text-sm text-slate-300">No glossary entries match.</div>
            <div className="text-xs text-slate-500">
              Try a synonym like <span className="text-slate-200">false positive</span> or <span className="text-slate-200">cox</span>.
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {suggestions.map((entry) => (
                  <button key={entry.id}
                    onClick={() => { setSearch(entry.term); openDetail(entry.id); }}
                    className="px-3 py-2 rounded-lg bg-slate-800/80 text-slate-200 text-sm font-medium active:bg-slate-700"
                  >
                    {entry.term}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}>
          {GM_LETTERS.filter((l) => groups[l]).map((letter) => (
            <div key={letter} id={`gm-letter-${letter}`} className="scroll-mt-[112px]">
              <div className="sticky top-[108px] z-10 bg-slate-950/90 backdrop-blur px-4 py-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold border-b border-slate-800/40">
                {letter}
              </div>
              <div>
                {groups[letter].map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => openDetail(entry.id)}
                    className="w-full text-left px-4 py-3.5 flex items-start gap-3 border-b border-slate-800/40 active:bg-slate-800/30 transition"
                  >
                    <BranchGlyph k={entry.branch} className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white text-[15px] leading-snug">{entry.term}</div>
                      <div className="text-xs text-slate-400 line-clamp-2 mt-0.5 leading-snug">{entry.oneLine}</div>
                    </div>
                    <span className="text-slate-600 text-base mt-0.5 leading-none">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Secondary: filter sheet on demand (reuses the shared searchFilterControls JSX) */}
      {showFilters && (
        <GlossaryMobileSheet
          title="Search & filter"
          subtitle={`${filtered.length} ${filtered.length === 1 ? "term" : "terms"} in view`}
          onClose={() => setShowFilters(false)}
        >
          {searchFilterControls}
          <div className="mt-5">
            <button onClick={() => setShowFilters(false)} className="btn btn-primary w-full py-3 rounded-xl text-sm">
              Done
            </button>
          </div>
        </GlossaryMobileSheet>
      )}
    </div>
  );
}

function GlossaryMobileSheet({ title, subtitle, onClose, children }) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return ReactDOM.createPortal((
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 safe-pad-top"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-slate-950 border border-slate-700 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto fade-in"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-5 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-bold text-white">{title}</div>
              {subtitle ? <p className="text-sm text-slate-400 mt-1">{subtitle}</p> : null}
            </div>
            <button onClick={onClose} className="btn btn-ghost px-3 py-2 rounded-lg text-sm shrink-0">
              Close
            </button>
          </div>
        </div>
        <div className="px-5 sm:px-6 py-5 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  ), document.body);
}

function compactGlossaryText(value) {
  return normalizeGlossaryText(value).replace(/\s+/g, "");
}

// glossaryHashForId / parseGlossaryHash moved to src/lib/glossaryHash.ts
// in Phase 6 round 2.

function levenshteinDistance(a, b) {
  const aa = String(a || "");
  const bb = String(b || "");
  const rows = Array.from({ length: aa.length + 1 }, () => Array(bb.length + 1).fill(0));
  for (let i = 0; i <= aa.length; i++) rows[i][0] = i;
  for (let j = 0; j <= bb.length; j++) rows[0][j] = j;
  for (let i = 1; i <= aa.length; i++) {
    for (let j = 1; j <= bb.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (aa[i - 1] === bb[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[aa.length][bb.length];
}

function fuzzyGlossaryScore(query, candidate, weight = 40) {
  if (!query || !candidate) return 0;
  const q = compactGlossaryText(query);
  const c = compactGlossaryText(candidate);
  if (!q || !c) return 0;
  if (c.includes(q)) return weight + Math.max(0, 14 - (c.indexOf(q) * 2));
  const distance = levenshteinDistance(q, c.slice(0, Math.max(q.length, Math.min(c.length, q.length + 2))));
  if (distance <= 1) return weight + 22;
  if (distance === 2 && q.length >= 5) return weight + 10;
  let qi = 0;
  for (const ch of c) if (q[qi] === ch) qi++;
  if (qi === q.length && q.length >= 3) return weight - 4;
  return 0;
}

function glossarySearchScore(entry, query) {
  if (!query) {
    return (entry.featured ? 1000 : 0) + ({ concept: 300, measure: 250, design: 220, method: 180 }[entry.kind] || 0);
  }
  const aliases = entry.aliases || [];
  const fields = [
    { text: normalizeGlossaryText(entry.term), weight: 120 },
    ...(aliases.map((alias) => ({ text: normalizeGlossaryText(alias), weight: 100 }))),
    { text: normalizeGlossaryText(entry.oneLine), weight: 44 },
    { text: normalizeGlossaryText(entry.plainEnglish), weight: 32 },
    { text: normalizeGlossaryText(entry.whenToUse), weight: 24 },
    { text: normalizeGlossaryText(entry.commonMistake), weight: 18 },
  ];
  const tokens = query.split(" ").filter(Boolean);
  let score = 0;
  for (const field of fields) {
    if (!field.text) continue;
    if (field.text === query) score += field.weight + 90;
    else if (field.text.startsWith(query)) score += field.weight + 45;
    else if (field.text.includes(query)) score += field.weight;
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (field.text.includes(token)) score += Math.max(6, Math.round(field.weight / 8));
    }
  }
  score += fuzzyGlossaryScore(query, entry.term, 54);
  aliases.forEach((alias) => { score += fuzzyGlossaryScore(query, alias, 42); });
  return score;
}

function Glossary({ state, onStartCase, onOpenBranch, request }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [branch, setBranch] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const browsePanelRef = useRef(null);
  const detailPanelRef = useRef(null);
  const [isStackedGlossary, setIsStackedGlossary] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(max-width: 1279px)").matches;
  });
  const [isMobileGlossary, setIsMobileGlossary] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [mobilePanel, setMobilePanel] = useState("");
  const query = normalizeGlossaryText(search);
  const hasActiveFilters = !!search.trim() || kind !== "all" || branch !== "all";

  const entriesInCurrentScope = useMemo(() => {
    return GLOSSARY.filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false;
      if (branch !== "all" && entry.branch !== branch) return false;
      return true;
    });
  }, [branch, kind]);

  const filtered = useMemo(() => {
    return entriesInCurrentScope
      .map((entry) => ({ entry, score: glossarySearchScore(entry, query) }))
      .filter(({ entry, score }) => {
        if (query && score <= 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (query && b.score !== a.score) return b.score - a.score;
        if (!!b.entry.featured !== !!a.entry.featured) return Number(b.entry.featured) - Number(a.entry.featured);
        if (a.entry.kind !== b.entry.kind) return (GLOSSARY_KIND_META[a.entry.kind]?.label || "").localeCompare(GLOSSARY_KIND_META[b.entry.kind]?.label || "");
        return a.entry.term.localeCompare(b.entry.term);
      })
      .map((x) => x.entry);
  }, [entriesInCurrentScope, query]);

  const suggestions = useMemo(() => {
    if (!query || filtered.length > 0) return [];
    return entriesInCurrentScope
      .map((entry) => ({ entry, score: glossarySearchScore(entry, query) + fuzzyGlossaryScore(query, entry.term, 60) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.entry);
  }, [entriesInCurrentScope, filtered.length, query]);

  const selected = filtered.find((entry) => entry.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!selectedId || !filtered.some((entry) => entry.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!request) return;
    if (request.query !== undefined) setSearch(request.query || "");
    if (request.kind) setKind(request.kind);
    if (request.branch) setBranch(request.branch);
    if (request.selectedId && GLOSSARY_BY_ID[request.selectedId]) setSelectedId(request.selectedId);
  }, [request]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selected?.id) {
      const nextHash = glossaryHashForId(selected.id);
      if (window.location.hash !== nextHash) window.history.replaceState(null, "", nextHash);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1279px)");
    const sync = () => setIsStackedGlossary(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobileGlossary(media.matches);
    sync();
    if (media.addEventListener) {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!isMobileGlossary && mobilePanel) setMobilePanel("");
  }, [isMobileGlossary, mobilePanel]);

  const branchStats = selected?.branch ? state.stats?.byBranch?.[selected.branch] : null;
  const branchAccuracy = branchStats?.answered ? Math.round((branchStats.correct / branchStats.answered) * 100) : null;
  const mastery = selected?.methodId ? getMethodMastery(selected.methodId, state.srs || {}) : null;
  const relatedTerms = (selected?.relatedTerms || []).map((id) => GLOSSARY_BY_ID[id]).filter(Boolean);
  const relatedMethods = (selected?.relatedMethods || []).map((id) => GLOSSARY_BY_ID[`method:${id}`]).filter(Boolean);
  const aliasPreview = (selected?.aliases || []).filter((alias) => normalizeGlossaryText(alias) !== normalizeGlossaryText(selected.term)).slice(0, 4);
  const activeKindLabel = kind === "all" ? "All types" : (GLOSSARY_KIND_META[kind]?.label || kind);
  const activeBranchLabel = branch === "all" ? "All branches" : (BRANCHES[branch]?.name || branch);
  const countSummary = hasActiveFilters
    ? `${filtered.length} ${filtered.length === 1 ? "term" : "terms"} in view`
    : `${GLOSSARY.length} entries across ${Object.keys(BRANCHES).length} branches`;
  const trimmedSearchLabel = search.trim().length > 28 ? `${search.trim().slice(0, 28)}…` : search.trim();
  const mobileSummary = [
    query ? `Search: ${trimmedSearchLabel}` : null,
    kind !== "all" ? activeKindLabel : null,
    branch !== "all" ? activeBranchLabel : null,
  ].filter(Boolean).join(" · ") || "All terms";
  const mobileBrowseLabel = filtered.length > 0 ? `Browse ${filtered.length} ${filtered.length === 1 ? "term" : "terms"}` : "Browse terms";

  const relatedCases = useMemo(() => {
    if (!selected) return [];
    const fallbackIds = CASES.filter((c) => c.branch === selected.branch).slice(0, 3).map((c) => c.id);
    const ids = (selected.relatedCaseIds && selected.relatedCaseIds.length ? selected.relatedCaseIds : fallbackIds).slice(0, 3);
    return ids
      .map((caseId) => {
        const caseObj = CASES.find((c) => c.id === caseId);
        if (!caseObj) return null;
        const methodMatches = selected.methodId ? caseObj.bank.filter((q) => q.method === selected.methodId).length : 0;
        const best = state.caseScores?.[caseObj.id];
        let reason = methodMatches > 0 ? `${methodMatches} linked question${methodMatches === 1 ? "" : "s"}` : `${BRANCHES[caseObj.branch].name} case`;
        if (best !== undefined) reason += ` · best ${best}%`;
        return {
          caseObj,
          reason,
          done: state.completed.includes(caseObj.id),
        };
      })
      .filter(Boolean);
  }, [selected, state.caseScores, state.completed]);

  const scrollToPanel = (ref) => {
    if (typeof window === "undefined" || !ref?.current) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const selectGlossaryEntry = (entryId, options = {}) => {
    if (!entryId || !GLOSSARY_BY_ID[entryId]) return;
    setSelectedId(entryId);
    if (options.searchTerm !== undefined) setSearch(options.searchTerm);
    if (isMobileGlossary) setMobilePanel("");
    if (isStackedGlossary && options.revealDetail !== false) {
      scrollToPanel(detailPanelRef);
    }
  };

  const jumpToBrowseTerms = () => {
    if (isMobileGlossary) {
      setMobilePanel("browse");
      return;
    }
    if (isStackedGlossary) scrollToPanel(browsePanelRef);
  };

  const resetFilters = () => {
    setSearch("");
    setKind("all");
    setBranch("all");
  };

  const searchFilterControls = (
    <div className="space-y-5">
      <div className="space-y-3">
        <input
          type="search"
          placeholder="Search p-value, confounding, ANOVA, Cox, sensitivity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full bg-slate-900/60 text-white rounded-xl px-4 py-3 border border-slate-700 focus:border-cyan-500 outline-none"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
          <div>{countSummary}</div>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="text-slate-400 hover:text-slate-200 transition">
              Reset filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold px-0.5">Browse by type</div>
          <div className="relative">
            <div className="hscroll -mx-5 px-5 sm:mx-0 sm:px-0">
              <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
                {Object.entries(GLOSSARY_KIND_META).map(([key, meta]) => (
                  <button
                    key={key}
                    onClick={() => setKind(key)}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition border whitespace-nowrap ${
                      kind === key
                        ? "bg-cyan-500/14 border-cyan-400/45 text-cyan-100"
                        : "bg-slate-900/40 border-slate-800/80 text-slate-300 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:hidden pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-slate-950 to-transparent rounded-l-xl" />
            <div className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-950 to-transparent rounded-r-xl" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold px-0.5">Filter by branch</div>
          <div className="relative">
            <div className="hscroll -mx-5 px-5 sm:mx-0 sm:px-0">
              <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
                <button
                  onClick={() => setBranch("all")}
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition border whitespace-nowrap ${
                    branch === "all"
                      ? "bg-slate-800 border-slate-500 text-white"
                      : "bg-transparent border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  All branches
                </button>
                {Object.entries(BRANCHES).map(([branchId, branchMeta]) => (
                  <button
                    key={branchId}
                    onClick={() => setBranch(branchId)}
                    className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition border inline-flex items-center gap-2 whitespace-nowrap ${
                      branch === branchId
                        ? "bg-slate-800 border-slate-500 text-white"
                        : "bg-transparent border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <BranchGlyph k={branchId} className="w-3.5 h-3.5" />
                    <span>{branchMeta.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:hidden pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-slate-950 to-transparent rounded-l-xl" />
            <div className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-slate-950 to-transparent rounded-r-xl" />
          </div>
        </div>
      </div>

      {query && filtered.length === 0 && suggestions.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 p-4 space-y-3">
          <div className="text-sm text-slate-300">No glossary entries match that search.</div>
          <div className="text-sm text-slate-500">Try one of these nearby terms instead.</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((entry) => (
              <button
                key={entry.id}
                onClick={() => selectGlossaryEntry(entry.id, { searchTerm: entry.term, revealDetail: !isMobileGlossary })}
                className="px-3 py-2 rounded-lg bg-slate-800/80 text-slate-200 text-sm font-medium hover:bg-slate-700 transition"
              >
                {entry.term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const browseList = filtered.length === 0 ? (
    <div className="rounded-xl border border-dashed border-slate-700 p-5 space-y-3">
      <div className="text-sm text-slate-300">No glossary entries match that search.</div>
      <div className="text-sm text-slate-500">
        Try a synonym like <span className="text-slate-200">false positive</span>, <span className="text-slate-200">cox</span>, or <span className="text-slate-200">ppv</span>.
      </div>
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold">Suggested terms</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((entry) => (
              <button
                key={entry.id}
                onClick={() => selectGlossaryEntry(entry.id, { searchTerm: entry.term })}
                className="px-3 py-2 rounded-lg bg-slate-800/80 text-slate-200 text-sm font-medium hover:bg-slate-700 transition"
              >
                {entry.term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="space-y-2 xl:max-h-[70vh] xl:overflow-y-auto xl:scrollbar xl:pr-1">
      {filtered.map((entry) => {
        const active = entry.id === selectedId;
        return (
          <button
            key={entry.id}
            onClick={() => selectGlossaryEntry(entry.id)}
            className={`w-full text-left rounded-xl p-3 border transition ${
              active
                ? "bg-cyan-500/10 border-cyan-500/35"
                : "bg-slate-900/30 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5"><BranchGlyph k={entry.branch} className="w-4 h-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white text-sm sm:text-base leading-snug">{entry.term}</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mt-1">
                  {GLOSSARY_KIND_META[entry.kind]?.label || entry.kind} · {BRANCHES[entry.branch]?.name}
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 line-clamp-2">{entry.oneLine}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  // Mobile (≤767px) gets a purpose-built view: sticky search, A–Z ribbon,
  // letter-grouped list, inline detail with prev/next. Desktop path below
  // is entirely untouched and only runs when isMobileGlossary is false.
  if (isMobileGlossary) {
    return (
      <GlossaryMobile
        search={search}
        setSearch={setSearch}
        kind={kind}
        branch={branch}
        filtered={filtered}
        suggestions={suggestions}
        selected={selected}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        relatedTerms={relatedTerms}
        relatedMethods={relatedMethods}
        relatedCases={relatedCases}
        aliasPreview={aliasPreview}
        hasActiveFilters={hasActiveFilters}
        resetFilters={resetFilters}
        onStartCase={onStartCase}
        searchFilterControls={searchFilterControls}
      />
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 fade-in space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 mb-3">
              <span className="inline-flex items-center justify-center w-4 h-4">{NAV_ICON.glossary}</span>
              <span>Knowledge Base</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Glossary</h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Definitions are only the start. Search terms, jump to related methods, and go straight into a case that uses the idea in context.
            </p>
          </div>
          {!isMobileGlossary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              <div className="card rounded-xl p-3 text-center">
                <div className="text-xl sm:text-2xl font-extrabold stat-number">{GLOSSARY.length}</div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mt-1">Entries</div>
              </div>
              <div className="card rounded-xl p-3 text-center">
                <div className="text-xl sm:text-2xl font-extrabold text-white">{GLOSSARY.filter((x) => x.kind === "method").length}</div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mt-1">Methods</div>
              </div>
              <div className="card rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                <div className="text-xl sm:text-2xl font-extrabold text-white">{Object.keys(BRANCHES).length}</div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 mt-1">Branches</div>
              </div>
            </div>
          )}
        </div>

        {isMobileGlossary ? (
          <div className="card rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMobilePanel("filters")} className="btn btn-ghost px-4 py-3 rounded-xl text-sm">
                Search & filter
              </button>
              <button onClick={() => setMobilePanel("browse")} className="btn btn-ghost px-4 py-3 rounded-xl text-sm">
                Browse terms
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
              <div className="min-w-0">{countSummary} · {mobileSummary}</div>
              {hasActiveFilters && (
                <button onClick={resetFilters} className="text-slate-400 hover:text-slate-200 transition shrink-0">
                  Reset
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="card rounded-2xl p-5 sm:p-6 space-y-5">
            {searchFilterControls}
          </div>
        )}

        <div className="grid xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-4">
          {!isMobileGlossary && (
            <div ref={browsePanelRef} className="card rounded-2xl p-3 sm:p-4 xl:sticky xl:top-24 h-fit order-2 xl:order-1 scroll-mt-24">
              <div className="mb-3 px-1 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500 font-semibold">Browse terms</div>
                  {isStackedGlossary && filtered.length > 0 && (
                    <div className="text-xs text-slate-500 mt-1">Tap a term to open it above.</div>
                  )}
                </div>
                {isStackedGlossary && selected && (
                  <button onClick={() => scrollToPanel(detailPanelRef)} className="btn btn-ghost px-3 py-2 rounded-lg text-xs shrink-0">
                    Current entry
                  </button>
                )}
              </div>
              {browseList}
            </div>
          )}

          <div ref={detailPanelRef} className="space-y-4 order-1 xl:order-2 scroll-mt-24">
            {selected ? (
              <>
                <div className="card rounded-2xl sm:rounded-3xl p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:gap-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip bg-slate-800 text-slate-200">{GLOSSARY_KIND_META[selected.kind]?.label || selected.kind}</span>
                          <button
                            onClick={() => onOpenBranch && onOpenBranch(selected.branch)}
                            className="chip bg-slate-800/80 text-slate-300 hover:text-white transition inline-flex items-center gap-1.5"
                          >
                            <BranchGlyph k={selected.branch} className="w-3.5 h-3.5" />
                            <span>{BRANCHES[selected.branch]?.name}</span>
                          </button>
                          {selected.questionCount ? (
                            <span className="chip mono bg-slate-800/80 text-cyan-200">{selected.questionCount} linked questions</span>
                          ) : null}
                          {mastery && mastery.total > 0 ? (
                            <span className="chip bg-slate-800/80 text-emerald-200">{mastery.reviewed}/{mastery.total} reviewed</span>
                          ) : null}
                          {branchAccuracy !== null ? (
                            <span className="chip bg-slate-800/80 text-slate-300">{branchAccuracy}% in this branch</span>
                          ) : null}
                        </div>
                        <div>
                          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2 break-words">{selected.term}</h3>
                          {aliasPreview.length > 0 && (
                            <div className="text-xs sm:text-sm text-slate-500 break-words">
                              Also searched as: <span className="text-slate-300">{aliasPreview.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                        {(isStackedGlossary || isMobileGlossary) && filtered.length > 1 && (
                          <button onClick={jumpToBrowseTerms} className="btn btn-ghost px-3 py-2 rounded-lg text-sm w-full sm:w-auto">
                            Browse terms
                          </button>
                        )}
                        {isMobileGlossary && (
                          <button onClick={() => setMobilePanel("filters")} className="btn btn-ghost px-3 py-2 rounded-lg text-sm w-full sm:w-auto">
                            Search & filter
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-3xl">{selected.oneLine}</p>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="card rounded-2xl p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300 font-semibold mb-2">Plain English</div>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{selected.plainEnglish}</p>
                  </div>
                  <div className="card rounded-2xl p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold mb-2">When To Reach For It</div>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{selected.whenToUse}</p>
                  </div>
                  <div className="card rounded-2xl p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-400 font-semibold mb-2">Common Mistake</div>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{selected.commonMistake}</p>
                  </div>
                  <div className="card rounded-2xl p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold mb-2">Example</div>
                    <p className="text-sm sm:text-base text-slate-300 leading-relaxed">{selected.example}</p>
                  </div>
                </div>

                {(selected.assumptions?.length || selected.pitfalls?.length || selected.reading?.length) && (
                  <div className="grid xl:grid-cols-3 gap-4">
                    {selected.assumptions?.length ? (
                      <div className="card rounded-2xl p-5">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold mb-3">Key Assumptions</div>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-300">
                          {selected.assumptions.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {selected.pitfalls?.length ? (
                      <div className="card rounded-2xl p-5">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-amber-400 font-semibold mb-3">Common Pitfalls</div>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-300">
                          {selected.pitfalls.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {selected.reading?.length ? (
                      <div className="card rounded-2xl p-5">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold mb-3">Further Reading</div>
                        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-400">
                          {selected.reading.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}

                {(relatedTerms.length > 0 || relatedMethods.length > 0) && (
                  <div className="card rounded-2xl p-5">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-semibold mb-3">Related Ideas</div>
                    <div className="flex flex-wrap gap-2">
                      {relatedTerms.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => selectGlossaryEntry(entry.id)}
                          className="px-3 py-2 rounded-lg bg-slate-800/80 text-slate-200 text-sm font-medium hover:bg-slate-700 transition"
                        >
                          {entry.term}
                        </button>
                      ))}
                      {relatedMethods.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => selectGlossaryEntry(entry.id)}
                          className="px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-200 text-sm font-medium hover:bg-cyan-500/15 transition"
                        >
                          {entry.term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card rounded-2xl p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-300 font-semibold mb-2">Practice It In Context</div>
                      <h4 className="text-lg sm:text-xl font-bold text-white">Related cases</h4>
                      <p className="text-sm text-slate-400 mt-1">Move from definition to judgment by seeing the idea inside a case.</p>
                    </div>
                    <button onClick={() => onOpenBranch && onOpenBranch(selected.branch)} className="btn btn-ghost px-4 py-2 rounded-lg text-sm w-full sm:w-auto">
                      Browse {BRANCHES[selected.branch]?.name} →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {relatedCases.map(({ caseObj, reason, done }) => (
                      <div key={caseObj.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
                              <BranchGlyph k={caseObj.branch} className="w-3.5 h-3.5" />
                              <span>{BRANCHES[caseObj.branch].name}</span>
                              <span>·</span>
                              <span>{caseObj.qPerRun} questions</span>
                            </div>
                            <div className="font-semibold text-white">{caseObj.title}</div>
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{caseObj.story}</p>
                            <div className="text-xs text-slate-500 mt-2">{reason}</div>
                          </div>
                          <button onClick={() => onStartCase && onStartCase(caseObj.id)} className="btn btn-primary px-4 py-2 rounded-lg text-sm shrink-0 w-full sm:w-auto">
                            {done ? "Replay case" : "Start case"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="card rounded-2xl p-5 sm:p-6">
                <div className="text-lg font-bold text-white mb-2">No glossary entry in view</div>
                <p className="text-sm text-slate-400 mb-4">
                  Adjust the current search or filters to bring terms back into view.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {isMobileGlossary && (
                    <button onClick={() => setMobilePanel("filters")} className="btn btn-ghost px-4 py-2 rounded-lg text-sm">
                      Search & filter
                    </button>
                  )}
                  {hasActiveFilters && (
                    <button onClick={resetFilters} className="btn btn-primary px-4 py-2 rounded-lg text-sm">
                      Reset filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobileGlossary && mobilePanel === "filters" && (
        <GlossaryMobileSheet
          title="Search & filter"
          subtitle="Find a term fast or narrow the glossary before you browse."
          onClose={() => setMobilePanel("")}
        >
          {searchFilterControls}
          <div className="grid grid-cols-2 gap-2 mt-5">
            <button
              onClick={() => setMobilePanel("browse")}
              disabled={!filtered.length}
              className="btn btn-primary py-3 rounded-xl text-sm disabled:opacity-40"
            >
              {mobileBrowseLabel}
            </button>
            <button onClick={() => setMobilePanel("")} className="btn btn-ghost py-3 rounded-xl text-sm">
              Done
            </button>
          </div>
        </GlossaryMobileSheet>
      )}

      {isMobileGlossary && mobilePanel === "browse" && (
        <GlossaryMobileSheet
          title="Browse terms"
          subtitle={`${countSummary} · ${mobileSummary}`}
          onClose={() => setMobilePanel("")}
        >
          <div className="space-y-4">
            {browseList}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMobilePanel("filters")} className="btn btn-ghost py-3 rounded-xl text-sm">
                Adjust filters
              </button>
              <button onClick={() => setMobilePanel("")} className="btn btn-primary py-3 rounded-xl text-sm">
                Done
              </button>
            </div>
          </div>
        </GlossaryMobileSheet>
      )}
    </>
  );
}

// ============================================================
// INTERACTIVE LAB — simulators
// ============================================================

// Math helpers — extracted to src/lib/stats.ts for testability and to
// shrink App.tsx. Same numerical implementations, re-imported here.
import { erf, pnorm, dnorm, qnorm, lgamma, dbeta } from "./lib/stats";
import { isCaseLockedForUser } from "./lib/access";
import {
  GLOSSARY_HASH_PREFIX,
  glossaryHashForId,
  parseGlossaryHash,
} from "./lib/glossaryHash";

// Phase 6 lazy-loaded views. Each is its own bundle chunk Vite emits
// at build time; users who never open the route never download the JS.
// Wrap the route render with <Suspense fallback={…}> below.
const SkillTreeLazy = React.lazy(() => import("./views/SkillTree"));

// --- small primitives ---
function Slider({ label, value, min, max, step, onChange, suffix, color="#8b5cf6" }) {
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className="mono font-bold" style={{color}}>{value}{suffix||""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"/>
    </div>
  );
}
function LabCard({ title, icon, desc, children }) {
  return (
    <div className="card rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between mb-3 sm:mb-4 gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl sm:text-2xl shrink-0">{icon}</span>
            <h3 className="text-base sm:text-xl font-bold text-white">{title}</h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// --- 1. Power & Sample Size ---
function PowerSim() {
  const [n, setN] = useState(30);
  const [d, setD] = useState(0.5);
  const [alpha, setAlpha] = useState(0.05);
  const [twoSided, setTwoSided] = useState(true);

  const se = 1/Math.sqrt(n/2); // SE of mean diff in two-sample t on standardized scale
  const ncp = d / se; // noncentrality
  const zCrit = qnorm(1 - (twoSided?alpha/2:alpha));
  const power = twoSided
    ? (1 - pnorm(zCrit - ncp)) + pnorm(-zCrit - ncp)
    : 1 - pnorm(zCrit - ncp);

  // Plot: H0 centered at 0, H1 at ncp, sd 1
  const W=520, H=220, pad=30;
  const xMin=-4, xMax=Math.max(6, ncp+4);
  const toX = x => pad + (x-xMin)/(xMax-xMin)*(W-2*pad);
  const toY = y => H-pad - y*(H-2*pad)/0.45;
  const curve = (mu) => { let d=""; for (let i=0;i<=200;i++){ const x=xMin+(xMax-xMin)*i/200; const y=dnorm(x,mu,1); d += (i===0?"M":"L")+toX(x)+","+toY(y); } return d; };
  const shadeUpper = (mu, cut) => { let d=`M${toX(cut)},${toY(0)}`; for (let i=0;i<=100;i++){ const x=cut+(xMax-cut)*i/100; d+=`L${toX(x)},${toY(dnorm(x,mu,1))}`; } d+=`L${toX(xMax)},${toY(0)}Z`; return d; };
  const shadeLower = (mu, cut) => { let d=`M${toX(xMin)},${toY(0)}`; for (let i=0;i<=100;i++){ const x=xMin+(cut-xMin)*i/100; d+=`L${toX(x)},${toY(dnorm(x,mu,1))}`; } d+=`L${toX(cut)},${toY(0)}Z`; return d; };

  return (
    <LabCard title="Power & Sample Size" icon={<Ico name="bolt" size={22}/>} desc="Watch how n, effect size, and α shape power. Tune the sliders and see the acceptance/rejection regions live.">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <Slider label="Sample size per group (n)" value={n} min={5} max={500} step={1} onChange={setN}/>
          <Slider label="Effect size (Cohen's d)" value={d.toFixed(2)} min={0} max={2} step={0.05} onChange={setD} color="#06b6d4"/>
          <Slider label="Significance level (α)" value={alpha.toFixed(3)} min={0.001} max={0.2} step={0.001} onChange={setAlpha} color="#f59e0b"/>
          <label className="flex items-center gap-2 text-sm text-slate-300 mt-2">
            <input type="checkbox" checked={twoSided} onChange={e=>setTwoSided(e.target.checked)} className="accent-purple-500"/>
            Two-sided test
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-slate-900/60 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Power (1−β)</div>
              <div className="text-3xl font-extrabold stat-number mono">{(power*100).toFixed(1)}%</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Type II (β)</div>
              <div className="text-3xl font-extrabold text-rose-400 mono">{((1-power)*100).toFixed(1)}%</div>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3 leading-relaxed">
            {power < 0.5 && (<span className="inline-flex items-start gap-1.5"><span className="text-amber-400 inline-flex mt-0.5"><Ico name="warning" size={12}/></span> Severely underpowered. Expect Type M (magnitude) errors in any 'significant' findings.</span>)}
            {power >= 0.5 && power < 0.8 && "Below conventional 80% target — consider more n."}
            {power >= 0.8 && power < 0.95 && "Adequate power for a primary endpoint."}
            {power >= 0.95 && "Very high power. May suggest n is larger than needed."}
          </div>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-3 overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* axes */}
            <line x1={pad} y1={toY(0)} x2={W-pad} y2={toY(0)} stroke="#334155"/>
            {/* shaded alpha region (under H0 in tail) */}
            <path d={shadeUpper(0, zCrit)} fill="#f59e0b" opacity="0.4"/>
            {twoSided && <path d={shadeLower(0, -zCrit)} fill="#f59e0b" opacity="0.4"/>}
            {/* shaded beta region (under H1 below zCrit) */}
            <path d={shadeLower(ncp, zCrit)} fill="#f43f5e" opacity="0.35"/>
            {/* H0 curve */}
            <path d={curve(0)} fill="none" stroke="#94a3b8" strokeWidth="2"/>
            {/* H1 curve */}
            <path d={curve(ncp)} fill="none" stroke="#8b5cf6" strokeWidth="2.5"/>
            {/* critical line */}
            <line x1={toX(zCrit)} y1={toY(0)} x2={toX(zCrit)} y2={pad} stroke="#f59e0b" strokeDasharray="4,3"/>
            <text x={toX(zCrit)+4} y={pad+12} fill="#f59e0b" fontSize="11" fontFamily="JetBrains Mono">z*={zCrit.toFixed(2)}</text>
            <text x={toX(0)} y={pad+12} fill="#94a3b8" fontSize="11" textAnchor="middle">H₀</text>
            <text x={toX(ncp)} y={pad+12} fill="#8b5cf6" fontSize="11" textAnchor="middle">H₁</text>
          </svg>
          <div className="flex gap-3 text-xs mt-1 flex-wrap">
            <span className="text-slate-400">— H₀</span>
            <span className="text-purple-400">— H₁</span>
            <span className="text-amber-400">▨ α (Type I)</span>
            <span className="text-rose-400">▨ β (Type II)</span>
          </div>
        </div>
      </div>
    </LabCard>
  );
}

// --- 2. CLT ---
function CLTSim() {
  const [dist, setDist] = useState("expo");
  const [n, setN] = useState(30);
  const [reps, setReps] = useState(500);
  const [tick, setTick] = useState(0);

  const means = useMemo(() => {
    const out = new Array(reps);
    const gen = () => {
      if (dist==="uniform") return Math.random();
      if (dist==="expo") return -Math.log(1-Math.random());
      if (dist==="bimodal") return Math.random()<0.5 ? 0.2 + 0.1*(Math.random()-0.5)*2 : 0.8 + 0.1*(Math.random()-0.5)*2;
      if (dist==="skewed") { const u=Math.random(); return Math.pow(u,3)*3; }
      return Math.random();
    };
    for (let r=0;r<reps;r++) { let s=0; for (let i=0;i<n;i++) s+=gen(); out[r]=s/n; }
    return out;
  }, [dist, n, reps, tick]);

  // histogram
  const W=520, H=200, pad=30;
  const mn = Math.min(...means), mx = Math.max(...means);
  const bins = 30;
  const binW = (mx-mn)/bins || 1;
  const counts = new Array(bins).fill(0);
  means.forEach(m => { let b = Math.min(bins-1, Math.max(0, Math.floor((m-mn)/binW))); counts[b]++; });
  const maxC = Math.max(...counts);
  const mean = means.reduce((a,b)=>a+b,0)/means.length;
  const sd = Math.sqrt(means.reduce((a,b)=>a+(b-mean)**2,0)/means.length);

  return (
    <LabCard title="Central Limit Theorem" icon={<Ico name="bell" size={22}/>} desc="Draw repeated samples from any crazy distribution. Watch the distribution of sample means become normal.">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <div className="mb-3">
            <div className="text-sm text-slate-300 mb-2 font-medium">Source distribution</div>
            <div className="grid grid-cols-2 gap-2">
              {[["uniform","Uniform"],["expo","Exponential (skewed)"],["bimodal","Bimodal"],["skewed","Heavy-right"]].map(([k,l])=>(
                <button key={k} onClick={()=>setDist(k)}
                  className={`p-2 rounded-lg text-sm border ${dist===k?"border-purple-500 bg-purple-900/30 text-white":"border-slate-700 bg-slate-900/40 text-slate-300"}`}>{l}</button>
              ))}
            </div>
          </div>
          <Slider label="Sample size n" value={n} min={1} max={200} step={1} onChange={setN}/>
          <Slider label="Number of samples" value={reps} min={50} max={3000} step={50} onChange={setReps} color="#06b6d4"/>
          <button onClick={()=>setTick(t=>t+1)} className="btn btn-primary px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1.5"><Ico name="reset" size={13}/> Resample</button>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-slate-900/60 rounded-lg p-3"><div className="text-[10px] uppercase text-slate-400">Mean of means</div><div className="text-xl font-bold mono text-white">{mean.toFixed(3)}</div></div>
            <div className="bg-slate-900/60 rounded-lg p-3"><div className="text-[10px] uppercase text-slate-400">SE (empirical)</div><div className="text-xl font-bold mono text-cyan-400">{sd.toFixed(3)}</div></div>
          </div>
          <div className="text-xs text-slate-400 mt-3 leading-relaxed">
            {n < 10 && "At small n, CLT hasn't fully kicked in — source shape can bleed through."}
            {n >= 10 && n < 30 && "Getting there — some skew may still be visible."}
            {n >= 30 && "CLT in action: the sampling distribution of the mean is looking Gaussian."}
          </div>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#334155"/>
            {counts.map((c,i)=>{
              const h = c/maxC * (H-2*pad);
              const x = pad + i/bins*(W-2*pad);
              const w = (W-2*pad)/bins - 1;
              return <rect key={i} x={x} y={H-pad-h} width={w} height={h} fill="#8b5cf6" opacity="0.85"/>;
            })}
            {/* overlay normal */}
            {(() => {
              let d=""; for (let i=0;i<=200;i++){ const x=mn+(mx-mn)*i/200; const y=dnorm(x,mean,sd)*binW; const scaled=y/(maxC/reps); d += (i===0?"M":"L")+(pad+(x-mn)/(mx-mn)*(W-2*pad))+","+(H-pad-scaled*(H-2*pad));}
              return <path d={d} fill="none" stroke="#fbbf24" strokeWidth="2"/>;
            })()}
          </svg>
          <div className="text-xs text-slate-500 text-center mt-1">Histogram of {reps} sample means (n={n}) · gold = fitted normal</div>
        </div>
      </div>
    </LabCard>
  );
}

// --- 3. ROC / Diagnostic ---
function ROCSim() {
  const [sep, setSep] = useState(1.5);       // separation between healthy & diseased
  const [prev, setPrev] = useState(0.1);
  const [thr, setThr] = useState(0);
  const [sdD, setSdD] = useState(1);

  // Healthy ~ N(0,1), Diseased ~ N(sep, sdD)
  const sens = 1 - pnorm((thr - sep)/sdD);    // P(X > thr | diseased)
  const spec = pnorm(thr);                     // P(X <= thr | healthy)
  const fpr = 1 - spec;
  const ppv = (sens*prev) / (sens*prev + (1-spec)*(1-prev));
  const npv = (spec*(1-prev)) / (spec*(1-prev) + (1-sens)*prev);
  const lrPos = sens / (1-spec || 1e-9);
  const lrNeg = (1-sens) / (spec || 1e-9);
  const auc = pnorm(sep/Math.sqrt(1 + sdD*sdD)); // closed form for two normals

  const W=520, H=220, pad=30;
  const xMin=-4, xMax=Math.max(6, sep+3.5*sdD);
  const toX = x => pad + (x-xMin)/(xMax-xMin)*(W-2*pad);
  const toY = y => H-pad - y*(H-2*pad)/0.45;
  const curve = (mu,sd) => { let d=""; for (let i=0;i<=200;i++){ const x=xMin+(xMax-xMin)*i/200; d += (i===0?"M":"L")+toX(x)+","+toY(dnorm(x,mu,sd)); } return d; };

  // ROC plot
  const RW=220, RH=220, rpad=28;
  const rocPts = [];
  for (let t=-5; t<=8; t+=0.1){ const se = 1 - pnorm((t - sep)/sdD); const sp = pnorm(t); rocPts.push([1-sp, se]); }
  const rocPath = rocPts.map((p,i)=> (i===0?"M":"L")+(rpad+p[0]*(RW-2*rpad))+","+(RH-rpad - p[1]*(RH-2*rpad))).join("");

  return (
    <LabCard title="ROC & Diagnostic Test" icon={<Ico name="stethoscope" size={22}/>} desc="Drag the threshold to see sensitivity, specificity, PPV, NPV, and the ROC curve point move together.">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <Slider label="Disease–healthy separation" value={sep.toFixed(2)} min={0} max={4} step={0.05} onChange={setSep}/>
          <Slider label="Diseased SD" value={sdD.toFixed(2)} min={0.3} max={2.5} step={0.05} onChange={setSdD} color="#06b6d4"/>
          <Slider label="Decision threshold" value={thr.toFixed(2)} min={-4} max={8} step={0.05} onChange={setThr} color="#f59e0b"/>
          <Slider label="Disease prevalence" value={prev.toFixed(3)} min={0.001} max={0.5} step={0.001} onChange={setPrev} color="#ec4899"/>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <Metric label="Sensitivity" value={(sens*100).toFixed(1)+"%"} color="#10b981"/>
            <Metric label="Specificity" value={(spec*100).toFixed(1)+"%"} color="#06b6d4"/>
            <Metric label="PPV" value={(ppv*100).toFixed(1)+"%"} color="#8b5cf6"/>
            <Metric label="NPV" value={(npv*100).toFixed(1)+"%"} color="#a855f7"/>
            <Metric label="LR+" value={lrPos.toFixed(2)} color="#fbbf24"/>
            <Metric label="LR−" value={lrNeg.toFixed(2)} color="#f87171"/>
            <Metric label="AUC" value={auc.toFixed(3)} color="#fbbf24"/>
            <Metric label="Youden J" value={(sens+spec-1).toFixed(2)} color="#10b981"/>
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-slate-900/40 rounded-xl p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <line x1={pad} y1={toY(0)} x2={W-pad} y2={toY(0)} stroke="#334155"/>
              <path d={curve(0,1)} fill="#06b6d4" fillOpacity="0.15" stroke="#06b6d4" strokeWidth="2"/>
              <path d={curve(sep,sdD)} fill="#ec4899" fillOpacity="0.15" stroke="#ec4899" strokeWidth="2"/>
              <line x1={toX(thr)} y1={toY(0)} x2={toX(thr)} y2={pad} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,3"/>
              <text x={toX(thr)+4} y={pad+12} fill="#f59e0b" fontSize="11" fontFamily="JetBrains Mono">thr={thr.toFixed(2)}</text>
              <text x={toX(0)} y={toY(dnorm(0,0,1))-4} fill="#06b6d4" fontSize="11" textAnchor="middle">Healthy</text>
              <text x={toX(sep)} y={toY(dnorm(sep,sep,sdD))-4} fill="#ec4899" fontSize="11" textAnchor="middle">Diseased</text>
            </svg>
          </div>
          <div className="bg-slate-900/40 rounded-xl p-3 flex items-center gap-4">
            <svg viewBox={`0 0 ${RW} ${RH}`} style={{width:220}}>
              <line x1={rpad} y1={RH-rpad} x2={RW-rpad} y2={RH-rpad} stroke="#334155"/>
              <line x1={rpad} y1={rpad} x2={rpad} y2={RH-rpad} stroke="#334155"/>
              <line x1={rpad} y1={RH-rpad} x2={RW-rpad} y2={rpad} stroke="#475569" strokeDasharray="3,3"/>
              <path d={rocPath} fill="none" stroke="#8b5cf6" strokeWidth="2"/>
              <circle cx={rpad+fpr*(RW-2*rpad)} cy={RH-rpad - sens*(RH-2*rpad)} r="6" fill="#fbbf24" stroke="#fff" strokeWidth="2"/>
              <text x={RW/2} y={RH-6} fill="#64748b" fontSize="10" textAnchor="middle">1 − Specificity</text>
              <text x={10} y={RH/2} fill="#64748b" fontSize="10" textAnchor="middle" transform={`rotate(-90 10 ${RH/2})`}>Sensitivity</text>
            </svg>
            <div className="text-xs text-slate-400">
              <div className="mb-1">AUC = <span className="mono gold-text font-bold">{auc.toFixed(3)}</span></div>
              <div>Move the threshold to slide the yellow dot along the ROC curve.</div>
            </div>
          </div>
        </div>
      </div>
    </LabCard>
  );
}
function Metric({ label, value, color }) {
  return (
    <div className="bg-slate-900/60 rounded-lg p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-base font-bold mono" style={{color}}>{value}</div>
    </div>
  );
}

// --- 4. Bayesian Updating ---
function BayesSim() {
  const [a, setA] = useState(2);
  const [b, setB] = useState(2);
  const [succ, setSucc] = useState(0);
  const [fail, setFail] = useState(0);

  const postA = a + succ, postB = b + fail;
  const postMean = postA / (postA + postB);
  const priorMean = a/(a+b);

  // CI (approx via quantiles of Beta — simple Monte Carlo from posterior)
  const samp = useMemo(() => {
    const out=[];
    for (let i=0;i<2000;i++){
      // Sample Beta via two Gammas: Gamma(a,1)/(Gamma(a,1)+Gamma(b,1))
      // Use simple approximation: sample from beta via Marsaglia... here just use numerical inversion from grid
      out.push(Math.random()); // placeholder replaced below
    }
    // Actually sample from Beta(postA, postB) via acceptance-rejection on grid
    const n=3000, grid=200;
    const vals=[], cdf=[]; let cum=0;
    for (let i=0;i<=grid;i++){ const x=i/grid; const p=dbeta(x,postA,postB); cum+=p; cdf.push(cum); vals.push(x); }
    const result=[];
    for (let i=0;i<n;i++){ const u=Math.random()*cum; let j=0; while (cdf[j]<u) j++; result.push(vals[j]); }
    return result.sort((x,y)=>x-y);
  }, [postA, postB]);
  const ciLow = samp[Math.floor(samp.length*0.025)];
  const ciHi = samp[Math.floor(samp.length*0.975)];

  const W=520, H=220, pad=30;
  const toX = x => pad + x*(W-2*pad);
  const maxY = Math.max(...[...Array(100).keys()].map(i=>dbeta(i/100, postA, postB)), 0.1);
  const toY = y => H-pad - y/maxY*(H-2*pad);
  const curve = (aa,bb) => { let d=""; for (let i=1;i<100;i++){ const x=i/100; d += (i===1?"M":"L")+toX(x)+","+toY(dbeta(x,aa,bb)); } return d; };

  const flip = (win) => { if (win) setSucc(s=>s+1); else setFail(f=>f+1); };

  return (
    <LabCard title="Bayesian Updating" icon={<Ico name="swap" size={22}/>} desc="Start with a prior. Add successes and failures. Watch the posterior sharpen in real time.">
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <Slider label="Prior α (successes-like)" value={a} min={0.5} max={20} step={0.5} onChange={setA}/>
          <Slider label="Prior β (failures-like)" value={b} min={0.5} max={20} step={0.5} onChange={setB} color="#ec4899"/>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={()=>flip(true)} className="btn btn-primary py-3 rounded-lg">+ Success</button>
            <button onClick={()=>flip(false)} className="btn py-3 rounded-lg" style={{background:"linear-gradient(135deg,#ec4899,#f43f5e)",color:"#fff"}}>+ Failure</button>
          </div>
          <button onClick={()=>{setSucc(0);setFail(0);}} className="btn btn-ghost w-full py-2 rounded-lg text-sm mb-3">Clear data</button>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Metric label="Successes" value={succ} color="#10b981"/>
            <Metric label="Failures" value={fail} color="#f43f5e"/>
            <Metric label="Trials" value={succ+fail} color="#94a3b8"/>
            <Metric label="Prior mean" value={priorMean.toFixed(3)} color="#8b5cf6"/>
            <Metric label="Posterior mean" value={postMean.toFixed(3)} color="#06b6d4"/>
            <Metric label="95% CrI" value={`(${ciLow.toFixed(2)},${ciHi.toFixed(2)})`} color="#fbbf24"/>
          </div>
        </div>
        <div className="bg-slate-900/40 rounded-xl p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#334155"/>
            <path d={curve(a,b)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,3"/>
            <path d={curve(postA,postB)} fill="#8b5cf6" fillOpacity="0.2" stroke="#8b5cf6" strokeWidth="2.5"/>
            <line x1={toX(ciLow)} y1={H-pad} x2={toX(ciLow)} y2={pad+10} stroke="#fbbf24" strokeDasharray="3,2"/>
            <line x1={toX(ciHi)} y1={H-pad} x2={toX(ciHi)} y2={pad+10} stroke="#fbbf24" strokeDasharray="3,2"/>
            <line x1={toX(postMean)} y1={H-pad} x2={toX(postMean)} y2={pad} stroke="#06b6d4" strokeWidth="1.5"/>
            <text x={pad} y={pad+10} fill="#94a3b8" fontSize="11">- - Prior</text>
            <text x={pad} y={pad+24} fill="#8b5cf6" fontSize="11">— Posterior</text>
          </svg>
          <div className="text-xs text-slate-500 text-center mt-1">Beta prior × Binomial likelihood → Beta posterior</div>
        </div>
      </div>
    </LabCard>
  );
}

// --- Lab container ---
// --- 5. p-value distribution simulator ---
function PvalueSim() {
  const [n, setN] = useState(30);
  const [d, setD] = useState(0);
  const [reps, setReps] = useState(2000);
  const [seed, setSeed] = useState(1);
  const ps = useMemo(()=>{
    const out=[]; let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()), v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
    for (let r=0;r<reps;r++){
      let m1=0,m2=0,s1=0,s2=0;
      for (let i=0;i<n;i++){ const x=rn(), y=rn()+d; m1+=x; m2+=y; s1+=x*x; s2+=y*y; }
      m1/=n; m2/=n; const v1=s1/n-m1*m1, v2=s2/n-m2*m2;
      const se=Math.sqrt((v1+v2)/n); const z=(m2-m1)/se;
      out.push(2*(1-pnorm(Math.abs(z))));
    }
    return out;
  },[n,d,reps,seed]);
  const bins = Array(20).fill(0);
  ps.forEach(p=>bins[Math.min(19,Math.floor(p*20))]++);
  const max = Math.max(...bins);
  const sig = ps.filter(p=>p<0.05).length;
  const rate = (sig/ps.length*100).toFixed(1);
  return (
    <LabCard icon={<Ico name="p" size={22}/>} title="p-value Distribution" desc="Under H₀ (d=0): p-values are uniform. Under H₁: they pile up near 0. This is the cure for 'p<0.05 means 5% chance H₀ is true'.">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Sample size (per group)" value={n} min={10} max={200} step={5} onChange={setN}/>
          <Slider label="True effect d" value={d} min={0} max={1.5} step={0.05} onChange={setD}/>
          <Slider label="Experiments" value={reps} min={200} max={5000} step={100} onChange={setReps}/>
          <button onClick={()=>setSeed(Math.random())} className="mt-2 px-4 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white text-sm font-semibold w-full inline-flex items-center justify-center gap-1.5"><Ico name="reset" size={13}/> Resample</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="% p<0.05" value={`${rate}%`} color="#f59e0b"/>
            <Metric label={d===0?"Type I err":"Power"} value={`${rate}%`} color={d===0?"#ef4444":"#10b981"}/>
          </div>
          <div className="mt-3 text-xs text-slate-400">
            {d===0 ? "Null is true — bars should be flat at ~5% each." : "Alternative is true — mass shifts toward 0."}
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 260" className="w-full bg-slate-950/50 rounded-xl">
            {bins.map((c,i)=>{
              const h = c/max*200; const x = 20+i*23; const col = i===0?"#ef4444":"#8b5cf6";
              return <rect key={i} x={x} y={230-h} width={20} height={h} fill={col} opacity="0.85"/>;
            })}
            <line x1={20+1*23} x2={20+1*23} y1="20" y2="230" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4"/>
            <text x={20+1*23+4} y="30" fill="#f59e0b" fontSize="10">α=0.05</text>
            <line x1="20" x2="480" y1="230" y2="230" stroke="#475569"/>
            <text x="20" y="250" fill="#94a3b8" fontSize="10">0</text>
            <text x="465" y="250" fill="#94a3b8" fontSize="10">1</text>
            <text x="240" y="258" fill="#94a3b8" fontSize="10" textAnchor="middle">p-value</text>
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

// --- 6. CI coverage simulator ---
function CICoverage() {
  const [n, setN] = useState(30);
  const [conf, setConf] = useState(0.95);
  const [k, setK] = useState(100);
  const [seed, setSeed] = useState(1);
  const trueMu = 0;
  const cis = useMemo(()=>{
    let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()), v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
    const z = qnorm(1-(1-conf)/2);
    const out=[];
    for (let r=0;r<k;r++){
      let m=0,s2=0; const xs=[];
      for(let i=0;i<n;i++){ const x=rn(); xs.push(x); m+=x; }
      m/=n; xs.forEach(x=>s2+=(x-m)*(x-m)); const sd=Math.sqrt(s2/(n-1));
      const se=sd/Math.sqrt(n);
      out.push({lo:m-z*se, hi:m+z*se, m});
    }
    return out;
  },[n,conf,k,seed]);
  const miss = cis.filter(c=>c.lo>trueMu||c.hi<trueMu).length;
  const cov = ((k-miss)/k*100).toFixed(1);
  return (
    <LabCard icon={<Ico name="ruler" size={22}/>} title="Confidence Interval Coverage" desc={`Generate ${k} CIs from the same population (μ=0). A ${(conf*100).toFixed(0)}% CI should capture μ ~${(conf*100).toFixed(0)}% of the time.`}>
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Sample size n" value={n} min={5} max={200} step={1} onChange={setN}/>
          <Slider label="Confidence" value={conf} min={0.5} max={0.99} step={0.01} onChange={setConf}/>
          <Slider label="# intervals" value={k} min={20} max={300} step={10} onChange={setK}/>
          <button onClick={()=>setSeed(Math.random())} className="mt-2 px-4 py-2 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-sm font-semibold w-full inline-flex items-center justify-center gap-1.5"><Ico name="dice" size={14}/> Resample</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="Coverage" value={`${cov}%`} color="#10b981"/>
            <Metric label="Missed" value={miss} color="#ef4444"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 300" className="w-full bg-slate-950/50 rounded-xl">
            <line x1="250" x2="250" y1="10" y2="290" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3"/>
            <text x="254" y="20" fill="#f59e0b" fontSize="10">μ=0</text>
            {cis.map((c,i)=>{
              const y = 15+i*(270/k);
              const xL = 250 + c.lo*80;
              const xH = 250 + c.hi*80;
              const xM = 250 + c.m*80;
              const hit = c.lo<=0 && c.hi>=0;
              const col = hit?"#22c55e":"#ef4444";
              return <g key={i}>
                <line x1={xL} x2={xH} y1={y} y2={y} stroke={col} strokeWidth="1.2" opacity="0.75"/>
                <circle cx={xM} cy={y} r="1.5" fill={col}/>
              </g>;
            })}
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

// --- 7. Multiple testing / FDR ---
function MultipleTestingSim() {
  const [m, setM] = useState(100);
  const [mTrue, setMTrue] = useState(10);
  const [alpha, setAlpha] = useState(0.05);
  const [method, setMethod] = useState("none");
  const [seed, setSeed] = useState(1);
  const res = useMemo(()=>{
    let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
    const ps=[]; const isTrue=[];
    const mT = Math.min(mTrue, m);
    for (let i=0;i<m;i++){
      const effect = i<mT ? 0.6 : 0;
      isTrue.push(i<mT);
      let m1=0,m2=0; const n=30;
      for (let j=0;j<n;j++){ m1+=rn(); m2+=rn()+effect; }
      m1/=n; m2/=n; const z=(m2-m1)/Math.sqrt(2/n);
      ps.push(2*(1-pnorm(Math.abs(z))));
    }
    let rej = ps.map(p=>false);
    if (method==="none") ps.forEach((p,i)=>rej[i]=p<alpha);
    else if (method==="bonf") ps.forEach((p,i)=>rej[i]=p<alpha/m);
    else if (method==="bh") {
      const ord = ps.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p);
      let maxK=-1;
      ord.forEach((o,k)=>{ if (o.p <= alpha*(k+1)/m) maxK=k; });
      for (let k=0;k<=maxK;k++) rej[ord[k].i]=true;
    }
    let TP=0,FP=0,TN=0,FN=0;
    rej.forEach((r,i)=>{
      if (r && isTrue[i]) TP++;
      else if (r && !isTrue[i]) FP++;
      else if (!r && !isTrue[i]) TN++;
      else FN++;
    });
    const totRej = TP+FP;
    const fdr = totRej>0 ? FP/totRej : 0;
    const power = mT>0 ? TP/mT : 0;
    return {ps, rej, isTrue, TP, FP, TN, FN, fdr, power};
  },[m,mTrue,alpha,method,seed]);
  return (
    <LabCard icon={<Ico name="grid" size={22}/>} title="Multiple Testing Correction" desc="Run m tests; some have a real effect. Compare no correction vs Bonferroni (FWER) vs Benjamini–Hochberg (FDR).">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Total tests m" value={m} min={20} max={500} step={10} onChange={setM}/>
          <Slider label="# truly non-null" value={mTrue} min={0} max={Math.min(m,100)} step={1} onChange={setMTrue}/>
          <Slider label="α" value={alpha} min={0.001} max={0.2} step={0.001} onChange={setAlpha}/>
          <div className="flex gap-2 my-3">
            {[["none","None"],["bonf","Bonf"],["bh","BH"]].map(([k,l])=>(
              <button key={k} onClick={()=>setMethod(k)} className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold ${method===k?"bg-purple-600 text-white":"bg-slate-800 text-slate-300"}`}>{l}</button>
            ))}
          </div>
          <button onClick={()=>setSeed(Math.random())} className="px-4 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white text-sm font-semibold w-full inline-flex items-center justify-center gap-1.5"><Ico name="reset" size={13}/> Resample</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="True pos" value={res.TP} color="#10b981"/>
            <Metric label="False pos" value={res.FP} color="#ef4444"/>
            <Metric label="FDR" value={`${(res.fdr*100).toFixed(1)}%`} color="#f59e0b"/>
            <Metric label="Power" value={`${(res.power*100).toFixed(1)}%`} color="#06b6d4"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 260" className="w-full bg-slate-950/50 rounded-xl">
            {res.ps.map((p,i)=>{
              const x = 20 + (i/m)*460;
              const y = 230 - (1-p)*200;
              const rej = res.rej[i];
              const real = res.isTrue[i];
              const col = rej && real ? "#10b981" : rej && !real ? "#ef4444" : real ? "#f59e0b" : "#64748b";
              return <circle key={i} cx={x} cy={y} r={rej?3.5:2} fill={col} opacity="0.9"/>;
            })}
            <line x1="20" x2="480" y1={230-(1-alpha)*200} y2={230-(1-alpha)*200} stroke="#f59e0b" strokeDasharray="4" strokeWidth="1"/>
            <text x="485" y={230-(1-alpha)*200+4} fill="#f59e0b" fontSize="9">α</text>
            <text x="20" y="250" fill="#94a3b8" fontSize="10">test index →</text>
            <text x="10" y="30" fill="#10b981" fontSize="9">● true pos</text>
            <text x="10" y="45" fill="#ef4444" fontSize="9">● false pos</text>
            <text x="10" y="60" fill="#f59e0b" fontSize="9">● missed (real)</text>
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

// --- 8. Regression playground ---
function RegressionSim() {
  const [n, setN] = useState(30);
  const [slope, setSlope] = useState(1);
  const [noise, setNoise] = useState(1);
  const [outlier, setOutlier] = useState(false);
  const [seed, setSeed] = useState(1);
  const data = useMemo(()=>{
    let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
    const pts=[];
    for (let i=0;i<n;i++){
      const x = (i/(n-1))*10 - 5;
      const y = slope*x + rn()*noise;
      pts.push({x,y});
    }
    if (outlier) pts.push({x:4.5, y:-10});
    return pts;
  },[n,slope,noise,outlier,seed]);
  // OLS
  const mx = data.reduce((a,p)=>a+p.x,0)/data.length;
  const my = data.reduce((a,p)=>a+p.y,0)/data.length;
  let sxy=0, sxx=0, syy=0;
  data.forEach(p=>{ sxy+=(p.x-mx)*(p.y-my); sxx+=(p.x-mx)**2; syy+=(p.y-my)**2; });
  const b1 = sxy/sxx, b0 = my-b1*mx;
  const r2 = (sxy*sxy)/(sxx*syy);
  const r = sxy/Math.sqrt(sxx*syy);
  const toX = x => 40+(x+6)/12*420;
  const toY = y => 230-(y+12)/24*210;
  return (
    <LabCard icon={<Ico name="lm" size={22}/>} title="Regression Playground" desc="Drag parameters, toggle an outlier. Watch β₁, R² and the fitted line react. Leverage lesson built in.">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Sample size n" value={n} min={10} max={200} step={1} onChange={setN}/>
          <Slider label="True slope" value={slope} min={-2} max={2} step={0.1} onChange={setSlope}/>
          <Slider label="Noise σ" value={noise} min={0.1} max={5} step={0.1} onChange={setNoise}/>
          <button onClick={()=>setOutlier(!outlier)} className={`mt-2 w-full px-4 py-2 rounded-lg text-sm font-semibold ${outlier?"bg-rose-600 text-white":"bg-slate-800 text-slate-300"}`}>
            {outlier ? (<span className="inline-flex items-center gap-1.5"><Ico name="check" size={12}/> Outlier ON</span>) : "Add high-leverage outlier"}
          </button>
          <button onClick={()=>setSeed(Math.random())} className="mt-2 w-full px-4 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"><Ico name="refresh" size={14}/> Resample</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="β̂₁" value={b1.toFixed(3)} color="#8b5cf6"/>
            <Metric label="β̂₀" value={b0.toFixed(3)} color="#06b6d4"/>
            <Metric label="R²" value={r2.toFixed(3)} color="#10b981"/>
            <Metric label="r" value={r.toFixed(3)} color="#f59e0b"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 260" className="w-full bg-slate-950/50 rounded-xl">
            <line x1="40" x2="460" y1={toY(0)} y2={toY(0)} stroke="#334155"/>
            <line x1={toX(0)} x2={toX(0)} y1="20" y2="230" stroke="#334155"/>
            {data.map((p,i)=>{
              const isOut = outlier && i===data.length-1;
              return <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={isOut?5:3.5} fill={isOut?"#ef4444":"#8b5cf6"} opacity="0.85"/>;
            })}
            <line x1={toX(-6)} x2={toX(6)} y1={toY(b0+b1*-6)} y2={toY(b0+b1*6)} stroke="#22d3ee" strokeWidth="2"/>
            <line x1={toX(-6)} x2={toX(6)} y1={toY(slope*-6)} y2={toY(slope*6)} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4" opacity="0.6"/>
            <text x="45" y="35" fill="#22d3ee" fontSize="10">— fitted</text>
            <text x="45" y="50" fill="#10b981" fontSize="10">-- truth</text>
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

// --- 9. Sampling bias ---
function SamplingBiasSim() {
  const [bias, setBias] = useState("none");
  const [seed, setSeed] = useState(1);
  const pop = useMemo(()=>{
    let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
    const N=600; const out=[];
    for (let i=0;i<N;i++){
      const x = rn()*15+50;
      out.push({x, id:i, r:rnd()});
    }
    return out;
  },[seed]);
  const popMean = pop.reduce((a,p)=>a+p.x,0)/pop.length;
  const sample = useMemo(()=>{
    if (bias==="none") return pop.filter(p=>p.r<0.25);
    if (bias==="selection") return pop.filter(p=>p.x>55 && p.r<0.5); // high-x oversampled
    if (bias==="survivor") return pop.filter(p=>p.x>popMean-5); // low values missing
    if (bias==="nonresponse") return pop.filter(p=>p.r<0.25 && p.x<65); // high-x won't respond
    return pop;
  },[pop,bias,popMean]);
  const sMean = sample.length ? sample.reduce((a,p)=>a+p.x,0)/sample.length : 0;
  return (
    <LabCard icon={<Ico name="mask" size={22}/>} title="Sampling Bias" desc="The population has a true mean. Your sampling frame changes what you actually see.">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <div className="text-xs text-slate-400 mb-2">Bias type</div>
          <div className="space-y-2 mb-4">
            {[["none","Random (unbiased)"],["selection","Selection (high-x)"],["survivor","Survivorship"],["nonresponse","Nonresponse"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBias(k)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${bias===k?"bg-gradient-to-r from-rose-600 to-amber-600 text-white":"bg-slate-800 text-slate-300"}`}>{l}</button>
            ))}
          </div>
          <button onClick={()=>setSeed(Math.random())} className="w-full px-4 py-2 rounded-lg bg-purple-600/80 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"><Ico name="dice" size={14}/> New population</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="Pop μ" value={popMean.toFixed(2)} color="#10b981"/>
            <Metric label="Sample x̄" value={sMean.toFixed(2)} color="#f59e0b"/>
            <Metric label="Bias" value={(sMean-popMean).toFixed(2)} color="#ef4444"/>
            <Metric label="n" value={sample.length} color="#8b5cf6"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 260" className="w-full bg-slate-950/50 rounded-xl">
            {(() => {
              const bins=30; const binsPop=Array(bins).fill(0), binsSamp=Array(bins).fill(0);
              const mn=10, mx=90;
              pop.forEach(p=>{ const b=Math.min(bins-1,Math.max(0,Math.floor((p.x-mn)/(mx-mn)*bins))); binsPop[b]++; });
              sample.forEach(p=>{ const b=Math.min(bins-1,Math.max(0,Math.floor((p.x-mn)/(mx-mn)*bins))); binsSamp[b]++; });
              const mP=Math.max(...binsPop), mS=Math.max(...binsSamp,1);
              return <>
                {binsPop.map((c,i)=>(<rect key={"p"+i} x={20+i*15} y={230-c/mP*200} width={14} height={c/mP*200} fill="#334155"/>))}
                {binsSamp.map((c,i)=>(<rect key={"s"+i} x={20+i*15} y={230-c/mS*200} width={14} height={c/mS*200} fill="#f59e0b" opacity="0.85"/>))}
              </>;
            })()}
            <line x1={20+(popMean-10)/80*450} x2={20+(popMean-10)/80*450} y1="20" y2="230" stroke="#10b981" strokeDasharray="4"/>
            <line x1={20+(sMean-10)/80*450} x2={20+(sMean-10)/80*450} y1="20" y2="230" stroke="#ef4444" strokeDasharray="4"/>
            <text x="25" y="35" fill="#334155" fontSize="10">■ population</text>
            <text x="25" y="50" fill="#f59e0b" fontSize="10">■ sample</text>
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

// --- 10. Simpson's Paradox ---
function SimpsonSim() {
  const [shift, setShift] = useState(0.7);
  const data = useMemo(()=>{
    // Two groups: A (small, high baseline), B (large, low baseline)
    // Treatment helps in both, but A gets less of it → aggregate reverses
    const out=[];
    // group A: mostly control, high success
    for (let i=0;i<80;i++) out.push({g:"A", t:0, y: Math.random()<0.85?1:0});
    for (let i=0;i<20;i++) out.push({g:"A", t:1, y: Math.random()<(0.85+shift*0.05)?1:0});
    // group B: mostly treatment, low success
    for (let i=0;i<20;i++) out.push({g:"B", t:0, y: Math.random()<0.30?1:0});
    for (let i=0;i<80;i++) out.push({g:"B", t:1, y: Math.random()<(0.30+shift*0.15)?1:0});
    return out;
  },[shift]);
  const rate = (g,t) => {
    const f = data.filter(d=> (g==="all"||d.g===g) && d.t===t);
    return f.length ? f.filter(d=>d.y===1).length/f.length : 0;
  };
  const agC = rate("all",0), agT = rate("all",1);
  const aC = rate("A",0), aT = rate("A",1);
  const bC = rate("B",0), bT = rate("B",1);
  const Bar = ({label, c, t, col}) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1"><span className="text-slate-300 font-semibold">{label}</span><span className="mono" style={{color:col}}>C:{(c*100).toFixed(0)}% T:{(t*100).toFixed(0)}% Δ:{((t-c)*100).toFixed(1)}</span></div>
      <div className="flex gap-1 h-5">
        <div className="flex-1 bg-slate-800 rounded relative overflow-hidden"><div className="absolute inset-y-0 left-0 bg-slate-500" style={{width:`${c*100}%`}}/></div>
        <div className="flex-1 bg-slate-800 rounded relative overflow-hidden"><div className="absolute inset-y-0 left-0" style={{width:`${t*100}%`, background:col}}/></div>
      </div>
    </div>
  );
  return (
    <LabCard icon={<Ico name="swap" size={22}/>} title="Simpson's Paradox" desc="Within each stratum, treatment helps. In the aggregate — sign can flip. Confounding by group assignment.">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Treatment effect (within group)" value={shift} min={0} max={1} step={0.05} onChange={setShift}/>
          <div className="mt-4 text-xs text-slate-400 leading-relaxed">
            Group A (high baseline) is mostly <b>untreated</b>. Group B (low baseline) is mostly <b>treated</b>. Imbalanced assignment creates the paradox.
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="Overall Δ" value={((agT-agC)*100).toFixed(1)+"%"} color={(agT-agC)<0?"#ef4444":"#10b981"}/>
            <Metric label="A Δ" value={((aT-aC)*100).toFixed(1)+"%"} color="#10b981"/>
            <Metric label="B Δ" value={((bT-bC)*100).toFixed(1)+"%"} color="#10b981"/>
            <Metric label="Paradox?" value={(agT-agC<0 && aT-aC>0 && bT-bC>0)?"YES":"no"} color="#f59e0b"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <Bar label="Group A" c={aC} t={aT} col="#22c55e"/>
          <Bar label="Group B" c={bC} t={bT} col="#22c55e"/>
          <div className="border-t border-slate-700 my-3"/>
          <Bar label="AGGREGATE (ignoring group)" c={agC} t={agT} col="#ef4444"/>
        </div>
      </div>
    </LabCard>
  );
}

// --- 11. Bootstrap ---
function BootstrapSim() {
  const [n, setN] = useState(30);
  const [stat, setStat] = useState("mean");
  const [B, setB] = useState(2000);
  const [seed, setSeed] = useState(1);
  const sample = useMemo(()=>{
    let s=seed*9301+49297;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const rn=()=>{ const u=Math.max(1e-9,rnd()); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd()); };
    return Array.from({length:n}, ()=> rn()*2+5 + (rnd()<0.1?8:0));
  },[n,seed]);
  const compute = (arr) => {
    if (stat==="mean") return arr.reduce((a,x)=>a+x,0)/arr.length;
    if (stat==="median") { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
    if (stat==="sd") { const m=arr.reduce((a,x)=>a+x,0)/arr.length; return Math.sqrt(arr.reduce((a,x)=>a+(x-m)**2,0)/(arr.length-1)); }
  };
  const boot = useMemo(()=>{
    let s=seed*1237+991;
    const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
    const out=[];
    for (let b=0;b<B;b++){
      const resamp = Array.from({length:n}, ()=> sample[Math.floor(rnd()*n)]);
      out.push(compute(resamp));
    }
    return out.sort((a,b)=>a-b);
  },[sample,B,stat,seed]);
  const obs = compute(sample);
  const lo = boot[Math.floor(0.025*B)], hi = boot[Math.floor(0.975*B)];
  const bSE = Math.sqrt(boot.reduce((a,x)=>a+(x-obs)**2,0)/B);
  const bins=25; const hist=Array(bins).fill(0);
  const mn=Math.min(...boot), mx=Math.max(...boot);
  boot.forEach(x=>hist[Math.min(bins-1,Math.floor((x-mn)/(mx-mn)*bins))]++);
  const mH=Math.max(...hist);
  return (
    <LabCard icon={<Ico name="boot" size={22}/>} title="Bootstrap" desc="Resample your data with replacement B times, recompute the statistic — get a distribution without any parametric assumption.">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <Slider label="Sample size n" value={n} min={5} max={200} step={1} onChange={setN}/>
          <Slider label="Bootstrap reps B" value={B} min={200} max={5000} step={100} onChange={setB}/>
          <div className="flex gap-2 my-3">
            {[["mean","Mean"],["median","Median"],["sd","SD"]].map(([k,l])=>(
              <button key={k} onClick={()=>setStat(k)} className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold ${stat===k?"bg-purple-600 text-white":"bg-slate-800 text-slate-300"}`}>{l}</button>
            ))}
          </div>
          <button onClick={()=>setSeed(Math.random())} className="w-full px-4 py-2 rounded-lg bg-purple-600/80 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"><Ico name="refresh" size={14}/> New sample</button>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Metric label="Observed" value={obs.toFixed(3)} color="#06b6d4"/>
            <Metric label="Boot SE" value={bSE.toFixed(3)} color="#8b5cf6"/>
            <Metric label="95% CI lo" value={lo.toFixed(3)} color="#10b981"/>
            <Metric label="95% CI hi" value={hi.toFixed(3)} color="#10b981"/>
          </div>
        </div>
        <div className="md:col-span-2">
          <svg viewBox="0 0 500 260" className="w-full bg-slate-950/50 rounded-xl">
            {hist.map((c,i)=>{
              const x = 20 + i*18;
              const h = c/mH*200;
              return <rect key={i} x={x} y={230-h} width={17} height={h} fill="#8b5cf6" opacity="0.85"/>;
            })}
            <line x1={20+(obs-mn)/(mx-mn)*bins*18} x2={20+(obs-mn)/(mx-mn)*bins*18} y1="20" y2="230" stroke="#06b6d4" strokeWidth="2"/>
            <line x1={20+(lo-mn)/(mx-mn)*bins*18} x2={20+(lo-mn)/(mx-mn)*bins*18} y1="20" y2="230" stroke="#10b981" strokeDasharray="4"/>
            <line x1={20+(hi-mn)/(mx-mn)*bins*18} x2={20+(hi-mn)/(mx-mn)*bins*18} y1="20" y2="230" stroke="#10b981" strokeDasharray="4"/>
            <text x="25" y="35" fill="#06b6d4" fontSize="10">| observed</text>
            <text x="25" y="50" fill="#10b981" fontSize="10">-- 95% CI</text>
            <text x="20" y="250" fill="#94a3b8" fontSize="10">bootstrap statistic</text>
          </svg>
        </div>
      </div>
    </LabCard>
  );
}

function Lab({ onVisit } = {}) {
  const [tab, setTab] = useState("power");
  const tabs = [
    ["power",    "Power",      "bolt"],
    ["clt",      "CLT",        "bell"],
    ["roc",      "ROC",        "stethoscope"],
    ["bayes",    "Bayes",      "swap"],
    ["reg",      "Regression", "lm"],
    ["boot",     "Bootstrap",  "boot"],
  ];
  // Record which simulator the user opens (for the Simulator Scout badge).
  useEffect(() => { if (typeof onVisit === "function") onVisit(tab); }, [tab, onVisit]);
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 fade-in">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white inline-flex items-center gap-2">
          <span className="text-cyan-400"><Ico name="beaker" size={26}/></span>
          Interactive Lab
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm mt-1">Hands-on simulators. Drag the sliders — intuition beats memorization.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k,l,ico])=>(
          <button key={k} onClick={()=>setTab(k)}
            className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition inline-flex items-center gap-1.5 ${tab===k?"bg-gradient-to-r from-purple-600 to-cyan-600 text-white":"bg-slate-800/60 text-slate-300 hover:bg-slate-700"}`}>
            <Ico name={ico} size={14}/>
            <span>{l}</span>
          </button>
        ))}
      </div>
      {tab==="power" && <PowerSim/>}
      {tab==="clt" && <CLTSim/>}
      {tab==="roc" && <ROCSim/>}
      {tab==="bayes" && <BayesSim/>}
      {tab==="reg" && <RegressionSim/>}
      {tab==="boot" && <BootstrapSim/>}
    </div>
  );
}

// ============================================================
// ADMIN REPORTS (Phase 0 — content correctness triage queue)
// Email-gated. Lists open question reports and lets admin mark them
// triaged / fixed / wontfix / duplicate with an optional resolution note.
// Reachable via /?admin=1 or URL hash, or the Home shortcut shown only to admin.
// ============================================================

// Resolve a qid to its full question payload (q / options / answer / explain /
// case title) so the admin can triage in context without leaving the page.
function findQuestionByQid(qid) {
  if (!qid) return null;
  for (const c of CASES) {
    for (const q of c.bank || []) {
      if (q.qid === qid) return { q, caseTitle: c.title, caseId: c.id, branch: c.branch };
    }
  }
  return null;
}

function ReportedQuestionDetail({ qid }) {
  const hit = findQuestionByQid(qid);
  if (!hit) {
    return <div className="mt-3 text-xs text-red-400">Question not found in current bank — qid may be stale.</div>;
  }
  const { q, caseTitle, caseId } = hit;
  return (
    <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-purple-300 mb-1.5">{caseTitle} · <span className="mono text-slate-500">{caseId}</span></div>
      <div className="text-sm text-white font-semibold leading-snug mb-2">{q.q}</div>
      {q.output && (
        <pre className="mono text-[11px] leading-relaxed text-slate-300 bg-slate-950/80 border border-slate-800 rounded p-2 mb-2 overflow-x-auto whitespace-pre">{q.output}</pre>
      )}
      {q.type === "mcq" && Array.isArray(q.options) && (
        <div className="space-y-1 mb-2">
          {q.options.map((o, i) => (
            <div key={i} className={`text-xs px-2 py-1 rounded flex gap-2 ${i === q.answer ? "bg-emerald-900/30 border border-emerald-700/40" : "bg-slate-900/30 border border-slate-800"}`}>
              <span className="mono text-slate-500">{String.fromCharCode(65 + i)}</span>
              <span className={i === q.answer ? "text-emerald-200" : "text-slate-300"}>{o}</span>
              {i === q.answer && <span className="ml-auto text-emerald-400 text-[10px] font-bold">KEY</span>}
            </div>
          ))}
        </div>
      )}
      {q.type === "multi" && Array.isArray(q.options) && (
        <div className="space-y-1 mb-2">
          {q.options.map((o, i) => {
            const isKey = Array.isArray(q.answer) && q.answer.includes(i);
            return (
              <div key={i} className={`text-xs px-2 py-1 rounded flex gap-2 ${isKey ? "bg-emerald-900/30 border border-emerald-700/40" : "bg-slate-900/30 border border-slate-800"}`}>
                <span className="mono text-slate-500">{String.fromCharCode(65 + i)}</span>
                <span className={isKey ? "text-emerald-200" : "text-slate-300"}>{o}</span>
                {isKey && <span className="ml-auto text-emerald-400 text-[10px] font-bold">KEY</span>}
              </div>
            );
          })}
        </div>
      )}
      {q.type === "numeric" && (
        <div className="text-xs px-2 py-1 rounded bg-emerald-900/30 border border-emerald-700/40 mb-2 flex items-center gap-2">
          <span className="mono text-emerald-400 font-bold">numeric</span>
          <span className="text-emerald-200">answer = {String(q.answer)}</span>
          {q.tol !== undefined && <span className="text-emerald-300/70">± {q.tol}</span>}
        </div>
      )}
      {q.explain && (
        <div className="text-xs text-slate-300 leading-relaxed border-l-2 border-slate-700 pl-3 mt-2">
          <span className="uppercase tracking-wider text-slate-500 text-[10px]">Explanation · </span>{q.explain}
        </div>
      )}
      {q.method && <div className="mt-1.5 text-[10px] mono text-slate-500">method: {q.method}</div>}
    </div>
  );
}

// Download an array-of-objects as a CSV file. Escapes commas, quotes, newlines.
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set()));
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Error boundary scoped to admin panels. One bad row or a malformed `state`
// JSONB shouldn't blank the whole admin UI — React 18 without an error
// boundary renders nothing on a thrown error, which was causing the "click
// user → page goes blank" bug. Here we catch, log, and show a tiny fallback.
class AdminErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.warn("[admin] render error:", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div className="card rounded-xl p-4 border border-red-900/40 bg-red-950/20 text-sm">
          <div className="text-red-300 font-semibold mb-1">Couldn't render this section.</div>
          <div className="text-red-200/70 text-xs mono">{String(this.state.err?.message || this.state.err)}</div>
          <button onClick={() => this.setState({ err: null })} className="btn btn-ghost px-3 py-1.5 rounded text-xs mt-3">Dismiss</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- Overview tab ---------------------------------------------------------
// Compact "what needs attention today" card. Scans every data source the
// admin already fetches (users, reports, events) and surfaces rows the admin
// should act on — low-accuracy questions, high-dropoff cases, overdue reports,
// stuck users, and fresh signups. Each row calls onNavigate to jump to the
// right tab; admins apply filters there (click-through deep linking is later).
function NeedsAttention({ users, reports, events, onNavigate }) {
  const now = Date.now();
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;

  // 1) Low-accuracy questions (possibly broken content).
  //    Threshold: ≥10 answers, <40% correct. 10 is a noise floor; under that
  //    one lucky streak flips the signal. The 40% cutoff is empirical — below
  //    that a 4-option MCQ is doing worse than random-plus-distractor-avoidance.
  const accuracy = {};
  for (const e of events || []) {
    if (!e.qid) continue;
    if (e.type !== "answer_correct" && e.type !== "answer_wrong") continue;
    const b = accuracy[e.qid] || { correct: 0, total: 0 };
    b.total += 1;
    if (e.type === "answer_correct") b.correct += 1;
    accuracy[e.qid] = b;
  }
  const lowAcc = Object.entries(accuracy)
    .filter(([, b]) => b.total >= 10 && b.correct / b.total < 0.4)
    .map(([qid, b]) => ({ qid, pct: Math.round((b.correct / b.total) * 100), n: b.total }))
    .sort((a, b) => a.pct - b.pct);

  // 2) Cases with start→complete dropoff. Only fire if a case has ≥5 starts
  //    (small-n guard) AND completion rate <50%.
  const starts = {}, completes = {};
  for (const e of events || []) {
    if (e.type === "case_start" && e.case_id) starts[e.case_id] = (starts[e.case_id] || 0) + 1;
    if (e.type === "case_complete" && e.case_id) completes[e.case_id] = (completes[e.case_id] || 0) + 1;
  }
  const dropoffCases = Object.entries(starts)
    .filter(([, n]) => n >= 5)
    .map(([id, n]) => ({ id, starts: n, completes: completes[id] || 0, rate: Math.round((completes[id] || 0) / n * 100) }))
    .filter(c => c.rate < 50)
    .sort((a, b) => a.rate - b.rate);

  // 3) Reports open > 72h (triage overdue).
  const overdueReports = (reports || []).filter(r =>
    r.status === "open" && (now - new Date(r.created_at).getTime()) > 72 * HOUR
  );

  // 4) Stuck users: signed up ≥7 days ago, completed 0 cases. Signal that the
  //    funnel leaks between signup and first case.
  const stuckUsers = (users || []).filter(u =>
    (u.state?.completed?.length || 0) === 0 &&
    (now - new Date(u.created_at).getTime()) > 7 * DAY
  );

  // 5) Fresh signups in last 24h (informational — you probably want to welcome
  //    or watch). Not a "problem," but worth knowing before the day starts.
  const freshSignups = (users || []).filter(u =>
    (now - new Date(u.created_at).getTime()) < 1 * DAY
  );

  const items = [];
  if (overdueReports.length > 0) items.push({
    key: "overdue-reports",
    severity: "red",
    icon: "flag",
    title: `${overdueReports.length} open report${overdueReports.length === 1 ? "" : "s"} > 72h`,
    detail: "Triage overdue",
    tab: "reports",
  });
  if (lowAcc.length > 0) items.push({
    key: "low-acc",
    severity: "red",
    icon: "cross",
    title: `${lowAcc.length} question${lowAcc.length === 1 ? "" : "s"} < 40% accuracy`,
    detail: lowAcc.slice(0, 3).map(q => `${q.qid} (${q.pct}%, n=${q.n})`).join(" · ") + (lowAcc.length > 3 ? ` · +${lowAcc.length - 3} more` : ""),
    tab: "content",
  });
  if (dropoffCases.length > 0) items.push({
    key: "dropoff",
    severity: "amber",
    icon: "alarm-clock",
    title: `${dropoffCases.length} case${dropoffCases.length === 1 ? "" : "s"} with high dropoff`,
    detail: dropoffCases.slice(0, 3).map(c => `${c.id} (${c.rate}% complete, ${c.starts} starts)`).join(" · ") + (dropoffCases.length > 3 ? ` · +${dropoffCases.length - 3} more` : ""),
    tab: "content",
  });
  if (stuckUsers.length > 0) items.push({
    key: "stuck",
    severity: "amber",
    icon: "calendar",
    title: `${stuckUsers.length} stuck user${stuckUsers.length === 1 ? "" : "s"}`,
    detail: "Signed up ≥7 days ago, 0 cases completed",
    tab: "users",
  });
  if (freshSignups.length > 0) items.push({
    key: "fresh",
    severity: "cyan",
    icon: "star-shine",
    title: `${freshSignups.length} new signup${freshSignups.length === 1 ? "" : "s"} · last 24h`,
    detail: freshSignups.slice(0, 3).map(u => u.email || "no email").join(" · ") + (freshSignups.length > 3 ? ` · +${freshSignups.length - 3} more` : ""),
    tab: "users",
  });

  const sevCls = {
    red:   { border: "border-red-700/50",    bg: "bg-red-950/20",    text: "text-red-300",    chip: "bg-red-900/50 text-red-200" },
    amber: { border: "border-amber-700/50",  bg: "bg-amber-950/20",  text: "text-amber-300",  chip: "bg-amber-900/50 text-amber-200" },
    cyan:  { border: "border-cyan-700/50",   bg: "bg-cyan-950/20",   text: "text-cyan-300",   chip: "bg-cyan-900/50 text-cyan-200" },
  };

  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Needs attention</div>
        {items.length === 0 && <div className="text-[10px] text-emerald-400 uppercase tracking-widest">All clear</div>}
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-900/40 text-emerald-400"><Ico name="check" size={12}/></span>
          Nothing urgent. Backlog is clean, no broken content signals, no stuck users.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map(it => {
            const c = sevCls[it.severity];
            return (
              <button
                key={it.key}
                onClick={() => onNavigate?.(it.tab)}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg border ${c.border} ${c.bg} hover:bg-opacity-60 transition group`}>
                <span className={`shrink-0 w-6 h-6 rounded inline-flex items-center justify-center ${c.chip}`}>
                  <Ico name={it.icon} size={12}/>
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${c.text}`}>{it.title}</div>
                  {it.detail && <div className="text-xs text-slate-400 mt-0.5 truncate">{it.detail}</div>}
                </div>
                <span className="shrink-0 text-[11px] text-slate-500 mono opacity-0 group-hover:opacity-100 transition self-center">→ {it.tab}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminOverview({ users, openReportsCount, events, reports, onNavigate }) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const safe = users || [];
  const signups7d = safe.filter(u => new Date(u.created_at).getTime() >= now - 7 * DAY).length;
  const signups30d = safe.filter(u => new Date(u.created_at).getTime() >= now - 30 * DAY).length;
  const active1d = safe.filter(u => new Date(u.updated_at).getTime() >= now - 1 * DAY).length;
  const active7d = safe.filter(u => new Date(u.updated_at).getTime() >= now - 7 * DAY).length;
  const active30d = safe.filter(u => new Date(u.updated_at).getTime() >= now - 30 * DAY).length;
  const byType = safe.reduce((acc, u) => { acc[u.user_type || "free"] = (acc[u.user_type || "free"] || 0) + 1; return acc; }, {});
  const totalCasesCompleted = safe.reduce((s, u) => s + ((u.state?.completed?.length) || 0), 0);
  const totalXP = safe.reduce((s, u) => s + (u.state?.xp || 0), 0);
  const diagnosticCompleters = safe.filter(u => !!u.state?.onboardingCompletedAt).length;
  const activatedUsers = safe.filter(u => (u.state?.completed?.length || 0) >= 1).length;
  const activationRate = safe.length ? Math.round((activatedUsers / safe.length) * 100) : 0;

  // Retention glimpse: of users who signed up 7+ days ago, what % saved
  // (opened the app) within the last 7 days? A first-cut Day-7 retention.
  const cohort = safe.filter(u => new Date(u.created_at).getTime() <= now - 7 * DAY);
  const cohortRetained = cohort.filter(u => new Date(u.updated_at).getTime() >= now - 7 * DAY).length;
  const d7Retention = cohort.length ? Math.round((cohortRetained / cohort.length) * 100) : null;

  // 30-day signup histogram (one bar per day). Uses created_at from users.
  const buckets = Array.from({ length: 30 }, () => 0);
  safe.forEach(u => {
    const daysAgo = Math.floor((now - new Date(u.created_at).getTime()) / DAY);
    if (daysAgo >= 0 && daysAgo < 30) buckets[29 - daysAgo]++;
  });
  const maxBucket = Math.max(1, ...buckets);

  // Event mix over last 7d from the events table (powers activity story).
  const evs = events || [];
  const evs7d = evs.filter(e => new Date(e.created_at).getTime() >= now - 7 * DAY);
  const evs30d = evs.filter(e => new Date(e.created_at).getTime() >= now - 30 * DAY);
  const evMix = evs7d.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});

  // Anonymous activity — unique visitor_ids that haven't converted to a user.
  const anonVisitors7d = new Set(evs7d.filter(e => !e.user_id && e.visitor_id).map(e => e.visitor_id));
  const anonVisitors30d = new Set(evs30d.filter(e => !e.user_id && e.visitor_id).map(e => e.visitor_id));

  // Landing-variant mix (30d): which referrer-aware hero variants fire most,
  // and what fraction of visitors from each convert to a signup. Reads data
  // from session_start / guest_visit events populated by auth.ts.
  const variantVisitors = new Map(); // key: variant → Set(visitor_id)
  const variantSignups  = new Map(); // key: variant → Set(visitor_id) that later signed up
  for (const e of evs30d) {
    const vKey = (e.data && (e.data.landingVariant || e.data.ref)) || null;
    if (!vKey || !e.visitor_id) continue;
    if (!variantVisitors.has(vKey)) variantVisitors.set(vKey, new Set());
    variantVisitors.get(vKey).add(e.visitor_id);
    if (e.user_id) {
      if (!variantSignups.has(vKey)) variantSignups.set(vKey, new Set());
      variantSignups.get(vKey).add(e.visitor_id);
    }
  }
  const variantRows = [...variantVisitors.entries()]
    .map(([key, vSet]) => {
      const signed = variantSignups.get(key) || new Set();
      const total = vSet.size;
      const conv = total ? Math.round((signed.size / total) * 100) : 0;
      return { key, visitors: total, signups: signed.size, conv };
    })
    .sort((a, b) => b.visitors - a.visitors);

  // Guest → signup conversion. A visitor_id is "converted" if at some point
  // it appears on an event with user_id set (i.e., they signed up AND the
  // browser remembered its visitor_id through the transition).
  const allVisitors30d = new Set(evs30d.filter(e => e.visitor_id).map(e => e.visitor_id));
  const convertedVisitors30d = new Set(evs30d.filter(e => e.user_id && e.visitor_id).map(e => e.visitor_id));
  const conversionRate = allVisitors30d.size ? Math.round((convertedVisitors30d.size / allVisitors30d.size) * 100) : null;

  const card = (label, value, hint) => (
    <div className="card rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white leading-none">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1.5">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <NeedsAttention users={users} reports={reports} events={events} onNavigate={onNavigate}/>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {card("Total users", safe.length)}
        {card("Active today", active1d, `${active7d} past 7d · ${active30d} past 30d`)}
        {card("New signups (7d)", signups7d, `${signups30d} past 30d`)}
        {card("Open reports", openReportsCount ?? "–")}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {card("Diagnostic completed", diagnosticCompleters, `${safe.length ? Math.round(diagnosticCompleters/safe.length*100) : 0}% of users`)}
        {card("Activation (≥1 case)", `${activationRate}%`, `${activatedUsers} / ${safe.length} users`)}
        {card("Day-7 retention", d7Retention === null ? "–" : `${d7Retention}%`, cohort.length ? `${cohortRetained} / ${cohort.length} 7d+ cohort active` : "no cohort yet")}
        {card("Cases completed (all)", totalCasesCompleted, `${fmtNumber(totalXP)} total XP`)}
      </div>

      {/* Anonymous / guest funnel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {card("Guest visitors (7d)", anonVisitors7d.size, `${anonVisitors30d.size} past 30d`)}
        {card("Guest → Signup rate", conversionRate === null ? "–" : `${conversionRate}%`, allVisitors30d.size ? `${convertedVisitors30d.size} / ${allVisitors30d.size} visitors signed up (30d)` : "no traffic yet")}
        {card("Total visitors (30d)", allVisitors30d.size, "unique browsers seen")}
        {card("Unconverted (30d)", Math.max(0, allVisitors30d.size - convertedVisitors30d.size), "visitors who never signed up")}
      </div>

      {/* Landing-variant breakdown: which referrer-aware hero converts best */}
      {variantRows.length > 0 && (
        <div className="card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Landing variant · 30 days</div>
            <div className="text-xs text-slate-500 mono">visitors · signups · conv</div>
          </div>
          <div className="space-y-2">
            {variantRows.map((r) => (
              <div key={r.key} className="grid grid-cols-12 gap-2 items-center text-sm">
                <div className="col-span-4 md:col-span-3">
                  <span className="chip text-xs bg-slate-800 text-slate-200 mono">{r.key}</span>
                </div>
                <div className="col-span-6 md:col-span-7">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-400"
                      style={{ width: `${Math.min(100, (r.visitors / (variantRows[0].visitors || 1)) * 100)}%` }}/>
                  </div>
                </div>
                <div className="col-span-2 text-right mono text-xs text-slate-300">
                  {r.visitors} · {r.signups} · <span className={r.conv >= 20 ? "text-emerald-300 font-semibold" : r.conv > 0 ? "text-slate-300" : "text-slate-600"}>{r.conv}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            Powered by <code className="text-slate-400">landingVariant</code> + <code className="text-slate-400">ref</code> in event data.
            Variant is chosen on <code className="text-slate-400">/</code> based on <code className="text-slate-400">document.referrer</code> or <code className="text-slate-400">?utm_source</code>; preview any variant with <code className="text-slate-400">?ref=usmle</code>.
          </div>
        </div>
      )}

      {/* 30-day signup sparkline */}
      <div className="card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Signups · last 30 days</div>
          <div className="text-xs text-slate-500 mono">{buckets.reduce((a,b)=>a+b,0)} total · peak {maxBucket}/day</div>
        </div>
        <div className="flex items-end gap-0.5 h-20">
          {buckets.map((v, i) => (
            <div key={i} title={`${v} signup${v===1?'':'s'} · ${30-i-1}d ago`}
              className="flex-1 bg-gradient-to-t from-purple-700 to-cyan-500 rounded-sm opacity-80 hover:opacity-100 transition"
              style={{ height: `${Math.max(2, (v / maxBucket) * 100)}%`, minHeight: v === 0 ? "2px" : undefined, background: v === 0 ? "rgba(71,85,105,0.4)" : undefined }}/>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-600 mt-1 mono">
          <span>30d ago</span>
          <span>15d ago</span>
          <span>today</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Plan mix</div>
          <div className="flex gap-4 flex-wrap text-sm">
            {Object.entries(byType).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className={`chip text-xs ${k==='pro'?'bg-amber-900/40 text-amber-300':k==='institutional'?'bg-cyan-900/40 text-cyan-300':'bg-slate-800 text-slate-300'}`}>{k}</span>
                <span className="text-white font-semibold">{v}</span>
              </div>
            ))}
            {!Object.keys(byType).length && <span className="text-slate-500 text-sm">No users yet.</span>}
          </div>
        </div>
        <div className="card rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Events · last 7 days</div>
          {Object.keys(evMix).length === 0 ? (
            <div className="text-slate-500 text-sm">No events logged yet. Start using the app — events will populate here.</div>
          ) : (
            <div className="space-y-1.5 text-sm">
              {Object.entries(evMix).sort((a,b) => b[1] - a[1]).map(([t, n]) => (
                <div key={t} className="flex items-center justify-between">
                  <span className="text-slate-300 mono text-xs">{t}</span>
                  <span className="text-white font-semibold">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Users tab ------------------------------------------------------------
function AdminUsers({ users, onRefresh }) {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("updated_at"); // 'updated_at' | 'created_at' | 'xp' | 'cases'
  const [planFilter, setPlanFilter] = useState(""); // '' | 'free' | 'pro' | 'institutional'
  const [expanded, setExpanded] = useState(null);
  const [planBusyFor, setPlanBusyFor] = useState(null);
  const [planErr, setPlanErr] = useState("");

  async function handlePlanChange(userId, newType) {
    setPlanBusyFor(userId); setPlanErr("");
    try {
      await window.BQAuth.setUserType(userId, newType);
      onRefresh?.();
    } catch (e) {
      setPlanErr((e && e.message) || "Could not update plan.");
    } finally {
      setPlanBusyFor(null);
    }
  }

  function exportCSV() {
    const rows = (users || []).map(u => ({
      user_id: u.user_id,
      email: u.email || "",
      user_type: u.user_type || "free",
      display_name: u.state?.display_name || "",
      xp: u.state?.xp || 0,
      level: (typeof levelFromXP === "function") ? levelFromXP(u.state?.xp || 0) : Math.floor(Math.sqrt((u.state?.xp||0)/50)) + 1,
      cases_completed: u.state?.completed?.length || 0,
      total_answered: u.state?.stats?.totalAnswered || 0,
      total_correct: u.state?.stats?.totalCorrect || 0,
      current_streak: u.state?.currentStreak || 0,
      best_streak: u.state?.bestStreak || 0,
      onboarding: u.state?.onboardingCompletedAt ? "completed" : u.state?.onboardingSkippedAt ? "skipped" : "none",
      diagnostic_label: u.state?.diagnosticProfile?.label || "",
      study_path: u.state?.studyPath || "",
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
    downloadCSV(`biostatquest-users-${new Date().toISOString().slice(0,10)}.csv`, rows);
  }

  const filtered = (users || []).filter(u => {
    if (planFilter && (u.user_type || "free") !== planFilter) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (u.email || "").toLowerCase().includes(ql) || (u.state?.display_name || "").toLowerCase().includes(ql);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "xp") return (b.state?.xp || 0) - (a.state?.xp || 0);
    if (sortBy === "cases") return (b.state?.completed?.length || 0) - (a.state?.completed?.length || 0);
    if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const fmt = (iso) => {
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      const day = 24 * 3600e3;
      if (diff < 60e3) return "just now";
      if (diff < 3600e3) return Math.round(diff/60e3) + "m ago";
      if (diff < day) return Math.round(diff/3600e3) + "h ago";
      if (diff < 30*day) return Math.round(diff/day) + "d ago";
      return fmtDate(d);
    } catch { return iso; }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email or display name…"
          className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"/>
        <select value={planFilter} onChange={e=>setPlanFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="institutional">Institutional</option>
        </select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="updated_at">Last active ↓</option>
          <option value="created_at">Signup date ↓</option>
          <option value="xp">XP ↓</option>
          <option value="cases">Cases completed ↓</option>
        </select>
        <button onClick={exportCSV} disabled={!users?.length}
          className="btn btn-ghost px-3 py-2 rounded-lg text-sm disabled:opacity-40">Export CSV</button>
        <div className="text-xs text-slate-500 mono shrink-0">{sorted.length} {sorted.length === 1 ? "user" : "users"}</div>
      </div>
      {planErr && <div className="card rounded-xl p-3 text-sm text-red-400">{planErr}</div>}

      {sorted.length === 0 && (
        <div className="card rounded-xl p-8 text-center text-slate-500 text-sm">
          No users match.
        </div>
      )}

      <div className="card rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-1 text-right">Lvl</div>
          <div className="col-span-1 text-right">XP</div>
          <div className="col-span-1 text-right">Cases</div>
          <div className="col-span-1 text-right">Streak</div>
          <div className="col-span-2 text-right">Last active</div>
        </div>
        {sorted.map((u) => {
          const s = u.state || {};
          const lvl = (typeof levelFromXP === "function") ? levelFromXP(s.xp || 0) : Math.floor(Math.sqrt((s.xp||0)/50)) + 1;
          const isOpen = expanded === u.user_id;
          return (
            <div key={u.user_id} className="border-t border-slate-800/60">
              <button
                onClick={() => setExpanded(isOpen ? null : u.user_id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-900/40 transition">
                <div className="grid md:grid-cols-12 gap-2 md:gap-3 items-center text-sm">
                  <div className="md:col-span-4 min-w-0">
                    <div className="text-slate-100 truncate">{u.email || <span className="text-slate-600 italic">no email</span>}</div>
                    {s.display_name && <div className="text-[11px] text-slate-500 truncate">{s.display_name}</div>}
                  </div>
                  <div className="md:col-span-2"><span className={`chip text-xs ${u.user_type==='pro'?'bg-amber-900/40 text-amber-300':u.user_type==='institutional'?'bg-cyan-900/40 text-cyan-300':'bg-slate-800 text-slate-300'}`}>{u.user_type || "free"}</span></div>
                  <div className="md:col-span-1 md:text-right text-slate-300 mono text-xs">Lv {lvl}</div>
                  <div className="md:col-span-1 md:text-right text-slate-300 mono text-xs">{fmtNumber(s.xp || 0)}</div>
                  <div className="md:col-span-1 md:text-right text-slate-300 mono text-xs">{(s.completed?.length) || 0}</div>
                  <div className="md:col-span-1 md:text-right text-slate-300 mono text-xs">{s.currentStreak || 0}</div>
                  <div className="md:col-span-2 md:text-right text-slate-500 mono text-xs">{fmt(u.updated_at)}</div>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-800/60 bg-slate-950/30">
                  <AdminErrorBoundary>
                  <div className="pt-3 mb-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">Set plan →</span>
                    {["free", "pro", "institutional"].map((p) => {
                      const isCurrent = (u.user_type || "free") === p;
                      return (
                        <button key={p}
                          onClick={() => !isCurrent && handlePlanChange(u.user_id, p)}
                          disabled={planBusyFor === u.user_id || isCurrent}
                          className={`chip text-xs ${isCurrent ? (p==='pro'?'bg-amber-900/60 text-amber-200 ring-1 ring-amber-500/50':p==='institutional'?'bg-cyan-900/60 text-cyan-200 ring-1 ring-cyan-500/50':'bg-slate-700 text-slate-100 ring-1 ring-slate-500/50') : 'bg-slate-800 text-slate-400 hover:text-white'} disabled:cursor-not-allowed`}>
                          {isCurrent ? (<span className="inline-flex items-center gap-1.5"><Ico name="check" size={10}/> {p}</span>) : p}
                        </button>
                      );
                    })}
                    {planBusyFor === u.user_id && <span className="text-xs text-slate-500">updating…</span>}
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 text-xs text-slate-300">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Account</div>
                      <div>User ID: <span className="mono text-slate-400">{u.user_id}</span></div>
                      <div>Signed up: <span className="text-slate-200">{fmtDateTime(u.created_at)}</span></div>
                      <div>Last saved: <span className="text-slate-200">{fmtDateTime(u.updated_at)}</span></div>
                      <div>Onboarding: {s.onboardingCompletedAt ? <span className="text-emerald-300">completed</span> : s.onboardingSkippedAt ? <span className="text-slate-400">skipped</span> : <span className="text-amber-300">not taken</span>}</div>
                      {typeof s.diagnosticProfile?.label === "string" && (
                        <div>Diagnostic profile: <span className="text-slate-200">{s.diagnosticProfile.label}</span></div>
                      )}
                      {Array.isArray(s.studyPath) && s.studyPath.length > 0 && (
                        <div>Study path: <span className="text-slate-200">{s.studyPath.map(p => p?.caseId || p).filter(x => typeof x === "string").join(" → ") || `${s.studyPath.length} steps`}</span></div>
                      )}
                      {typeof s.learnerGoal === "string" && s.learnerGoal && (
                        <div>Goal: <span className="text-slate-200">{s.learnerGoal}</span></div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Progress</div>
                      <div>Total answered: <span className="mono text-slate-200">{s.stats?.totalAnswered || 0}</span></div>
                      <div>Total correct: <span className="mono text-slate-200">{s.stats?.totalCorrect || 0}</span> ({s.stats?.totalAnswered ? Math.round((s.stats.totalCorrect/s.stats.totalAnswered)*100) : 0}%)</div>
                      <div>Best streak: <span className="mono text-slate-200">{s.bestStreak || 0}</span></div>
                      <div>Badges: <span className="mono text-slate-200">{s.badges?.length || 0}</span></div>
                      <div>Completed cases: <span className="mono text-slate-200">{s.completed?.length || 0}</span></div>
                      {s.completed?.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {s.completed.slice(0, 12).map((id) => (
                            <span key={id} className="mono text-[10px] bg-slate-800 text-slate-400 rounded px-1.5 py-0.5">{id}</span>
                          ))}
                          {s.completed.length > 12 && <span className="text-[10px] text-slate-500">+{s.completed.length - 12} more</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  </AdminErrorBoundary>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Content tab ----------------------------------------------------------
// Case-by-case health. Aggregates: (a) how many users have completed each
// case (from user_progress.state.completed), (b) how many reports touch
// questions in this case (from question_reports.case_id), (c) how many
// events touch this case (from events.case_id). Click a case → drill into
// questions, each with its own report count so problem items surface fast.
function AdminContent({ users, reports, events }) {
  const [expanded, setExpanded] = useState(null);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("reports"); // 'reports' | 'completions' | 'order'

  const userList = users || [];
  const reportList = reports || [];
  const eventList = events || [];

  // Aggregate by case
  const completionsByCase = {};
  for (const u of userList) for (const id of (u.state?.completed || [])) completionsByCase[id] = (completionsByCase[id] || 0) + 1;

  const reportsByCase = {};
  const reportsByQid = {};
  for (const r of reportList) {
    if (r.case_id) reportsByCase[r.case_id] = (reportsByCase[r.case_id] || 0) + 1;
    if (r.qid) reportsByQid[r.qid] = (reportsByQid[r.qid] || 0) + 1;
  }

  const startsByCase = {};
  const completesByCase = {};
  const accuracyByQid = {}; // { qid: { correct, total } }
  for (const e of eventList) {
    if (e.type === "case_start" && e.case_id) startsByCase[e.case_id] = (startsByCase[e.case_id] || 0) + 1;
    if (e.type === "case_complete" && e.case_id) completesByCase[e.case_id] = (completesByCase[e.case_id] || 0) + 1;
    if ((e.type === "answer_correct" || e.type === "answer_wrong") && e.qid) {
      const bucket = accuracyByQid[e.qid] || { correct: 0, total: 0 };
      bucket.total += 1;
      if (e.type === "answer_correct") bucket.correct += 1;
      accuracyByQid[e.qid] = bucket;
    }
  }

  const enriched = CASES.map((c, i) => ({
    id: c.id,
    title: c.title,
    branch: c.branch,
    order: i,
    bankSize: c.bank?.length || 0,
    completions: completionsByCase[c.id] || 0,
    starts: startsByCase[c.id] || 0,
    completes: completesByCase[c.id] || 0,
    reports: reportsByCase[c.id] || 0,
    // Completion rate from events: what % of case_start events reached case_complete
    completionRate: startsByCase[c.id] ? Math.round((completesByCase[c.id] || 0) / startsByCase[c.id] * 100) : null,
  }));

  const filtered = enriched.filter(c => !q || c.title.toLowerCase().includes(q.toLowerCase()) || c.id.includes(q.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "reports") return b.reports - a.reports;
    if (sortBy === "completions") return b.completions - a.completions;
    return a.order - b.order;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search case title or id…"
          className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"/>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="reports">Most reports ↓</option>
          <option value="completions">Most completions ↓</option>
          <option value="order">Catalog order</option>
        </select>
        <div className="text-xs text-slate-500 mono shrink-0">{sorted.length} cases</div>
      </div>

      <div className="card rounded-xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
          <div className="col-span-5">Case</div>
          <div className="col-span-2">Branch</div>
          <div className="col-span-1 text-right">Qs</div>
          <div className="col-span-1 text-right">Users done</div>
          <div className="col-span-1 text-right">Start→Done</div>
          <div className="col-span-2 text-right">Reports</div>
        </div>
        {sorted.map(c => {
          const isOpen = expanded === c.id;
          const fullCase = CASES.find(x => x.id === c.id);
          return (
            <div key={c.id} className="border-t border-slate-800/60">
              <button onClick={() => setExpanded(isOpen ? null : c.id)}
                className="w-full text-left px-4 py-3 hover:bg-slate-900/40 transition">
                <div className="grid md:grid-cols-12 gap-2 items-center text-sm">
                  <div className="md:col-span-5 min-w-0">
                    <div className="text-white truncate">{c.title}</div>
                    <div className="text-[11px] mono text-slate-500">{c.id}</div>
                  </div>
                  <div className="md:col-span-2"><span className="chip text-xs bg-slate-800 text-slate-300">{c.branch}</span></div>
                  <div className="md:col-span-1 md:text-right mono text-xs text-slate-400">{c.bankSize}</div>
                  <div className="md:col-span-1 md:text-right mono text-xs text-slate-300">{c.completions}</div>
                  <div className="md:col-span-1 md:text-right mono text-xs text-slate-300">{c.completionRate === null ? "–" : `${c.completionRate}%`}</div>
                  <div className="md:col-span-2 md:text-right mono text-xs">
                    <span className={c.reports > 0 ? "text-amber-300 font-semibold" : "text-slate-500"}>{c.reports}</span>
                  </div>
                </div>
              </button>
              {isOpen && fullCase && (
                <div className="px-4 pb-4 border-t border-slate-800/60 bg-slate-950/30 pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Questions · accuracy from events · reports</div>
                  <div className="space-y-1">
                    {fullCase.bank.map((qq) => {
                      const acc = accuracyByQid[qq.qid];
                      const accPct = acc && acc.total ? Math.round((acc.correct / acc.total) * 100) : null;
                      const rpt = reportsByQid[qq.qid] || 0;
                      return (
                        <div key={qq.qid} className="flex items-start gap-2 text-xs py-1.5 border-b border-slate-800/40 last:border-0">
                          <span className="mono text-slate-500 shrink-0 w-14 truncate">{qq.qid}</span>
                          <span className="flex-1 text-slate-300 truncate">{qq.q}</span>
                          <span className="shrink-0 mono text-slate-400 w-16 text-right">
                            {accPct === null ? <span className="text-slate-600">–</span> : <span className={accPct < 50 ? "text-amber-300" : "text-slate-400"}>{accPct}%</span>}
                            {acc && <span className="text-slate-600"> ({acc.total})</span>}
                          </span>
                          <span className="shrink-0 w-10 text-right">
                            {rpt > 0 ? <span className="chip text-[10px] bg-amber-900/40 text-amber-300 inline-flex items-center gap-1"><Ico name="flag" size={10}/> {rpt}</span> : <span className="text-slate-700">–</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Waitlist tab (email_signups) ----------------------------------------
function AdminWaitlist() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  async function load() {
    setRows(null); setErr("");
    try {
      const d = await window.BQAuth.fetchEmailSignups();
      setRows(d || []);
    } catch (e) {
      setErr((e && e.message) || "Could not load waitlist.");
      setRows([]);
    }
  }
  useEffect(() => { load(); }, []);

  const sources = Array.from(new Set((rows || []).map(r => r.source).filter(Boolean)));
  const filtered = (rows || []).filter(r => {
    if (sourceFilter && r.source !== sourceFilter) return false;
    if (!q) return true;
    return (r.email || "").toLowerCase().includes(q.toLowerCase());
  });

  function exportCSV() {
    downloadCSV(`biostatquest-waitlist-${new Date().toISOString().slice(0,10)}.csv`,
      filtered.map(r => ({ email: r.email, source: r.source || "", created_at: r.created_at })));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email…"
          className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"/>
        <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">Refresh</button>
        <button onClick={exportCSV} disabled={!filtered.length}
          className="btn btn-ghost px-3 py-2 rounded-lg text-sm disabled:opacity-40">Export CSV</button>
        <div className="text-xs text-slate-500 mono shrink-0">{filtered.length} emails</div>
      </div>
      {err && <div className="card rounded-xl p-4 text-sm text-red-400">{err}</div>}
      {rows === null && <div className="text-slate-500 text-sm">Loading…</div>}
      {rows && filtered.length === 0 && (
        <div className="card rounded-xl p-10 text-center text-slate-500">
          <div className="text-sm">No signups match.</div>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="card rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
            <div className="col-span-7">Email</div>
            <div className="col-span-3">Source</div>
            <div className="col-span-2 text-right">Signed up</div>
          </div>
          {filtered.map(r => (
            <div key={r.id} className="grid grid-cols-12 gap-3 px-4 py-2 border-t border-slate-800/60 text-sm">
              <div className="col-span-7 text-slate-100 truncate">{r.email}</div>
              <div className="col-span-3"><span className="chip text-xs bg-slate-800 text-slate-400">{r.source || "unknown"}</span></div>
              <div className="col-span-2 text-right text-slate-500 mono text-xs">{fmtDate(r.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Activity tab (event feed) -------------------------------------------
function AdminActivity({ events }) {
  const [typeFilter, setTypeFilter] = useState("");
  const [q, setQ] = useState("");

  const [audience, setAudience] = useState(""); // '' | 'guest' | 'user'

  const evs = events || [];
  const types = Array.from(new Set(evs.map(e => e.type))).sort();
  const filtered = evs.filter(e => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (audience === "guest" && e.user_id) return false;
    if (audience === "user" && !e.user_id) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (e.user_email || "").toLowerCase().includes(ql)
        || (e.qid || "").toLowerCase().includes(ql)
        || (e.case_id || "").toLowerCase().includes(ql)
        || (e.visitor_id || "").toLowerCase().includes(ql);
  });

  const iconFor = (t) => {
    if (t === "signup") return { node: <span className="w-1.5 h-1.5 rounded-full bg-current"/>, cls: "bg-emerald-900/40 text-emerald-300" };
    if (t === "session_start") return { node: "→", cls: "bg-slate-800 text-slate-400" };
    if (t === "guest_visit") return { node: "◌", cls: "bg-slate-800 text-slate-500" };
    if (t === "case_start") return { node: "▶", cls: "bg-purple-900/40 text-purple-300" };
    if (t === "case_complete") return { node: <Ico name="check" size={12}/>, cls: "bg-cyan-900/40 text-cyan-300" };
    if (t === "answer_correct") return { node: <Ico name="check" size={12}/>, cls: "bg-emerald-950/40 text-emerald-400" };
    if (t === "answer_wrong") return { node: <Ico name="cross" size={12}/>, cls: "bg-red-950/40 text-red-400" };
    if (t === "report_filed") return { node: <Ico name="flag" size={12}/>, cls: "bg-amber-900/40 text-amber-300" };
    if (t === "diagnostic_complete") return { node: "◎", cls: "bg-cyan-900/40 text-cyan-300" };
    if (t === "diagnostic_skipped") return { node: "↷", cls: "bg-slate-800 text-slate-400" };
    return { node: "·", cls: "bg-slate-800 text-slate-400" };
  };

  const fmt = (iso) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60e3) return "just now";
    if (diff < 3600e3) return Math.round(diff/60e3) + "m ago";
    if (diff < 86400e3) return Math.round(diff/3600e3) + "h ago";
    return fmtDateTime(d);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search email, qid, case, or visitor…"
          className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500"/>
        <select value={audience} onChange={e=>setAudience(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="">All audiences</option>
          <option value="user">Signed in</option>
          <option value="guest">Guests only</option>
        </select>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
          <option value="">All event types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="text-xs text-slate-500 mono shrink-0">{filtered.length} events · {evs.length} loaded</div>
      </div>

      {evs.length === 0 && (
        <div className="card rounded-xl p-10 text-center text-slate-400 text-sm">
          <p>No events logged yet. Use the app — events will appear here.</p>
          <p className="text-xs text-slate-500 mt-2">Signups, sessions, case plays, answers, and reports are tracked.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="card rounded-xl overflow-hidden divide-y divide-slate-800/60">
          {filtered.map(e => {
            const ic = iconFor(e.type);
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-sm hover:bg-slate-900/40 transition">
                <span className={`shrink-0 w-6 h-6 rounded inline-flex items-center justify-center text-xs font-bold ${ic.cls}`}>{ic.node}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="mono text-xs text-slate-300">{e.type}</span>
                    {e.case_id && <span className="mono text-xs text-slate-500">case: {e.case_id}</span>}
                    {e.qid && <span className="mono text-xs text-slate-500">qid: {e.qid}</span>}
                    {e.method && <span className="mono text-xs text-slate-500">· {e.method}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-2 flex-wrap">
                    {e.user_email ? (
                      <span className="text-slate-400">{e.user_email}</span>
                    ) : e.visitor_id ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="chip text-[10px] bg-slate-800 text-slate-500">guest</span>
                        <span className="mono text-slate-600">{e.visitor_id.slice(0, 8)}</span>
                      </span>
                    ) : (
                      <span className="italic text-slate-600">anonymous</span>
                    )}
                    {e.data && Object.keys(e.data).length > 0 && (
                      <span className="mono text-slate-600 truncate">· {Object.entries(e.data).map(([k,v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500 mono">{fmt(e.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Telemetry tab (S — telemetry-driven content quality view) ----------
// Reads two admin RPCs over question_attempts:
//   • Top misconceptions: which tags fire most often (drives F8 ledger
//     priorities and content gaps).
//   • Question stats: per-qid n / accuracy / dominant distractor share
//     (low-accuracy + high-dominant-distractor = pedagogical signal worth
//     reviewing). Sorted ascending by accuracy so the worst items float up.
//
// Both views are read-only here; turning a row into a content-edit action
// (e.g. "open in Glossary editor") is a later iteration.
function AdminTelemetry() {
  const [days, setDays] = useState(30);
  const [tags, setTags] = useState(null);
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = React.useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const [t, s] = await Promise.all([
        window.BQAuth.adminFetchTopMisconceptions(days),
        window.BQAuth.adminFetchQuestionStats(days, 5),
      ]);
      setTags(t || []);
      setStats(s || []);
    } catch (e) {
      setErr((e && e.message) || "Could not load telemetry.");
    } finally {
      setBusy(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totalAttempts = (stats || []).reduce((s, r) => s + (r.n || 0), 0);
  const meanAccuracy = stats && stats.length
    ? (stats.reduce((s, r) => s + (r.accuracy || 0), 0) / stats.length)
    : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-xs uppercase tracking-widest text-slate-500">Window</label>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm">
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>1 year</option>
        </select>
        <button onClick={load} disabled={busy} className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs disabled:opacity-40">
          {busy ? "Loading…" : "Refresh"}
        </button>
        {stats && (
          <span className="text-xs text-slate-500 mono">
            {stats.length} questions · {totalAttempts.toLocaleString()} attempts · mean acc {(meanAccuracy * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {err && <div className="card rounded-xl p-4 mb-4 text-sm text-red-400">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top misconceptions */}
        <div className="card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Top misconceptions</h3>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">tag · count · last</span>
          </div>
          {tags === null ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : tags.length === 0 ? (
            <div className="text-slate-500 text-sm">No tagged attempts in this window yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {tags.map((t) => (
                    <tr key={t.tag} className="border-b border-slate-800/50 last:border-0">
                      <td className="py-1.5 pr-3 mono text-[12px] text-slate-200">{t.tag}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-100 font-semibold">{t.cnt}</td>
                      <td className="py-1.5 text-right text-[11px] text-slate-500 mono">{t.lastSeen ? new Date(t.lastSeen).toISOString().slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Question stats — worst-accuracy first */}
        <div className="card rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Lowest-accuracy questions</h3>
            <span className="text-[10px] uppercase tracking-widest text-slate-500">qid · n · acc · top distractor</span>
          </div>
          {stats === null ? (
            <div className="text-slate-500 text-sm">Loading…</div>
          ) : stats.length === 0 ? (
            <div className="text-slate-500 text-sm">No questions with ≥5 attempts in this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {stats.map((r) => {
                    const acc = Math.round(r.accuracy * 100);
                    const accClass = acc < 30 ? "text-red-300"
                                   : acc < 50 ? "text-amber-300"
                                   : acc < 75 ? "text-yellow-200"
                                   :            "text-emerald-300";
                    return (
                      <tr key={r.qid} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-1.5 pr-3 mono text-[12px] text-slate-200">{r.qid}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-400 mono text-[11px]">n={r.n}</td>
                        <td className={`py-1.5 pr-3 text-right font-semibold ${accClass}`}>{acc}%</td>
                        <td className="py-1.5 text-right text-[11px] text-slate-500 mono truncate max-w-[140px]">
                          {r.topDistractor != null ? `${r.topDistractor} (${r.topDistractorPct != null ? Math.round(r.topDistractorPct * 100) : 0}%)` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Reports tab (the existing triage queue, now embedded) ---------------
function AdminReportsTab() {
  const [rows, setRows] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editResolution, setEditResolution] = useState("");
  const [editStatus, setEditStatus] = useState("fixed");

  async function load() {
    setRows(null); setErr("");
    try {
      const data = await window.BQAuth.fetchQuestionReports(statusFilter || undefined);
      setRows(data || []);
    } catch (e) {
      setErr((e && e.message) || "Could not load reports.");
      setRows([]);
    }
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function saveEdit(id) {
    try {
      await window.BQAuth.updateQuestionReport(id, { status: editStatus, resolution: editResolution });
      setEditingId(null); setEditResolution(""); setEditStatus("fixed");
      load();
    } catch (e) {
      setErr((e && e.message) || "Update failed.");
    }
  }

  const counts = Array.isArray(rows) ? rows.length : "–";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="text-sm text-slate-400">Triage queue · {counts} {statusFilter || "all"}</div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100">
            <option value="open">Open</option>
            <option value="triaged">Triaged</option>
            <option value="fixed">Fixed</option>
            <option value="wontfix">Won't fix</option>
            <option value="duplicate">Duplicate</option>
            <option value="">All</option>
          </select>
          <button onClick={load} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">Refresh</button>
        </div>
      </div>

      {err && <div className="card rounded-xl p-4 mb-4 text-sm text-red-400">{err}</div>}
      {rows === null && <div className="text-slate-500 text-sm">Loading…</div>}
      {rows && rows.length === 0 && (
        <div className="card rounded-xl p-10 text-center text-slate-400">
          <div className="mb-3 text-emerald-400 inline-flex items-center justify-center"><Ico name="check" size={40}/></div>
          <div className="font-semibold text-white mb-1">No {statusFilter || ""} reports.</div>
          <div className="text-sm">You're caught up.</div>
        </div>
      )}

      <div className="space-y-3">
        {rows && rows.map((r) => {
          const isEditing = editingId === r.id;
          return (
            <div key={r.id} className="card rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="mono text-xs text-purple-300">{r.qid}</span>
                    {r.case_id && <span className="mono text-xs text-slate-500">· {r.case_id}</span>}
                    <span className={`chip text-xs ${r.status==='open'?'bg-amber-900/40 text-amber-300':r.status==='fixed'?'bg-emerald-900/40 text-emerald-300':'bg-slate-800 text-slate-300'}`}>{r.status}</span>
                    <span className="chip text-xs bg-slate-800 text-slate-300">{r.reason}</span>
                  </div>
                  {r.comment && (
                    <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap border-l-2 border-amber-600/60 pl-3 py-0.5">
                      <span className="uppercase tracking-wider text-amber-400 text-[10px] font-semibold block mb-0.5">Reporter's note</span>
                      {r.comment}
                    </div>
                  )}
                  <ReportedQuestionDetail qid={r.qid}/>
                  <div className="text-[11px] text-slate-500 mt-2 mono">
                    {fmtDateTime(r.created_at)} · {r.user_email || "anon"}
                  </div>
                  {r.resolution && (
                    <div className="mt-2 text-xs text-slate-400 border-l-2 border-slate-700 pl-3">
                      <span className="uppercase tracking-wider text-slate-500">Resolution · </span>{r.resolution}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {!isEditing ? (
                    <button onClick={() => { setEditingId(r.id); setEditResolution(r.resolution || ""); setEditStatus(r.status === "open" ? "fixed" : r.status); }}
                      className="btn btn-ghost px-3 py-1.5 rounded text-xs">Resolve…</button>
                  ) : (
                    <div className="text-xs text-slate-500">editing</div>
                  )}
                </div>
              </div>
              {isEditing && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs uppercase tracking-widest text-slate-400 w-20">Status</label>
                    <select value={editStatus} onChange={e=>setEditStatus(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100">
                      <option value="triaged">Triaged</option>
                      <option value="fixed">Fixed</option>
                      <option value="wontfix">Won't fix</option>
                      <option value="duplicate">Duplicate</option>
                      <option value="open">Re-open</option>
                    </select>
                  </div>
                  <textarea value={editResolution} onChange={e=>setEditResolution(e.target.value.slice(0, 500))}
                    rows={2} placeholder="Resolution note (what you changed, why, or why not)"
                    className="w-full p-2 rounded bg-slate-950/60 border border-slate-700 text-slate-100 text-xs"/>
                  <div className="flex gap-2 justify-end">
                    <button onClick={()=>setEditingId(null)} className="btn btn-ghost px-3 py-1.5 rounded text-xs">Cancel</button>
                    <button onClick={()=>saveEdit(r.id)} className="btn btn-primary px-3 py-1.5 rounded text-xs">Save</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Admin panel shell ---------------------------------------------------
function AdminReports({ onHome }) {
  // Reactive admin gate: re-evaluate on every auth change so a fresh tab
  // that opens /?admin=1 before BQAuth.init() finishes hydrating doesn't
  // get a permanent "page not found." authReady tracks whether we've
  // received at least one auth signal — until then we render nothing
  // (empty page) rather than flashing the not-found state.
  const [isAdmin, setIsAdmin] = useState<boolean>(() => window.BQAuth?.isAdmin?.() ?? false);
  const [authReady, setAuthReady] = useState<boolean>(() => !!window.BQAuth?.getUser?.() || isAdmin);
  useEffect(() => {
    const off = window.BQAuth?.onAuthChange?.(() => {
      setIsAdmin(window.BQAuth?.isAdmin?.() ?? false);
      setAuthReady(true);
    });
    return () => { if (typeof off === "function") off(); };
  }, []);

  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState(null);
  const [openReports, setOpenReports] = useState(null);
  const [allReports, setAllReports] = useState(null); // used by Content tab for qid/case aggregation
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState("");

  async function loadShared() {
    try {
      const [u, rc, rep, ev] = await Promise.all([
        window.BQAuth.fetchAllUsers(),
        window.BQAuth.fetchReportsCount(),
        window.BQAuth.fetchQuestionReports(),
        window.BQAuth.fetchRecentEvents(500),
      ]);
      setUsers(u || []);
      setOpenReports(rc);
      setAllReports(rep || []);
      setEvents(ev || []);
    } catch (e) {
      setErr((e && e.message) || "Could not load admin data.");
    }
  }
  useEffect(() => { if (isAdmin) loadShared(); }, [isAdmin]);

  // While auth is still hydrating, render nothing — avoids a flash of
  // "page not found" for a real admin who deep-links into /?admin=1.
  if (!authReady) return <div className="min-h-[40vh]" />;

  // Non-admins see a generic "page not found" rather than "Admin only" —
  // the existence of an admin area shouldn't be advertised to anyone who
  // happens to type ?admin=1 in the URL.
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6 fade-in">
        <div className="card rounded-2xl p-8 text-center">
          <h2 className="t-title mb-3">Page not found</h2>
          <p className="t-body text-slate-400 mb-6">The link you followed didn't lead anywhere we could load.</p>
          <button onClick={onHome} className="btn btn-primary px-5 py-2 rounded-lg">← Home</button>
        </div>
      </div>
    );
  }

  const tabs = [
    ["overview",  "Overview"],
    ["users",     `Users${users ? ` (${users.length})` : ""}`],
    ["content",   "Content"],
    ["activity",  `Activity${events ? ` (${events.length})` : ""}`],
    ["telemetry", "Telemetry"],
    ["waitlist",  "Waitlist"],
    ["reports",   `Reports${openReports != null ? ` (${openReports})` : ""}`],
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="t-title mb-1">Admin</h2>
          <p className="t-body text-slate-400 text-sm">Activity dashboard · signed in as <span className="text-slate-300">{window.BQAuth?.getUser?.()?.email}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadShared} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">Refresh</button>
          <button onClick={onHome} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Home</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-800 mb-5 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === k
                ? "border-purple-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}>
            {l}
          </button>
        ))}
      </div>

      {err && <div className="card rounded-xl p-4 mb-4 text-sm text-red-400">{err}</div>}

      <AdminErrorBoundary>
        {tab === "overview" && <AdminOverview users={users} openReportsCount={openReports} events={events} reports={allReports} onNavigate={setTab}/>}
        {tab === "users"    && (users === null ? <div className="text-slate-500 text-sm">Loading…</div> : <AdminUsers users={users} onRefresh={loadShared}/>)}
        {tab === "content"  && <AdminContent users={users} reports={allReports} events={events}/>}
        {tab === "activity"  && <AdminActivity events={events}/>}
        {tab === "telemetry" && <AdminTelemetry/>}
        {tab === "waitlist"  && <AdminWaitlist/>}
        {tab === "reports"  && <AdminReportsTab/>}
      </AdminErrorBoundary>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
function App() {
  const [state, setState] = useState(loadState());

  // URL ↔ view sync. The initial view is resolved once; thereafter the
  // wrapped setView pushes URL updates, and popstate (back/forward) is
  // handled via the effect below.
  const { path: urlPath, navigate } = useUrlPath();

  // First-run routing: zero-progress + never-decided users land on onboarding.
  const [view, _setView] = useState(() => {
    if (typeof window !== "undefined") {
      // Class invite landing — vercel.json rewrites /join → /biostat-quest
      // so the React app handles the URL. Check the pathname first; query-
      // param token is read inside JoinView from window.location.search.
      if (window.location.pathname === "/join") return "join";
      const qs = new URLSearchParams(window.location.search);
      // Back-compat triggers: pre-URL-routing era used ?admin=1 / #admin.
      // Honor them and replace the URL with the canonical /admin so the
      // back button doesn't take the user to ?admin=1 ad infinitum.
      if (qs.get("admin") === "1" || window.location.hash === "#admin") {
        try { window.history.replaceState(null, "", "/admin"); } catch {}
        return "admin";
      }
      // Intent-to-sign-in (e.g. landing page "Sign in" → ?auth=1) should mount
      // the TopBar so AuthButton can open its modal; skip onboarding for now.
      if (qs.get("auth") === "1") return "home";
      // Honor an explicit URL path. /teach, /admin, /glossary, etc. all
      // route here without query-param hacks.
      const fromUrl = viewFromPath(window.location.pathname);
      if (fromUrl) return fromUrl;
    }
    const glossaryHash = typeof window !== "undefined" ? parseGlossaryHash(window.location.hash) : null;
    if (glossaryHash) return "glossary";
    const s = loadState();
    const neverDecided = !s.onboardingCompletedAt && !s.onboardingSkippedAt;
    const zeroProgress = (s.completed || []).length === 0 && (s.xp || 0) === 0;
    // Interstitial diagnostic gate is reserved for first-time guests. Signed-in
    // users — even with zero progress — go straight to home and see the
    // diagnostic as a dismissible prompt card; gating an established account
    // behind a "find your weak spots" wall every visit was a UX bug. Detect
    // sign-in via Supabase's localStorage entry rather than waiting for
    // BQAuth.init() so we get the correct answer on the first paint.
    let isSignedInOnMount = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) { isSignedInOnMount = true; break; }
      }
    } catch { /* sandboxed contexts → treat as guest */ }
    return neverDecided && zeroProgress && !isSignedInOnMount ? "onboarding" : "home";
  });

  // Wrapped setView: every state change also pushes the canonical URL
  // (when the view has one). Transient views — play / select / result —
  // leave the URL alone since they need params we haven't put there yet.
  // Phase 6's view extraction is the natural moment to migrate those
  // to /case/:caseId / /case/:caseId/play / /case/:caseId/result.
  const setView = React.useCallback((next: string) => {
    _setView(next);
    if (viewHasUrl(next)) {
      const path = pathFromView(next);
      if (path) navigate(path);
    }
  }, [navigate]);

  // Browser back/forward: when the URL changes (popstate fires inside
  // useUrlPath), reconcile the view to whatever the URL now says. Skip
  // the join view because /join is handled by its own initial-resolver
  // path and JoinView reads its token directly from window.location.
  useEffect(() => {
    if (urlPath === "/join") return;
    const fromUrl = viewFromPath(urlPath);
    if (fromUrl && fromUrl !== view) _setView(fromUrl);
  }, [urlPath]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeCase, setActiveCase] = useState(null);
  const [activeDiff, setActiveDiff] = useState("intern");
  const [activeQuestions, setActiveQuestions] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [initialBranch, setInitialBranch] = useState(null);
  const [glossaryRequest, setGlossaryRequest] = useState(() => {
    const parsed = typeof window !== "undefined" ? parseGlossaryHash(window.location.hash) : null;
    return parsed ? { ...parsed, nonce: Date.now() } : null;
  });
  // Phase 3: which achievement (if any) is currently being shared.
  const [sharePending, setSharePending] = useState(null);
  // Phase 3a billing: subscription state + paywall modal trigger.
  const { sub, reload: reloadSub } = useSubscription();
  const [paywall, setPaywall] = useState(null); // null | { reason, caseTitle? }

  // Welcome-back banner after a successful Stripe checkout. Also re-pulls
  // subscription state so the UI reflects the new plan immediately.
  const [billingToast, setBillingToast] = useState(null); // null | 'success' | 'cancelled'
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const b = qs.get("billing");
      if (b === "success" || b === "cancelled" || b === "portal-return") {
        if (b === "success") setBillingToast("success");
        reloadSub();
        // Clean the URL so reloads don't re-fire the banner.
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
  }, [reloadSub]);

  useEffect(() => saveState(state), [state]);

  // Existing users with progress but no onboarding decision: mark them as
  // skipped so we never interrupt their flow with a diagnostic.
  useEffect(() => {
    if (!state.onboardingCompletedAt && !state.onboardingSkippedAt &&
        ((state.completed?.length || 0) > 0 || (state.xp || 0) > 0)) {
      setState((s) => ({ ...s, onboardingSkippedAt: Date.now() }));
    }
  }, []);

  // Instructor auto-skip: if the signed-in user owns or co-owns any class,
  // they aren't the audience for "find your weak spots in 6 minutes" — they
  // teach this stuff. Mark onboarding as skipped so the prompt card on home
  // doesn't keep nagging them. Re-checks on auth change so a freshly-signed-
  // in instructor identity gets the same treatment without a reload.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const signedIn = !!(window.BQAuth?.getUser?.());
      if (!signedIn) return;
      // Bail if we already have a decision on file — don't overwrite a
      // completion timestamp with a skip timestamp.
      try {
        const yes = await hasAnyInstructorRole();
        if (!alive || !yes) return;
        setState((s) => (
          s.onboardingCompletedAt || s.onboardingSkippedAt
            ? s
            : { ...s, onboardingSkippedAt: Date.now() }
        ));
      } catch { /* network failures shouldn't block UI */ }
    };
    check();
    const off = window.BQAuth?.onAuthChange?.(() => check());
    return () => { alive = false; if (typeof off === "function") off(); };
  }, []);

  // When remote state is loaded after sign-in, refresh from localStorage.
  useEffect(() => {
    const handler = () => setState(loadState());
    window.addEventListener("bq-state-reload", handler);
    return () => window.removeEventListener("bq-state-reload", handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      const parsed = parseGlossaryHash(window.location.hash);
      if (!parsed) return;
      setGlossaryRequest({ ...parsed, nonce: Date.now() });
      setView("glossary");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (view === "glossary") return;
    if (!window.location.hash.startsWith(GLOSSARY_HASH_PREFIX)) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, [view]);

  const openGlossary = (target) => {
    let next = null;
    if (typeof target === "string") next = { selectedId: target };
    else if (target?.methodId) next = { ...target, selectedId: `method:${target.methodId}` };
    else if (target && typeof target === "object") next = { ...target };
    if (!next) return;
    if (next.selectedId && !GLOSSARY_BY_ID[next.selectedId]) return;
    setGlossaryRequest({
      query: "",
      kind: "all",
      branch: "all",
      ...next,
      nonce: Date.now(),
    });
    setView("glossary");
  };

  const startCaseSelect = (id) => {
    if (isCaseLockedForUser(id, sub?.user_type)) {
      const c = CASES.find((x) => x.id === id);
      setPaywall({ reason: "locked_case", caseTitle: c?.title });
      return;
    }
    setActiveCase(id); setView("select");
  };

  // ---------- Diagnostic onboarding handlers ----------
  const beginDiagnostic = () => setView("diagnostic");
  const skipDiagnostic = () => {
    setState((s) => ({ ...s, onboardingSkippedAt: Date.now() }));
    setView("home");
    window.BQAuth?.logEvent?.("diagnostic_skipped");
  };
  const finishDiagnostic = (answers) => {
    const profile = scoreDiagnostic(answers);
    const path = buildStudyPath(profile, state);
    setState((s) => {
      let next = {
        ...s,
        onboardingVersion: ONBOARDING_VERSION_CURRENT,
        onboardingCompletedAt: Date.now(),
        diagnosticAnswers: answers,
        diagnosticProfile: profile,
        studyPath: path,
      };
      next = bumpDailyStreak(next);
      return applyBadgeChecks(next).state;
    });
    setView("results");
    window.BQAuth?.logEvent?.("diagnostic_complete", {
      data: { profileLabel: profile?.label, studyPath: path },
    });
  };

  const beginPlay = (id, diff) => {
    if (isCaseLockedForUser(id, sub?.user_type)) {
      const c = CASES.find((x) => x.id === id);
      setPaywall({ reason: "locked_case", caseTitle: c?.title });
      return;
    }
    const c = CASES.find(x=>x.id===id);
    const qs = pickQuestions(c, state.seenQuestions[id] || [], state.srs);
    setActiveCase(id); setActiveDiff(diff); setActiveQuestions(qs); setView("play");
    window.BQAuth?.logEvent?.("case_start", { caseId: id, data: { difficulty: diff } });
  };

  // Called by WebRPane whenever R Lab progress changes. We union new ids into
  // state arrays and monotonically advance runsOk, then re-run badge checks.
  // Dedupe aggressively so we don't thrash setState on every render.
  const handleRLabProgress = useCallback(({ completed, perfect, runsOk }) => {
    setState(s => {
      const curCompleted = s.rLabCompleted || [];
      const curPerfect   = s.rLabPerfect   || [];
      const nextCompleted = Array.from(new Set([...curCompleted, ...(completed || [])]));
      const nextPerfect   = Array.from(new Set([...curPerfect,   ...(perfect   || [])]));
      const nextRuns      = Math.max(s.rLabRunsOk || 0, runsOk || 0);
      // No-op if nothing changed.
      if (nextCompleted.length === curCompleted.length &&
          nextPerfect.length   === curPerfect.length   &&
          nextRuns             === (s.rLabRunsOk || 0)) {
        return s;
      }
      const next = {
        ...s,
        rLabCompleted: nextCompleted,
        rLabPerfect:   nextPerfect,
        rLabRunsOk:    nextRuns,
      };
      return applyBadgeChecks(next).state;
    });
  }, []);

  // Called by Lab when the user opens a simulator tab.
  const handleLabSimVisit = useCallback((simId) => {
    if (!simId) return;
    setState(s => {
      const seen = s.labSimsSeen || [];
      if (seen.includes(simId)) return s;
      const next = { ...s, labSimsSeen: [...seen, simId] };
      return applyBadgeChecks(next).state;
    });
  }, []);

  const replay = () => {
    if (activeCase === REVIEW_CASE_ID) { beginReview(); return; }
    // Pick a fresh set of questions
    const c = CASES.find(x=>x.id===activeCase);
    const seen = state.seenQuestions[activeCase] || [];
    const qs = pickQuestions(c, seen, state.srs);
    setActiveQuestions(qs);
    setView("play");
  };

  const beginReview = async () => {
    // Signed-in users: pull due qids from server-backed FSRS. Guests: fall
    // back to the local SM-2 (in state.srs) so everyone gets a review loop.
    let qs = [];
    const signedIn = !!(window.BQAuth && window.BQAuth.getUser && window.BQAuth.getUser());
    if (signedIn) {
      try {
        const dueQids = await srsGetDueQids(20);
        if (dueQids.length > 0) {
          const order = new Map(dueQids.map((q, i) => [q, i]));
          const qidSet = new Set(dueQids);
          for (const c of CASES) {
            for (const q of c.bank) {
              if (qidSet.has(q.qid)) qs.push({ ...q, _caseId: c.id, _branch: c.branch });
            }
          }
          qs.sort((a, b) => (order.get(a.qid) ?? 0) - (order.get(b.qid) ?? 0));
        }
      } catch {}
    }
    if (qs.length === 0) qs = getDueQuestionsAcrossCases(state.srs, 20);
    if (qs.length === 0) return;
    setActiveCase(REVIEW_CASE_ID);
    setActiveDiff("resident");
    setActiveQuestions(qs);
    setView("play");
  };

  const finishCase = (caseId, difficulty, answers, timeBonus) => {
    const isReview = caseId === REVIEW_CASE_ID;
    const c = isReview ? null : CASES.find(x => x.id === caseId);
    const correctCount = answers.filter(a=>a.correct).length;
    const score = Math.round((correctCount/answers.length)*100);
    const baseXP = Math.round(correctCount * 30 * DIFFICULTIES[difficulty].xpMult);
    const timeXP = Math.round(timeBonus * DIFFICULTIES[difficulty].xpMult);
    const xpEarned = baseXP + timeXP;
    const wasCompleted = !isReview && state.completed.includes(caseId);
    const completedBefore = [...state.completed];

    // Update seen questions — per case in normal play; per-question attribution in review.
    const newSeen = { ...state.seenQuestions };
    if (!isReview) {
      const curSeen = new Set(newSeen[caseId] || []);
      answers.forEach(a => curSeen.add(a.qid));
      if (curSeen.size >= c.bank.length) newSeen[caseId] = [];
      else newSeen[caseId] = [...curSeen];
    }

    // Streak
    let curStreak = state.currentStreak;
    let bestStreak = state.bestStreak;
    let streakLastActiveMs = state.streakLastActiveMs || 0;
    answers.forEach(a => {
      if (a.correct) {
        curStreak++;
        if (curStreak > bestStreak) bestStreak = curStreak;
        streakLastActiveMs = Date.now();
      } else {
        curStreak = 0;
      }
    });

    // Spaced-repetition update (SM-2-lite): wrong=1, correct=4
    let newSrs = state.srs || {};
    answers.forEach(a => { newSrs = updateSRS(newSrs, a.qid, a.correct ? 4 : 1); });

    // Branch stats — in review, attribute each answer to its question's original branch
    const br = { ...state.stats.byBranch };
    if (isReview) {
      answers.forEach(a => {
        // Find the question in CASES to get its branch (review questions had _branch on them,
        // but answers array only has qid — look up via CASES).
        let branch = null;
        for (const k of CASES) for (const q of k.bank) if (q.qid === a.qid) { branch = k.branch; break; }
        if (!branch) return;
        br[branch] = br[branch] || { answered: 0, correct: 0 };
        br[branch] = { answered: br[branch].answered + 1, correct: br[branch].correct + (a.correct ? 1 : 0) };
      });
    } else {
      br[c.branch] = br[c.branch] || { answered: 0, correct: 0 };
      br[c.branch] = { answered: br[c.branch].answered + answers.length, correct: br[c.branch].correct + correctCount };
    }

    const prevXp = state.xp;
    let newState = {
      ...state,
      xp: state.xp + xpEarned,
      completed: (isReview || wasCompleted) ? state.completed : [...state.completed, caseId],
      perfectRuns: state.perfectRuns + (!isReview && score === 100 ? 1 : 0),
      hardWins: state.hardWins + (!isReview && (difficulty==="fellow"||difficulty==="pi") && score >= 70 ? 1 : 0),
      piWins: state.piWins + (!isReview && difficulty==="pi" && score >= 70 ? 1 : 0),
      speedRuns: state.speedRuns + (timeBonus >= answers.length * 5 ? 1 : 0),
      srsReviewsDone: state.srsReviewsDone + (isReview ? 1 : 0),
      caseScores: isReview ? state.caseScores : { ...state.caseScores, [caseId]: Math.max(state.caseScores[caseId]||0, score) },
      seenQuestions: newSeen,
      srs: newSrs,
      currentStreak: curStreak, bestStreak,
      streakLastActiveMs,
      stats: { totalAnswered: state.stats.totalAnswered + answers.length, totalCorrect: state.stats.totalCorrect + correctCount, byBranch: br },
    };
    // Any finished case, review, or diagnostic counts as "active today".
    newState = bumpDailyStreak(newState);
    // Review sessions additionally tick the (stricter) review streak.
    if (isReview) newState = bumpReviewStreak(newState);

    const badgeResult = applyBadgeChecks(newState);
    newState = badgeResult.state;
    const newBadges = badgeResult.newly;

    setState(newState);
    const resultPayload = { caseId, difficulty, answers, newBadges, completedBefore, timeBonus, prevXp, newXp: newState.xp };
    setLastResult(resultPayload);
    // Surface the best share-worthy achievement (if any) on this run.
    const share = selectAchievementForSharing(resultPayload, newState, prevXp);
    if (share) setSharePending(share);
    setView("result");
    // Telemetry: one event per answer (powers per-question accuracy analytics)
    // plus a single case_complete summary. Fire-and-forget; failures never
    // affect the UI because logEvent swallows errors internally.
    try {
      answers.forEach(a => {
        window.BQAuth?.logEvent?.(a.correct ? "answer_correct" : "answer_wrong", {
          qid: a.qid,
          caseId,
          method: a.method,
          data: { timedOut: !!a.timedOut, difficulty },
        });
      });
      window.BQAuth?.logEvent?.("case_complete", {
        caseId,
        data: {
          difficulty,
          score: Math.round((correctCount / answers.length) * 100),
          xp: xpEarned,
          correct: correctCount,
          total: answers.length,
          isReview,
        },
      });
    } catch {}
  };

  // Mark an achievement as "handled" so we don't re-prompt after reload.
  const markShared = (id) => {
    if (!id) return;
    setState(s => ({ ...s, sharedAchievements: Array.from(new Set([...(s.sharedAchievements || []), id])) }));
  };

  const resetProgress = () => {
    if (confirm("Erase ALL progress, badges, XP, and seen-question history?")) {
      setState(structuredClone(DEFAULT_STATE));
      setView("home");
    }
  };

  return (
    <div className="min-h-screen">
      {/* Skip-to-content link — invisible until focused. Lets keyboard
          users bypass the TopBar's nav rather than tabbing through 8+
          links on every page. Targets #main-content rendered below. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-cyan-500 focus:text-slate-950 focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>
      {view !== "onboarding" && view !== "diagnostic" && view !== "results" && view !== "join" && (
        <>
          <TopBar state={state} setState={setState} onReset={resetProgress} onNav={(v)=>{ if(v==="tree") setInitialBranch(null); setView(v); }} current={view}/>
          <OpenBetaBanner/>
        </>
      )}
      <main id="main-content" tabIndex={-1} className="outline-none">
      {view === "onboarding" && <OnboardingIntro state={state} setState={setState} onStart={beginDiagnostic} onSkip={skipDiagnostic}/>}
      {view === "diagnostic"  && <DiagnosticPlay onFinish={finishDiagnostic} onExit={() => setView("home")}/>}
      {view === "results"     && <DiagnosticResults profile={state.diagnosticProfile} studyPath={state.studyPath} onStartCase={startCaseSelect} onNav={setView} learnerGoal={state.learnerGoal}/>}
      {view === "home"     && <Home state={state} setState={setState} onStartCase={startCaseSelect} onNav={setView} onOpenBranch={(b)=>{setInitialBranch(b); setView("tree");}} onReview={beginReview}/>}
      {view === "tree"     && (
        <React.Suspense fallback={<div className="max-w-7xl mx-auto p-6 text-slate-500 text-sm">Loading Skill Tree…</div>}>
          <SkillTreeLazy state={state} onStartCase={startCaseSelect} initialBranch={initialBranch}/>
        </React.Suspense>
      )}
      {view === "lab"      && <Lab onVisit={handleLabSimVisit}/>}
      {view === "rlab"     && (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 fade-in">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div className="min-w-0">
              <h2 className="t-title mb-1 inline-flex items-center gap-2"><span className="text-cyan-400"><Ico name="terminal" size={24}/></span> R Lab <span className="text-xs sm:text-sm font-normal text-slate-400">· real R, in your browser</span></h2>
              <p className="t-body text-slate-400 text-sm max-w-2xl">
                A full interactive R environment powered by WebR (R compiled to WebAssembly). Fifteen curated biostatistics lessons — descriptives, tests, regression, survival — with inline plots, comprehension quizzes, and key takeaways. Nothing is sent to a server.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="chip mono" style={{background:"rgba(34,211,238,0.1)", color:"#22d3ee"}}>15 lessons</span>
              <span className="chip mono" style={{background:"rgba(139,92,246,0.1)", color:"#a78bfa"}}>Starter → Advanced</span>
              <span className="chip mono" style={{background:"rgba(16,185,129,0.1)", color:"#10b981"}}>runs locally</span>
            </div>
          </div>
          <WebRPane onProgress={handleRLabProgress}/>
        </div>
      )}
      {view === "badges"   && <Badges state={state} onShare={(b)=>setSharePending({ id: "badge:"+b.id, icon: b.icon, kindLabel: "Badge", title: b.name, subtitle: b.desc })}/>}
      {view === "board"    && <Leaderboard state={state} setState={setState} onNav={setView}/>}
      {view === "stats"    && <Stats state={state}/>}
      {view === "glossary" && (
        <Glossary
          state={state}
          onStartCase={startCaseSelect}
          onOpenBranch={(branchId) => { setInitialBranch(branchId); setView("tree"); }}
          request={glossaryRequest}
        />
      )}
      {view === "select"   && <CaseSelect caseId={activeCase} onStart={beginPlay} onBack={()=>setView("tree")} state={state}/>}
      {view === "play"     && <CasePlay caseId={activeCase} difficulty={activeDiff} questions={activeQuestions} onFinish={finishCase} onExit={()=>setView("home")} srs={state.srs} onOpenGlossary={openGlossary}/>}
      {view === "result"   && <CaseResult result={lastResult} onHome={()=>setView("home")} onReplay={replay} onNext={(id)=>{setActiveCase(id); setView("select");}} onShare={(a)=>setSharePending(a)} srs={state.srs} state={state} onOpenGlossary={openGlossary}/>}
      {view === "admin"    && <AdminReports onHome={()=>setView("home")}/>}
      {view === "teach"    && <TeachView onHome={()=>setView("home")}/>}
      {view === "join"     && <JoinView/>}
      {view === "misconceptions" && <MyMisconceptions onExit={()=>setView("home")} onOpenGlossary={openGlossary} onStartCase={startCaseSelect}/>}
      {view === "exam"           && <Exam onExit={()=>setView("home")}/>}
      {view === "competency"     && <Competency state={state} onExit={()=>setView("home")}/>}
      {view === "upgrade"        && <Upgrade onExit={()=>setView("home")}/>}
      </main>
      {sharePending && (
        <ShareCardModal
          achievement={sharePending}
          state={state}
          onClose={()=>setSharePending(null)}
          onDismiss={markShared}
        />
      )}
      {paywall && (
        <PaywallModal
          reason={paywall.reason}
          caseTitle={paywall.caseTitle}
          onClose={() => setPaywall(null)}
        />
      )}
      {billingToast === "success" && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] card premium-border rounded-xl px-5 py-3 max-w-md w-[92vw] fade-in" style={{background: "linear-gradient(145deg, rgba(16,185,129,0.15), rgba(22,28,54,0.85))"}}>
          <div className="flex items-center gap-3">
            <span className="text-emerald-300 inline-flex items-center"><Ico name="check" size={20}/></span>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-sm">Welcome to Pro.</div>
              <div className="text-xs text-slate-300">All 50 cases unlocked. Your receipt is in your inbox.</div>
            </div>
            <button onClick={() => setBillingToast(null)} className="text-slate-400 hover:text-white inline-flex items-center"><Ico name="close" size={14}/></button>
          </div>
        </div>
      )}
      <div className="text-center py-8 text-xs text-slate-600 mono">
        BioStat Quest · Progress saved locally
      </div>
    </div>
  );
}

export default App;
