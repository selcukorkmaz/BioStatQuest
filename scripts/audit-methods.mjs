#!/usr/bin/env node
// scripts/audit-methods.mjs
//
// One-shot auditor for the `method:` field on every question in
// src/data/cases.ts. Goal: catch questions whose semantic content (stem +
// options + explanation) suggests a different method than the one declared.
//
// We do this by scoring each question against a keyword dictionary for every
// valid method. If the DECLARED method's score is meaningfully beaten by a
// different method, we flag it for review.
//
// Output: a ranked TSV to stdout + stderr summary. Manual review is required
// before applying any fix — this tool is for detection, not auto-fix.
//
// Usage: node scripts/audit-methods.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Canonical method IDs from methods.ts (top-level keys only, not nested ones
// like `intuition`/`formula` which share the same indentation pattern).
// ---------------------------------------------------------------------------
function loadMethodIds() {
  const src = readFileSync(resolve(ROOT, "src/data/methods.ts"), "utf8");
  const ids = new Set();
  const re = /^  ([a-z_]+): \{$/gm;
  let m;
  while ((m = re.exec(src))) ids.add(m[1]);
  return ids;
}

// ---------------------------------------------------------------------------
// Keyword dictionary per method. Tuned toward the vocabulary actually used in
// the bank (case stems + explanations). Order within an array doesn't matter.
// Multi-word phrases are matched as whole substrings, case-insensitive.
// ---------------------------------------------------------------------------
const KW = {
  anova: ["anova", "one-way", "two-way", "repeated measures", "post-hoc", "post hoc", "tukey hsd", "tukey's honestly", "levene", "kruskal-wallis", "cochran-armitage", "between-group", "within-group"],
  chi_square: ["chi-square", "chi square", "chisquare", "χ²", "contingency", "fisher's exact", "fisher exact", "2x2", "2×2", "mcnemar", "cochran-armitage", "expected count", "categorical outcome"],
  t_test: ["t-test", "t test", "student's t", "welch", "paired t-test", "paired t test", "independent t-test", "two-sample t", "one-sample t"],
  lm: ["linear regression", "ols", "ordinary least squares", "slope", "intercept", "r-squared", "r²", "coefficient", "least-squares", "adjusted r²", "beta coefficient", "standardized", "interaction term"],
  logistic: ["logistic regression", "log-odds", "logit", "odds ratio", "or =", "firth", "separation", "hosmer-lemeshow", "pseudo-r²", "conditional logistic", "link function"],
  km_logrank: ["kaplan-meier", "log-rank", "logrank", "survival curve", "censoring", "time-to-event", "median survival"],
  cox_ph: ["cox", "cox regression", "hazard ratio", "proportional hazards", "schoenfeld", "hr ="],
  ci: ["confidence interval", "95% ci", "99% ci", "90% ci", "margin of error", "wald ci", "wilson", "clopper-pearson", "bca", "credible interval comparison", "percentile bootstrap ci"],
  hypothesis_testing: ["p-value", "p value", "null hypothesis", "type i error", "type ii error", "α =", "alpha", "two-sided", "one-sided", "reject h0", "reject the null", "fail to reject", "test statistic", "equivalence test", "non-inferiority", "p="],
  power: ["power", "sample size", "cohen's d", "cohen's h", "mcid", "effect size", "noncentrality", "underpowered"],
  multiple_testing: ["bonferroni", "holm", "benjamini-hochberg", "benjamini hochberg", "bh procedure", "fdr", "family-wise", "fwer", "multiplicity", "q-value", "p-hacking", "closed testing", "gatekeeping", "alpha-spending", "permutation testing"],
  bayes: ["bayes", "posterior", "prior", "credible interval", "bayes factor", "mcmc", "gibbs", "hpd", "beta(1,1)", "conjugate prior", "informative prior", "flat prior", "weakly informative", "bayesian", "hierarchical bayesian"],
  roc_auc: ["auc", "roc", "sensitivity", "specificity", "positive predictive", "ppv", "npv", "likelihood ratio", "lr+", "lr−", "lr-", "youden", "calibration", "discrimination", "c-statistic", "net reclassification", "decision-curve", "pre-test probability", "post-test probability"],
  confounding: ["confound", "stratification", "regression adjustment", "dag", "directed acyclic", "unmeasured confounding", "collider"],
  iv: ["instrumental variable", "instrumental-variable", "two-stage", "2sls", "mendelian randomization", "weak instrument", "strong instrument", "f-statistic > 10"],
  mediation: ["mediator", "mediation", "direct effect", "indirect effect", "exposure → mediator", "table 2 fallacy"],
  meta_analysis: ["meta-analysis", "meta analysis", "heterogeneity", "i²", "tau²", "funnel plot", "forest plot", "fixed-effect", "random-effects", "pooled estimate"],
  study_design: ["cohort", "case-control", "cross-sectional", "rct", "randomized", "nested", "pragmatic", "cluster rct", "factorial trial", "crossover trial", "stepped-wedge", "equipoise", "allocation concealment", "blinding", "itt", "intention-to-treat", "per-protocol", "run-in", "ecological"],
  bias: ["selection bias", "information bias", "measurement bias", "recall bias", "healthy worker", "detection bias", "publication bias", "immortal time", "lead time", "length bias", "spectrum bias", "verification bias", "confounding by indication"],
  normal_zscore: ["z-score", "z score", "standard normal", "empirical rule", "z = ", "1.96", "standardize", "p(z", "tail probability"],
  prob_dist: ["poisson", "binomial", "exponential distribution", "uniform(", "gamma distribution", "lognormal", "negative binomial", "chi-square distribution", "t-distribution approaches", "zero-inflated", "heavy-tailed", "kurtosis"],
  variable_types: ["nominal", "ordinal", "interval scale", "ratio scale", "continuous numeric", "discrete numeric", "discrete count", "categorical", "variable type", "scale of measurement", "blood type", "pain score"],
  central_tendency: ["mean", "median", "mode", "central tendency", "arithmetic mean", "weighted mean", "percentile", "quartile", "25th percentile", "75th percentile"],
  spread_variability: ["standard deviation", "variance", "iqr", "interquartile", "range", "coefficient of variation", "mad", "robust statistic", "outlier", "spread"],
  descriptive: ["histogram", "boxplot", "box plot", "violin plot", "skew", "right-skewed", "left-skewed", "log transformation", "exploratory"],
  regression_diagnostics: ["residual", "homoscedastic", "heteroscedastic", "heteroscedasticity", "leverage", "influence", "cook's", "vif", "variance inflation", "multicollinearity", "qq-plot", "qq plot", "shapiro-wilk", "hc standard errors", "sandwich standard"],
  model_selection: ["aic", "bic", "cross-validation", "k-fold", "ridge", "lasso", "elastic net", "l1 penalty", "l2 penalty", "dic", "waic", "model comparison", "quasi-poisson", "overdispersion"],
  mixed_models: ["mixed-effects", "mixed effects model", "random effect", "random intercept", "sphericity", "repeated-measures anova", "hierarchical model", "multilevel", "partial pooling"],
  bootstrap: ["bootstrap", "resample", "resampling", "percentile bootstrap", "bca", "parametric bootstrap", "sd of bootstrap"],
  clt_sampling: ["central limit theorem", "clt", "sampling distribution", "standard error", "se =", "se is"],
  icc_agreement: ["icc", "intraclass correlation"],
  kappa: ["kappa", "cohen's kappa", "inter-rater", "agreement beyond chance"],
  bland_altman: ["bland-altman", "bland altman", "limits of agreement"],
  measurement_validity: ["reliability", "validity", "minimum clinically important", "mcid", "cronbach"],
  psm: ["propensity score", "propensity matching", "overlap"],
  iptw: ["iptw", "inverse probability weighting", "stabilized weight"],
  target_trial: ["target trial", "pharmacoepi", "person-time", "time-varying exposure", "new-user design"],
  did: ["difference-in-differences", "difference in differences", "parallel trends"],
  rdd: ["regression discontinuity", "cutoff rule", "running variable"],
  e_value: ["e-value", "e value"],
  causal_assumptions: ["positivity", "exchangeability", "consistency", "counterfactual", "g-methods", "g-computation", "ipw"],
  mice: ["multiple imputation", "mice", "chained equations", "imputation model"],
  // — non-content buckets below are rare and intentionally under-weighted —
};

// ---------------------------------------------------------------------------
// Parse questions out of cases.ts. We use a regex because the file is
// hand-formatted with one consistent pattern; a real parser would be
// overkill for a one-shot audit.
// ---------------------------------------------------------------------------
function parseQuestions() {
  const src = readFileSync(resolve(ROOT, "src/data/cases.ts"), "utf8");
  const out = [];

  // Match each `Q("xx", [ ... ])` block by first capturing the bank id,
  // then iterating over its children. The easy parse: find `Q("id",` lines
  // and slice from `[` to its matching `])`.
  const qCallRe = /Q\("(\w+)",\s*\[/g;
  let m;
  while ((m = qCallRe.exec(src))) {
    const bankId = m[1];
    const startIdx = m.index + m[0].length - 1; // points at '['
    let depth = 0;
    let end = startIdx;
    for (let i = startIdx; i < src.length; i++) {
      const ch = src[i];
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(startIdx + 1, end);

    // Split into individual `{ ... }` entries — one per question. Walk
    // brace-matched depth to handle nested objects (e.g. arrays in options).
    let qIdx = 0;
    let i = 0;
    while (i < body.length) {
      // skip to next `{`
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
      const qidField = `${bankId}_${qIdx}`;
      const fields = extractFields(qBody);
      out.push({ qid: qidField, caseId: bankId, ...fields, raw: qBody });
      qIdx++;
    }
  }
  return out;
}

function extractFields(qBody) {
  // Lenient parsers — we just want the text content to score on.
  const q = firstString(qBody, "q:") || "";
  const method = firstString(qBody, "method:") || "";
  const scenario = firstString(qBody, "scenario:") || "";
  const explain = firstString(qBody, "explain:") || "";
  // options: either ["a","b"] or a multiline ["a","b","c","d"]
  const opts = [];
  const optRe = /options:\s*\[([\s\S]*?)\]/;
  const om = qBody.match(optRe);
  if (om) {
    const inner = om[1];
    const sRe = /"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = sRe.exec(inner))) opts.push(sm[1]);
  }
  return { q, scenario, explain, method, options: opts };
}

function firstString(src, key) {
  const re = new RegExp(key + '\\s*"((?:[^"\\\\]|\\\\.)*)"');
  const m = src.match(re);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Scorer: for one question, compute a hit count per method using the keyword
// dictionary. The "haystack" is stem + options + explain + scenario, all
// lowercased, so a keyword like "kaplan-meier" matches regardless of where
// it appears.
// ---------------------------------------------------------------------------
function scoreQuestion(q) {
  const hay = [
    q.q || "",
    q.scenario || "",
    (q.options || []).join(" | "),
    q.explain || "",
  ].join(" ").toLowerCase();

  const scores = {};
  for (const [method, kws] of Object.entries(KW)) {
    let s = 0;
    for (const kw of kws) {
      const k = kw.toLowerCase();
      if (hay.includes(k)) s++;
    }
    scores[method] = s;
  }
  return scores;
}

function topPicks(scores, k = 3) {
  return Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const methodIds = loadMethodIds();
const qs = parseQuestions();

console.error(`[audit] loaded ${methodIds.size} canonical methods and ${qs.length} questions`);

let invalidMethod = 0;
let suspicious = [];
let orphan = [];

for (const q of qs) {
  if (!q.method) { orphan.push(q); continue; }
  if (!methodIds.has(q.method)) {
    invalidMethod++;
    suspicious.push({ q, declared: q.method, winner: "UNKNOWN_METHOD", winScore: 0, declaredScore: 0, alts: [] });
    continue;
  }
  const scores = scoreQuestion(q);
  const declaredScore = scores[q.method] ?? 0;
  const top = topPicks(scores, 3);
  if (top.length === 0) continue; // no keywords hit — can't judge

  const winner = top[0][0];
  const winScore = top[0][1];

  // Flag criterion: the top-scoring method is different from declared AND
  // beats declared by ≥2 hits (to avoid false positives from 1-word overlaps).
  if (winner !== q.method && (winScore - declaredScore) >= 2) {
    suspicious.push({ q, declared: q.method, winner, winScore, declaredScore, alts: top });
  }
}

// Header
console.log(["qid", "case", "declared_method", "declared_score", "top_candidate", "top_score", "stem_preview"].join("\t"));
suspicious.sort((a, b) => (b.winScore - b.declaredScore) - (a.winScore - a.declaredScore));
for (const s of suspicious) {
  const stem = (s.q.q || "").replace(/\s+/g, " ").slice(0, 80);
  console.log([s.q.qid, s.q.caseId, s.declared, s.declaredScore, s.winner, s.winScore, stem].join("\t"));
}

console.error(`[audit] ${suspicious.length} flagged · invalid-method: ${invalidMethod} · orphan (no method): ${orphan.length}`);
