#!/usr/bin/env node
// scripts/audit-quality.mjs
//
// One-shot content-quality scanner for selected cases. Finds:
//   (B) Thin explanations — < MIN_EXPLAIN_WORDS words (default 15)
//   (C) Lazy distractors  — options matching LAZY_REGEX (e.g. "Impossible",
//       "None of the above", "Always", "Never", "Undefined", "Not defined")
//
// Output: TSV lines grouped by kind (THIN | LAZY), to stdout. Meant to be
// skimmed by hand before making content changes.
//
// Usage: node scripts/audit-quality.mjs [case_id ...]
// Example: node scripts/audit-quality.mjs f1 f2 p1 e1 t2 d1 r1 r2

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CASES = process.argv.slice(2);
const MIN_EXPLAIN_WORDS = 15;
const LAZY_REGEX = /^(Impossible|None of the above|None of these|Never|Always|Always 0|Undefined|Not defined|N\/A|Nothing|Cannot tell|Meaningless)\.?$/i;

function parseQuestions() {
  const src = readFileSync(resolve(ROOT, "src/data/cases.ts"), "utf8");
  const out = [];
  const qCallRe = /Q\("(\w+)",\s*\[/g;
  let m;
  while ((m = qCallRe.exec(src))) {
    const bankId = m[1];
    const startIdx = m.index + m[0].length - 1;
    let depth = 0;
    let end = startIdx;
    for (let i = startIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(startIdx + 1, end);
    let qIdx = 0;
    let i = 0;
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
  return out;
}

function extractFields(qBody) {
  const q = firstString(qBody, "q:") || "";
  const explain = firstString(qBody, "explain:") || "";
  const opts = [];
  const om = qBody.match(/options:\s*\[([\s\S]*?)\]/);
  if (om) {
    const inner = om[1];
    const sRe = /"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = sRe.exec(inner))) opts.push(sm[1]);
  }
  return { q, explain, options: opts };
}

function firstString(src, key) {
  const re = new RegExp(key + '\\s*"((?:[^"\\\\]|\\\\.)*)"');
  const m = src.match(re);
  return m ? m[1] : null;
}

function wordCount(s) {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

const qs = parseQuestions();
const picked = CASES.length ? qs.filter((q) => CASES.includes(q.caseId)) : qs;

console.log("kind\tqid\twords\tstem_or_option_preview");
for (const q of picked) {
  const wc = wordCount(q.explain);
  if (wc > 0 && wc < MIN_EXPLAIN_WORDS) {
    const stem = (q.q || "").replace(/\s+/g, " ").slice(0, 70);
    console.log(["THIN", q.qid, wc, `${stem} → ${q.explain}`].join("\t"));
  }
  for (const opt of q.options) {
    if (LAZY_REGEX.test(opt.trim())) {
      console.log(["LAZY", q.qid, "-", `option="${opt}" | stem="${(q.q || "").slice(0, 60)}"`].join("\t"));
    }
  }
}

console.error(`[quality] scanned ${picked.length} questions across ${CASES.length || "ALL"} case(s)`);
