// Item families for the Missing Data & Measurement branch.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

function pickDistinct<T>(rng: RNG, pool: readonly T[], k: number): T[] {
  const rest = pool.slice(), out: T[] = [];
  while (out.length < k && rest.length) out.push(rest.splice(Math.floor(rng.next() * rest.length), 1)[0]);
  return out;
}

// ============================================================
// Missingness mechanisms
// ============================================================
export type MissKey = "mcar" | "mar" | "mnar";

const MISS_LABEL: Record<MissKey, string> = {
  mcar: "Missing completely at random (MCAR)",
  mar: "Missing at random (MAR)",
  mnar: "Missing not at random (MNAR)",
};
const MISS_DEF: Record<MissKey, string> = {
  mcar: "whether a value is missing has nothing to do with anything — observed or unobserved",
  mar: "whether a value is missing depends on variables you HAVE recorded, and on nothing else once those are accounted for",
  mnar: "whether a value is missing depends on the missing value itself, even after conditioning on everything you measured",
};
const MISS_COMPLETE_CASE: Record<MissKey, string> = {
  mcar: "Unbiased, but wasteful — you lose precision in proportion to how much you throw away.",
  mar: "Biased, unless the analysis conditions on the recorded variables that drive the missingness.",
  mnar: "Biased, and no analysis of the observed data alone can tell you by how much.",
};
const MISS_METHOD: Record<MissKey, string> = {
  mcar: "A complete-case analysis is defensible; imputation mainly buys back precision.",
  mar: "Multiple imputation (or a likelihood method) including the variables that predict missingness.",
  mnar: "Sensitivity analysis across plausible departures — there is no single correct fix.",
};

type MissEntry = { key: MissKey; tmpl: (r: RNG) => string; match: RegExp };

const MISS_ENTRIES: readonly MissEntry[] = [
  { key: "mcar", match: /freezer failure destroyed/,
    tmpl: (r) => `A freezer failure destroyed ${r.int(40, 260)} stored serum samples. Which samples were in the failed unit had nothing to do with the patients they came from.` },
  { key: "mcar", match: /batch of .+ questionnaires was lost in the post/,
    tmpl: (r) => `A batch of ${r.int(60, 400)} questionnaires was lost in the post. Which batch went missing was determined by the courier, not by anything about the respondents.` },
  { key: "mar", match: /Older participants were markedly more likely to skip/,
    tmpl: (r) => `Older participants were markedly more likely to skip the six-minute walk test — about ${r.int(20, 45)}% of those over 75 missed it, against ${r.int(4, 12)}% of younger participants. Age is recorded for everyone.` },
  { key: "mar", match: /clinic closure at one of the .+ sites/,
    tmpl: (r) => `A clinic closure at one of the ${r.int(4, 14)} sites meant ${r.int(30, 180)} participants missed their month-6 visit. Site is recorded for every participant, and the closure had nothing to do with individual patients.` },
  { key: "mnar", match: /heaviest drinkers were the least likely to report/,
    tmpl: (r) => `In a survey of ${num(r.int(8, 40) * 100)} adults, the heaviest drinkers were the least likely to report their weekly alcohol intake at all.` },
  { key: "mnar", match: /participants whose depression score worsened/,
    tmpl: (r) => `Over ${r.int(6, 24)} months, participants whose depression score worsened were the ones who stopped attending — so the missing value IS the deterioration you wanted to measure.` },
];

const MISS_KEYS = Object.keys(MISS_LABEL) as MissKey[];

export const MISSING_MECHANISM_FAMILY: QuestionFamily = {
  fid: "gen_missing_mechanism",
  title: "Missingness mechanisms and what they cost you",
  method: "mice",
  diffMin: "resident",
  variants: ["classify", "complete_case", "method"],
  gen: (rng) => {
    const e = rng.pick(MISS_ENTRIES);
    const scenario = e.tmpl(rng);
    const variant = rng.pick(["classify", "complete_case", "method"] as const);

    const build = (
      label: Record<MissKey, string>,
      tagSuffix: string,
      explainFor: (other: MissKey) => string,
    ) => assemble(rng, MISS_KEYS.map<Choice>((k) => k === e.key
      ? { text: label[k], correct: true }
      : { text: label[k], tag: `${e.key}_${tagSuffix}_${k}`, explain: explainFor(k) }));

    if (variant === "classify") {
      const { options, answer, optionExplanations, misconceptionTag } =
        build(MISS_LABEL, "classified_as", (k) =>
          `${MISS_LABEL[k]} means ${MISS_DEF[k]}. That is not this pattern, where ${MISS_DEF[e.key]}.`);
      return {
        _variant: variant, _params: { mechanism: e.key },
        q: `Which missingness mechanism does this describe?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask what the missingness depends on: nothing, something you recorded, or the missing value itself.",
        explain: `${MISS_LABEL[e.key]} — ${MISS_DEF[e.key]}. The label is not academic: it decides whether dropping incomplete rows is merely wasteful, quietly biased, or unfixable from the observed data.`,
      };
    }

    if (variant === "complete_case") {
      const { options, answer, optionExplanations, misconceptionTag } =
        build(MISS_COMPLETE_CASE, "complete_case_read_as", (k) =>
          `That is the consequence under ${MISS_LABEL[k]}, where ${MISS_DEF[k]}. Here ${MISS_DEF[e.key]}, so the consequence is different.`);
      return {
        _variant: variant, _params: { mechanism: e.key },
        q: `What happens if you simply drop the incomplete records?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Complete-case analysis is safe only when the people who remain are a fair sample of everyone. Ask whether they are.",
        explain: `${MISS_COMPLETE_CASE[e.key]} The mechanism here is that ${MISS_DEF[e.key]}. Note that a small amount of missingness under a bad mechanism can do more damage than a large amount under a benign one — the percentage missing is a poor guide on its own.`,
      };
    }

    const { options, answer, optionExplanations, misconceptionTag } =
      build(MISS_METHOD, "method_chosen_as", (k) =>
        `That is the appropriate response to ${MISS_LABEL[k]}, where ${MISS_DEF[k]}. It does not address this pattern, where ${MISS_DEF[e.key]}.`);
    return {
      _variant: variant, _params: { mechanism: e.key },
      q: `Which approach fits this situation?`,
      scenario,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Imputation can only borrow information from variables you actually recorded. Ask whether the reason for missingness is among them.",
      explain: `${MISS_METHOD[e.key]} Multiple imputation is a MAR tool: it reconstructs missing values from the observed ones, so it helps exactly when the observed variables explain the missingness — and quietly fails when they do not.`,
    };
  },
};

// ============================================================
// Validity and reliability
// ============================================================
export type ValidityKey = "content" | "criterion" | "construct" | "face";

const VALIDITY_LABEL: Record<ValidityKey, string> = {
  content: "Content validity", criterion: "Criterion validity",
  construct: "Construct validity", face: "Face validity",
};
const VALIDITY_DEF: Record<ValidityKey, string> = {
  content: "the items between them cover every important domain of the concept, with nothing essential left out",
  criterion: "scores agree with an accepted gold-standard measurement of the same thing",
  construct: "the scores behave the way theory says they should — correlating with related measures and not with unrelated ones",
  face: "the instrument simply LOOKS, on inspection, as though it measures what it claims",
};

type ValidityEntry = { key: ValidityKey; tmpl: (r: RNG) => string; match: RegExp };

const VALIDITY_ENTRIES: readonly ValidityEntry[] = [
  { key: "content", match: /panel of .+ specialists reviews whether the items/,
    tmpl: (r) => `A panel of ${r.int(6, 18)} specialists reviews whether the items between them cover every domain of the concept, and flags two domains the draft omits.` },
  { key: "criterion", match: /compared against .+ obtained by the reference standard/,
    tmpl: (r) => `Scores from the ${r.int(8, 30)}-item screening tool are compared against the diagnosis obtained by the reference standard structured interview at the same visit.` },
  { key: "construct", match: /correlates .+ with established measures of related/,
    tmpl: (r) => `The new scale correlates ${(r.int(60, 85) / 100).toFixed(2)} with established measures of related constructs and only ${(r.int(3, 20) / 100).toFixed(2)} with measures theory says should be unrelated.` },
  { key: "face", match: /clinicians are asked whether the questionnaire simply looks/,
    tmpl: (r) => `${r.int(5, 15)} clinicians are asked whether the questionnaire simply looks, on reading it, like something that measures the intended concept.` },
];

type ReliabilityCase = { key: string; tmpl: (r: RNG) => string; verdict: string; why: string; match: RegExp };

const DEVICES = ["clinic scale", "bedside spirometer", "automated BP cuff", "handheld glucometer", "digital thermometer"] as const;

const RELIABILITY_CASES: readonly ReliabilityCase[] = [
  { key: "reliable_not_valid", verdict: "Reliable but not valid",
    match: /reads exactly .+ heavy on every single/,
    why: "repeat measurements agree with each other perfectly, and all agree on the wrong value — consistency without accuracy",
    tmpl: (r) => `A ${r.pick(DEVICES)} reads exactly ${(r.int(8, 40) / 10).toFixed(1)} units heavy on every single reading, for all ${r.int(2, 9) * 50} patients checked.` },
  { key: "valid_not_reliable", verdict: "Valid on average but unreliable",
    match: /scatter widely around the true value with no systematic offset/,
    why: "the readings centre on the truth, so there is no systematic error, but any single measurement could be far out",
    tmpl: (r) => `${r.int(3, 12)} repeat readings from a ${r.pick(DEVICES)} scatter widely around the true value with no systematic offset in either direction.` },
  { key: "neither", verdict: "Neither reliable nor valid",
    match: /Two observers scoring the same patient disagree/,
    why: "the observers do not agree with each other, and the instrument is also calibrated against the wrong standard",
    tmpl: (r) => `Two observers scoring the same patient disagree by up to ${r.int(3, 15)} points, and the scoring rules were adapted from a different disease entirely.` },
  { key: "both", verdict: "Both reliable and valid",
    match: /agree closely with each other and with the reference standard/,
    why: "repeat measurements agree closely with each other (reliability) and with the reference standard (validity)",
    tmpl: (r) => `Repeat measurements agree closely with each other and with the reference standard on all ${r.int(2, 9) * 40} patients tested.` },
];

export const VALIDITY_FAMILY: QuestionFamily = {
  fid: "gen_validity",
  title: "Validity, reliability and what measurement error does",
  method: "measurement_validity",
  diffMin: "resident",
  variants: ["classify", "reliability", "error_effect"],
  gen: (rng) => {
    const variant = rng.pick(["classify", "reliability", "error_effect"] as const);

    if (variant === "classify") {
      const e = rng.pick(VALIDITY_ENTRIES);
      const ALL = Object.keys(VALIDITY_LABEL) as ValidityKey[];
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
        ALL.map<Choice>((k) => k === e.key
          ? { text: VALIDITY_LABEL[k], correct: true }
          : {
              text: VALIDITY_LABEL[k],
              tag: `${e.key}_validity_named_as_${k}`,
              explain: `${VALIDITY_LABEL[k]} asks whether ${VALIDITY_DEF[k]}. The activity described checks something else: whether ${VALIDITY_DEF[e.key]}.`,
            }),
      );
      return {
        _variant: variant, _params: { validity: e.key },
        q: `Which kind of validity is being assessed?`,
        scenario: e.tmpl(rng),
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask what the instrument is being held up against: expert judgement about coverage, a gold standard, a web of theoretical predictions, or nothing but appearances.",
        explain: `${VALIDITY_LABEL[e.key]} — it asks whether ${VALIDITY_DEF[e.key]}. Only criterion validity can be reduced to a single number against a gold standard; the others are arguments, built from several kinds of evidence.`,
      };
    }

    if (variant === "reliability") {
      const c = rng.pick(RELIABILITY_CASES);
      const decoys = pickDistinct(rng, RELIABILITY_CASES.filter((x) => x.key !== c.key), 3);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: c.verdict, correct: true },
        ...decoys.map<Choice>((d) => ({
          text: d.verdict,
          tag: `${c.key}_read_as_${d.key}`,
          explain: `That verdict fits an instrument where ${d.why}. This one is different: ${c.why}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { reliability: c.key },
        q: `How would you describe this instrument?`,
        scenario: c.tmpl(rng),
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Reliability asks whether repeat measurements agree with EACH OTHER. Validity asks whether they agree with the TRUTH. They are independent.",
        explain: `${c.verdict}: ${c.why}. The pair is asymmetric — an instrument can be perfectly reliable and perfectly wrong, but it cannot be valid for individual patients while being unreliable, because the noise itself puts any single reading far from the truth.`,
      };
    }

    // error_effect — random error attenuates, a constant offset cancels
    const random = rng.next() < 0.5;
    const pctError = rng.int(10, 30);
    const offset = rng.int(15, 40) / 10;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      random
        ? { text: "It biases the estimated association towards the null — the measured link is weaker than the true one.", correct: true }
        : { text: "It leaves the between-group difference unchanged, because the offset cancels when the groups are subtracted.", correct: true },
      random
        ? { text: "It leaves the association unchanged, because the errors average out across patients.",
            tag: "random_error_assumed_to_average_out_of_an_association",
            explain: `The errors do average out of the MEAN — which is why a group mean stays roughly right. They do not average out of an ASSOCIATION: blurring the exposure makes the exposed and unexposed groups resemble each other, and more alike groups show a weaker association. This is regression dilution, and it works in one direction only.` }
        : { text: "It biases the between-group difference towards the null.",
            tag: "systematic_offset_assumed_to_attenuate",
            explain: `A constant offset moves every reading the same way, so both arms shift by ${offset.toFixed(1)} and the DIFFERENCE between them is untouched. Attenuation comes from random error, not from a systematic one. The offset does matter if you report absolute values against a reference range.` },
      { text: "It makes the confidence interval narrower, because measurement noise adds information.",
        tag: "measurement_error_assumed_to_help_precision",
        explain: "Noise never adds information. Random measurement error widens intervals and attenuates associations at the same time; a systematic offset changes neither the width nor the difference." },
      { text: "It can be removed afterwards by adjusting for the mismeasured variable in the model.",
        tag: "measurement_error_assumed_fixable_by_adjustment",
        explain: "Adjusting for a mismeasured variable adjusts for the mismeasured version, and leaves residual confounding behind. Correcting measurement error needs a validation sub-study or a measurement-error model, not an extra term in the regression." },
    ]);
    return {
      _variant: variant, _params: { random: random ? 1 : 0, pctError, offset },
      q: `What does this measurement error do to the study's estimate?`,
      scenario: random
        ? `Exposure status is recorded by a questionnaire that misclassifies about ${pctError}% of participants, with errors equally likely in either direction and unrelated to the outcome.`
        : `The scale used at every visit reads ${offset.toFixed(1)} kg heavy for every patient in both arms of the trial, throughout the study.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Ask whether the error pushes everyone the same way, or scrambles people in both directions.",
      explain: random
        ? `Non-differential random misclassification blurs the exposure groups into one another. Two groups that resemble each other more show a weaker association, so the estimate is pulled towards the null: the observed effect is a FLOOR on the true one, which is why "the association survived despite crude exposure measurement" is a meaningful argument.`
        : `A constant offset of ${offset.toFixed(1)} kg applies to both arms, so it cancels exactly in the between-group difference. It would still matter for anything absolute — classifying patients against a BMI threshold, or comparing with an external reference — but a randomised comparison is immune to it.`,
    };
  },
};

// ============================================================
// Cohen's kappa
// ============================================================
const KAPPA_CONTEXTS = [
  { task: "grading chest radiographs for consolidation", raters: "two radiologists" },
  { task: "classifying biopsy slides as malignant", raters: "two pathologists" },
  { task: "scoring ECGs for atrial fibrillation", raters: "two cardiologists" },
  { task: "rating wound photographs as infected", raters: "two nurse specialists" },
] as const;

const BANDS: readonly { lo: number; hi: number; label: string }[] = [
  { lo: -1, hi: 0.2, label: "Slight agreement" },
  { lo: 0.2, hi: 0.4, label: "Fair agreement" },
  { lo: 0.4, hi: 0.6, label: "Moderate agreement" },
  { lo: 0.6, hi: 0.8, label: "Substantial agreement" },
  { lo: 0.8, hi: 1, label: "Almost perfect agreement" },
];

export const KAPPA_FAMILY: QuestionFamily = {
  fid: "gen_kappa",
  title: "Cohen's kappa — agreement beyond chance",
  method: "kappa",
  diffMin: "fellow",
  variants: ["compute", "vs_raw", "interpret"],
  gen: (rng) => {
    const c = rng.pick(KAPPA_CONTEXTS);
    const variant = rng.pick(["compute", "vs_raw", "interpret"] as const);
    // Rare-positive tables are the interesting case: raw agreement is high,
    // chance agreement is high too, and kappa is much lower than either.
    const N = rng.int(2, 8) * 100;
    const a = rng.int(Math.round(N * 0.02), Math.round(N * 0.16));   // both say yes
    const b = rng.int(Math.round(N * 0.02), Math.round(N * 0.09));   // rater 1 only
    const cCell = rng.int(Math.round(N * 0.02), Math.round(N * 0.09)); // rater 2 only
    const d = N - a - b - cCell;
    if (d <= 0) degenerate("no double-negative cell left");
    const po = (a + d) / N;
    const pe = (((a + b) * (a + cCell)) + ((cCell + d) * (b + d))) / (N * N);
    if (1 - pe < 0.08) degenerate("chance agreement too close to 1 for kappa to be stable");
    const kappa = (po - pe) / (1 - pe);
    if (kappa < 0.05 || kappa > 0.95) degenerate("kappa at the edge of its range");
    const table = `${c.raters[0].toUpperCase()}${c.raters.slice(1)} independently ${c.task} for ${num(N)} cases. Both called ${num(a)} positive and ${num(d)} negative; the first alone called ${num(b)} positive, and the second alone called ${num(cCell)} positive.`;

    if (variant === "compute") {
      return {
        _variant: variant, _params: { N, a, b, c: cCell, d, po, pe, kappa },
        q: `What is Cohen's kappa for these two raters?`,
        scenario: table,
        type: "numeric",
        answer: +kappa.toFixed(3),
        tol: 0.02,
        hint: "Two quantities first: how often they actually agreed, and how often they would agree by chance given each rater's own rate of calling things positive.",
        explain: `Observed agreement p₀ = (${num(a)} + ${num(d)})/${num(N)} = ${po.toFixed(3)}. Expected by chance pₑ = ${pe.toFixed(3)}, from the two raters' marginals. κ = (p₀ − pₑ)/(1 − pₑ) = (${po.toFixed(3)} − ${pe.toFixed(3)})/(1 − ${pe.toFixed(3)}) ≈ ${kappa.toFixed(2)}. The denominator is the room for improvement chance left available — which is why kappa collapses when a finding is rare.`,
      };
    }

    if (variant === "vs_raw") {
      if (po - kappa < 0.25) degenerate("raw agreement and kappa too close to make the point");
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `Because the finding is rare, two raters who both mostly say "no" agree ${(pe * 100).toFixed(0)}% of the time by chance alone — and kappa credits only the agreement beyond that.`, correct: true },
        { text: `Because the sample size of ${num(N)} is too small for kappa to be stable.`,
          tag: "kappa_drop_blamed_on_sample_size",
          explain: `${num(N)} cases is ample. Sample size governs the CONFIDENCE INTERVAL around kappa, not its value — recruiting ten times as many cases with the same rating pattern would return almost exactly the same ${kappa.toFixed(2)}.` },
        { text: `Because the two raters disagreed on most of the positive cases, which kappa weights more heavily than negatives.`,
          tag: "kappa_thought_to_weight_cells_unequally",
          explain: `Unweighted kappa treats every disagreement alike; it does not up-weight positives. What drives the value down here is the chance-agreement term pₑ = ${pe.toFixed(2)}, which is large precisely because both raters call almost everything negative.` },
        { text: `Because kappa and raw agreement measure different raters — kappa is about intra-rater consistency.`,
          tag: "cohens_kappa_confused_with_intra_rater_reliability",
          explain: `Cohen's kappa is an INTER-rater measure, computed from exactly the same table as the raw agreement. Intra-rater consistency would need each rater to score the same cases twice.` },
      ]);
      return {
        _variant: variant, _params: { po, pe, kappa },
        q: `Raw agreement is ${(po * 100).toFixed(0)}%, yet kappa is only ${kappa.toFixed(2)}. Why?`,
        scenario: table,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask how often two raters who both say \"no\" almost all the time would agree even if they never looked at the images.",
        explain: `With only ${num(a + b)} and ${num(a + cCell)} positives out of ${num(N)}, chance alone delivers pₑ = ${pe.toFixed(2)} agreement. Kappa asks how much of the remaining ${((1 - pe) * 100).toFixed(0)} percentage points of headroom the raters actually captured — here ${((po - pe) * 100).toFixed(1)} of them, giving ${kappa.toFixed(2)}. This "kappa paradox" is why raw agreement should never be reported on its own for a rare finding.`,
      };
    }

    // interpret — Landis & Koch band
    const band = BANDS.find((b) => kappa >= b.lo && kappa < b.hi) ?? BANDS[BANDS.length - 1];
    const edge = Math.min(Math.abs(kappa - band.lo), Math.abs(kappa - band.hi));
    if (edge < 0.03) degenerate("kappa sits on a band boundary");
    const decoys = pickDistinct(rng, BANDS.filter((b) => b.label !== band.label), 3);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: band.label, correct: true },
      ...decoys.map<Choice>((b) => ({
        text: b.label,
        tag: `kappa_band_misread_as_${b.label.split(" ")[0].toLowerCase()}`,
        explain: `"${b.label}" corresponds to κ between ${b.lo.toFixed(1)} and ${b.hi.toFixed(1)} on the Landis–Koch scale. This κ is ${kappa.toFixed(2)}.`,
      })),
    ]);
    return {
      _variant: variant, _params: { kappa, band: band.label },
      q: `On the conventional Landis–Koch scale, κ = ${kappa.toFixed(2)} represents:`,
      scenario: table,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "The bands run in steps of 0.2 from 0.2 upwards.",
      explain: `κ = ${kappa.toFixed(2)} falls in the ${band.lo.toFixed(1)}–${band.hi.toFixed(1)} band: ${band.label.toLowerCase()}. These labels are a convention with no theoretical backing — Landis and Koch proposed them as "arbitrary but useful", and what counts as acceptable depends entirely on the consequences of a disagreement.`,
    };
  },
};
