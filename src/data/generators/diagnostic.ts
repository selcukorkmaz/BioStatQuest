// Diagnostic-accuracy item families.
import type { QuestionFamily } from "./core";
import { assemble, degenerate, pct, num } from "./core";

// ============================================================
// FAMILY 1 — Predictive values under a shifting base rate
// ============================================================
// The single most-failed reasoning step in clinical epidemiology, and the
// one most damaged by a static bank: once you have seen "1% prevalence,
// 90% sens, 95% spec" twice you recall 15.4% instead of re-deriving it.

type DxContext = {
  condition: string;
  test: string;
  screen: string;
  clinic: string;
};

const DX_CONTEXTS: readonly DxContext[] = [
  { condition: "colorectal cancer", test: "a stool-DNA screening assay",
    screen: "average-risk adults aged 50–75 invited to population screening",
    clinic: "patients referred to GI clinic with iron-deficiency anaemia" },
  { condition: "HIV infection", test: "a fourth-generation antigen/antibody assay",
    screen: "first-time blood donors",
    clinic: "sexual-health clinic attendees reporting a high-risk exposure" },
  { condition: "pulmonary embolism", test: "a point-of-care D-dimer",
    screen: "ambulatory patients with atypical, non-pleuritic chest discomfort",
    clinic: "ED patients with tachycardia, hypoxia and pleuritic chest pain" },
  { condition: "latent tuberculosis", test: "an interferon-γ release assay",
    screen: "newly enrolled healthcare workers in a low-incidence region",
    clinic: "household contacts of a smear-positive index case" },
  { condition: "gestational diabetes", test: "a 1-hour 50 g glucose challenge",
    screen: "all pregnant women screened at 24–28 weeks",
    clinic: "pregnant women with BMI > 35 and a prior macrosomic infant" },
  { condition: "atrial fibrillation", test: "a single-lead wearable ECG",
    screen: "community-dwelling adults over 65 with no cardiac history",
    clinic: "patients referred after documented palpitations and syncope" },
];

const SCREEN_PREV = [0.002, 0.005, 0.008, 0.01, 0.02, 0.03, 0.05] as const;
const CLINIC_PREV = [0.25, 0.3, 0.35, 0.4, 0.5] as const;
const COHORT = 100_000;

type TwoByTwo = { tp: number; fp: number; fn: number; tn: number; ppv: number; npv: number };

function twoByTwo(prev: number, sens: number, spec: number): TwoByTwo {
  const sick = Math.round(COHORT * prev);
  const well = COHORT - sick;
  const tp = Math.round(sick * sens);
  const fn = sick - tp;
  const tn = Math.round(well * spec);
  const fp = well - tn;
  if (tp + fp === 0 || tn + fn === 0) degenerate("empty positive or negative column");
  return { tp, fp, fn, tn, ppv: tp / (tp + fp), npv: tn / (tn + fn) };
}

export const PPV_FAMILY: QuestionFamily = {
  fid: "gen_ppv",
  title: "Predictive value under a shifting base rate",
  method: "roc_auc",
  diffMin: "resident",
  variants: ["rates", "table", "shift"],
  gen: (rng) => {
    const ctx = rng.pick(DX_CONTEXTS);
    const sens = rng.int(82, 98) / 100;
    const spec = rng.int(88, 99) / 100;
    const variant = rng.pick(["rates", "table", "shift"] as const);

    if (variant === "shift") {
      const prevLow = rng.pick(SCREEN_PREV);
      const prevHigh = rng.pick(CLINIC_PREV);
      const low = twoByTwo(prevLow, sens, spec);
      const high = twoByTwo(prevHigh, sens, spec);
      // Base-rate neglect: reading PPV straight off the test's own accuracy,
      // as though prevalence were 50%.
      const naive = sens / (sens + (1 - spec));
      const hi = high.ppv * 100, lo = low.ppv * 100, nv = naive * 100;
      if (hi - lo < 15) degenerate("prevalence shift too small to be unambiguous");
      if (nv - lo < 15) degenerate("base-rate-neglect distractor too close to the key");

      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `It falls sharply — from roughly ${pct(hi)} to roughly ${pct(lo)}.`, correct: true },
        { text: `It barely moves — it sits around ${pct(nv)} in both settings, because that is what the test's own accuracy implies.`,
          tag: "base_rate_neglect",
          explain: `${pct(nv)} is what you get by ignoring prevalence entirely — treating sensitivity and (1 − specificity) as if sick and well people arrived in equal numbers. In the screening population they do not: ${num(low.tn + low.fp)} of the ${num(COHORT)} screened are disease-free, so even ${pct((1 - spec) * 100)} false positives among them (${num(low.fp)} people) swamp the ${num(low.tp)} true positives.` },
        { text: "It is unchanged — sensitivity and specificity are properties of the test, not of the population.",
          tag: "operating_characteristics_conflated_with_predictive_values",
          explain: "Sensitivity and specificity really are (approximately) population-independent — that part is right. But PPV is not one of them. PPV answers a different question: given a positive result, how likely is disease? That depends on how many diseased people were there to begin with." },
        { text: "It rises — the screening population is far larger, so each positive result is better supported.",
          tag: "sample_size_confused_with_base_rate",
          explain: "Sample size buys precision in your *estimate* of PPV; it does not change the PPV itself. What changes here is the mix of who gets tested, and the mix moves sharply toward disease-free people." },
      ]);

      return {
        _variant: variant,
        _params: { prevLow, prevHigh, sens, spec, ppvLow: low.ppv, ppvHigh: high.ppv, naive },
        q: `Moving the same test from the referral clinic into the screening programme, the positive predictive value:`,
        scenario: `${ctx.test[0].toUpperCase()}${ctx.test.slice(1)} for ${ctx.condition} has sensitivity ${pct(sens * 100, 0)} and specificity ${pct(spec * 100, 0)}, both measured in validation and unchanged. Among ${ctx.clinic}, prevalence is ${pct(prevHigh * 100, 0)}. Among ${ctx.screen}, prevalence is ${pct(prevLow * 100, 1)}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Sensitivity and specificity look backwards from disease to result. PPV looks forwards from result to disease — and that direction has to pass through the base rate.",
        explain: `Per ${num(COHORT)} people tested: in the clinic ${num(high.tp)} true positives against ${num(high.fp)} false positives → PPV ≈ ${pct(hi)}. In screening, ${num(low.tp)} true positives against ${num(low.fp)} false positives → PPV ≈ ${pct(lo)}. Identical test, identical cut-off; only the base rate moved.`,
      };
    }

    const prev = rng.pick(SCREEN_PREV);
    const t = twoByTwo(prev, sens, spec);
    const ppvPct = t.ppv * 100;

    if (variant === "rates") {
      return {
        _variant: variant,
        _params: { prev, sens, spec, ppv: t.ppv, tp: t.tp, fp: t.fp, fn: t.fn, tn: t.tn },
        q: `A randomly screened person tests positive. What is the probability they actually have ${ctx.condition}? Answer as a percentage.`,
        scenario: `Among ${ctx.screen}, the prevalence of ${ctx.condition} is ${pct(prev * 100, 1)}. ${ctx.test[0].toUpperCase()}${ctx.test.slice(1)} has sensitivity ${pct(sens * 100, 0)} and specificity ${pct(spec * 100, 0)}.`,
        type: "numeric",
        answer: +ppvPct.toFixed(2),
        tol: Math.max(0.3, +(ppvPct * 0.02).toFixed(2)),
        hint: "Positives come from two places: the few sick people the test catches, and the many well people it mislabels. Build both counts out of a cohort of 100,000 before dividing.",
        explain: `Out of ${num(COHORT)} screened: ${num(t.tp + t.fn)} have ${ctx.condition} and the test flags ${num(t.tp)} of them. Of the ${num(t.tn + t.fp)} without it, ${num(t.fp)} test positive anyway. Positives total ${num(t.tp + t.fp)}, of which ${num(t.tp)} are real → PPV = ${num(t.tp)}/${num(t.tp + t.fp)} ≈ ${pct(ppvPct)}.`,
      };
    }

    // variant === "table" — the counts are handed over; the work is knowing
    // which margin to divide by.
    const sensPct = sens * 100, specPct = spec * 100, npvPct = t.npv * 100;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: pct(ppvPct, 1), correct: true },
      { text: pct(sensPct, 1), tag: "ppv_confused_with_sensitivity",
        explain: `${pct(sensPct, 1)} is sensitivity: TP / (TP + FN) = ${num(t.tp)}/${num(t.tp + t.fn)} — it divides along the DISEASE column. PPV divides along the TEST-POSITIVE row: TP / (TP + FP).` },
      { text: pct(specPct, 1), tag: "ppv_confused_with_specificity",
        explain: `${pct(specPct, 1)} is specificity: TN / (TN + FP) = ${num(t.tn)}/${num(t.tn + t.fp)}. It says nothing about what a POSITIVE result means — it is about the disease-free column.` },
      { text: pct(npvPct, 2), tag: "ppv_confused_with_npv",
        explain: `${pct(npvPct, 2)} is the negative predictive value: TN / (TN + FN). Right row-wise logic, wrong row — that is the answer to "the test was negative, am I safe?".` },
    ]);

    return {
      _variant: variant,
      _params: { prev, sens, spec, ppv: t.ppv, tp: t.tp, fp: t.fp, fn: t.fn, tn: t.tn },
      q: `What is the positive predictive value of the test in this population?`,
      scenario: `${num(COHORT)} people from ${ctx.screen} are tested with ${ctx.test}. Of them, ${num(t.tp + t.fn)} turn out to have ${ctx.condition} and ${num(t.tn + t.fp)} do not. The test is positive in ${num(t.tp)} of the ${num(t.tp + t.fn)} who have it, and positive in ${num(t.fp)} of the ${num(t.tn + t.fp)} who do not.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Read along the row you are actually standing in. The patient is positive — so the denominator is everyone who tested positive.",
      explain: `PPV = TP / (TP + FP) = ${num(t.tp)} / ${num(t.tp + t.fp)} ≈ ${pct(ppvPct)}. Note how far it sits below sensitivity (${pct(sensPct, 0)}) — with ${pct(prev * 100, 1)} prevalence the false positives outnumber the true ones.`,
    };
  },
};
