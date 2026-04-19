#!/usr/bin/env node
// scripts/apply-method-fixes.mjs
//
// One-shot fixer: given a { qid → newMethod } table, rewrites cases.ts
// in place. Uses the same block-parser as the audit scripts, so it
// finds each question by qid unambiguously and only swaps its
// `method:"..."` value.
//
// Drop the fix table inline below; run `node scripts/apply-method-fixes.mjs`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PATH = resolve(ROOT, "src/data/cases.ts");

// -----------------------------------------------------------------------
// Fix table. Keep alphabetized per case-prefix for easy reference.
// -----------------------------------------------------------------------
const FIXES = {
  // Foundations — trimmed means / Winsorizing
  "f3_4":  "central_tendency",
  "f3_5":  "spread_variability",
  // Foundations — effect-size
  "f4_7":  "power",
  // Probability — distributions & z-score
  "p3_8":  "roc_auc",
  "p4_18": "prob_dist",
  "p4_19": "prob_dist",
  "p4_20": "normal_zscore",
  // Estimation — test picker chi_square cluster
  "e4_5":  "chi_square",
  "e4_6":  "chi_square",
  "e4_12": "chi_square",
  // Estimation — e5 SE + SMD
  "e5_0":  "clt_sampling",
  "e5_17": "meta_analysis",
  // Hypothesis testing — one-sided, power effect size
  "t2_6":  "hypothesis_testing",
  "a2_5":  "power",
  // Multiplicity — forking paths + closed testing
  "ab1_13": "multiple_testing",
  "ab1_21": "multiple_testing",
  // Regression (r4 GLMM) / r5 GLMs / r2 rate
  "r4_14": "mixed_models",
  "r5_1":  "logistic",
  "r5_8":  "prob_dist",
  "r5_9":  "prob_dist",
  "r5_17": "prob_dist",
  "r5_21": "roc_auc",
  // Design — non-inferiority margin, blinding, bias
  "d3_8":  "study_design",
  "d4_9":  "hypothesis_testing",
  // Causal — collider, IV, cross-world
  "ci1_1":  "confounding",
  "ci3_20": "causal_assumptions",
  "ci4_10": "iv",
  // Missing-data pipeline
  "md2_13": "mice",
  "mm2_11": "mice",
  "mm3_17": "measurement_validity",
  // Measurement — ROC/diagnostic vs logistic
  "me1_4":  "roc_auc",
  "me1_10": "roc_auc",
  "me2_2":  "roc_auc",
  "me2_3":  "roc_auc",
  "me2_4":  "roc_auc",
  "me2_13": "roc_auc",
  "mm1_21": "icc_agreement",
  // R-output cases — diagnostics
  "o2_1":   "regression_diagnostics",
  // Advanced Bayesian — diversify b1 (handled separately) + ab3
  "ab3_1":  "mixed_models",
  "ab3_3":  "bayes",
  "ab3_6":  "bayes",
  "ab3_16": "roc_auc",
  "ab3_19": "bayes",
};

// -----------------------------------------------------------------------
// Parser (shared pattern with audit-methods.mjs).
// -----------------------------------------------------------------------
const src = readFileSync(PATH, "utf8");

// We rewrite the file by walking Q("id", [...]) bodies and replacing
// `method:"X"` inside each matched question, but only when the qid hits
// the FIXES table. Each question is a brace-balanced block.

function rewrite(src) {
  let out = "";
  let i = 0;
  const qCallRe = /Q\("(\w+)",\s*\[/g;
  let m;
  let cursor = 0;
  const applied = [];

  while ((m = qCallRe.exec(src))) {
    const bankId = m[1];
    const listStart = m.index + m[0].length - 1; // points at '['
    // find matching ']'
    let depth = 0, listEnd = listStart;
    for (let k = listStart; k < src.length; k++) {
      const ch = src[k];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { listEnd = k; break; } }
    }
    // Emit everything up to and including the '['
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
    const target = FIXES[qid];
    if (target) {
      // Replace the FIRST method:"..." inside this question body.
      const re = /method:"([a-z_]+)"/;
      const curMatch = qBody.match(re);
      if (curMatch && curMatch[1] !== target) {
        const replaced = qBody.replace(re, `method:"${target}"`);
        result += replaced;
        applied.push({ qid, from: curMatch[1], to: target });
      } else {
        result += qBody;
      }
    } else {
      result += qBody;
    }
    qIdx++;
  }
  return result;
}

const { text, applied } = rewrite(src);
writeFileSync(PATH, text);

console.log(`Applied ${applied.length} method-tag fixes:`);
for (const a of applied) console.log(`  ${a.qid.padEnd(8)} ${a.from.padEnd(20)} → ${a.to}`);

const unapplied = Object.keys(FIXES).filter((q) => !applied.find((a) => a.qid === q));
if (unapplied.length) {
  console.error(`\nWARN: ${unapplied.length} qids in FIXES not found or already at target:`);
  for (const q of unapplied) console.error(`  ${q}`);
}
