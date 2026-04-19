#!/usr/bin/env node
// scripts/audit-structure.mjs
//
// Broad-spectrum structural audit that complements cases.test.ts (which
// enforces per-question schema) and audit-methods.mjs (which catches
// semantic mis-tags). Looks for the class of problems that slip past both:
//
//   • duplicate question STEMS across cases (content duplication)
//   • qids referenced from caseNarratives.ts that no longer exist
//   • METHODS entries with zero question references (dead deep-dives)
//   • BRANCHES with zero cases
//   • cases whose qPerRun > 2/3 of bank (exhausts variety in 2 runs)
//   • cases with suspiciously few unique methods in the bank
//   • numeric answers that look wrong (off-by-decimal, unit mismatch)
//   • inconsistent option formatting (leading/trailing whitespace, etc.)
//
// Output: stderr summary + grouped stdout lines by issue class.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function slurp(p) { return readFileSync(resolve(ROOT, p), "utf8"); }

// ---- parse cases (same parser as audit-methods, audit-quality) ----
function parseQuestions() {
  const src = slurp("src/data/cases.ts");
  const out = [];
  const caseHead = [];
  const qCallRe = /Q\("(\w+)",\s*\[/g;
  let m;
  while ((m = qCallRe.exec(src))) {
    const bankId = m[1];
    const startIdx = m.index + m[0].length - 1;
    let depth = 0, end = startIdx;
    for (let i = startIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(startIdx + 1, end);
    let qIdx = 0, i = 0;
    while (i < body.length) {
      while (i < body.length && body[i] !== "{") i++;
      if (i >= body.length) break;
      const qs = i;
      let d = 0;
      for (; i < body.length; i++) {
        const ch = body[i];
        if (ch === "{") d++;
        else if (ch === "}") { d--; if (d === 0) { i++; break; } }
      }
      const qBody = body.slice(qs, i);
      out.push({
        qid: `${bankId}_${qIdx}`,
        caseId: bankId,
        ...extractFields(qBody),
      });
      qIdx++;
    }
  }
  // parse case headers: id, branch, title, qPerRun
  const caseRe = /\{\s*id:\s*"(\w+)",\s*branch:\s*"(\w+)",\s*title:\s*"([^"]+)",[\s\S]*?qPerRun:\s*(\d+)/g;
  let cm;
  while ((cm = caseRe.exec(src))) {
    caseHead.push({ id: cm[1], branch: cm[2], title: cm[3], qPerRun: Number(cm[4]) });
  }
  return { questions: out, cases: caseHead };
}

function extractFields(qBody) {
  const q = firstString(qBody, "q:") || "";
  const method = firstString(qBody, "method:") || "";
  const explain = firstString(qBody, "explain:") || "";
  const type = firstString(qBody, "type:") || "";
  const answer = qBody.match(/answer:\s*([\s\S]*?)(?:,\s*tol:|,\s*explain:)/)?.[1]?.trim() || "";
  const tol = qBody.match(/tol:\s*([0-9.\-]+)/)?.[1] || "";
  const opts = [];
  const om = qBody.match(/options:\s*\[([\s\S]*?)\]/);
  if (om) {
    const inner = om[1];
    const sRe = /"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = sRe.exec(inner))) opts.push(sm[1]);
  }
  return { q, explain, method, type, options: opts, answer, tol };
}
function firstString(src, key) {
  const re = new RegExp(key + '\\s*"((?:[^"\\\\]|\\\\.)*)"');
  const m = src.match(re);
  return m ? m[1] : null;
}

function loadMethodIds() {
  const ids = new Set();
  const re = /^  ([a-z_]+): \{$/gm;
  const src = slurp("src/data/methods.ts");
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return ids;
}

function loadBranchIds() {
  const src = slurp("src/data/branches.ts");
  const ids = new Set();
  const re = /^  (\w+): \{/gm;
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return ids;
}

// ---------------------------------------------------------------------------
const { questions, cases } = parseQuestions();
const methodIds = loadMethodIds();
const branchIds = loadBranchIds();

const findings = { duplicates: [], missingNarrativeQids: [], deadMethods: [], emptyBranches: [], variety: [], whitespace: [], lowDiversity: [], suspectNumeric: [] };

// ---- 1) duplicate question stems (normalized) ----
const stemMap = new Map();
for (const q of questions) {
  const norm = (q.q || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!stemMap.has(norm)) stemMap.set(norm, []);
  stemMap.get(norm).push(q.qid);
}
for (const [stem, qids] of stemMap.entries()) {
  if (qids.length > 1) findings.duplicates.push({ stem: stem.slice(0, 80), qids });
}

// ---- 2) caseNarratives qid references ----
const validQids = new Set(questions.map((q) => q.qid));
try {
  const narr = slurp("src/data/caseNarratives.ts");
  const ref = /["'](\w+_\d+)["']/g;
  let m;
  const seen = new Set();
  while ((m = ref.exec(narr))) seen.add(m[1]);
  for (const qid of seen) {
    if (!validQids.has(qid)) findings.missingNarrativeQids.push(qid);
  }
} catch {}

// ---- 3) unused methods (defined but not referenced) ----
const referencedMethods = new Set(questions.map((q) => q.method).filter(Boolean));
for (const mid of methodIds) {
  if (!referencedMethods.has(mid)) findings.deadMethods.push(mid);
}

// ---- 4) branches with zero cases ----
const usedBranches = new Set(cases.map((c) => c.branch));
for (const bid of branchIds) if (!usedBranches.has(bid)) findings.emptyBranches.push(bid);

// ---- 5) cases whose qPerRun exhausts variety (bank < 2 * qPerRun) ----
const bankSizeByCase = new Map();
for (const q of questions) {
  bankSizeByCase.set(q.caseId, (bankSizeByCase.get(q.caseId) || 0) + 1);
}
for (const c of cases) {
  const bank = bankSizeByCase.get(c.id) || 0;
  if (bank && bank < 2 * c.qPerRun) findings.variety.push({ id: c.id, bank, qPerRun: c.qPerRun });
}

// ---- 6) whitespace / formatting in options ----
for (const q of questions) {
  for (const opt of q.options) {
    if (opt !== opt.trim()) findings.whitespace.push({ qid: q.qid, opt });
    if (/  +/.test(opt)) findings.whitespace.push({ qid: q.qid, opt: `double-space: ${opt}` });
  }
}

// ---- 7) low method diversity per case (<=2 unique methods across 15+ Qs) ----
const methodsByCase = new Map();
for (const q of questions) {
  if (!methodsByCase.has(q.caseId)) methodsByCase.set(q.caseId, new Set());
  if (q.method) methodsByCase.get(q.caseId).add(q.method);
}
for (const [caseId, set] of methodsByCase.entries()) {
  const bankN = bankSizeByCase.get(caseId) || 0;
  if (bankN >= 15 && set.size <= 2) findings.lowDiversity.push({ id: caseId, bankN, methods: [...set].join(",") });
}

// ---- 8) suspect numeric answers (value exactly 0 or 1 for computation qs) ----
// Heuristic only — flags q's whose numeric answer is a common "default" value
// worth eyeballing. Not an automatic bug.
for (const q of questions) {
  if (q.type !== "numeric") continue;
  const a = Number(q.answer);
  if (!Number.isFinite(a)) continue;
  if ((a === 0 || a === 1) && (q.tol === "" || Number(q.tol) === 0)) {
    findings.suspectNumeric.push({ qid: q.qid, answer: a, stem: q.q.slice(0, 70) });
  }
}

// ---- Print grouped report ----
function header(t) { console.log(`\n━━━ ${t} ━━━`); }

header(`duplicate stems (${findings.duplicates.length})`);
for (const d of findings.duplicates) console.log(`  ${d.qids.join(", ")}\t${d.stem}`);

header(`missing caseNarratives qid refs (${findings.missingNarrativeQids.length})`);
for (const q of findings.missingNarrativeQids) console.log(`  ${q}`);

header(`methods with zero question references (${findings.deadMethods.length})`);
for (const m of findings.deadMethods) console.log(`  ${m}`);

header(`branches with zero cases (${findings.emptyBranches.length})`);
for (const b of findings.emptyBranches) console.log(`  ${b}`);

header(`low variety (bank < 2×qPerRun) (${findings.variety.length})`);
for (const v of findings.variety) console.log(`  ${v.id}\tbank=${v.bank}\tqPerRun=${v.qPerRun}`);

header(`whitespace issues in options (${findings.whitespace.length})`);
for (const w of findings.whitespace.slice(0, 20)) console.log(`  ${w.qid}\t"${w.opt}"`);
if (findings.whitespace.length > 20) console.log(`  … ${findings.whitespace.length - 20} more`);

header(`low method diversity in large banks (${findings.lowDiversity.length})`);
for (const l of findings.lowDiversity) console.log(`  ${l.id}\tbank=${l.bankN}\tmethods=${l.methods}`);

header(`suspect numeric answers (0/1 with tol=0) (${findings.suspectNumeric.length})`);
for (const s of findings.suspectNumeric.slice(0, 20)) console.log(`  ${s.qid}\tanswer=${s.answer}\t${s.stem}`);
if (findings.suspectNumeric.length > 20) console.log(`  … ${findings.suspectNumeric.length - 20} more`);

console.error(`\n[audit] scanned ${questions.length} questions, ${cases.length} cases, ${methodIds.size} methods, ${branchIds.size} branches`);
