#!/usr/bin/env node
// scripts/audit-standalone.mjs
//
// Finds questions that are likely CANDIDATES for `standalone: true` — i.e.,
// questions whose stems introduce numeric scenarios that differ from their
// parent case's `story`. The goal is to flag p1_20-style conflicts where
// the case-context panel would contradict the question's own numbers.
//
// Heuristic: per question, extract any percentage or p(…)=N patterns in
// stem + options, then compare to percentages/numbers extracted from the
// parent case's story. If the stem introduces >=2 distinct numeric
// constants that don't all appear in the case story, flag it for human
// review as a possible `standalone` candidate.
//
// Output: qid · caseId · stem · story-numbers vs stem-numbers mismatch.
// Manual review is required before setting `standalone: true`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const src = readFileSync(resolve(ROOT, "src/data/cases.ts"), "utf8");

// Collect all (caseId, story)
const caseRe = /\{\s*id:\s*"(\w+)",[\s\S]*?story:\s*"((?:[^"\\]|\\.)*)"/g;
const stories = new Map();
let cm;
while ((cm = caseRe.exec(src))) stories.set(cm[1], cm[2]);

// Walk Q("id", [...]) blocks
const qCallRe = /Q\("(\w+)",\s*\[/g;
let m;
let flagged = 0;
let skipped = 0;

console.log("qid\tcase\tstem_numbers\tstory_numbers\tstandalone?\tstem_preview");

while ((m = qCallRe.exec(src))) {
  const bankId = m[1];
  const story = stories.get(bankId) || "";
  const storyNums = extractNumbers(story);
  if (storyNums.length === 0) continue; // case has no numeric facts — skip entirely

  const listStart = m.index + m[0].length - 1;
  let depth = 0, end = listStart;
  for (let i = listStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(listStart + 1, end);

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
    const qid = `${bankId}_${qIdx}`;
    qIdx++;

    // Skip if question already has a scenario or is already flagged standalone.
    const hasScenario = /scenario:\s*"/.test(qBody);
    const alreadyStandalone = /standalone:\s*true/.test(qBody);
    if (hasScenario || alreadyStandalone) { skipped++; continue; }

    const stemMatch = qBody.match(/q:\s*"((?:[^"\\]|\\.)*)"/);
    const stem = stemMatch ? stemMatch[1] : "";
    const stemNums = extractNumbers(stem);

    // Candidate if the stem has ≥2 numeric constants AND most don't appear in story.
    if (stemNums.length >= 2) {
      const shared = stemNums.filter((n) => storyNums.includes(n)).length;
      const novel  = stemNums.length - shared;
      if (novel >= 2) {
        flagged++;
        const preview = stem.replace(/\s+/g, " ").slice(0, 70);
        console.log([qid, bankId, stemNums.join(","), storyNums.join(","), "likely", preview].join("\t"));
      }
    }
  }
}

console.error(`\n[audit-standalone] flagged=${flagged} skipped-had-scenario-or-standalone=${skipped}`);

// --------------------------------------------------------------
// Number extraction. Captures %-values and plain numbers in the
// text. For p1's story "prevalence 1% ... 95% sensitive and 95%
// specific" we get ["1","95","95"]. A question saying "99%
// sensitive, 99% specific test at 0.1% prevalence" yields
// ["99","99","0.1"], none of which overlap.
// --------------------------------------------------------------
function extractNumbers(s) {
  if (!s) return [];
  const re = /\b(\d+(?:\.\d+)?)(?:\s*%|\b)/g;
  const out = [];
  let mm;
  while ((mm = re.exec(s))) out.push(mm[1]);
  return out;
}
