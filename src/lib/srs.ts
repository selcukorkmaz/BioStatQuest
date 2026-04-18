// FSRS-6 scheduler — server-backed spaced repetition.
// Wraps `ts-fsrs` and syncs with public.reviews in Supabase.
//
// Design:
//   - For signed-in users, the `reviews` table is the source of truth.
//   - For guests, calls are no-ops; the legacy in-state SRS (updateSRS()) still
//     runs in App.tsx so they get SOMETHING, just without cross-device sync.
//   - The admin panel's Content tab reads per-qid accuracy from the `events`
//     table, independent of this — so content analytics keep working for all.

import { createEmptyCard, FSRS, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

// Default FSRS-6 parameters. These are the library-recommended defaults from
// research on ~10M reviews — tunable per-user later if we ever implement
// personalized parameter optimization.
const fsrs = new FSRS(generatorParameters({
  enable_fuzz: true,          // small randomization to avoid review-pile synchronization
  enable_short_term: true,    // learning steps for brand-new cards
}));

// ts-fsrs v5 uses Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 }
export const RATING = {
  AGAIN: Rating.Again as Grade,
  HARD: Rating.Hard as Grade,
  GOOD: Rating.Good as Grade,
  EASY: Rating.Easy as Grade,
};

export type RatingName = "again" | "hard" | "good" | "easy";
export const RATING_BY_NAME: Record<RatingName, Grade> = {
  again: Rating.Again as Grade,
  hard: Rating.Hard as Grade,
  good: Rating.Good as Grade,
  easy: Rating.Easy as Grade,
};

// Convert a DB reviews row → ts-fsrs Card
type ReviewsRow = {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_reviewed: string | null;
  due_at: string;
};

function rowToCard(row: ReviewsRow | null): Card {
  if (!row) return createEmptyCard();
  return {
    due: new Date(row.due_at),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_reviewed ? new Date(row.last_reviewed) : undefined,
  } as Card;
}

function cardToRow(card: Card, userId: string, qid: string, lastGrade: Grade) {
  return {
    user_id: userId,
    qid,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps || 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_grade: lastGrade,
    last_reviewed: (card.last_review ?? new Date()).toISOString(),
    due_at: card.due.toISOString(),
  };
}

function getClient() {
  const anyWin = window as any;
  const BQ = anyWin?.BQAuth;
  if (!BQ || !BQ.enabled) return null;
  // auth.ts doesn't expose the raw client; use the helpers we already have
  // and a small adapter. For direct table access we need the client, so
  // pull it from the global. Easiest: check if a helper is available.
  return BQ;
}

// Grade a single card. Returns the next due date (or null if not synced).
export async function gradeCard(qid: string, rating: Grade): Promise<Date | null> {
  const BQ = getClient();
  if (!BQ || !BQ.getUser || !BQ.getUser()) return null;
  const user = BQ.getUser();

  try {
    // Access Supabase via the BQ internal — auth.ts must expose a small
    // fetch/update API. For now, we piggyback on window.__SUPABASE so we
    // can run SQL against `reviews` without duplicating client setup.
    // (Adds a small shim in auth.ts; see grade/due helpers there.)
    return await BQ._srsGrade(qid, rating);
  } catch (e) {
    console.warn("[srs] grade failed", e);
    return null;
  }
}

// Count of due cards for current user. 0 for guests or errors.
export async function getDueCount(): Promise<number> {
  const BQ = getClient();
  if (!BQ || !BQ.getUser || !BQ.getUser()) return 0;
  try {
    return (await BQ._srsDueCount()) || 0;
  } catch {
    return 0;
  }
}

// Fetch up to `limit` qids that are currently due, sorted by most overdue first.
export async function getDueQids(limit = 20): Promise<string[]> {
  const BQ = getClient();
  if (!BQ || !BQ.getUser || !BQ.getUser()) return [];
  try {
    return (await BQ._srsDueQids(limit)) || [];
  } catch {
    return [];
  }
}

// Fetch aggregate mastery stats by method. Returns { method: {mean_stability, n} }
export async function getMasteryByMethod(): Promise<Record<string, { stability: number; count: number }>> {
  const BQ = getClient();
  if (!BQ || !BQ.getUser || !BQ.getUser()) return {};
  try {
    return (await BQ._srsMasteryByMethod()) || {};
  } catch {
    return {};
  }
}

// Exposed so auth.ts can implement the shim — see _srs* helpers there.
export const __SRS = {
  fsrs,
  rowToCard,
  cardToRow,
};
