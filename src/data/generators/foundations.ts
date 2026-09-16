// Item families for the Foundations branch: variable types, central tendency,
// descriptive summaries, relative spread, and the normal/z scale.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

// ============================================================
// Shared vocabulary for the variable-type families
// ============================================================
export type VarKind = "nominal" | "ordinal" | "count" | "continuous";
export type Stevens = "nominal" | "ordinal" | "interval" | "ratio";

export type VariableEntry = {
  name: string;
  kind: VarKind;
  stevens: Stevens;
  /** One clause explaining what the variable actually is. Reused verbatim in
   *  every distractor explanation, so it must read as a reason, not a label. */
  why: string;
  /** Excluded from the kind-based variants where "continuous" would also be
   *  defensible; used only where the Stevens taxonomy is the question. */
  stevensOnly?: boolean;
};

export const VARIABLES: readonly VariableEntry[] = [
  // --- nominal ---
  { name: "ABO blood group (A / B / AB / O)", kind: "nominal", stevens: "nominal",
    why: "the four groups are labels — there is no ranking and no arithmetic to do on them" },
  { name: "admitting specialty (cardiology / neurology / general surgery)", kind: "nominal", stevens: "nominal",
    why: "the specialties are names, not positions on a scale" },
  { name: "surgical approach (open / laparoscopic / robotic)", kind: "nominal", stevens: "nominal",
    why: "the three approaches are alternatives, not ordered levels" },
  { name: "country of birth recorded at registration", kind: "nominal", stevens: "nominal",
    why: "countries are labels with no natural ordering" },
  { name: "randomised treatment arm (drug / placebo)", kind: "nominal", stevens: "nominal",
    why: "the two arms are labels; neither is 'more' than the other" },

  // --- ordinal ---
  { name: "NYHA heart-failure class (I–IV)", kind: "ordinal", stevens: "ordinal",
    why: "the classes are ranked by severity, but the gap from I to II is not a measured quantity equal to the gap from III to IV" },
  { name: "tumour stage (I / II / III / IV)", kind: "ordinal", stevens: "ordinal",
    why: "the stages are ordered by extent of disease, yet the spacing between them is clinical judgement, not measurement" },
  { name: "ECOG performance status (0–4)", kind: "ordinal", stevens: "ordinal",
    why: "the scores rank function from fully active to bedbound without equal intervals between scores" },
  { name: "patient-satisfaction rating (strongly disagree → strongly agree)", kind: "ordinal", stevens: "ordinal",
    why: "the responses are ordered, but the distance between adjacent responses is not fixed or known" },
  { name: "chronic kidney disease stage (1–5)", kind: "ordinal", stevens: "ordinal",
    why: "the stages are ordered by declining function, with unequal and non-measured gaps" },

  // --- discrete counts ---
  { name: "number of emergency admissions in the past year", kind: "count", stevens: "ratio",
    why: "it can only be a whole number of events, and zero genuinely means none occurred" },
  { name: "number of previous pregnancies", kind: "count", stevens: "ratio",
    why: "it is a tally of events — whole numbers only, with a real zero" },
  { name: "number of falls recorded on the ward each month", kind: "count", stevens: "ratio",
    why: "falls are counted one by one; there is no such thing as 2.4 falls" },
  { name: "number of teeth requiring extraction", kind: "count", stevens: "ratio",
    why: "it is a count of discrete items with a true zero" },

  // --- continuous ---
  { name: "systolic blood pressure (mmHg)", kind: "continuous", stevens: "ratio",
    why: "any value in the range is possible and zero would mean no pressure at all" },
  { name: "birth weight (g)", kind: "continuous", stevens: "ratio",
    why: "weight varies continuously and has a true zero, so 'twice as heavy' is a meaningful statement" },
  { name: "serum creatinine (µmol/L)", kind: "continuous", stevens: "ratio",
    why: "concentration is measured on a continuous scale and zero means none present" },
  { name: "forced expiratory volume in 1 second (L)", kind: "continuous", stevens: "ratio",
    why: "volume varies continuously and zero means no air moved" },
  { name: "time from randomisation to discharge (hours)", kind: "continuous", stevens: "ratio",
    why: "elapsed time is continuous and zero means no time passed" },
  { name: "body temperature (°C)", kind: "continuous", stevens: "interval",
    why: "degrees are equally spaced and readings are continuous, but 0 °C is the freezing point of water rather than an absence of heat" },
  { name: "calendar year of diagnosis", kind: "continuous", stevens: "interval", stevensOnly: true,
    why: "years are equally spaced, but the zero point is a calendar convention — 2020 is not 'twice' 1010" },
];

const KIND_LABEL: Record<VarKind, string> = {
  nominal: "Nominal categorical",
  ordinal: "Ordinal categorical",
  count: "Discrete count",
  continuous: "Continuous numeric",
};
const KIND_DEF: Record<VarKind, string> = {
  nominal: "unordered labels — categories you can count but never rank or average",
  ordinal: "ranked categories whose spacing is not a measured quantity",
  count: "whole numbers obtained by counting events, with a true zero",
  continuous: "measurements that can in principle take any value within a range",
};
const STEVENS_LABEL: Record<Stevens, string> = {
  nominal: "Nominal", ordinal: "Ordinal", interval: "Interval", ratio: "Ratio",
};
const STEVENS_DEF: Record<Stevens, string> = {
  nominal: "labels with no order at all",
  ordinal: "an order, but no guarantee that equal steps mean equal amounts",
  interval: "equal, meaningful steps but an arbitrary zero, so ratios are not interpretable",
  ratio: "equal steps AND a true zero, so ratios such as 'twice as much' are meaningful",
};

const DATASET_CONTEXTS = [
  "a hospital admissions extract",
  "the baseline table of a multicentre trial",
  "a primary-care audit dataset",
  "a national disease-registry export",
  "a ward-level quality-improvement spreadsheet",
] as const;

const VAR_KINDS: readonly VarKind[] = ["nominal", "ordinal", "count", "continuous"];
const STEVENS_KINDS: readonly Stevens[] = ["nominal", "ordinal", "interval", "ratio"];

const kindPool = (k: VarKind) => VARIABLES.filter(v => v.kind === k && !v.stevensOnly);

export const VARIABLE_TYPE_FAMILY: QuestionFamily = {
  fid: "gen_variable_type",
  title: "Classifying a variable's measurement scale",
  method: "variable_types",
  diffMin: "intern",
  variants: ["classify", "stevens", "odd_one_out"],
  gen: (rng) => {
    const variant = rng.pick(["classify", "stevens", "odd_one_out"] as const);
    const ctx = rng.pick(DATASET_CONTEXTS);

    if (variant === "classify") {
      const e = rng.pick(VARIABLES.filter(v => !v.stevensOnly));
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
        VAR_KINDS.map<Choice>(k => k === e.kind
          ? { text: KIND_LABEL[k], correct: true }
          : {
              text: KIND_LABEL[k],
              tag: `${e.kind}_misclassified_as_${k}`,
              explain: `${KIND_LABEL[k]} would mean ${KIND_DEF[k]}. This variable is ${KIND_LABEL[e.kind].toLowerCase()} instead: ${e.why}.`,
            }),
      );
      return {
        _variant: variant,
        _params: { name: e.name, kind: e.kind },
        q: `In ${ctx}, **${e.name}** is best described as:`.replace(/\*\*/g, ""),
        scenario: `You are writing the data dictionary for ${ctx} before any analysis begins. One column records ${e.name}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask two questions in order: are the values ordered, and is the spacing between them something that was actually measured?",
        explain: `${e.name} is ${KIND_LABEL[e.kind].toLowerCase()} — ${e.why}. That choice decides everything downstream: how you summarise it in Table 1, which plot is honest, and which test is available to you.`,
      };
    }

    if (variant === "stevens") {
      const e = rng.pick(VARIABLES);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
        STEVENS_KINDS.map<Choice>(k => k === e.stevens
          ? { text: STEVENS_LABEL[k], correct: true }
          : {
              text: STEVENS_LABEL[k],
              tag: `${e.stevens}_scale_misread_as_${k}`,
              explain: `${STEVENS_LABEL[k]} means ${STEVENS_DEF[k]}. That is not what this variable offers: ${e.why}.`,
            }),
      );
      return {
        _variant: variant,
        _params: { name: e.name, stevens: e.stevens },
        q: `On Stevens' taxonomy, ${e.name} is measured on which scale?`,
        scenario: `A reviewer asks you to state the scale of measurement for every variable in ${ctx}. The column in question records ${e.name}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Work up the ladder: order → equal spacing → a zero that means 'none of the quantity'. The scale is the highest rung the variable actually reaches.",
        explain: `It is a ${STEVENS_LABEL[e.stevens].toLowerCase()} scale — ${STEVENS_DEF[e.stevens]}. Here, ${e.why}.`,
      };
    }

    // odd_one_out — the target kind appears exactly once among four variables.
    const target = rng.pick(VAR_KINDS);
    const decoyKind = rng.pick(VAR_KINDS.filter(k => k !== target));
    const targetPool = kindPool(target);
    const decoyPool = kindPool(decoyKind).slice();
    if (targetPool.length < 1 || decoyPool.length < 3) degenerate("not enough pool entries");
    const hit = rng.pick(targetPool);
    const decoys: VariableEntry[] = [];
    while (decoys.length < 3) {
      const idx = Math.floor(rng.next() * decoyPool.length);
      decoys.push(decoyPool.splice(idx, 1)[0]);
    }
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: hit.name, correct: true },
      ...decoys.map<Choice>(d => ({
        text: d.name,
        tag: `${decoyKind}_misclassified_as_${target}`,
        explain: `${d.name} is ${KIND_LABEL[decoyKind].toLowerCase()}, not ${KIND_LABEL[target].toLowerCase()}: ${d.why}.`,
      })),
    ]);
    return {
      _variant: variant,
      _params: { target, decoyKind, hit: hit.name },
      q: `Which of these four columns is the only ${KIND_LABEL[target].toLowerCase()} variable?`,
      scenario: `Four columns from ${ctx} are shown below. Exactly one of them is ${KIND_LABEL[target].toLowerCase()}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: `Classify each one on its own before comparing. Three of the four share a single type.`,
      explain: `${hit.name} is the ${KIND_LABEL[target].toLowerCase()} one — ${hit.why}. The other three are all ${KIND_LABEL[decoyKind].toLowerCase()}.`,
    };
  },
};

// ============================================================
// Central tendency under a single extreme value
// ============================================================
type MeasureCtx = { label: string; unit: string; lo: number; hi: number; setting: string };

const MEASURES: readonly MeasureCtx[] = [
  { label: "door-to-triage time", unit: "min", lo: 12, hi: 70, setting: "a Monday-morning emergency-department audit" },
  { label: "length of stay", unit: "days", lo: 2, hi: 9, setting: "a surgical ward's discharge log" },
  { label: "C-reactive protein", unit: "mg/L", lo: 3, hi: 26, setting: "a post-operative inflammation review" },
  { label: "outpatient visits in the year", unit: "visits", lo: 1, hi: 9, setting: "a chronic-disease clinic's records" },
  { label: "invasive ventilation time", unit: "h", lo: 6, hi: 44, setting: "an ICU respiratory audit" },
];

const N_PATIENTS = 7;

export const CENTER_OUTLIER_FAMILY: QuestionFamily = {
  fid: "gen_center_outlier",
  title: "Mean vs median with one extreme value",
  method: "central_tendency",
  diffMin: "intern",
  variants: ["mean", "median", "shift"],
  gen: (rng) => {
    const m = rng.pick(MEASURES);
    const typical = Array.from({ length: N_PATIENTS - 1 }, () => rng.int(m.lo, m.hi));
    const outlier = m.hi * rng.int(5, 12);
    const values = [...typical, outlier].sort((a, b) => a - b);
    if (values[N_PATIENTS - 1] !== outlier) degenerate("outlier is not the maximum");
    if (new Set(typical).size < 4) degenerate("typical values too repetitive");
    const sum = values.reduce((s, v) => s + v, 0);
    const mean = sum / N_PATIENTS;
    const median = values[(N_PATIENTS - 1) / 2];
    const list = values.join(", ");
    const setup = `${m.setting[0].toUpperCase()}${m.setting.slice(1)} records ${m.label} for ${N_PATIENTS} consecutive patients (${m.unit}): ${list}.`;
    const variant = rng.pick(["mean", "median", "shift"] as const);

    if (variant === "mean") {
      return {
        _variant: variant, _params: { values: list, mean, median },
        q: `What is the mean ${m.label} for these ${N_PATIENTS} patients, in ${m.unit}?`,
        scenario: setup,
        type: "numeric",
        answer: +mean.toFixed(2),
        tol: Math.max(0.05, +(mean * 0.01).toFixed(2)),
        hint: "Add all seven and divide by seven — including the value that looks out of place.",
        explain: `Sum = ${num(sum)}, so the mean is ${num(sum)}/${N_PATIENTS} ≈ ${mean.toFixed(2)} ${m.unit}. Note that ${values.filter(v => v < mean).length} of the ${N_PATIENTS} patients fall BELOW this "average" — one value at ${num(outlier)} has dragged it past most of the data.`,
      };
    }

    if (variant === "median") {
      return {
        _variant: variant, _params: { values: list, mean, median },
        q: `What is the median ${m.label} for these ${N_PATIENTS} patients, in ${m.unit}?`,
        scenario: setup,
        type: "numeric",
        answer: median,
        tol: 0,
        hint: "Order the values and take the middle position. The size of the largest value is irrelevant — only its rank matters.",
        explain: `Sorted, the values are ${list}; the 4th of ${N_PATIENTS} is ${median} ${m.unit}. Compare with the mean (${mean.toFixed(2)}): the same data, ${(mean - median).toFixed(1)} ${m.unit} apart, because the median counts positions while the mean counts magnitudes.`,
      };
    }

    // shift — the outlier turns out to be a data-entry error.
    const corrected = rng.int(median, m.hi);
    const drop = (outlier - corrected) / N_PATIENTS;
    if (drop < 1) degenerate("correction too small to be worth asking about");
    return {
      _variant: variant, _params: { values: list, outlier, corrected, drop, median },
      q: `The ${num(outlier)} turns out to be a transcription error; the true value was ${corrected}. By how much does the MEAN fall, in ${m.unit}?`,
      scenario: setup,
      type: "numeric",
      answer: +drop.toFixed(2),
      tol: Math.max(0.05, +(drop * 0.01).toFixed(2)),
      hint: "Only one of the seven numbers changed. The mean moves by that change divided by n; ask yourself separately whether the middle POSITION moved at all.",
      explain: `The mean falls by (${num(outlier)} − ${corrected})/${N_PATIENTS} ≈ ${drop.toFixed(2)} ${m.unit}, from ${mean.toFixed(2)} to ${((sum - outlier + corrected) / N_PATIENTS).toFixed(2)}. The median does not move at all — it is still ${median}, because the corrected value stays above the middle position. That asymmetry is the whole argument for reporting the median when a single entry could be wrong.`,
    };
  },
};

// ============================================================
// Reading an R summary() block
// ============================================================
type RVar = { rName: string; label: string; unit: string; centre: [number, number] };

const R_VARS: readonly RVar[] = [
  { rName: "los", label: "length of stay", unit: "days", centre: [3, 9] },
  { rName: "wait_min", label: "waiting time", unit: "min", centre: [20, 60] },
  { rName: "crp", label: "C-reactive protein", unit: "mg/L", centre: [6, 30] },
  { rName: "ferritin", label: "serum ferritin", unit: "µg/L", centre: [40, 130] },
  { rName: "cost_usd", label: "episode cost", unit: "USD", centre: [400, 1600] },
];

const f2 = (x: number) => x.toFixed(2);

function rSummaryBlock(rName: string, v: Record<string, number>): string {
  const labels = ["Min.", "1st Qu.", "Median", "Mean", "3rd Qu.", "Max."];
  const vals = [v.min, v.q1, v.median, v.mean, v.q3, v.max].map(f2);
  const w = Math.max(8, ...vals.map(s => s.length + 2), ...labels.map(s => s.length + 1));
  return `> summary(${rName})\n` +
    labels.map(s => s.padStart(w)).join("") + " \n" +
    vals.map(s => s.padStart(w)).join("") + " ";
}

export const DESCRIPTIVE_OUTPUT_FAMILY: QuestionFamily = {
  fid: "gen_descriptive_output",
  title: "Reading shape and spread off an R summary()",
  method: "descriptive",
  diffMin: "intern",
  variants: ["skew", "iqr", "report"],
  gen: (rng) => {
    const v = rng.pick(R_VARS);
    const skewed = rng.next() < 0.5;
    const median = rng.int(v.centre[0] * 10, v.centre[1] * 10) / 10;
    const a = Math.max(0.5, +(median * (rng.int(20, 40) / 100)).toFixed(2)); // lower-half spread

    const stats = skewed
      ? {
          min: Math.max(0, +(median - a * 1.1).toFixed(2)),
          q1: +(median - a).toFixed(2),
          median,
          mean: +(median + a * (rng.int(14, 24) / 10)).toFixed(2),
          q3: +(median + a * 2.6).toFixed(2),
          max: +(median + a * rng.int(11, 18)).toFixed(2),
        }
      : {
          min: Math.max(0, +(median - a * 2.2).toFixed(2)),
          q1: +(median - a).toFixed(2),
          median,
          mean: +(median + a * (rng.int(-6, 6) / 100)).toFixed(2),
          q3: +(median + a).toFixed(2),
          max: +(median + a * 2.2).toFixed(2),
        };

    if (!(stats.min <= stats.q1 && stats.q1 < stats.median && stats.median <= stats.q3 && stats.q3 <= stats.max)) {
      degenerate("quantiles out of order after rounding");
    }
    const gap = (stats.mean - stats.median) / (stats.q3 - stats.q1);
    if (skewed && gap < 0.35) degenerate("skew too weak to be readable");
    if (!skewed && Math.abs(gap) > 0.06) degenerate("symmetric draw is not symmetric enough");

    const output = rSummaryBlock(v.rName, stats);
    const iqr = +(stats.q3 - stats.q1).toFixed(2);
    const variant = rng.pick(["skew", "iqr", "report"] as const);
    const shared = {
      scenario: `You have just loaded ${v.label} (${v.unit}) for a cohort of ${num(rng.int(180, 900))} patients and printed the six-number summary.`,
      output,
      outputLang: "r",
    };

    if (variant === "iqr") {
      return {
        ...shared,
        _variant: variant, _params: { ...stats, iqr, skewed: skewed ? 1 : 0 },
        q: `What is the interquartile range of ${v.label}, in ${v.unit}?`,
        type: "numeric",
        answer: iqr,
        tol: 0.01,
        hint: "The IQR is a single subtraction between two numbers that are already printed.",
        explain: `IQR = 3rd Qu. − 1st Qu. = ${f2(stats.q3)} − ${f2(stats.q1)} = ${f2(iqr)} ${v.unit}. It spans the middle half of the patients and — unlike the range (${f2(stats.max - stats.min)}) — is untouched by the largest value.`,
      };
    }

    if (variant === "skew") {
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        skewed
          ? { text: "Strongly right-skewed (a long upper tail)", correct: true }
          : { text: "Roughly symmetric", correct: true },
        skewed
          ? { text: "Roughly symmetric", tag: "mean_median_gap_overlooked",
              explain: `If it were symmetric the mean and median would sit on top of each other. Here the mean (${f2(stats.mean)}) is well above the median (${f2(stats.median)}), and the upper quartile reaches ${f2(stats.q3)} while the lower reaches only ${f2(stats.q1)}.` }
          : { text: "Strongly right-skewed (a long upper tail)", tag: "range_mistaken_for_skew",
              explain: `The maximum being larger than the minimum is not skew. Skew shows up as the mean pulling away from the median — here they are ${f2(stats.mean)} and ${f2(stats.median)}, essentially identical — and as one quartile sitting further from the median than the other.` },
        { text: "Strongly left-skewed (a long lower tail)", tag: "skew_direction_reversed",
          explain: `Left skew would put the mean BELOW the median and stretch the lower tail. ${skewed ? `Here the mean (${f2(stats.mean)}) is above the median (${f2(stats.median)}) and it is the upper tail that runs out to ${f2(stats.max)}.` : `Here the two tails are about equal and the mean and median coincide.`} Skew is named for the tail, not the bulk.` },
        { text: "Bimodal", tag: "summary_read_as_evidence_of_modes",
          explain: "A six-number summary cannot show modes at all — it reports positions, not density. Deciding between one hump and two needs a histogram or density plot." },
      ]);
      return {
        ...shared,
        _variant: variant, _params: { ...stats, skewed: skewed ? 1 : 0 },
        q: `What does this summary tell you about the shape of the distribution?`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Two comparisons carry almost all the information: mean vs median, and how far each quartile sits from the median.",
        explain: skewed
          ? `Mean ${f2(stats.mean)} sits well above median ${f2(stats.median)}, the upper quartile is further from the median than the lower one, and the maximum (${f2(stats.max)}) is far beyond the 3rd quartile (${f2(stats.q3)}). All three signs point the same way: a long right tail.`
          : `Mean ${f2(stats.mean)} and median ${f2(stats.median)} coincide, the quartiles sit at roughly equal distances either side, and neither extreme runs away from the box. Nothing here suggests a tail.`,
      };
    }

    // report — what belongs in Table 1
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      skewed
        ? { text: "Median with the interquartile range", correct: true }
        : { text: "Mean with the standard deviation", correct: true },
      skewed
        ? { text: "Mean with the standard deviation", tag: "mean_sd_used_for_skewed_data",
            explain: `With a mean of ${f2(stats.mean)} against a median of ${f2(stats.median)} and a maximum of ${f2(stats.max)}, "mean ± SD" would imply a symmetric spread that the data do not have — and would describe a typical patient who does not exist.` }
        : { text: "Median with the interquartile range", tag: "robust_summary_used_by_reflex",
            explain: `The median and IQR are never WRONG, but here they throw information away for nothing: with a symmetric distribution the mean uses every observation and the SD is directly interpretable. Reach for the robust pair when the data earn it.` },
      { text: "Mean with the full range", tag: "range_used_as_spread",
        explain: `The range depends on exactly two observations and can only grow with sample size, so it is not a stable description of spread. Here it would be ${f2(stats.max - stats.min)} ${v.unit} — driven almost entirely by the single largest patient.` },
      { text: "Mode with the interquartile range", tag: "mode_used_for_continuous_data",
        explain: "The mode of a continuous measurement is essentially meaningless — with values recorded to two decimals, almost every patient is their own mode. Modes belong to categorical data." },
    ]);
    return {
      ...shared,
      _variant: variant, _params: { ...stats, skewed: skewed ? 1 : 0 },
      q: `Which summary belongs in Table 1 for ${v.label}?`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Let the mean-versus-median comparison decide it, not habit.",
      explain: skewed
        ? `The mean (${f2(stats.mean)}) sits well above the median (${f2(stats.median)}) and the maximum runs to ${f2(stats.max)} — a right tail. Report median ${f2(stats.median)} (IQR ${f2(stats.q1)}–${f2(stats.q3)}), which describes the typical patient honestly.`
        : `Mean ${f2(stats.mean)} and median ${f2(stats.median)} agree and the quartiles are balanced, so the distribution is near-symmetric. Mean with SD is the efficient summary here.`,
    };
  },
};

// ============================================================
// Relative spread: CV, and SD vs SE
// ============================================================
type Analyte = { name: string; unit: string; mean: [number, number]; cvPct: [number, number]; dec: 0 | 1 };

const ANALYTES: readonly Analyte[] = [
  { name: "HbA1c", unit: "%", mean: [60, 95], cvPct: [3, 12], dec: 1 },
  { name: "serum sodium", unit: "mmol/L", mean: [1360, 1425], cvPct: [1, 4], dec: 1 },
  { name: "C-reactive protein", unit: "mg/L", mean: [40, 260], cvPct: [25, 70], dec: 1 },
  { name: "platelet count", unit: "×10⁹/L", mean: [1800, 3200], cvPct: [12, 30], dec: 1 },
  { name: "serum ferritin", unit: "µg/L", mean: [400, 1400], cvPct: [20, 55], dec: 1 },
];

const drawAnalyte = (rng: RNG, a: Analyte) => {
  const mean = rng.int(a.mean[0], a.mean[1]) / 10;
  const cv = rng.int(a.cvPct[0] * 10, a.cvPct[1] * 10) / 10;
  const sd = +(mean * cv / 100).toFixed(2);
  return { mean: +mean.toFixed(1), sd, cv: +(sd / mean * 100).toFixed(2) };
};

export const CV_FAMILY: QuestionFamily = {
  fid: "gen_cv",
  title: "Relative spread — coefficient of variation, SD vs SE",
  method: "spread_variability",
  diffMin: "resident",
  variants: ["cv", "compare", "sd_vs_se"],
  gen: (rng) => {
    const variant = rng.pick(["cv", "compare", "sd_vs_se"] as const);

    if (variant === "compare") {
      // Constructed, not sampled: the item only teaches anything when the
      // analyte with the LARGER SD has the SMALLER CV. Drawing both freely
      // would fail that condition most of the time and burn the retry budget.
      const aDef = rng.pick(ANALYTES.filter(a => a.mean[1] >= 1000));   // large-scale analyte
      const bDef = rng.pick(ANALYTES.filter(a => a.mean[1] <= 300));    // small-scale analyte
      const meanA = rng.int(aDef.mean[0], aDef.mean[1]) / 10;
      const meanB = rng.int(bDef.mean[0], bDef.mean[1]) / 10;
      const cvA = rng.int(40, 140) / 10;    // 4–14 %
      const cvB = rng.int(250, 600) / 10;   // 25–60 %
      const sdA = +(meanA * cvA / 100).toFixed(2);
      const sdB = +(meanB * cvB / 100).toFixed(2);
      if (!(sdA > sdB * 1.5)) degenerate("large-scale analyte does not have the larger SD");
      const A = { mean: meanA, sd: sdA, cv: +(sdA / meanA * 100).toFixed(2) };
      const B = { mean: meanB, sd: sdB, cv: +(sdB / meanB * 100).toFixed(2) };
      if (!(B.cv > A.cv + 8)) degenerate("CVs not separated enough to be unambiguous");
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `${bDef.name}`, correct: true },
        { text: `${aDef.name}`, tag: "absolute_spread_confused_with_relative",
          explain: `${aDef.name} does have the larger SD (${A.sd} vs ${B.sd}), but it is also measured on a much larger scale — its mean is ${A.mean} against ${B.mean}. Relative to its own mean it varies by only ${A.cv.toFixed(1)}%, against ${B.cv.toFixed(1)}% for ${bDef.name}. Comparing SDs across different scales compares the units, not the variability.` },
        { text: "They are equally variable relative to their means", tag: "cv_not_computed",
          explain: `Their CVs are ${A.cv.toFixed(1)}% and ${B.cv.toFixed(1)}% — not close. The comparison is one division each; "about the same" is what SDs on different scales look like before you do it.` },
        { text: "They cannot be compared without knowing the sample sizes", tag: "sample_size_confused_with_variability",
          explain: "Sample size governs how precisely you have ESTIMATED each SD, not how variable the measurements are. The CV is defined from the mean and SD alone." },
      ]);
      return {
        _variant: variant,
        _params: { aName: aDef.name, aMean: A.mean, aSd: A.sd, bName: bDef.name, bMean: B.mean, bSd: B.sd },
        q: `Which measurement is more variable RELATIVE to its own mean?`,
        scenario: `A laboratory reports two analytes from the same run of samples. ${aDef.name}: mean ${A.mean} ${aDef.unit}, SD ${A.sd} ${aDef.unit}. ${bDef.name}: mean ${B.mean} ${bDef.unit}, SD ${B.sd} ${bDef.unit}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "An SD carries the units of its measurement, so two SDs on different scales are not comparable until you divide each by its own mean.",
        explain: `CV = SD/mean × 100. ${aDef.name}: ${A.sd}/${A.mean} = ${A.cv.toFixed(1)}%. ${bDef.name}: ${B.sd}/${B.mean} = ${B.cv.toFixed(1)}%. So ${bDef.name} is the more variable of the two despite having the SMALLER standard deviation — which is exactly why assay precision is quoted as a CV.`,
      };
    }

    const def = rng.pick(ANALYTES);
    const d = drawAnalyte(rng, def);

    if (variant === "cv") {
      return {
        _variant: variant, _params: { mean: d.mean, sd: d.sd, cv: d.cv },
        q: `What is the coefficient of variation, as a percentage?`,
        scenario: `Quality control for ${def.name} over 40 runs gives a mean of ${d.mean} ${def.unit} and an SD of ${d.sd} ${def.unit}.`,
        type: "numeric",
        answer: +d.cv.toFixed(2),
        tol: Math.max(0.05, +(d.cv * 0.02).toFixed(2)),
        hint: "Express the SD as a share of the mean, then move to a percentage.",
        explain: `CV = SD/mean × 100 = ${d.sd}/${d.mean} × 100 ≈ ${d.cv.toFixed(1)}%. Because it is unit-free, it is the only spread measure you can compare across analytes measured on different scales.`,
      };
    }

    // sd_vs_se
    const n = rng.pick([16, 25, 36, 49, 64, 100] as const);
    const se = +(d.sd / Math.sqrt(n)).toFixed(3);
    const wrong1 = +(d.sd / n).toFixed(3);
    const wrong2 = +(1.96 * se).toFixed(3);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `${d.sd} ${def.unit}`, correct: true },
      { text: `${se} ${def.unit}`, tag: "sd_confused_with_se",
        explain: `${se} is the standard ERROR, SD/√n = ${d.sd}/${Math.sqrt(n)}. It says how precisely you have pinned down the group MEAN — it would shrink if you simply recruited more patients, which tells you it cannot be describing how much patients differ from each other.` },
      { text: `${wrong1} ${def.unit}`, tag: "se_divided_by_n_instead_of_sqrt_n",
        explain: `Dividing by n rather than √n. The standard error is SD/√n = ${se}; and in any case the question asks about variation between PATIENTS, which is the SD itself.` },
      { text: `${wrong2} ${def.unit}`, tag: "ci_halfwidth_used_as_spread",
        explain: `${wrong2} is 1.96 × SE — the half-width of a 95% confidence interval for the mean. That is an uncertainty statement about one summary number, not a description of the patients.` },
    ]);
    return {
      _variant: variant, _params: { mean: d.mean, sd: d.sd, n, se },
      q: `Table 1 should report how much ${def.name} varies BETWEEN PATIENTS. Which number belongs there?`,
      scenario: `A cohort of n = ${n} patients has mean ${def.name} ${d.mean} ${def.unit} with an SD of ${d.sd} ${def.unit}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Ask what each candidate would do if you doubled the sample size. The description of patients should not move; a statement about precision should.",
      explain: `The SD (${d.sd} ${def.unit}) describes the patients and is a property of the population — recruiting more of them would not shrink it. The SE (${se}) describes how well the MEAN is known and falls as √n grows. Table 1 characterises the sample, so it takes the SD; the SE belongs next to the estimate it qualifies.`,
    };
  },
};

// ============================================================
// The normal scale: z, cut-offs, tail areas
// ============================================================
type NormCtx = { measure: string; unit: string; mu: [number, number]; sigma: [number, number]; dec: 0 | 1 };

const NORM_CONTEXTS: readonly NormCtx[] = [
  { measure: "birth weight", unit: "g", mu: [3200, 3600], sigma: [420, 580], dec: 0 },
  { measure: "systolic blood pressure", unit: "mmHg", mu: [118, 136], sigma: [11, 18], dec: 0 },
  { measure: "haemoglobin", unit: "g/dL", mu: [12, 15], sigma: [1, 2], dec: 1 },
  { measure: "serum sodium", unit: "mmol/L", mu: [138, 142], sigma: [2, 4], dec: 1 },
  { measure: "peak expiratory flow", unit: "L/min", mu: [380, 520], sigma: [50, 80], dec: 0 },
];

const TAIL_TABLE = [
  { z: 1.0, one: 15.9 },
  { z: 1.28, one: 10.0 },
  { z: 1.645, one: 5.0 },
  { z: 1.96, one: 2.5 },
  { z: 2.33, one: 1.0 },
  { z: 2.58, one: 0.5 },
] as const;

const CUTOFFS = [
  { pctile: 2.5, z: -1.96 }, { pctile: 5, z: -1.645 }, { pctile: 90, z: 1.28 },
  { pctile: 95, z: 1.645 }, { pctile: 97.5, z: 1.96 }, { pctile: 99, z: 2.33 },
] as const;

const drawNorm = (rng: RNG, c: NormCtx) => {
  const m = c.dec === 1 ? 10 : 1;
  return {
    mu: rng.int(c.mu[0] * m, c.mu[1] * m) / m,
    sigma: rng.int(c.sigma[0] * m, c.sigma[1] * m) / m,
  };
};

export const ZSCORE_FAMILY: QuestionFamily = {
  fid: "gen_zscore",
  title: "The normal scale — z-scores, cut-offs and tail areas",
  method: "normal_zscore",
  diffMin: "intern",
  variants: ["z", "cutoff", "tail"],
  gen: (rng) => {
    const c = rng.pick(NORM_CONTEXTS);
    const { mu, sigma } = drawNorm(rng, c);
    const variant = rng.pick(["z", "cutoff", "tail"] as const);
    const round = (x: number) => +x.toFixed(c.dec);
    const pop = `In a healthy reference population, ${c.measure} is approximately normally distributed with mean ${mu} ${c.unit} and SD ${sigma} ${c.unit}.`;

    if (variant === "z") {
      const k = rng.pick([-2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5] as const);
      const x = round(mu + k * sigma);
      const z = (x - mu) / sigma;
      if (Math.abs(z - k) > 0.05) degenerate("rounding moved the z too far");
      return {
        _variant: variant, _params: { mu, sigma, x, z },
        q: `A patient measures ${x} ${c.unit}. What is their z-score?`,
        scenario: pop,
        type: "numeric",
        answer: +z.toFixed(2),
        tol: 0.05,
        hint: "A z-score answers one question: how many SDs from the mean, and in which direction?",
        explain: `z = (x − μ)/σ = (${x} − ${mu})/${sigma} = ${z.toFixed(2)}. The sign matters as much as the size — this patient is ${Math.abs(z).toFixed(2)} SD ${z < 0 ? "BELOW" : "ABOVE"} the reference mean. Converting to z is what lets you compare this measurement against one on a completely different scale.`,
      };
    }

    if (variant === "cutoff") {
      const cut = rng.pick(CUTOFFS);
      const value = mu + cut.z * sigma;
      return {
        _variant: variant, _params: { mu, sigma, pctile: cut.pctile, z: cut.z, value },
        q: `What ${c.measure} marks the ${cut.pctile}th percentile? Use z = ${cut.z}.`,
        scenario: pop,
        type: "numeric",
        answer: +value.toFixed(2),
        tol: Math.max(0.05, +(Math.abs(value) * 0.005).toFixed(2)),
        hint: "Going from a z back to the original scale is the same formula, rearranged: start at the mean and walk z standard deviations.",
        explain: `x = μ + z·σ = ${mu} + (${cut.z} × ${sigma}) ≈ ${value.toFixed(2)} ${c.unit}. So ${cut.pctile}% of the reference population sits below this value — which is exactly how clinical reference limits (and growth-chart centiles) are built.`,
      };
    }

    // tail — proportion beyond a value, with the one- vs two-tailed trap.
    const row = rng.pick(TAIL_TABLE);
    const other = rng.pick(TAIL_TABLE.filter(r => r.z !== row.z));
    const x = round(mu + row.z * sigma);
    const zActual = (x - mu) / sigma;
    if (Math.abs(zActual - row.z) > 0.03) degenerate("rounding moved the z off the table");
    const fmt = (p: number) => `About ${p}%`;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: fmt(row.one), correct: true },
      { text: fmt(+(row.one * 2).toFixed(1)), tag: "one_tailed_confused_with_two_tailed",
        explain: `${(row.one * 2).toFixed(1)}% is the area in BOTH tails combined — above ${x} and, symmetrically, below ${round(mu - row.z * sigma)} ${c.unit}. The question asked only about values above ${x}, which is half of that.` },
      { text: fmt(+(100 - row.one).toFixed(1)), tag: "tail_and_body_reversed",
        explain: `${(100 - row.one).toFixed(1)}% is the proportion BELOW ${x} — the body of the distribution rather than the tail. A value ${row.z} SD above the mean is unusual; most of the population must lie below it, not above.` },
      { text: fmt(other.one), tag: "wrong_z_landmark_recalled",
        explain: `${other.one}% is the upper-tail area for z = ${other.z}, not for z = ${row.z}. These landmarks are close together and easy to swap — the ones worth knowing cold are z = 1.645 → 5% and z = 1.96 → 2.5% in one tail.` },
    ]);
    return {
      _variant: variant, _params: { mu, sigma, x, z: row.z, one: row.one },
      q: `Roughly what proportion of this population has a ${c.measure} ABOVE ${x} ${c.unit}?`,
      scenario: pop,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Convert to a z first, then recall the one-tailed area for that landmark — and check whether the question wants one tail or two.",
      explain: `z = (${x} − ${mu})/${sigma} ≈ ${row.z}. The area above z = ${row.z} in a standard normal is about ${row.one}%. Doubling it (${(row.one * 2).toFixed(1)}%) would answer a different question: how many are that far from the mean in EITHER direction.`,
    };
  },
};
