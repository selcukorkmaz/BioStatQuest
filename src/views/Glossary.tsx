// @ts-nocheck
// Glossary view — knowledge-base of statistical terms with browse,
// search, fuzzy match, and a mobile-optimised flow.
//
// Extracted from App.tsx (Phase 6 round 2). ~1,180 lines lifted out
// without behavior changes; the only surgery was hoisting the
// glossary-hash helpers to src/lib/glossaryHash.ts so App's view
// resolver can use them without pulling this chunk into the main
// bundle.
//
// Three sub-modules in this file (kept colocated because they're
// tightly coupled):
//   • groupGlossaryByLetter — A–Z bucket helper for the mobile ribbon
//   • GlossaryMobile        — full-page mobile UX (≤767px)
//   • GlossaryMobileSheet   — bottom-sheet modal used by mobile
//   • compactGlossaryText / levenshteinDistance / fuzzyGlossaryScore /
//     glossarySearchScore — search-rank helpers
//   • Glossary              — the desktop / responsive entry point
//                              (default export, renders GlossaryMobile
//                              when narrow)

import * as React from "react";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  GLOSSARY,
  GLOSSARY_BY_ID,
  GLOSSARY_KIND_META,
  normalizeGlossaryText,
} from "../data/glossary";
import { BRANCHES } from "../data/branches";
import { CASES } from "../data/cases";
import { BranchGlyph } from "../components/Icons";
import { GLOSSARY_HASH_PREFIX, glossaryHashForId } from "../lib/glossaryHash";

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

// Default export so App.tsx can React.lazy(() => import("./views/Glossary"))
export default Glossary;
