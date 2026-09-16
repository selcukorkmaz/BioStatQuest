// Lazy façade over the item-generator layer. This is what the app imports;
// ./index.ts stays the eager barrel (and is what the test suite imports, since
// property tests need the real `gen` functions anyway).
//
// THE SPLIT: the 28 families weigh ~57 KB gzipped — 17% of the main bundle —
// and none of it is needed to render a single screen. It is needed the moment
// a learner starts a case or a review, which is a click we can await. So the
// metadata half (./manifest.ts) is imported statically and answers every
// synchronous question the app asks, while the generator half arrives in its
// own chunk.
//
// CONTRACT: call `ensureGenerators()` before any code path that draws, and the
// synchronous `drawFamilyQuestion` below is guaranteed to work. If it is called
// before the chunk lands it returns null rather than throwing or blocking —
// every call site already skips null draws, so the failure mode is "this run
// has no generated items", never a crash. `warmGenerators()` makes that
// practically unreachable by fetching the chunk while the app sits idle.

import { FAMILY_MANIFEST, type FamilyMeta } from "./manifest";
import type { GeneratedQuestion } from "./core";

type GeneratorModule = typeof import("./index");

let loaded: GeneratorModule | null = null;
let inFlight: Promise<GeneratorModule> | null = null;

// ---- synchronous metadata surface (cheap, always available) --------------

/** Every family's metadata, in the order ./index.ts declares them. */
export const FAMILIES: readonly FamilyMeta[] = FAMILY_MANIFEST;

export const FAMILY_BY_ID: ReadonlyMap<string, FamilyMeta> = new Map(
  FAMILY_MANIFEST.map((f) => [f.fid, f]),
);

export const isFamilyQid = (qid: string | undefined | null): boolean =>
  !!qid && FAMILY_BY_ID.has(qid);

/** Families whose method appears among `methods` — how a case claims them. */
export function familiesForMethods(methods: Iterable<string>): FamilyMeta[] {
  const set = new Set(methods);
  return FAMILY_MANIFEST.filter((f) => set.has(f.method));
}

// ---- the lazy half -------------------------------------------------------

/**
 * Resolves once the generator chunk is in memory. Concurrent callers share one
 * request. Safe to call on every draw path — after the first load it is a
 * resolved promise, not a fetch.
 */
export function ensureGenerators(): Promise<GeneratorModule> {
  if (loaded) return Promise.resolve(loaded);
  if (!inFlight) {
    inFlight = import("./index").then((m) => {
      loaded = m;
      return m;
    }).catch((err) => {
      // Let the next attempt retry instead of caching a rejected promise —
      // a transient chunk-load failure shouldn't permanently disable
      // generated items for the rest of the session.
      inFlight = null;
      throw err;
    });
  }
  return inFlight;
}

/**
 * Fire-and-forget preload. Called once the app has painted so the chunk is
 * already there by the time anyone clicks into a case. Swallows failures:
 * this is an optimisation, and `ensureGenerators()` at the draw sites is the
 * real guarantee.
 */
export function warmGenerators(): void {
  const start = () => { ensureGenerators().catch(() => {}); };
  if (typeof window === "undefined") return;
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") ric(start, { timeout: 3000 });
  else window.setTimeout(start, 1200);
}

/** True once the generator chunk is loaded and draws will actually produce items. */
export const generatorsReady = (): boolean => loaded !== null;

/**
 * Fresh instance of one family. Synchronous by design — it sits inside run
 * composition, which is synchronous — so callers must have awaited
 * `ensureGenerators()` first. Returns null when the chunk isn't loaded yet.
 */
export function drawFamilyQuestion(
  fid: string,
  seed?: number,
): GeneratedQuestion | null {
  if (!loaded) {
    // Not an error: start the load so the next attempt succeeds, and let the
    // caller's existing null-check drop this item from the run.
    warmGenerators();
    return null;
  }
  return loaded.drawFamilyQuestion(fid, seed);
}

/** Fresh instances of every family eligible for a case's methods. */
export function drawForMethods(
  methods: Iterable<string>,
  seed?: number,
): GeneratedQuestion[] {
  if (!loaded) {
    warmGenerators();
    return [];
  }
  return loaded.drawForMethods(methods, seed);
}
