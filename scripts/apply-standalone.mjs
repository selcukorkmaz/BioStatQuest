#!/usr/bin/env node
// scripts/apply-standalone.mjs
//
// Batch applier for `standalone: true` on questions flagged as likely
// self-contained (stem introduces its own numeric scenario that would
// conflict with the parent case story). Same block-parser pattern as
// apply-method-fixes.mjs.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PATH = resolve(ROOT, "src/data/cases.ts");

// Curated: questions reviewed from audit-standalone.mjs whose stems
// clearly introduce numbers that contradict or are unrelated to the
// case's story. Skips borderlines (generic definitions / theoretical
// properties) where the case context is odd but not misleading.
const STANDALONE_QIDS = new Set([
  // f2 — case story is about ER wait-time data; binomial/uniform questions
  //       are pure distribution math.
  "f2_8", "f2_9", "f2_20",
  // p2 — case story's CLT scenario differs from the biomarker σ=8, n=64 Q.
  "p2_10",
  // e1 — case story is the BP-REDUCE 8 mmHg trial; this asks about a
  //       generic CI 3.2 ± 0.5.
  "e1_9",
  // e3 — case story numerics are about a specific reported mean; these
  //       questions introduce their own sample sizes / SEs.
  "e3_3", "e3_11", "e3_12", "e3_19",
  // ab1 — case story is 20,000 genes; these Qs use 20 or 100 tests.
  "ab1_1", "ab1_3",
  // f4 — case story specifies particular correlations; these introduce
  //       fresh r values / Cohen's d / proportions / OR.
  "f4_2", "f4_6", "f4_10", "f4_18",
  // p5 — case story has specific joint-probability numbers; these Qs
  //       all introduce their own P(A), P(B) etc.
  "p5_2", "p5_3", "p5_13", "p5_17", "p5_19",
]);

const src = readFileSync(PATH, "utf8");

function rewrite(src) {
  let out = "";
  let cursor = 0;
  const qCallRe = /Q\("(\w+)",\s*\[/g;
  let m;
  const applied = [];

  while ((m = qCallRe.exec(src))) {
    const bankId = m[1];
    const listStart = m.index + m[0].length - 1;
    let depth = 0, listEnd = listStart;
    for (let k = listStart; k < src.length; k++) {
      const ch = src[k];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { listEnd = k; break; } }
    }
    out += src.slice(cursor, listStart + 1);
    const body = src.slice(listStart + 1, listEnd);
    out += rewriteBody(bankId, body, applied);
    cursor = listEnd;
    qCallRe.lastIndex = listEnd;
  }
  out += src.slice(cursor);
  return { text: out, applied };
}

function rewriteBody(bankId, body, applied) {
  let result = "";
  let i = 0;
  let qIdx = 0;
  while (i < body.length) {
    while (i < body.length && body[i] !== "{") { result += body[i]; i++; }
    if (i >= body.length) break;
    const qStart = i;
    let d = 0;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{") d++;
      else if (ch === "}") { d--; if (d === 0) { i++; break; } }
    }
    const qBody = body.slice(qStart, i);
    const qid = `${bankId}_${qIdx}`;
    qIdx++;

    if (!STANDALONE_QIDS.has(qid)) { result += qBody; continue; }
    if (/standalone:\s*true/.test(qBody)) { result += qBody; continue; }

    // Insert `standalone:true,` after the `type:"..."` field to keep
    // it alongside the other declarative flags.
    const typeRe = /(type:\s*"(?:mcq|numeric|multi)",)/;
    const replaced = qBody.replace(typeRe, `$1 standalone:true,`);
    if (replaced !== qBody) {
      result += replaced;
      applied.push(qid);
    } else {
      // Fallback: prepend at the start of the object if no type field found.
      result += qBody;
    }
  }
  return result;
}

const { text, applied } = rewrite(src);
writeFileSync(PATH, text);

console.log(`Applied standalone:true to ${applied.length} questions:`);
for (const qid of applied) console.log(`  ${qid}`);

const missed = [...STANDALONE_QIDS].filter((q) => !applied.includes(q));
if (missed.length) {
  console.error(`\nWARN: ${missed.length} qids not found:`);
  for (const q of missed) console.error(`  ${q}`);
}
