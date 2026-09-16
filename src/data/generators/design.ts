// Item families for the Study Design & Bias branch.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, num } from "./core";

// ============================================================
// Naming a study design, and what it can and cannot estimate
// ============================================================
export type DesignKey = "rct" | "cohort" | "case_control" | "cross_sectional" | "case_series";

export const DESIGN_NAME: Record<DesignKey, string> = {
  rct: "Randomised controlled trial",
  cohort: "Prospective cohort study",
  case_control: "Case-control study",
  cross_sectional: "Cross-sectional survey",
  case_series: "Case series",
};

const DESIGN_WHY: Record<DesignKey, string> = {
  rct: "the investigators ALLOCATED the exposure at random and then followed people forward",
  cohort: "people free of the outcome are grouped by exposure and followed forward to see who develops it",
  case_control: "people are recruited BY OUTCOME STATUS and their past exposure is then reconstructed",
  cross_sectional: "exposure and outcome are measured at the same moment, with no follow-up at all",
  case_series: "a group of treated patients is described with no comparison group of any kind",
};

/** What each design can estimate directly, and why. */
const DESIGN_MEASURE: Record<DesignKey, { label: string; why: string }> = {
  rct: { label: "A risk ratio or risk difference", why: "everyone is followed forward from a common start, so the denominator of people at risk is known" },
  cohort: { label: "A risk ratio or risk difference", why: "everyone is followed forward from a common start, so the denominator of people at risk is known" },
  case_control: { label: "An odds ratio only", why: "the investigators fixed how many cases and controls to recruit, so the ratio of diseased to healthy in the study is an artefact of sampling and no risk can be computed from it" },
  cross_sectional: { label: "A prevalence ratio", why: "with everything measured at one instant there is no incidence to observe — only how common the outcome is right now" },
  case_series: { label: "No measure of association at all", why: "there is no unexposed or untreated group to compare against, so there is nothing to form a ratio with" },
};

type Clin = { cond: string; outcome: string; exposure: string; drug: string };
const CLIN: readonly Clin[] = [
  { cond: "type-2 diabetes", outcome: "myocardial infarction", exposure: "heavy alcohol use", drug: "empagliflozin" },
  { cond: "rheumatoid arthritis", outcome: "serious infection", exposure: "long-term corticosteroid use", drug: "a JAK inhibitor" },
  { cond: "chronic kidney disease", outcome: "end-stage kidney failure", exposure: "regular NSAID use", drug: "a SGLT2 inhibitor" },
  { cond: "atrial fibrillation", outcome: "ischaemic stroke", exposure: "untreated hypertension", drug: "a direct oral anticoagulant" },
  { cond: "severe asthma", outcome: "hospital admission", exposure: "occupational dust exposure", drug: "a biologic add-on therapy" },
  { cond: "cirrhosis", outcome: "variceal bleeding", exposure: "continued alcohol intake", drug: "a non-selective beta-blocker" },
  { cond: "HIV infection", outcome: "opportunistic infection", exposure: "interrupted adherence", drug: "an integrase inhibitor" },
  { cond: "heart failure", outcome: "unplanned readmission", exposure: "high dietary sodium", drug: "sacubitril–valsartan" },
  { cond: "inflammatory bowel disease", outcome: "bowel resection", exposure: "current smoking", drug: "an anti-TNF agent" },
  { cond: "osteoporosis", outcome: "hip fracture", exposure: "chronic proton-pump inhibitor use", drug: "a bisphosphonate" },
];

const DESIGN_TMPL: Record<DesignKey, { tmpl: (r: RNG, c: Clin) => string; match: RegExp }> = {
  rct: {
    match: /randomly allocated/,
    tmpl: (r, c) => `${num(r.int(2, 18) * 100)} patients with ${c.cond} are randomly allocated to ${c.drug} or placebo and followed for ${r.int(6, 48)} months to see who develops ${c.outcome}.`,
  },
  cohort: {
    match: /free of .+ at baseline are grouped by/,
    tmpl: (r, c) => `${num(r.int(4, 40) * 1000)} adults free of ${c.outcome} at baseline are grouped by ${c.exposure} and followed for ${r.int(3, 15)} years to see who develops it.`,
  },
  case_control: {
    match: /matched controls without it are then asked/,
    tmpl: (r, c) => `${num(r.int(2, 9) * 100)} patients newly diagnosed with ${c.outcome} and ${num(r.int(4, 18) * 100)} matched controls without it are then asked about their history of ${c.exposure}.`,
  },
  cross_sectional: {
    match: /single survey .+ records current/,
    tmpl: (r, c) => `A single survey of ${num(r.int(8, 60) * 100)} adults records current ${c.exposure} and current ${c.outcome} at the same visit.`,
  },
  case_series: {
    match: /no comparison group is included/,
    tmpl: (r, c) => `A unit describes its ${r.int(12, 90)} consecutive patients with ${c.cond} who received ${c.drug}, reporting how many improved; no comparison group is included.`,
  },
};

const DESIGN_KEYS = Object.keys(DESIGN_NAME) as DesignKey[];

function pickDistinct<T>(rng: RNG, pool: T[], k: number): T[] {
  const rest = pool.slice(), out: T[] = [];
  while (out.length < k && rest.length) out.push(rest.splice(Math.floor(rng.next() * rest.length), 1)[0]);
  return out;
}

export const STUDY_DESIGN_FAMILY: QuestionFamily = {
  fid: "gen_study_design",
  title: "Naming a study design and knowing what it can estimate",
  method: "study_design",
  diffMin: "intern",
  variants: ["name_it", "measure", "sampled_on"],
  gen: (rng) => {
    const key = rng.pick(DESIGN_KEYS);
    const clin = rng.pick(CLIN);
    const scenario = DESIGN_TMPL[key].tmpl(rng, clin);
    const variant = rng.pick(["name_it", "measure", "sampled_on"] as const);

    if (variant === "name_it") {
      const decoys = pickDistinct(rng, DESIGN_KEYS.filter((k) => k !== key), 3);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: DESIGN_NAME[key], correct: true },
        ...decoys.map<Choice>((d) => ({
          text: DESIGN_NAME[d],
          tag: `${key}_named_as_${d}`,
          explain: `In ${DESIGN_NAME[d].toLowerCase()}, ${DESIGN_WHY[d]}. That is not what happened here, where ${DESIGN_WHY[key]}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { design: key },
        q: `Which study design is this?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask two questions in order: did anyone assign the exposure, and were people recruited on their exposure, on their outcome, or on neither?",
        explain: `This is ${DESIGN_NAME[key].toLowerCase()}: ${DESIGN_WHY[key]}. The label is not bookkeeping — it fixes which measures of association are even computable and which biases you have to worry about.`,
      };
    }

    if (variant === "measure") {
      // Deduplicate by LABEL first: an RCT and a cohort study estimate the same
      // thing, so drawing decoys by design key could offer the same option twice.
      const byLabel = new Map<string, DesignKey>();
      for (const k of DESIGN_KEYS) if (!byLabel.has(DESIGN_MEASURE[k].label)) byLabel.set(DESIGN_MEASURE[k].label, k);
      const correct = DESIGN_MEASURE[key];
      const decoys = pickDistinct(rng, [...byLabel.keys()].filter((l) => l !== correct.label), 3);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: correct.label, correct: true },
        ...decoys.map<Choice>((label) => {
          const d = byLabel.get(label)!;
          return {
            text: label,
            tag: `${key}_measure_confused_with_${d}`,
            explain: `${label} is what ${DESIGN_NAME[d].toLowerCase()} gives you, because ${DESIGN_MEASURE[d].why}. This study cannot deliver it: ${correct.why}.`,
          };
        }),
      ]);
      return {
        _variant: variant, _params: { design: key, measure: correct.label },
        q: `What measure of association can this study estimate DIRECTLY?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "A risk needs a denominator of people genuinely at risk, followed forward. Ask whether this design ever has one.",
        explain: `${correct.label} — ${correct.why}. Reaching for a risk ratio where the design cannot support one is the single most common analytical error in observational epidemiology.`,
      };
    }

    // sampled_on — what the investigators selected people on
    const SAMPLED: Record<DesignKey, string> = {
      rct: "On exposure — the investigators assigned it themselves, at random.",
      cohort: "On exposure — people were grouped by it before any outcome occurred.",
      case_control: "On outcome — cases and controls were recruited by disease status.",
      cross_sectional: "On neither — a single snapshot of everyone, measuring both at once.",
      case_series: "On outcome or treatment, with no comparison group selected at all.",
    };
    const uniq = new Map<string, DesignKey>();
    for (const k of DESIGN_KEYS) if (!uniq.has(SAMPLED[k])) uniq.set(SAMPLED[k], k);
    const correctText = SAMPLED[key];
    const decoys = pickDistinct(rng, [...uniq.keys()].filter((t) => t !== correctText), 3);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: correctText, correct: true },
      ...decoys.map<Choice>((t) => ({
        text: t,
        tag: `${key}_sampling_axis_misread`,
        explain: `That describes ${DESIGN_NAME[uniq.get(t)!].toLowerCase()}. Here, ${DESIGN_WHY[key]}.`,
      })),
    ]);
    return {
      _variant: variant, _params: { design: key },
      q: `What did the investigators select participants ON?`,
      scenario,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Follow the recruitment step, not the analysis. Who was let into the study, and what did they have to have?",
      explain: `${correctText} This is the axis that decides everything downstream: sampling on the outcome is what makes risks uncomputable and leaves only the odds ratio; sampling on exposure preserves the denominators.`,
    };
  },
};

// ============================================================
// Naming a bias, its direction, and its remedy
// ============================================================
export type BiasKey =
  | "selection" | "recall" | "nondifferential" | "lead_time" | "immortal_time" | "confounding";

export const BIAS_NAME: Record<BiasKey, string> = {
  selection: "Selection bias",
  recall: "Recall bias",
  nondifferential: "Non-differential misclassification",
  lead_time: "Lead-time bias",
  immortal_time: "Immortal time bias",
  confounding: "Confounding",
};

const BIAS_DEF: Record<BiasKey, string> = {
  selection: "who ends up in the study depends on both the exposure and the outcome, so the sample's association differs from the population's",
  recall: "people who already have the outcome search their memories harder, so past exposure is reported differently by cases and controls",
  nondifferential: "exposure or outcome is measured with error that is equally likely in every group",
  lead_time: "screening moves the moment of diagnosis earlier without changing the date of death, so survival measured FROM DIAGNOSIS stretches",
  immortal_time: "a period during which the outcome could not possibly have occurred is assigned to the treated group",
  confounding: "a common cause of both exposure and outcome is distributed unequally between the groups",
};

type Dir = "null" | "away" | "either";
const DIR_TEXT: Record<Dir, string> = {
  null: "Towards the null — the true association is diluted.",
  away: "Away from the null — the apparent association is exaggerated.",
  either: "Unpredictable — it can push the estimate in either direction.",
};

type BiasEntry = {
  key: BiasKey; dir: Dir; fix: BiasKey;
  tmpl: (r: RNG, c: Clin) => string; match: RegExp;
  dirWhy: string;
};

const BIAS_ENTRIES: readonly BiasEntry[] = [
  { key: "selection", dir: "either", fix: "selection",
    match: /health-awareness fair/,
    dirWhy: "which way it pushes depends on how the selected group's exposure–outcome relationship differs from the population's, and nothing in the design tells you that",
    tmpl: (r, c) => `Volunteers for a study of ${c.exposure} and ${c.outcome} are recruited at a health-awareness fair; the ${num(r.int(3, 12) * 100)} who attend are far more health-conscious than the population they are meant to represent.` },
  { key: "recall", dir: "away", fix: "recall",
    match: /asked to remember their use/,
    dirWhy: "cases search their memories harder for a cause, so exposure is over-reported in exactly the group that has the outcome",
    tmpl: (r, c) => `${num(r.int(2, 8) * 100)} patients with ${c.outcome} and an equal number of controls are asked to remember their use of ${c.exposure.replace(/ use$/, "")} over the previous ${r.int(5, 20)} years.` },
  { key: "nondifferential", dir: "null", fix: "nondifferential",
    match: /equally likely in both groups/,
    dirWhy: "blurring the exposure groups into each other makes them look more alike than they are, and two identical groups show no association",
    tmpl: (r, c) => `Exposure to ${c.exposure} is captured by a questionnaire that misclassifies about ${r.int(8, 25)}% of respondents, equally likely in both groups, in a study of ${c.outcome}.` },
  { key: "lead_time", dir: "away", fix: "lead_time",
    match: /survival measured from the date of diagnosis/,
    dirWhy: "diagnosis is moved earlier while death stays put, so the interval between them grows even if the programme saved nobody",
    tmpl: (r, c) => `A screening programme reports that screen-detected cases of ${c.outcome} have ${r.int(12, 40)} months longer survival measured from the date of diagnosis than symptom-detected cases.` },
  { key: "immortal_time", dir: "away", fix: "immortal_time",
    match: /follow-up for everyone starts at cohort entry/,
    dirWhy: "the treated group is credited with a stretch of time in which, by construction, none of them could have died — they had to survive long enough to fill the prescription",
    tmpl: (r, c) => `Patients are labelled "treated" if they ever filled a prescription for ${c.drug} during ${r.int(1, 3)} years, but follow-up for everyone starts at cohort entry, before any prescription was filled.` },
  { key: "confounding", dir: "either", fix: "confounding",
    match: /systematically younger and have fewer comorbidities/,
    dirWhy: "whether the estimate is pulled up or down depends on how the common cause relates to both variables, which varies case by case",
    tmpl: (r, c) => `Patients started on ${c.drug} are systematically younger and have fewer comorbidities than those left on older therapy, in an analysis of ${c.outcome} over ${r.int(2, 8)} years.` },
];

/** Study settings, prefixed to bias scenarios purely to widen the draw space —
 *  a family that repeats its wording is a small bank wearing a costume. */
const SETTINGS = [
  "In a single teaching hospital",
  "Across 14 primary-care practices",
  "In a regional disease registry",
  "In a two-centre observational study",
  "Within a national insurance-claims database",
  "In a university outpatient clinic",
] as const;

const FIXES: Record<BiasKey, string> = {
  selection: "Recruit from a defined population frame rather than from people who volunteer",
  recall: "Take exposure from prospectively recorded records rather than from interviews",
  nondifferential: "Measure the exposure more precisely, with a validated instrument or a biomarker",
  lead_time: "Compare disease-specific MORTALITY rates instead of survival from diagnosis",
  immortal_time: "Start follow-up at treatment assignment, or model treatment as time-varying",
  confounding: "Adjust for the measured common causes, or balance them by design",
};

export const BIAS_FAMILY: QuestionFamily = {
  fid: "gen_bias",
  title: "Naming a bias, its direction and its remedy",
  method: "bias",
  diffMin: "resident",
  variants: ["name_it", "direction", "fix"],
  gen: (rng) => {
    const e = rng.pick(BIAS_ENTRIES);
    const clin = rng.pick(CLIN);
    const raw = e.tmpl(rng, clin);
    const scenario = `${rng.pick(SETTINGS)}, ${raw[0].toLowerCase()}${raw.slice(1)}`;
    const variant = rng.pick(["name_it", "direction", "fix"] as const);
    const ALL = Object.keys(BIAS_NAME) as BiasKey[];

    if (variant === "name_it") {
      const decoys = pickDistinct(rng, ALL.filter((k) => k !== e.key), 3);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: BIAS_NAME[e.key], correct: true },
        ...decoys.map<Choice>((d) => ({
          text: BIAS_NAME[d],
          tag: `${e.key}_named_as_${d}`,
          explain: `${BIAS_NAME[d]} is when ${BIAS_DEF[d]}. That is not the mechanism here, where ${BIAS_DEF[e.key]}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { bias: e.key },
        q: `Which bias does this describe?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Locate the step where the error enters: who got into the study, how something was measured, or how time was allocated.",
        explain: `${BIAS_NAME[e.key]}: ${BIAS_DEF[e.key]}. Naming it matters because each of these has a different remedy — and most of them cannot be fixed in the analysis once the data are collected.`,
      };
    }

    if (variant === "direction") {
      const dirs: Dir[] = ["null", "away", "either"];
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: DIR_TEXT[e.dir], correct: true },
        ...dirs.filter((d) => d !== e.dir).map<Choice>((d) => ({
          text: DIR_TEXT[d],
          tag: `${e.key}_direction_read_as_${d}`,
          explain: `Not here: ${e.dirWhy}.`,
        })),
        { text: "It leaves the estimate unchanged and only widens the confidence interval.",
          tag: "bias_confused_with_imprecision",
          explain: "That is what random error does. Bias is systematic: it shifts the estimate itself, and collecting more data under the same flawed design shifts it no closer to the truth — it just tightens the interval around the wrong value." },
      ]);
      return {
        _variant: variant, _params: { bias: e.key, dir: e.dir },
        q: `Which way does this bias push the estimated association?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask what the mechanism does to the groups being compared: does it blur them together, or separate them further?",
        explain: `${DIR_TEXT[e.dir]} Here, ${e.dirWhy}. Knowing the direction is what lets you say whether a reported effect is a floor or a ceiling on the truth — which is often more useful than knowing the bias exists.`,
      };
    }

    // fix — which remedy addresses THIS mechanism
    const decoyFixKeys = pickDistinct(rng, ALL.filter((k) => k !== e.fix), 3);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: FIXES[e.fix], correct: true },
      ...decoyFixKeys.map<Choice>((d) => ({
        text: FIXES[d],
        tag: `remedy_for_${d}_applied_to_${e.key}`,
        explain: `That is the remedy for ${BIAS_NAME[d].toLowerCase()}, where ${BIAS_DEF[d]}. It does nothing about the problem here, which is that ${BIAS_DEF[e.key]}.`,
      })),
    ]);
    return {
      _variant: variant, _params: { bias: e.key, fix: e.fix },
      q: `Which step would actually address the problem?`,
      scenario,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Match the remedy to the MECHANISM, not to the topic. A fix that leaves the faulty step in place changes nothing.",
      explain: `${FIXES[e.fix]}. The mechanism is that ${BIAS_DEF[e.key]}, so the remedy has to intervene at that step. Note how few of these are analysis fixes — most biases are decided at the design stage and are permanent by the time you have a dataset.`,
    };
  },
};
