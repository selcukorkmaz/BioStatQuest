// Property tests for the seeded item generators.
//
// A static question is reviewed once by a human and is then correct forever.
// A generator is reviewed once and must be correct for every seed — so the
// review has to be mechanical. These tests do three jobs:
//
//   1. STRUCTURE — mirror the invariants cases.test.ts enforces on the bank,
//      so a generated item can never be shaped in a way the UI can't render.
//   2. TEXT ↔ KEY AGREEMENT — the failure mode unique to generators is the
//      stem saying "87" while the key was computed from 0.87. So the checks
//      below parse the numbers back OUT of the text the learner actually
//      sees and re-derive the answer by an independent route.
//   3. NON-DEGENERACY — over thousands of seeds, no throw, no duplicate
//      option, no distractor that is accidentally also correct.

import { describe, it, expect } from "vitest";
import {
  FAMILIES, FAMILY_BY_ID, instantiate, makeRng, isFamilyQid,
  familiesForMethods, drawForMethods, drawFamilyQuestion,
  type GeneratedQuestion, type QuestionFamily,
} from "./generators";
import { VARIABLES, type VarKind } from "./generators/foundations";
import { PROCESSES, GOALS, type DistName, type DesignName } from "./generators/probability";
import { METHODS } from "./methods";
import { CASES } from "./cases";

const SEEDS = 1000;
const seedAt = (i: number) => (i * 2654435761) >>> 0;
const toNum = (s: string) => Number(s.replace(/,/g, ""));

describe("generator registry", () => {
  it("has at least one family", () => {
    expect(FAMILIES.length).toBeGreaterThan(0);
  });

  it("has unique family ids", () => {
    const ids = FAMILIES.map((f) => f.fid);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references known methods", () => {
    for (const f of FAMILIES) {
      expect(Object.keys(METHODS), `${f.fid} → ${f.method}`).toContain(f.method);
    }
  });

  it("never collides with a static bank qid", () => {
    // qid is the shared key across state.srs, public.reviews and public.events.
    // A family id that shadowed a bank item would silently merge two different
    // questions' scheduling and accuracy history.
    const bankQids = new Set<string>();
    for (const c of CASES) for (const q of c.bank) bankQids.add(q.qid as string);
    for (const f of FAMILIES) {
      expect(bankQids.has(f.fid), `${f.fid} collides with a bank qid`).toBe(false);
    }
  });

  it("resolves helpers", () => {
    expect(isFamilyQid("gen_ppv")).toBe(true);
    expect(isFamilyQid("f1_0")).toBe(false);
    expect(isFamilyQid(undefined)).toBe(false);
    expect(familiesForMethods(["roc_auc"]).map((f) => f.fid)).toEqual(["gen_ppv"]);
    expect(familiesForMethods(["variable_types"]).map((f) => f.fid)).toEqual(["gen_variable_type"]);
    expect(familiesForMethods(["mediation", "rdd", "icc_agreement"])).toEqual([]);
    expect(drawForMethods(["roc_auc", "ci"], 1).length).toBe(2);
    expect(drawFamilyQuestion("nope_not_a_family", 1)).toBeNull();
  });
});

describe("makeRng", () => {
  it("is deterministic and stays in [0,1)", () => {
    const a = Array.from({ length: 50 }, () => makeRng(42).next());
    expect(new Set(a).size).toBe(1);
    const seq = Array.from({ length: 5000 }, (_, i) => makeRng(i).next());
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // Crude uniformity guard — catches a broken mixing step.
    const mean = seq.reduce((s, v) => s + v, 0) / seq.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });

  it("int() respects inclusive bounds", () => {
    const rng = makeRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });
});

// ------------------------------------------------------------
// Per-variant semantic checks: re-derive the key from the RENDERED text.
// ------------------------------------------------------------
// Labels restated here on purpose. If someone renames an option in a family,
// these tests must fail rather than silently agree with the new spelling.
const KIND_LABEL_T: Record<VarKind, string> = {
  nominal: "Nominal categorical", ordinal: "Ordinal categorical",
  count: "Discrete count", continuous: "Continuous numeric",
};
const STEVENS_LABEL_T: Record<string, string> = {
  nominal: "Nominal", ordinal: "Ordinal", interval: "Interval", ratio: "Ratio",
};
const DIST_LABEL_T: Record<DistName, string> = {
  binomial: "Binomial", poisson: "Poisson", normal: "Normal", exponential: "Exponential",
};
const DESIGN_LABEL_T: Record<DesignName, string> = {
  srs: "Simple random sampling", stratified: "Stratified sampling",
  cluster: "Cluster sampling", systematic: "Systematic sampling",
  convenience: "Convenience sampling",
};
const TAIL_T = [
  { z: 1.0, one: 15.9 }, { z: 1.28, one: 10.0 }, { z: 1.645, one: 5.0 },
  { z: 1.96, one: 2.5 }, { z: 2.33, one: 1.0 }, { z: 2.58, one: 0.5 },
];

/** Recover the sampling design from the rendered procedure, not from _params. */
function designFromText(text: string): DesignName {
  if (/equally likely to be picked/.test(text)) return "srs";
  if (/divided by hospital site/.test(text)) return "stratified";
  if (/general practices are selected at random/.test(text)) return "cluster";
  if (/every \d+th name/.test(text)) return "systematic";
  if (/whoever attends/.test(text)) return "convenience";
  throw new Error(`unrecognised sampling procedure: ${text}`);
}

// --- study designs, restated independently of design.ts ---
type DK = "rct" | "cohort" | "case_control" | "cross_sectional" | "case_series";
const DESIGN_SIG: [DK, RegExp][] = [
  ["rct", /randomly allocated/],
  ["cohort", /free of .+ at baseline are grouped by/],
  ["case_control", /matched controls without it are then asked/],
  ["cross_sectional", /single survey of .+ records current/],
  ["case_series", /no comparison group is included/],
];
const DESIGN_NAME_T: Record<DK, string> = {
  rct: "Randomised controlled trial", cohort: "Prospective cohort study",
  case_control: "Case-control study", cross_sectional: "Cross-sectional survey",
  case_series: "Case series",
};
const DESIGN_MEASURE_T: Record<DK, string> = {
  rct: "A risk ratio or risk difference", cohort: "A risk ratio or risk difference",
  case_control: "An odds ratio only", cross_sectional: "A prevalence ratio",
  case_series: "No measure of association at all",
};
const DESIGN_SAMPLED_T: Record<DK, RegExp> = {
  rct: /^On exposure — the investigators assigned/,
  cohort: /^On exposure — people were grouped/,
  case_control: /^On outcome — cases and controls/,
  cross_sectional: /^On neither/,
  case_series: /^On outcome or treatment/,
};

// --- biases, restated independently of design.ts ---
type BK = "selection" | "recall" | "nondifferential" | "lead_time" | "immortal_time" | "confounding";
const BIAS_SIG: [BK, RegExp][] = [
  ["selection", /health-awareness fair/],
  ["recall", /asked to remember their use/],
  ["nondifferential", /equally likely in both groups/],
  ["lead_time", /survival measured from the date of diagnosis/],
  ["immortal_time", /follow-up for everyone starts at cohort entry/],
  ["confounding", /systematically younger and have fewer comorbidities/],
];
const BIAS_NAME_T: Record<BK, string> = {
  selection: "Selection bias", recall: "Recall bias",
  nondifferential: "Non-differential misclassification", lead_time: "Lead-time bias",
  immortal_time: "Immortal time bias", confounding: "Confounding",
};
const BIAS_DIR_T: Record<BK, RegExp> = {
  selection: /^Unpredictable/, recall: /^Away from the null/,
  nondifferential: /^Towards the null/, lead_time: /^Away from the null/,
  immortal_time: /^Away from the null/, confounding: /^Unpredictable/,
};
const BIAS_FIX_T: Record<BK, RegExp> = {
  selection: /defined population frame/, recall: /prospectively recorded records/,
  nondifferential: /validated instrument or a biomarker/,
  lead_time: /disease-specific MORTALITY/, immortal_time: /treatment assignment/,
  confounding: /common causes/,
};

const matchOne = <K extends string>(sigs: [K, RegExp][], text: string, what: string): K => {
  const hits = sigs.filter(([, re]) => re.test(text));
  if (hits.length !== 1) throw new Error(`${what}: ${hits.length} signatures matched "${text.slice(0, 90)}"`);
  return hits[0][0];
};

/** Estimates from the first numeric column of a printed coefficient table. */
const rEstimates = (output: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const line of output.split("\n").slice(2)) {
    const m = line.match(/^(\S+)\s+(-?\d+\.\d+)/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
};

// --- causal roles, restated independently of causal.ts ---
type RK = "confounder" | "mediator" | "collider" | "instrument";
const ROLE_SIG: [RK, RegExp][] = [
  ["confounder", /both raises the chance of being prescribed|drives both the decision to admit|influences both whether .+ is started and whether/],
  ["mediator", /the drug lowers LDL cholesterol|produces weight loss, and that weight loss|lowers blood pressure, and the lower pressure/],
  ["collider", /each independently make admission more likely|entry into the registry requires either|caused both by maternal smoking/],
];
const ROLE_LABEL_T: Record<RK, string> = {
  confounder: "A confounder", mediator: "A mediator",
  collider: "A collider", instrument: "An instrumental variable",
};
const ROLE_ADJUST_T: Record<RK, RegExp> = {
  confounder: /^Yes — adjusting removes the bias/,
  mediator: /^No, not if you want the TOTAL effect/,
  collider: /^No — adjusting for it CREATES/,
  instrument: /^No — adjusting for it throws away/,
};
const ROLE_CONSEQ_T: Record<RK, RegExp> = {
  confounder: /moves closer to the causal effect/,
  mediator: /shrinks toward zero/,
  collider: /spurious association appears/,
  instrument: /Precision falls/,
};

// --- missingness mechanisms, restated independently of measurement.ts ---
type MK = "mcar" | "mar" | "mnar";
const MISS_SIG: [MK, RegExp][] = [
  ["mcar", /freezer failure destroyed|questionnaires was lost in the post/],
  ["mar", /Older participants were markedly more likely to skip|clinic closure at one of the/],
  ["mnar", /heaviest drinkers were the least likely to report|participants whose depression score worsened/],
];
const MISS_LABEL_T: Record<MK, string> = {
  mcar: "Missing completely at random (MCAR)",
  mar: "Missing at random (MAR)",
  mnar: "Missing not at random (MNAR)",
};
const MISS_CC_T: Record<MK, RegExp> = {
  mcar: /^Unbiased, but wasteful/, mar: /^Biased, unless the analysis conditions/,
  mnar: /^Biased, and no analysis of the observed data alone/,
};
const MISS_METHOD_T: Record<MK, RegExp> = {
  mcar: /complete-case analysis is defensible/, mar: /Multiple imputation/,
  mnar: /Sensitivity analysis/,
};

// --- validity, restated independently of measurement.ts ---
type VK = "content" | "criterion" | "construct" | "face";
const VALIDITY_SIG: [VK, RegExp][] = [
  ["content", /specialists reviews whether the items/],
  ["criterion", /reference standard structured interview/],
  ["construct", /with measures theory says should be unrelated/],
  ["face", /simply looks, on reading it/],
];
const VALIDITY_LABEL_T: Record<VK, string> = {
  content: "Content validity", criterion: "Criterion validity",
  construct: "Construct validity", face: "Face validity",
};
const RELIABILITY_SIG: [string, RegExp][] = [
  ["Reliable but not valid", /reads exactly .+ units heavy/],
  ["Valid on average but unreliable", /scatter widely around the true value/],
  ["Neither reliable nor valid", /Two observers scoring the same patient/],
  ["Both reliable and valid", /agree closely with each other and with the reference/],
];

const keyText = (q: GeneratedQuestion) => (q.options as string[])[q.answer as number];

const keyedOptionValue = (q: GeneratedQuestion) => {
  const txt = (q.options as string[])[q.answer as number];
  const m = txt.match(/(-?[\d,.]+)/);
  return m ? toNum(m[1]) : NaN;
};

function verify(q: GeneratedQuestion) {
  const where = `${q._fid}:${q._variant} (seed ${q._seed})`;
  const scenario = q.scenario ?? "";

  switch (`${q._fid}:${q._variant}`) {
    case "gen_ppv:rates": {
      const pm = scenario.match(/prevalence of .+? is ([\d.]+)%/);
      const sm = scenario.match(/sensitivity ([\d.]+)% and specificity ([\d.]+)%/);
      expect(pm, `${where}: prevalence not stated`).toBeTruthy();
      expect(sm, `${where}: sens/spec not stated`).toBeTruthy();
      const p = Number(pm![1]) / 100, se = Number(sm![1]) / 100, sp = Number(sm![2]) / 100;
      // Independent route: Bayes directly, no cohort table.
      const bayes = (p * se) / (p * se + (1 - p) * (1 - sp)) * 100;
      const keyed = q.answer as number;
      expect(Math.abs(keyed - bayes), `${where}: key ${keyed} vs Bayes ${bayes.toFixed(3)}`)
        .toBeLessThan(Math.max(0.05, bayes * 0.005));
      expect(q.tol!).toBeGreaterThan(0);
      expect(keyed).toBeGreaterThan(0);
      expect(keyed).toBeLessThan(100);
      break;
    }

    case "gen_ppv:table": {
      const m = scenario.match(
        /positive in ([\d,]+) of the ([\d,]+) who have it, and positive in ([\d,]+) of the ([\d,]+) who do not/,
      );
      expect(m, `${where}: counts not stated`).toBeTruthy();
      const tp = toNum(m![1]), sick = toNum(m![2]), fp = toNum(m![3]), well = toNum(m![4]);
      expect(sick + well, `${where}: margins must sum to the cohort`).toBe(100_000);
      expect(tp).toBeLessThanOrEqual(sick);
      expect(fp).toBeLessThanOrEqual(well);
      const ppv = (tp / (tp + fp)) * 100;
      expect(Math.abs(keyedOptionValue(q) - ppv), `${where}: keyed option vs TP/(TP+FP)`)
        .toBeLessThan(0.06);
      // Every distractor must be a genuinely different number.
      (q.options as string[]).forEach((opt, i) => {
        if (i === q.answer) return;
        expect(Math.abs(toNum(opt.match(/([\d.,]+)/)![1]) - ppv), `${where}: distractor ${i} equals the key`)
          .toBeGreaterThan(0.06);
      });
      break;
    }

    case "gen_ppv:shift": {
      const prevs = [...scenario.matchAll(/prevalence is ([\d.]+)%/g)].map((x) => Number(x[1]) / 100);
      const sm = scenario.match(/sensitivity ([\d.]+)% and specificity ([\d.]+)%/);
      expect(prevs.length, `${where}: expected two prevalences`).toBe(2);
      expect(sm).toBeTruthy();
      const [pHigh, pLow] = prevs;
      const se = Number(sm![1]) / 100, sp = Number(sm![2]) / 100;
      expect(pHigh, `${where}: clinic prevalence must exceed screening prevalence`).toBeGreaterThan(pLow);
      const ppv = (p: number) => (p * se) / (p * se + (1 - p) * (1 - sp)) * 100;
      const keyText = (q.options as string[])[q.answer as number];
      expect(keyText, `${where}: key should describe a fall`).toMatch(/falls sharply/i);
      const shown = [...keyText.matchAll(/([\d.]+)%/g)].map((x) => Number(x[1]));
      expect(shown.length, `${where}: key should quote both PPVs`).toBe(2);
      expect(Math.abs(shown[0] - ppv(pHigh)), `${where}: quoted clinic PPV`).toBeLessThan(0.2);
      expect(Math.abs(shown[1] - ppv(pLow)), `${where}: quoted screening PPV`).toBeLessThan(0.2);
      expect(shown[0], `${where}: PPV must fall`).toBeGreaterThan(shown[1]);
      break;
    }

    case "gen_ci_width:halfwidth": {
      const m = scenario.match(/n = (\d+) participants: mean ([\d.]+) [^,]*, SD ([\d.]+)/);
      expect(m, `${where}: n/mean/SD not stated`).toBeTruthy();
      const n = Number(m![1]), sd = Number(m![3]);
      const half = 1.96 * sd / Math.sqrt(n);
      expect(Math.abs((q.answer as number) - half), `${where}: key vs 1.96·SD/√n`)
        .toBeLessThanOrEqual(q.tol!);
      expect(q.tol!).toBeGreaterThan(0);
      break;
    }

    case "gen_ci_width:scaling": {
      const nm = scenario.match(/enrolled n = (\d+)/);
      const km = scenario.match(/to be (\d+) times narrower/);
      expect(nm, `${where}: pilot n not stated`).toBeTruthy();
      expect(km, `${where}: narrowing factor not stated`).toBeTruthy();
      const n = Number(nm![1]), k = Number(km![1]);
      const want = n * k * k;
      expect(keyedOptionValue(q), `${where}: key should be n·k²`).toBe(want);
      (q.options as string[]).forEach((opt, i) => {
        if (i === q.answer) return;
        expect(toNum(opt.match(/([\d,]+)/)![1]), `${where}: distractor ${i} equals n·k²`).not.toBe(want);
      });
      break;
    }

    case "gen_ci_width:interpret": {
      const m = scenario.match(/95% CI (-?[\d.]+) to (-?[\d.]+)/);
      expect(m, `${where}: interval not stated`).toBeTruthy();
      const lo = Number(m![1]), hi = Number(m![2]);
      expect(hi, `${where}: interval must be ordered`).toBeGreaterThan(lo);
      const coversNull = lo < 0 && hi > 0;
      const keyText = (q.options as string[])[q.answer as number];
      // The whole point of this variant: the key flips with the seed.
      if (coversNull) {
        expect(keyText, `${where}: null-covering interval must key to the inconclusive reading`)
          .toMatch(/compatible with no difference/i);
        expect(keyText).not.toMatch(/statistically significant/i);
      } else {
        expect(keyText, `${where}: null-excluding interval must key to significance`)
          .toMatch(/statistically significant/i);
      }
      // These two are wrong under every seed and must always be offered.
      const all = (q.options as string[]).join(" | ");
      expect(all).toMatch(/95% probability that the true difference/i);
      expect(all).toMatch(/95% of participants/i);
      break;
    }

    // ---------- foundations: variable types ----------
    case "gen_variable_type:classify": {
      const m = scenario.match(/One column records (.+)\.$/);
      expect(m, `${where}: variable not named in the scenario`).toBeTruthy();
      const entry = VARIABLES.find((v) => v.name === m![1]);
      expect(entry, `${where}: "${m?.[1]}" is not a pool entry`).toBeTruthy();
      expect(keyText(q), `${where}: key must match the pool's kind`).toBe(KIND_LABEL_T[entry!.kind]);
      expect(entry!.stevensOnly, `${where}: stevens-only entry leaked into classify`).toBeFalsy();
      break;
    }

    case "gen_variable_type:stevens": {
      const m = q.q.match(/^On Stevens' taxonomy, (.+) is measured on which scale\?$/);
      expect(m, `${where}: variable not named in the stem`).toBeTruthy();
      const entry = VARIABLES.find((v) => v.name === m![1]);
      expect(entry, `${where}: "${m?.[1]}" is not a pool entry`).toBeTruthy();
      expect(keyText(q)).toBe(STEVENS_LABEL_T[entry!.stevens]);
      break;
    }

    case "gen_variable_type:odd_one_out": {
      const m = q.q.match(/only (.+) variable\?$/);
      expect(m, `${where}: target kind not stated`).toBeTruthy();
      const kind = (Object.keys(KIND_LABEL_T) as VarKind[])
        .find((k) => KIND_LABEL_T[k].toLowerCase() === m![1]);
      expect(kind, `${where}: unknown target kind "${m?.[1]}"`).toBeTruthy();
      const entries = (q.options as string[]).map((o) => VARIABLES.find((v) => v.name === o));
      entries.forEach((e, i) => expect(e, `${where}: option ${i} is not a pool entry`).toBeTruthy());
      expect(entries.filter((e) => e!.kind === kind).length,
        `${where}: the target kind must appear exactly once`).toBe(1);
      expect(entries[q.answer as number]!.kind, `${where}: key is not the odd one out`).toBe(kind);
      break;
    }

    // ---------- foundations: central tendency ----------
    case "gen_center_outlier:mean":
    case "gen_center_outlier:median":
    case "gen_center_outlier:shift": {
      const m = scenario.match(/\([^)]*\): ([\d, ]+)\.$/);
      expect(m, `${where}: value list not found`).toBeTruthy();
      const values = m![1].split(",").map((x) => Number(x.trim()));
      expect(values.length, `${where}: expected 7 values`).toBe(7);
      expect([...values].sort((a, b) => a - b), `${where}: values must be shown sorted`).toEqual(values);
      const sum = values.reduce((a, b) => a + b, 0);
      const median = values[3];

      if (q._variant === "mean") {
        expect(Math.abs((q.answer as number) - sum / 7), `${where}: key vs sum/7`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "median") {
        expect(q.answer, `${where}: key vs the 4th sorted value`).toBe(median);
        expect(q.tol).toBe(0);
      } else {
        const sm = q.q.match(/The ([\d,]+) turns out to be a transcription error; the true value was (\d+)\./);
        expect(sm, `${where}: correction not stated`).toBeTruthy();
        const outlier = toNum(sm![1]), corrected = Number(sm![2]);
        expect(values[6], `${where}: the corrected value must be the maximum`).toBe(outlier);
        expect(Math.abs((q.answer as number) - (outlier - corrected) / 7), `${where}: key vs Δ/n`)
          .toBeLessThanOrEqual(q.tol!);
        // The explanation claims the median does not move; that must be true.
        expect(corrected, `${where}: correction would move the median`).toBeGreaterThanOrEqual(median);
      }
      break;
    }

    // ---------- foundations: reading summary() ----------
    case "gen_descriptive_output:skew":
    case "gen_descriptive_output:iqr":
    case "gen_descriptive_output:report": {
      const nums = [...(q.output ?? "").matchAll(/\d+\.\d\d/g)].map((x) => Number(x[0]));
      expect(nums.length, `${where}: expected six numbers in the R block`).toBe(6);
      const [min, q1, med, mean, q3, max] = nums;
      expect(min).toBeLessThanOrEqual(q1);
      expect(q1).toBeLessThan(med);
      expect(med).toBeLessThanOrEqual(q3);
      expect(q3).toBeLessThanOrEqual(max);
      // Shape judged from the printed numbers alone.
      const skewed = (mean - med) / (q3 - q1) > 0.2;
      if (q._variant === "iqr") {
        expect(Math.abs((q.answer as number) - (q3 - q1)), `${where}: key vs Q3−Q1`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "skew") {
        expect(keyText(q)).toBe(skewed ? "Strongly right-skewed (a long upper tail)" : "Roughly symmetric");
      } else {
        expect(keyText(q)).toBe(skewed ? "Median with the interquartile range" : "Mean with the standard deviation");
      }
      break;
    }

    // ---------- foundations: relative spread ----------
    case "gen_cv:cv": {
      const m = scenario.match(/mean of ([\d.]+) .+? and an SD of ([\d.]+)/);
      expect(m, `${where}: mean/SD not stated`).toBeTruthy();
      const mean = Number(m![1]), sd = Number(m![2]);
      expect(Math.abs((q.answer as number) - (sd / mean) * 100), `${where}: key vs SD/mean·100`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_cv:compare": {
      const parts = [...scenario.matchAll(/([^.]+?): mean ([\d.]+) [^,]+, SD ([\d.]+)/g)]
        .map((x) => ({ name: x[1].trim(), mean: Number(x[2]), sd: Number(x[3]) }));
      expect(parts.length, `${where}: expected two analytes`).toBe(2);
      const cvs = parts.map((p) => (p.sd / p.mean) * 100);
      const higherCv = cvs[0] > cvs[1] ? parts[0] : parts[1];
      const higherSd = parts[0].sd > parts[1].sd ? parts[0] : parts[1];
      expect(keyText(q), `${where}: key must be the higher-CV analyte`).toBe(higherCv.name);
      // The item only teaches anything if SD and CV disagree.
      expect(higherSd.name, `${where}: SD and CV point at the same analyte`).not.toBe(higherCv.name);
      break;
    }

    case "gen_cv:sd_vs_se": {
      const m = scenario.match(/n = (\d+) patients has mean .+ with an SD of ([\d.]+)/);
      expect(m, `${where}: n/SD not stated`).toBeTruthy();
      const n = Number(m![1]), sd = Number(m![2]);
      expect(keyText(q).startsWith(`${sd} `), `${where}: key must be the SD itself`).toBe(true);
      const se = +(sd / Math.sqrt(n)).toFixed(3);
      expect((q.options as string[]).some((o) => o.startsWith(`${se} `)),
        `${where}: the SE distractor must be offered`).toBe(true);
      break;
    }

    // ---------- foundations: the normal scale ----------
    case "gen_zscore:z":
    case "gen_zscore:cutoff":
    case "gen_zscore:tail": {
      const m = scenario.match(/mean ([\d.]+) .+? and SD ([\d.]+)/);
      expect(m, `${where}: μ/σ not stated`).toBeTruthy();
      const mu = Number(m![1]), sigma = Number(m![2]);

      if (q._variant === "z") {
        const x = Number(q.q.match(/measures ([\d.]+)/)![1]);
        expect(Math.abs((q.answer as number) - (x - mu) / sigma), `${where}: key vs (x−μ)/σ`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "cutoff") {
        const z = Number(q.q.match(/Use z = (-?[\d.]+)\./)![1]);
        expect(Math.abs((q.answer as number) - (mu + z * sigma)), `${where}: key vs μ+zσ`)
          .toBeLessThanOrEqual(q.tol!);
      } else {
        const x = Number(q.q.match(/ABOVE ([\d.]+) /)![1]);
        const z = (x - mu) / sigma;
        const row = TAIL_T.find((r) => Math.abs(r.z - z) < 0.04);
        expect(row, `${where}: displayed value is ${z.toFixed(3)} SD out, not a table landmark`).toBeTruthy();
        expect(keyText(q), `${where}: key must be the ONE-tailed area`).toBe(`About ${row!.one}%`);
        expect((q.options as string[]).join(" | "), `${where}: two-tailed trap must be offered`)
          .toContain(`About ${+(row!.one * 2).toFixed(1)}%`);
      }
      break;
    }

    // ---------- probability: binomial ----------
    case "gen_binomial:moments": {
      const m = scenario.match(/Across (\d+) .+ probability ([\d.]+) that/);
      expect(m, `${where}: n/p not stated`).toBeTruthy();
      const n = Number(m![1]), p = Number(m![2]);
      const askMean = /expected NUMBER/.test(q.q);
      const want = askMean ? n * p : n * p * (1 - p);
      expect(Math.abs((q.answer as number) - want), `${where}: key vs ${askMean ? "np" : "np(1−p)"}`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_binomial:at_least_one": {
      const m = scenario.match(/block of (\d+) .+ probability ([\d.]+) that/);
      expect(m, `${where}: n/p not stated`).toBeTruthy();
      const n = Number(m![1]), p = Number(m![2]);
      const want = (1 - Math.pow(1 - p, n)) * 100;
      expect(Math.abs((q.answer as number) - want), `${where}: key vs 1−(1−p)^n`)
        .toBeLessThanOrEqual(q.tol!);
      expect(q.answer as number).toBeGreaterThan(0);
      expect(q.answer as number).toBeLessThan(100);
      break;
    }

    case "gen_binomial:which_dist": {
      const m = scenario.match(/^Consider (.+)\.$/);
      expect(m, `${where}: process not described`).toBeTruthy();
      const hits = PROCESSES.filter((x) => x.match.test(m![1]));
      expect(hits.length, `${where}: "${m?.[1]}" matches ${hits.length} templates, want exactly 1`).toBe(1);
      const proc = hits[0];
      expect(keyText(q)).toBe(DIST_LABEL_T[proc.dist]);
      break;
    }

    // ---------- probability: CLT ----------
    case "gen_clt_se:se":
    case "gen_clt_se:which_spread": {
      const m = scenario.match(/mean (\d+) .+? and SD (\d+) .+?\. You(?:r)? .*?n = (\d+)/);
      expect(m, `${where}: μ/σ/n not stated`).toBeTruthy();
      const mu = Number(m![1]), sigma = Number(m![2]), n = Number(m![3]);
      if (q._variant === "se") {
        expect(Math.abs((q.answer as number) - sigma / Math.sqrt(n)), `${where}: key vs σ/√n`)
          .toBeLessThanOrEqual(q.tol!);
      } else {
        const lo = (mu - 1.96 * sigma).toFixed(1), hi = (mu + 1.96 * sigma).toFixed(1);
        expect(keyText(q).startsWith(`${lo} to ${hi} `),
          `${where}: key must be μ ± 1.96σ, got "${keyText(q)}"`).toBe(true);
      }
      break;
    }

    case "gen_clt_se:shape": {
      const n = Number(scenario.match(/n = (\d+)/)![1]);
      expect(n <= 10 || n >= 200, `${where}: n = ${n} is in the ambiguous middle`).toBe(true);
      if (n >= 200) expect(keyText(q)).toMatch(/^Approximately normal, even though/);
      else expect(keyText(q)).toMatch(/^Still clearly right-skewed/);
      break;
    }

    // ---------- probability: sampling designs ----------
    case "gen_sampling_design:name_it": {
      expect(keyText(q)).toBe(DESIGN_LABEL_T[designFromText(scenario)]);
      break;
    }

    case "gen_sampling_design:for_goal": {
      const m = scenario.match(/need to (.+)\.$/);
      expect(m, `${where}: goal not stated`).toBeTruthy();
      const g = GOALS.find((x) => x.goal === m![1]);
      expect(g, `${where}: goal is not a pool entry`).toBeTruthy();
      expect(keyText(q)).toBe(DESIGN_LABEL_T[g!.design]);
      break;
    }

    case "gen_sampling_design:precision": {
      const d = designFromText(scenario);
      expect(["cluster", "stratified"], `${where}: unexpected design`).toContain(d);
      expect(keyText(q)).toMatch(d === "cluster" ? /^Larger/ : /^Smaller/);
      break;
    }

    // ---------- regression: linear models ----------
    case "gen_lm_interpret:prediction":
    case "gen_lm_interpret:slope":
    case "gen_lm_interpret:intercept": {
      const est = rEstimates(q.output ?? "");
      const names = Object.keys(est);
      expect(names.length, `${where}: expected three coefficient rows`).toBe(3);
      const [b0, b1] = [est["(Intercept)"], est[names[1]]];
      expect(Number.isFinite(b0) && Number.isFinite(b1), `${where}: coefficients unreadable`).toBe(true);
      const centred = /mean-centred/.test(scenario);

      if (q._variant === "prediction") {
        const xs = q.q.match(/= (-?[\d.]+) .+? and .+? = (-?[\d.]+) /);
        expect(xs, `${where}: predictor values not stated`).toBeTruthy();
        let [x1, x2] = [Number(xs![1]), Number(xs![2])];
        if (centred) {
          const m = scenario.match(/− (\d+), .+?− (\d+)\)/);
          expect(m, `${where}: centring constants not stated`).toBeTruthy();
          x1 -= Number(m![1]); x2 -= Number(m![2]);
        }
        const yhat = b0 + b1 * x1 + est[names[2]] * x2;
        expect(Math.abs((q.answer as number) - yhat), `${where}: key vs b0+b1x1+b2x2`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "slope") {
        expect(keyText(q), `${where}: key must quote the coefficient`).toContain(Math.abs(b1).toFixed(3));
        expect(keyText(q), `${where}: key must be associational`).toMatch(/associated with/);
        expect(keyText(q)).not.toMatch(/CAUSES/);
      } else {
        expect(keyText(q)).toMatch(centred ? /at the mean/ : /= 0 and .+= 0/);
      }
      break;
    }

    // ---------- regression: logistic ----------
    case "gen_logistic_or:or_from_beta": {
      const b = Number(scenario.match(/coefficient of (-?[\d.]+)/)![1]);
      expect(Math.abs((q.answer as number) - Math.exp(b)), `${where}: key vs exp(β)`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_logistic_or:prob_from_logodds": {
      const m = scenario.match(/intercept (-?[\d.]+) and a coefficient of (-?[\d.]+)/);
      const x = Number(q.q.match(/= (\d+)\?/)![1]);
      expect(m, `${where}: intercept/slope not stated`).toBeTruthy();
      const logit = Number(m![1]) + Number(m![2]) * x;
      const want = (1 / (1 + Math.exp(-logit))) * 100;
      expect(Math.abs((q.answer as number) - want), `${where}: key vs inverse logit`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_logistic_or:scale": {
      const b = Number(scenario.match(/coefficient of (-?[\d.]+)/)![1]);
      const k = Number(q.q.match(/a (\d+)-/)![1]);
      const want = Math.exp(b * k);
      expect(Math.abs(Number(keyText(q)) - want), `${where}: key vs exp(kβ)`).toBeLessThan(0.01);
      // The linear-scaling trap must be present and must not be the key.
      const trap = (Math.exp(b) * k).toFixed(2);
      expect((q.options as string[]).includes(trap), `${where}: linear-scaling distractor missing`).toBe(true);
      expect(keyText(q)).not.toBe(trap);
      break;
    }

    // ---------- regression: survival ----------
    case "gen_survival_hr:percent": {
      const hr = Number(scenario.match(/hazard ratio of ([\d.]+)/)![1]);
      expect(Math.abs((q.answer as number) - Math.abs(1 - hr) * 100), `${where}: key vs |1−HR|`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_survival_hr:direction": {
      const m = scenario.match(/hazard ratio of ([\d.]+) \(95% CI ([\d.]+) to ([\d.]+)\)/);
      expect(m, `${where}: HR/CI not stated`).toBeTruthy();
      const [hr, lo, hi] = [Number(m![1]), Number(m![2]), Number(m![3])];
      expect(lo).toBeLessThan(hr);
      expect(hr).toBeLessThan(hi);
      if (lo < 1 && hi > 1) {
        expect(keyText(q), `${where}: null-covering CI must key to "compatible with no difference"`)
          .toMatch(/interval includes 1/);
      } else {
        expect(keyText(q)).toMatch(hr < 1 ? /% lower in/ : /% higher in/);
        expect(keyText(q)).toMatch(/excludes 1/);
      }
      break;
    }

    case "gen_survival_hr:hr_vs_risk": {
      expect(keyText(q)).toMatch(/absolute risk in the control arm/);
      break;
    }

    // ---------- regression: model selection ----------
    case "gen_model_selection:aic_compute": {
      const m = scenario.match(/log-likelihood of (-?[\d.]+) and estimates (\d+) parameters/);
      expect(m, `${where}: logLik/k not stated`).toBeTruthy();
      const want = -2 * Number(m![1]) + 2 * Number(m![2]);
      expect(Math.abs((q.answer as number) - want), `${where}: key vs −2logL+2k`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    case "gen_model_selection:pick_model": {
      const rows = [...(q.output ?? "").matchAll(/^(Model [A-C])\s+(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)/gm)]
        .map((m) => ({ name: m[1], k: Number(m[2]), ll: Number(m[3]), aic: Number(m[4]), r2: Number(m[5]) }));
      expect(rows.length, `${where}: expected three model rows`).toBe(3);
      for (const r of rows) {
        expect(Math.abs(r.aic - (-2 * r.ll + 2 * r.k)), `${where}: printed AIC disagrees with −2logL+2k`)
          .toBeLessThan(0.15);
      }
      const bestAic = rows.reduce((a, b) => (b.aic < a.aic ? b : a));
      const bestR2 = rows.reduce((a, b) => (b.r2 > a.r2 ? b : a));
      expect(keyText(q), `${where}: key must be the lowest-AIC model`).toBe(bestAic.name);
      // The whole point: R² has to point somewhere else, or there is no lesson.
      expect(bestR2.name, `${where}: AIC and R² agree, so the trap is absent`).not.toBe(bestAic.name);
      break;
    }

    case "gen_model_selection:delta": {
      const d = Number(scenario.match(/ΔAIC = (\d+\.\d)/)![1]);
      expect(keyText(q)).toMatch(d < 2 ? /essentially indistinguishable/ : /clearly better support/);
      break;
    }

    // ---------- design & bias ----------
    case "gen_study_design:name_it": {
      expect(keyText(q)).toBe(DESIGN_NAME_T[matchOne(DESIGN_SIG, scenario, where)]);
      break;
    }

    case "gen_study_design:measure": {
      expect(keyText(q)).toBe(DESIGN_MEASURE_T[matchOne(DESIGN_SIG, scenario, where)]);
      break;
    }

    case "gen_study_design:sampled_on": {
      expect(keyText(q)).toMatch(DESIGN_SAMPLED_T[matchOne(DESIGN_SIG, scenario, where)]);
      break;
    }

    case "gen_bias:name_it": {
      expect(keyText(q)).toBe(BIAS_NAME_T[matchOne(BIAS_SIG, scenario, where)]);
      break;
    }

    case "gen_bias:direction": {
      expect(keyText(q)).toMatch(BIAS_DIR_T[matchOne(BIAS_SIG, scenario, where)]);
      break;
    }

    case "gen_bias:fix": {
      expect(keyText(q)).toMatch(BIAS_FIX_T[matchOne(BIAS_SIG, scenario, where)]);
      break;
    }

    // ---------- causal: confounding ----------
    case "gen_confounding:percent_change":
    case "gen_confounding:detect":
    case "gen_confounding:direction": {
      const m = scenario.match(/crude risk ratio of ([\d.]+)\..+?risk ratio is ([\d.]+)\./s);
      expect(m, `${where}: crude/adjusted not stated`).toBeTruthy();
      const crude = Number(m![1]), adj = Number(m![2]);
      const change = ((crude - adj) / adj) * 100;
      if (q._variant === "percent_change") {
        expect(Math.abs((q.answer as number) - Math.abs(change)), `${where}: key vs |crude−adj|/adj`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "detect") {
        // The 10% rule, applied to the numbers the learner can see.
        expect(Math.abs(change), `${where}: draw sits on the 10% boundary`).not.toBeCloseTo(10, 0);
        expect(keyText(q)).toMatch(Math.abs(change) > 10 ? /^Yes —/ : /^No —/);
      } else {
        const crudeFurther = Math.abs(crude - 1) > Math.abs(adj - 1);
        expect(keyText(q)).toMatch(crudeFurther ? /^It exaggerated/ : /^It masked/);
      }
      break;
    }

    // ---------- causal: variable roles ----------
    case "gen_causal_role:classify": {
      expect(keyText(q)).toBe(ROLE_LABEL_T[matchOne(ROLE_SIG, scenario, where)]);
      break;
    }
    case "gen_causal_role:adjust": {
      expect(keyText(q)).toMatch(ROLE_ADJUST_T[matchOne(ROLE_SIG, scenario, where)]);
      break;
    }
    case "gen_causal_role:consequence": {
      expect(keyText(q)).toMatch(ROLE_CONSEQ_T[matchOne(ROLE_SIG, scenario, where)]);
      break;
    }

    // ---------- missing data ----------
    case "gen_missing_mechanism:classify": {
      expect(keyText(q)).toBe(MISS_LABEL_T[matchOne(MISS_SIG, scenario, where)]);
      break;
    }
    case "gen_missing_mechanism:complete_case": {
      expect(keyText(q)).toMatch(MISS_CC_T[matchOne(MISS_SIG, scenario, where)]);
      break;
    }
    case "gen_missing_mechanism:method": {
      expect(keyText(q)).toMatch(MISS_METHOD_T[matchOne(MISS_SIG, scenario, where)]);
      break;
    }

    // ---------- measurement: validity ----------
    case "gen_validity:classify": {
      expect(keyText(q)).toBe(VALIDITY_LABEL_T[matchOne(VALIDITY_SIG, scenario, where)]);
      break;
    }
    case "gen_validity:reliability": {
      expect(keyText(q)).toBe(matchOne(RELIABILITY_SIG, scenario, where));
      break;
    }
    case "gen_validity:error_effect": {
      const random = /misclassifies about \d+% of participants/.test(scenario);
      expect(keyText(q)).toMatch(random ? /towards the null/ : /offset cancels/);
      break;
    }

    // ---------- measurement: kappa ----------
    case "gen_kappa:compute":
    case "gen_kappa:vs_raw":
    case "gen_kappa:interpret": {
      const m = scenario.match(
        /for ([\d,]+) cases\. Both called ([\d,]+) positive and ([\d,]+) negative; the first alone called ([\d,]+) positive, and the second alone called ([\d,]+) positive/,
      );
      expect(m, `${where}: agreement table not stated`).toBeTruthy();
      const [N, a, d, b, c] = m!.slice(1).map(toNum);
      expect(a + b + c + d, `${where}: cells must sum to N`).toBe(N);
      // Independent re-derivation from the four displayed cells.
      const po = (a + d) / N;
      const pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (N * N);
      const kappa = (po - pe) / (1 - pe);

      if (q._variant === "compute") {
        expect(Math.abs((q.answer as number) - kappa), `${where}: key vs (p0−pe)/(1−pe)`)
          .toBeLessThanOrEqual(q.tol!);
      } else if (q._variant === "interpret") {
        const stated = Number(q.q.match(/κ = ([\d.]+)/)![1]);
        expect(Math.abs(stated - kappa), `${where}: stem quotes a different kappa`).toBeLessThan(0.01);
        const bands: [number, number, string][] = [
          [-1, 0.2, "Slight agreement"], [0.2, 0.4, "Fair agreement"], [0.4, 0.6, "Moderate agreement"],
          [0.6, 0.8, "Substantial agreement"], [0.8, 1, "Almost perfect agreement"],
        ];
        const want = bands.find(([lo, hi]) => kappa >= lo && kappa < hi)![2];
        expect(keyText(q), `${where}: κ=${kappa.toFixed(2)} band`).toBe(want);
      } else {
        // The paradox item is only worth asking when raw agreement really is
        // much higher than kappa.
        expect(po - kappa, `${where}: no gap between raw agreement and kappa`).toBeGreaterThan(0.2);
        expect(keyText(q)).toMatch(/by chance alone/);
      }
      break;
    }

    // ---------- inference: p-values ----------
    case "gen_pvalue:meaning": {
      expect(keyText(q)).toMatch(/IF the null hypothesis were true/);
      break;
    }
    case "gen_pvalue:decision": {
      const m = q.q.match(/α = (\d+\.\d+) and the trial reports p = (\d+\.\d+)/);
      expect(m, `${where}: α/p not stated`).toBeTruthy();
      const alpha = Number(m![1]), p = Number(m![2]);
      expect(Math.abs(p - alpha), `${where}: p sits on the threshold`).toBeGreaterThan(0.005);
      expect(keyText(q)).toMatch(p < alpha ? /^Reject the null/ : /^Do not reject the null/);
      break;
    }
    case "gen_pvalue:errors": {
      const power = Number(scenario.match(/with (\d+)% power/)![1]);
      expect(Math.abs((q.answer as number) - (100 - power)), `${where}: key vs 1−power`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }

    // ---------- inference: chi-square ----------
    case "gen_chisq:df": {
      const m = scenario.match(/cross-tabulates (\d+) categories of exposure against (\d+) categories/);
      expect(m, `${where}: table shape not stated`).toBeTruthy();
      expect(q.answer, `${where}: key vs (r−1)(c−1)`).toBe((Number(m![1]) - 1) * (Number(m![2]) - 1));
      break;
    }
    case "gen_chisq:expected":
    case "gen_chisq:fisher": {
      const m = scenario.match(
        /Group sizes are ([\d,]+) and ([\d,]+); across both groups there were ([\d,]+) events and ([\d,]+) non-events/,
      );
      expect(m, `${where}: margins not stated`).toBeTruthy();
      const [n1, n2, ev, nonEv] = m!.slice(1).map(toNum);
      const N = n1 + n2;
      expect(ev + nonEv, `${where}: margins must sum to N`).toBe(N);
      if (q._variant === "expected") {
        expect(Math.abs((q.answer as number) - (n1 * ev) / N), `${where}: key vs row×col/N`)
          .toBeLessThanOrEqual(q.tol!);
      } else {
        // Rule of 5 applied to the smallest expected count, computed here.
        const minExp = Math.min(n1, n2) * Math.min(ev, nonEv) / N;
        expect(Math.abs(minExp - 5), `${where}: draw sits on the rule-of-5 boundary`).toBeGreaterThan(0.5);
        expect(keyText(q)).toMatch(minExp < 5 ? /^Fisher's exact test/ : /^The chi-square test is fine/);
      }
      break;
    }

    // ---------- inference: bootstrap ----------
    case "gen_bootstrap:percentile_index": {
      const B = toNum(q.q.match(/sorted vector of ([\d,]+) bootstrap estimates/)![1]);
      const level = Number(q.q.match(/the (\d+)% percentile interval/)![1]);
      expect(Math.abs((q.answer as number) - (B * (100 - level)) / 200), `${where}: key vs B·tail`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_bootstrap:b_effect": {
      expect(keyText(q)).toMatch(/Monte-Carlo noise .+ falls/);
      break;
    }
    case "gen_bootstrap:when": {
      const extreme = /MAXIMUM observed value|minimum observed value/.test(scenario);
      expect(keyText(q)).toMatch(extreme ? /^No — the statistic depends on an extreme/ : /^Yes — the statistic is a smooth/);
      break;
    }

    // ---------- advanced: Bayes ----------
    case "gen_bayes_odds:lr_from_sens_spec": {
      const m = scenario.match(/sensitivity (\d+)% and specificity (\d+)%/);
      expect(m, `${where}: sens/spec not stated`).toBeTruthy();
      const se = Number(m![1]) / 100, sp = Number(m![2]) / 100;
      expect(Math.abs((q.answer as number) - se / (1 - sp)), `${where}: key vs sens/(1−spec)`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_bayes_odds:posterior": {
      const m = scenario.match(/pre-test probability of .+? is (\d+)%.+?positive likelihood ratio of (\d+\.\d+)/s);
      expect(m, `${where}: prior/LR not stated`).toBeTruthy();
      const prior = Number(m![1]) / 100, lr = Number(m![2]);
      const odds = (prior / (1 - prior)) * lr;
      const want = (odds / (1 + odds)) * 100;
      expect(Math.abs((q.answer as number) - want), `${where}: key vs odds·LR back-converted`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_bayes_odds:credible_vs_ci": {
      expect(keyText(q)).toMatch(/there is a 95% probability that the true value lies/);
      break;
    }

    // ---------- advanced: multiplicity ----------
    case "gen_multiple_testing:fwer": {
      const m = scenario.match(/tests (\d+) independent .+? each at α = (\d+\.\d+)/);
      expect(m, `${where}: m/α not stated`).toBeTruthy();
      const want = (1 - Math.pow(1 - Number(m![2]), Number(m![1]))) * 100;
      expect(Math.abs((q.answer as number) - want), `${where}: key vs 1−(1−α)^m`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_multiple_testing:bonferroni": {
      const m = scenario.match(/tests (\d+) .+? family-wise error rate of (\d+\.\d+)/s);
      expect(m, `${where}: m/α not stated`).toBeTruthy();
      expect(Math.abs((q.answer as number) - Number(m![2]) / Number(m![1])), `${where}: key vs α/m`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_multiple_testing:fdr_vs_fwer": {
      expect(keyText(q)).toMatch(/expected PROPORTION of the discoveries/);
      break;
    }

    // ---------- advanced: power ----------
    case "gen_power:n_scaling": {
      const n0 = toNum(scenario.match(/with ([\d,]+) patients per arm/)![1]);
      const k = Number(scenario.match(/difference (\d+) times SMALLER/)![1]);
      expect(toNum(keyText(q).match(/([\d,]+)/)![1]), `${where}: key vs n·k²`).toBe(n0 * k * k);
      break;
    }
    case "gen_power:beta_events": {
      const m = scenario.match(/running (\d+) independent copies .+? powered at (\d+)%/s);
      expect(m, `${where}: trials/power not stated`).toBeTruthy();
      const want = (Number(m![1]) * (100 - Number(m![2]))) / 100;
      expect(Math.abs((q.answer as number) - want), `${where}: key vs trials·(1−power)`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_power:underpowered": {
      const power = Number(scenario.match(/had (\d+)% power/)![1]);
      expect(power <= 45 || power >= 85, `${where}: power ${power}% is ambiguous`).toBe(true);
      expect(keyText(q)).toMatch(power >= 85 ? /^The trial had a good chance/ : /^The trial was unlikely to detect/);
      break;
    }

    // ---------- advanced: correlation ----------
    case "gen_correlation:r_squared": {
      const r = Number(scenario.match(/r = (-?[\d.]+)/)![1]);
      expect(Math.abs((q.answer as number) - r * r * 100), `${where}: key vs r²`)
        .toBeLessThanOrEqual(q.tol!);
      break;
    }
    case "gen_correlation:which_coefficient": {
      const linear = /clean straight-line trend/.test(scenario);
      expect(keyText(q)).toMatch(linear ? /^Pearson's r/ : /^Spearman's rho/);
      break;
    }
    case "gen_correlation:interpret": {
      expect(keyText(q)).toMatch(/Nothing about causation/);
      break;
    }

    default:
      throw new Error(`${where}: no verifier registered for this variant`);
  }
}

// ------------------------------------------------------------
// Structural invariants — the bank rules, applied to every draw.
// ------------------------------------------------------------
function checkStructure(fam: QuestionFamily, q: GeneratedQuestion) {
  const where = `${fam.fid}:${q._variant} (seed ${q._seed})`;

  // Invariant 1: family-level SRS key.
  expect(q.qid, `${where}: qid must equal the family id`).toBe(fam.fid);
  expect(q._fid).toBe(fam.fid);
  expect(q.method).toBe(fam.method);
  expect(fam.variants, `${where}: undeclared variant`).toContain(q._variant);

  expect(q.q?.trim(), `${where}: empty stem`).toBeTruthy();
  expect(q.explain?.trim(), `${where}: empty explanation`).toBeTruthy();
  expect(["mcq", "multi", "numeric"]).toContain(q.type);
  // Generated items bring their own setup, so they must never inherit the
  // host case's story — one of them would be lying about the numbers.
  expect(q.scenario?.trim() || q.standalone, `${where}: needs a scenario or standalone`).toBeTruthy();

  if (q.type === "mcq") {
    const options = q.options as string[];
    const answer = q.answer as number;
    expect(Array.isArray(options)).toBe(true);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(new Set(options).size, `${where}: duplicate option text`).toBe(options.length);
    for (const o of options) expect(o.trim(), `${where}: blank option`).toBeTruthy();
    expect(Number.isInteger(answer)).toBe(true);
    expect(answer).toBeGreaterThanOrEqual(0);
    expect(answer).toBeLessThan(options.length);
  }

  if (q.type === "numeric") {
    expect(typeof q.answer).toBe("number");
    expect(Number.isFinite(q.answer as number), `${where}: non-finite key`).toBe(true);
    expect(typeof q.tol).toBe("number");
    expect(q.tol!).toBeGreaterThanOrEqual(0);
  }

  // Per-option metadata: distractors only, in bounds, non-empty — same rule
  // the bank is held to in cases.test.ts.
  const opts = (q.options as string[] | undefined) ?? [];
  const ans = q.answer as number | number[];
  const answerSet = new Set(Array.isArray(ans) ? ans : [ans]);
  for (const [label, map] of [
    ["optionExplanations", q.optionExplanations],
    ["misconceptionTag", q.misconceptionTag],
  ] as const) {
    if (!map) continue;
    for (const k of Object.keys(map)) {
      const idx = Number(k);
      expect(Number.isInteger(idx), `${where}: ${label} key "${k}"`).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(opts.length);
      expect(answerSet.has(idx), `${where}: ${label} targets the key`).toBe(false);
      expect((map as Record<number, string>)[idx].trim(), `${where}: blank ${label}`).toBeTruthy();
    }
  }

  // No leaked template plumbing.
  const surface = [q.q, q.scenario ?? "", q.explain, ...opts].join(" ");
  expect(surface, `${where}: unresolved template or NaN in visible text`)
    .not.toMatch(/undefined|NaN|\$\{/);
}

describe.each(FAMILIES)("family $fid", (fam) => {
  let buildError: unknown = null;
  let instances: GeneratedQuestion[] = [];
  try {
    instances = Array.from({ length: SEEDS }, (_, i) => instantiate(fam, seedAt(i)));
  } catch (e) {
    buildError = e;
  }

  it(`produces a valid item for all ${SEEDS} seeds without exhausting the retry budget`, () => {
    expect(buildError).toBeNull();
    expect(instances.length).toBe(SEEDS);
  });

  it("is deterministic in the seed", () => {
    for (const i of [0, 1, 17, 499, 999]) {
      const a = instantiate(fam, seedAt(i));
      const b = instantiate(fam, seedAt(i));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("reports the seed actually used, so a reported item can be regenerated", () => {
    for (const q of instances.slice(0, 50)) {
      const again = instantiate(fam, q._seed);
      expect(again._seed).toBe(q._seed);
      expect(again.q).toBe(q.q);
      expect(again.answer).toEqual(q.answer);
    }
  });

  it("satisfies the bank's structural invariants on every seed", () => {
    for (const q of instances) checkStructure(fam, q);
  });

  it("keys every item consistently with the numbers it displays", () => {
    for (const q of instances) verify(q);
  });

  it("reaches every declared variant", () => {
    const seen = new Set(instances.map((q) => q._variant));
    for (const v of fam.variants) expect([...seen], `variant ${v} unreachable`).toContain(v);
  });

  it("does not park the correct answer at a fixed position", () => {
    const mcq = instances.filter((q) => q.type === "mcq");
    if (mcq.length === 0) return;
    const positions = new Set(mcq.map((q) => q.answer as number));
    expect(positions.size).toBeGreaterThan(1);
  });

  it("produces genuinely fresh items rather than a small rotation", () => {
    // The whole premise: a family is not a disguised 5-item bank.
    // Everything the learner actually sees, including any printed output block —
    // for output-driven families that block carries most of the variation.
    const distinct = new Set(instances.map(
      (q) => `${q.scenario}|${q.output ?? ""}|${q.q}|${JSON.stringify(q.options ?? q.answer)}`));
    expect(distinct.size / SEEDS).toBeGreaterThan(0.8);
  });

  it("is listed under its own id", () => {
    expect(FAMILY_BY_ID.get(fam.fid)).toBe(fam);
  });
});

// ------------------------------------------------------------
// The claim that makes a family more than a bigger bank: for some items the
// CORRECT ANSWER itself moves with the seed, so there is nothing to memorise.
// Asserting consistency alone would pass a generator that had quietly frozen
// into one branch — this test is what catches that.
// ------------------------------------------------------------
describe("gen_ci_width:interpret — the key moves with the seed", () => {
  const fam = FAMILY_BY_ID.get("gen_ci_width")!;
  const interp = Array.from({ length: SEEDS }, (_, i) => instantiate(fam, seedAt(i)))
    .filter((q) => q._variant === "interpret");

  // Branch derived from the rendered interval, not from the generator's own
  // bookkeeping, so a flipped internal flag cannot hide here.
  const branch = (q: GeneratedQuestion) => {
    const m = (q.scenario ?? "").match(/95% CI (-?[\d.]+) to (-?[\d.]+)/)!;
    return Number(m[1]) < 0 && Number(m[2]) > 0 ? "covers" : "excludes";
  };

  it("emits both null-covering and null-excluding intervals", () => {
    const covers = interp.filter((q) => branch(q) === "covers").length;
    const excludes = interp.filter((q) => branch(q) === "excludes").length;
    expect(interp.length).toBeGreaterThan(100);
    expect(covers, "no null-covering intervals generated").toBeGreaterThan(20);
    expect(excludes, "no null-excluding intervals generated").toBeGreaterThan(20);
  });

  it("keys the two branches to genuinely different statements", () => {
    const keyOf = (q: GeneratedQuestion) => (q.options as string[])[q.answer as number];
    const coversKeys = new Set(interp.filter((q) => branch(q) === "covers").map(keyOf));
    const excludesKeys = new Set(interp.filter((q) => branch(q) === "excludes").map(keyOf));
    for (const k of coversKeys) expect(excludesKeys.has(k), "key text shared across branches").toBe(false);
  });
});

// ------------------------------------------------------------
// Wiring: which cases claim which families. App.tsx derives this exactly the
// same way (familiesForMethods over the case's bank methods), so this pins
// the integration's data half without having to mount the app.
// ------------------------------------------------------------
describe("case → family claims", () => {
  const claims = (caseId: string) =>
    familiesForMethods((CASES.find((c) => c.id === caseId)!.bank || []).map((q) => q.method).filter(Boolean) as string[])
      .map((f) => f.fid);

  it("attaches the PPV family to the diagnostic-accuracy cases", () => {
    expect(claims("p1")).toContain("gen_ppv");
    expect(claims("p3")).toContain("gen_ppv");
    expect(claims("me1")).toContain("gen_ppv");
  });

  it("attaches the CI family to the estimation cases", () => {
    expect(claims("e1")).toContain("gen_ci_width");
    expect(claims("e5")).toContain("gen_ci_width");
  });

  it("attaches the foundations families to the foundations cases", () => {
    // f1 covers variable types, central tendency, spread and descriptives.
    expect(claims("f1").sort()).toEqual(
      ["gen_center_outlier", "gen_cv", "gen_descriptive_output", "gen_variable_type"],
    );
    expect(claims("f2")).toContain("gen_zscore");
  });

  it("attaches the probability families to the probability cases", () => {
    expect(claims("p2")).toEqual(expect.arrayContaining(["gen_clt_se", "gen_sampling_design"]));
    expect(claims("p4")).toContain("gen_binomial");
  });

  it("claims only the families whose methods a case actually uses", () => {
    // ci1 covers confounding but none of the other families' methods.
    expect(claims("ci1")).toEqual(["gen_confounding"]);
  });

  it("claims at least one family for a non-trivial share of the catalogue", () => {
    const claimed = CASES.filter((c) => claims(c.id).length > 0);
    expect(claimed.length).toBeGreaterThan(5);
  });
});

// ------------------------------------------------------------
// Branch coverage for every variant whose KEY depends on the draw. Consistency
// checks alone would pass a generator that had quietly frozen into one branch,
// which is the failure that turns a family back into a memorisable item.
// ------------------------------------------------------------
describe("seed-dependent keys actually flip", () => {
  const BRANCHING: { fid: string; variant: string; label: (q: GeneratedQuestion) => string }[] = [
    { fid: "gen_descriptive_output", variant: "skew", label: (q) => keyText(q) },
    { fid: "gen_descriptive_output", variant: "report", label: (q) => keyText(q) },
    { fid: "gen_clt_se", variant: "shape", label: (q) => keyText(q).slice(0, 20) },
    { fid: "gen_sampling_design", variant: "precision", label: (q) => keyText(q).slice(0, 7) },
    { fid: "gen_sampling_design", variant: "for_goal", label: (q) => keyText(q) },
    { fid: "gen_variable_type", variant: "classify", label: (q) => keyText(q) },
    { fid: "gen_binomial", variant: "moments", label: (q) => (/expected NUMBER/.test(q.q) ? "mean" : "variance") },
    { fid: "gen_binomial", variant: "which_dist", label: (q) => keyText(q) },
    { fid: "gen_zscore", variant: "tail", label: (q) => keyText(q) },
  ];

  it.each(BRANCHING)("$fid:$variant reaches more than one keyed branch", ({ fid, variant, label }) => {
    const fam = FAMILY_BY_ID.get(fid)!;
    const hits = Array.from({ length: SEEDS }, (_, i) => instantiate(fam, seedAt(i)))
      .filter((q) => q._variant === variant);
    expect(hits.length, `${fid}:${variant} was never generated`).toBeGreaterThan(50);
    const counts = new Map<string, number>();
    for (const q of hits) counts.set(label(q), (counts.get(label(q)) ?? 0) + 1);
    expect(counts.size, `${fid}:${variant} only ever keys to ${[...counts.keys()]}`).toBeGreaterThan(1);
    // No branch may be vanishingly rare — that would make it effectively absent.
    const rarest = Math.min(...counts.values());
    expect(rarest / hits.length, `${fid}:${variant} rarest branch is ${rarest}/${hits.length}`)
      .toBeGreaterThan(0.02);
  });
});
