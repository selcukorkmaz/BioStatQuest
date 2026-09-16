// Item families for the Probability & Sampling branch: discrete distributions,
// the central limit theorem, and sampling designs.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

// ============================================================
// Binomial risk, "at least one", and choosing a distribution
// ============================================================
type RiskCtx = { event: string; pop: string; unit: string };

const RISK_CONTEXTS: readonly RiskCtx[] = [
  { event: "develops a surgical-site infection", pop: "consecutive elective operations", unit: "operations" },
  { event: "tests positive for influenza", pop: "patients swabbed in a walk-in clinic", unit: "patients" },
  { event: "is readmitted within 30 days", pop: "heart-failure discharges", unit: "discharges" },
  { event: "reports a treatment-related adverse event", pop: "participants on the active arm", unit: "participants" },
  { event: "fails to attend the follow-up appointment", pop: "patients booked into the clinic", unit: "patients" },
];

export type DistName = "binomial" | "poisson" | "normal" | "exponential";

const DIST_LABEL: Record<DistName, string> = {
  binomial: "Binomial", poisson: "Poisson", normal: "Normal", exponential: "Exponential",
};
const DIST_DEF: Record<DistName, string> = {
  binomial: "a fixed number of independent trials, each either a success or a failure with the same probability",
  poisson: "a count of events occurring at a constant average rate in a fixed window of time or space, with no fixed upper limit",
  normal: "a continuous quantity formed by adding up many small independent contributions — most notably an average",
  exponential: "the continuous waiting TIME until the next event, when events arrive at a constant rate",
};

/**
 * Process templates. The numbers inside each description are drawn per instance
 * so `which_dist` is not a disguised eight-item bank; `match` lets a reader
 * (and the test suite) recover which template produced a given rendering.
 */
export const PROCESSES: readonly { tmpl: (rng: RNG) => string; match: RegExp; dist: DistName }[] = [
  { dist: "binomial", match: /patients on a ward who screen positive/,
    tmpl: (r) => `the number of the ${r.int(20, 60)} patients on a ward who screen positive, each independently at the same risk` },
  { dist: "binomial", match: /operations complicated by infection/,
    tmpl: (r) => `the number of the ${r.int(15, 45)} consecutive operations complicated by infection, each independently at the same risk` },
  { dist: "binomial", match: /trial participants who report a headache/,
    tmpl: (r) => `the number of the ${r.int(30, 120)} trial participants who report a headache, each independently with the same probability` },
  { dist: "poisson", match: /ambulance calls a single station receives/,
    tmpl: (r) => `the number of ambulance calls a single station receives between ${String(r.int(0, 4)).padStart(2, "0")}:00 and the following hour` },
  { dist: "poisson", match: /dengue notifications in a district/,
    tmpl: (r) => `the number of new dengue notifications in a district over ${r.int(1, 4)} week(s), at a low and steady incidence rate` },
  { dist: "poisson", match: /needlestick injuries reported across the hospital/,
    tmpl: (r) => `the number of needlestick injuries reported across the hospital in a ${r.int(1, 6)}-month window, at a constant underlying rate` },
  { dist: "exponential", match: /until the first ventilator alarm/,
    tmpl: (r) => `the time from ICU admission until the first ventilator alarm, if alarms occur at a constant rate of ${r.int(2, 9)} per day` },
  { dist: "exponential", match: /until the next ambulance call arrives/,
    tmpl: (r) => `the waiting time until the next ambulance call arrives at a station averaging ${r.int(3, 12)} calls an hour` },
  { dist: "exponential", match: /until the next analyser failure/,
    tmpl: (r) => `the time until the next analyser failure, on a machine that fails at a constant rate of once every ${r.int(20, 90)} days` },
  { dist: "normal", match: /mean of \d+ independently measured serum-sodium/,
    tmpl: (r) => `the mean of ${r.int(120, 400)} independently measured serum-sodium values` },
  { dist: "normal", match: /sample means of \d+ randomly drawn birth weights/,
    tmpl: (r) => `the distribution of sample means of ${r.int(80, 300)} randomly drawn birth weights` },
  { dist: "normal", match: /average waiting time across \d+ randomly sampled/,
    tmpl: (r) => `the average waiting time across ${r.int(100, 500)} randomly sampled clinic attendances` },
];

export const BINOMIAL_FAMILY: QuestionFamily = {
  fid: "gen_binomial",
  title: "Binomial risk and choosing a distribution",
  method: "prob_dist",
  diffMin: "resident",
  variants: ["moments", "at_least_one", "which_dist"],
  gen: (rng) => {
    const variant = rng.pick(["moments", "at_least_one", "which_dist"] as const);

    if (variant === "which_dist") {
      const proc = rng.pick(PROCESSES);
      const desc = proc.tmpl(rng);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
        (Object.keys(DIST_LABEL) as DistName[]).map<Choice>(d => d === proc.dist
          ? { text: DIST_LABEL[d], correct: true }
          : {
              text: DIST_LABEL[d],
              tag: `${proc.dist}_process_read_as_${d}`,
              explain: `A ${DIST_LABEL[d].toLowerCase()} random variable describes ${DIST_DEF[d]}. That is not this process, which is ${DIST_DEF[proc.dist]}.`,
            }),
      );
      return {
        _variant: variant, _params: { desc, dist: proc.dist },
        q: `Which distribution describes this quantity?`,
        scenario: `Consider ${desc}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Two questions settle almost every case: is the quantity a COUNT or a TIME? And if it is a count, is there a fixed number of trials it cannot exceed?",
        explain: `This is ${DIST_LABEL[proc.dist].toLowerCase()}: ${DIST_DEF[proc.dist]}. The give-away is the structure of the question, not the clinical topic — the same ward can generate binomial, Poisson and exponential quantities depending on what you choose to record.`,
      };
    }

    const ctx = rng.pick(RISK_CONTEXTS);

    if (variant === "moments") {
      const n = rng.pick([20, 25, 30, 40, 50, 60, 80, 100, 120, 150] as const);
      const p = rng.int(5, 45) / 100;
      const askMean = rng.next() < 0.5;
      const mean = n * p;
      const variance = n * p * (1 - p);
      const target = askMean ? mean : variance;
      return {
        _variant: variant, _params: { n, p, mean, variance, asked: askMean ? "mean" : "variance" },
        q: askMean
          ? `What is the expected NUMBER of ${ctx.unit} in which the event occurs?`
          : `What is the VARIANCE of the number of ${ctx.unit} in which the event occurs?`,
        scenario: `Across ${n} ${ctx.pop}, each independently has probability ${p.toFixed(2)} that the patient ${ctx.event}.`,
        type: "numeric",
        answer: +target.toFixed(3),
        tol: Math.max(0.02, +(target * 0.01).toFixed(3)),
        hint: askMean
          ? "The expected count of a binomial is the number of trials scaled by the per-trial risk."
          : "Binomial variance is largest when the risk is near a half and shrinks to nothing as it approaches 0 or 1 — the formula has to reflect that.",
        explain: askMean
          ? `E[X] = np = ${n} × ${p.toFixed(2)} = ${mean.toFixed(2)} ${ctx.unit}. Note this need not be a whole number: it is the long-run average over many repetitions of the same ${n}-patient block, not a prediction for any single block.`
          : `Var(X) = np(1 − p) = ${n} × ${p.toFixed(2)} × ${(1 - p).toFixed(2)} = ${variance.toFixed(2)}, so SD = ${Math.sqrt(variance).toFixed(2)} ${ctx.unit}. Using np (${mean.toFixed(2)}) would be the Poisson variance — right only in the limit of small p, where (1 − p) ≈ 1.`,
      };
    }

    // at_least_one — the classic gap between "expected number" and "probability".
    const n = rng.int(3, 14);
    const p = rng.int(2, 25) / 100;
    const pAtLeastOne = (1 - Math.pow(1 - p, n)) * 100;
    if (pAtLeastOne < 8 || pAtLeastOne > 92) degenerate("probability too close to 0 or 1 to be informative");
    return {
      _variant: variant, _params: { n, p, pAtLeastOne },
      q: `What is the probability that AT LEAST ONE of the ${n} ${ctx.unit} has the event? Answer as a percentage.`,
      scenario: `In a block of ${n} ${ctx.pop}, each independently has probability ${p.toFixed(2)} that the patient ${ctx.event}.`,
      type: "numeric",
      answer: +pAtLeastOne.toFixed(2),
      tol: Math.max(0.2, +(pAtLeastOne * 0.02).toFixed(2)),
      hint: "\"At least one\" has many ways to happen and exactly one way not to. Compute the one.",
      explain: `P(at least one) = 1 − P(none) = 1 − (1 − ${p.toFixed(2)})^${n} = 1 − ${Math.pow(1 - p, n).toFixed(4)} ≈ ${pAtLeastOne.toFixed(1)}%. Contrast this with the EXPECTED number, np = ${(n * p).toFixed(2)} — a count, not a probability. When np exceeds 1 the two are routinely confused, and only one of them can ever exceed 100%.`,
    };
  },
};

// ============================================================
// The central limit theorem: SE, shape, and what each spread describes
// ============================================================
type PopCtx = { measure: string; unit: string; mu: [number, number]; sigma: [number, number] };

const POPULATIONS: readonly PopCtx[] = [
  { measure: "serum sodium", unit: "mmol/L", mu: [136, 143], sigma: [3, 6] },
  { measure: "systolic blood pressure", unit: "mmHg", mu: [118, 138], sigma: [12, 20] },
  { measure: "birth weight", unit: "g", mu: [3100, 3600], sigma: [420, 580] },
  { measure: "six-minute walk distance", unit: "m", mu: [300, 460], sigma: [50, 90] },
  { measure: "a tumour-marker concentration", unit: "ng/mL", mu: [20, 80], sigma: [8, 30] },
];

const SKEWED_POPULATIONS = [
  "hospital episode cost, where most admissions are cheap and a handful run to six figures",
  "length of stay, where most patients leave within days and a few stay for months",
  "serum C-reactive protein, where most values are low and a few are enormous",
  "time spent waiting for a specialist appointment, with a long upper tail",
] as const;

const SQUARES = [16, 25, 36, 49, 64, 100, 144, 225, 400] as const;

export const CLT_SE_FAMILY: QuestionFamily = {
  fid: "gen_clt_se",
  title: "Central limit theorem — standard error, shape, and what spread means",
  method: "clt_sampling",
  diffMin: "resident",
  variants: ["se", "shape", "which_spread"],
  gen: (rng) => {
    const variant = rng.pick(["se", "shape", "which_spread"] as const);

    if (variant === "shape") {
      const pop = rng.pick(SKEWED_POPULATIONS);
      const big = rng.next() < 0.5;
      const n = big ? rng.int(200, 600) : rng.int(5, 10);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        big
          ? { text: "Approximately normal, even though individual values are far from normal.", correct: true }
          : { text: "Still clearly right-skewed — n is nowhere near large enough for the CLT to have taken effect.", correct: true },
        big
          ? { text: "Still clearly right-skewed, because the underlying population is skewed.", tag: "clt_effect_denied_at_large_n",
              explain: `This is what the CLT exists to contradict. With n = ${n}, each sample mean averages away ${n} independent draws, and the skew in the ORIGINAL values stops being visible in the distribution of those means. The population stays skewed forever; the sampling distribution does not.` }
          : { text: "Approximately normal — the CLT guarantees it for any sample size.", tag: "clt_treated_as_unconditional",
              explain: `The CLT is an asymptotic result: it says the sampling distribution approaches normality AS n grows, not that it is normal at every n. With n = ${n} drawn from a strongly skewed population, the sampling distribution still carries a visible right tail.` },
        { text: "Exactly normal, because averaging always produces a normal result.", tag: "averaging_assumed_to_produce_exact_normality",
          explain: "Averaging gives exact normality only when the underlying values are themselves exactly normal. Here they are not, so the best available claim is 'approximately normal, for large enough n' — never 'exactly'." },
        { text: "Normal only once n exceeds 30 — below that the CLT never applies at all.", tag: "n30_rule_treated_as_law",
          explain: "n > 30 is a rule of thumb, not a threshold in any theorem. How large n must be depends entirely on how skewed the population is: mild skew may settle by n = 15, severe skew may still misbehave at n = 100." },
      ]);
      return {
        _variant: variant, _params: { n, big: big ? 1 : 0 },
        // Predict first, then watch the same experiment run.
        simulate: { kind: "clt", seed: rng.int(1, 1 << 29), population: "skewed", n, reps: 500 },
        q: `What does the sampling distribution of the MEAN look like?`,
        scenario: `You repeatedly draw samples of n = ${n} from a population of ${pop}, and each time record the sample mean.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "The CLT is a statement about what happens as n grows, applied to the distribution of MEANS — not to the patients themselves.",
        explain: big
          ? `With n = ${n}, the CLT has had ample room to work: the distribution of sample means is close to normal even though no individual value is. The population's skew has not gone anywhere — it simply does not show up in averages of ${n} draws.`
          : `With n = ${n} from a strongly skewed population, the sampling distribution of the mean is still visibly skewed. The CLT promises normality in the limit, and ${n} observations is not the limit. This is exactly when a t-test on the raw scale can mislead and a transformation or a rank-based method earns its place.`,
      };
    }

    const c = rng.pick(POPULATIONS);
    const mu = rng.int(c.mu[0], c.mu[1]);
    const sigma = rng.int(c.sigma[0], c.sigma[1]);
    const n = rng.pick(SQUARES);
    const se = sigma / Math.sqrt(n);

    if (variant === "se") {
      return {
        _variant: variant, _params: { mu, sigma, n, se },
        q: `What is the standard error of the sample mean, in ${c.unit}?`,
        scenario: `${c.measure[0].toUpperCase()}${c.measure.slice(1)} has population mean ${mu} ${c.unit} and SD ${sigma} ${c.unit}. You draw a sample of n = ${n}.`,
        type: "numeric",
        answer: +se.toFixed(3),
        tol: Math.max(0.01, +(se * 0.02).toFixed(3)),
        hint: "The SD describes one patient's distance from the mean. The standard error describes one SAMPLE MEAN's distance from it — and means are steadier by √n.",
        explain: `SE = σ/√n = ${sigma}/√${n} = ${sigma}/${Math.sqrt(n)} ≈ ${se.toFixed(3)} ${c.unit}. Patients scatter by ${sigma}; means of ${n} patients scatter by only ${se.toFixed(2)}. Quadrupling n would halve this again — precision is bought in squares.`,
      };
    }

    // which_spread — the interval that describes patients, not the mean.
    const ind = [mu - 1.96 * sigma, mu + 1.96 * sigma];
    const meanInt = [mu - 1.96 * se, mu + 1.96 * se];
    const oneSd = [mu - sigma, mu + sigma];
    const wide = [mu - 2.58 * sigma, mu + 2.58 * sigma];
    const iv = (a: number[]) => `${a[0].toFixed(1)} to ${a[1].toFixed(1)} ${c.unit}`;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: iv(ind), correct: true },
      { text: iv(meanInt), tag: "se_interval_used_for_individuals",
        explain: `${iv(meanInt)} is μ ± 1.96·SE — the range in which sample MEANS of ${n} patients fall. It is narrower than individual variation by a factor of √${n} = ${Math.sqrt(n)}, and would wrongly suggest almost every patient sits within ${(1.96 * se).toFixed(1)} ${c.unit} of the mean.` },
      { text: iv(oneSd), tag: "one_sd_treated_as_95_percent",
        explain: `μ ± 1 SD covers about 68% of a normal population, not 95%. The 95% multiplier is 1.96 — close enough to 2 for mental arithmetic, but 1 is a different landmark entirely.` },
      { text: iv(wide), tag: "ninety_nine_percent_multiple_used",
        explain: `2.58 is the multiplier for 99% coverage, not 95%. Both are correct intervals for their own coverage; the question fixed the coverage at 95%.` },
    ]);
    return {
      _variant: variant, _params: { mu, sigma, n, se },
      q: `Which interval contains roughly 95% of INDIVIDUAL PATIENTS?`,
      scenario: `${c.measure[0].toUpperCase()}${c.measure.slice(1)} is approximately normal with population mean ${mu} ${c.unit} and SD ${sigma} ${c.unit}. Your sample has n = ${n}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Decide first whose variation you are describing — one patient's, or one sample mean's. Only then pick the σ or the SE.",
      explain: `Individual patients scatter with the SD, so the interval is μ ± 1.96σ = ${iv(ind)}. The SE (${se.toFixed(2)}) belongs to a different question — how precisely the MEAN is known — and gives the much narrower ${iv(meanInt)}. Mixing them up is what produces reference ranges that almost no real patient falls inside.`,
    };
  },
};

// ============================================================
// Sampling designs: naming them, choosing them, and their precision
// ============================================================
export type DesignName = "srs" | "stratified" | "cluster" | "systematic" | "convenience";

export const DESIGN_LABEL: Record<DesignName, string> = {
  srs: "Simple random sampling",
  stratified: "Stratified sampling",
  cluster: "Cluster sampling",
  systematic: "Systematic sampling",
  convenience: "Convenience sampling",
};
const DESIGN_DEF: Record<DesignName, string> = {
  srs: "every individual on a complete list has the same chance of selection, drawn independently",
  stratified: "the population is split into meaningful subgroups first, and a sample is drawn at random within each",
  cluster: "whole naturally occurring groups are drawn at random, and everyone inside a selected group is enrolled",
  systematic: "a random start is chosen and then every k-th individual is taken from an ordered list or arrival stream",
  convenience: "whoever happens to be available is enrolled, with no randomisation anywhere in the process",
};

const procedureText = (d: DesignName, rng: RNG): string => {
  const N = rng.int(6, 24) * 1000;
  const n = rng.int(2, 8) * 100;
  const sites = rng.int(90, 240);
  const drawn = rng.int(8, 20);
  const k = rng.int(10, 40);
  switch (d) {
    case "srs":
      return `A computer draws ${num(n)} record numbers at random from the complete list of ${num(N)} registered patients; every patient is equally likely to be picked.`;
    case "stratified":
      return `The ${num(N)} registered patients are divided by hospital site, and a fixed proportion is then drawn at random from within each site, giving ${num(n)} patients in total.`;
    case "cluster":
      return `${drawn} of the region's ${sites} general practices are selected at random, and every patient on the list of each selected practice is enrolled.`;
    case "systematic":
      return `Starting from a randomly chosen patient among the first ${k}, every ${k}th name is taken from the ordered register of ${num(N)} patients.`;
    case "convenience":
      return `The researcher enrols whoever attends the Tuesday afternoon clinic, continuing until ${num(n)} questionnaires have been completed.`;
  }
};

export const GOALS: readonly { goal: string; design: DesignName; why: string }[] = [
  { goal: "guarantee that the 4% of your patients who are on dialysis end up represented in adequate numbers", design: "stratified",
    why: "splitting the population first and sampling within each subgroup is the only way to control how many of a small subgroup you end up with" },
  { goal: "keep fieldwork costs down by travelling to only a handful of the region's clinics", design: "cluster",
    why: "drawing whole clinics and enrolling everyone inside them concentrates the fieldwork in a few places" },
  { goal: "draw an unbiased sample from a complete, numbered patient list with the least possible machinery", design: "srs",
    why: "with a complete list in hand, an equal-probability random draw needs no extra structure and no assumptions" },
  { goal: "sample from a continuously arriving stream of patients when no complete list exists yet", design: "systematic",
    why: "a random start plus a fixed interval can be applied to arrivals as they happen, without ever needing the full list up front" },
];

export const SAMPLING_DESIGN_FAMILY: QuestionFamily = {
  fid: "gen_sampling_design",
  title: "Sampling designs — naming, choosing, and their effect on precision",
  method: "sampling_methods",
  diffMin: "resident",
  variants: ["name_it", "for_goal", "precision"],
  gen: (rng) => {
    const variant = rng.pick(["name_it", "for_goal", "precision"] as const);
    const ALL = Object.keys(DESIGN_LABEL) as DesignName[];

    if (variant === "name_it") {
      const d = rng.pick(ALL);
      const others = ALL.filter(x => x !== d).slice();
      const decoys: DesignName[] = [];
      while (decoys.length < 3) decoys.push(others.splice(Math.floor(rng.next() * others.length), 1)[0]);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: DESIGN_LABEL[d], correct: true },
        ...decoys.map<Choice>(x => ({
          text: DESIGN_LABEL[x],
          tag: `${d}_procedure_named_as_${x}`,
          explain: `${DESIGN_LABEL[x]} means ${DESIGN_DEF[x]}. That is not what happened here, where ${DESIGN_DEF[d]}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { design: d },
        q: `Which sampling design is this?`,
        scenario: procedureText(d, rng),
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Ask what the randomisation was applied TO: individuals, subgroups, whole groups, a starting position — or nothing at all.",
        explain: `This is ${DESIGN_LABEL[d].toLowerCase()}: ${DESIGN_DEF[d]}. The label matters because it determines the analysis — designs that randomise groups rather than individuals need their clustering accounted for in the standard errors.`,
      };
    }

    if (variant === "for_goal") {
      const g = rng.pick(GOALS);
      const others = ALL.filter(x => x !== g.design).slice();
      const decoys: DesignName[] = [];
      while (decoys.length < 3) decoys.push(others.splice(Math.floor(rng.next() * others.length), 1)[0]);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: DESIGN_LABEL[g.design], correct: true },
        ...decoys.map<Choice>(x => ({
          text: DESIGN_LABEL[x],
          tag: `${g.design}_goal_answered_with_${x}`,
          explain: `${DESIGN_LABEL[x]} means ${DESIGN_DEF[x]} — which does not deliver what was asked for here. What does: ${g.why}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { design: g.design, goal: g.goal },
        q: `Which design should you use?`,
        scenario: `You are planning a survey and need to ${g.goal}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Start from the constraint, not from the list of designs. Each design exists to solve one specific practical problem.",
        explain: `${DESIGN_LABEL[g.design]} is the fit: ${g.why}. Designs are chosen against constraints — a complete list or not, a rare subgroup or not, a travel budget or not — and every one of them costs something in precision or in effort.`,
      };
    }

    // precision — cluster loses precision, stratification gains it.
    const d: DesignName = rng.next() < 0.5 ? "cluster" : "stratified";
    const larger = d === "cluster";
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      larger
        ? { text: "Larger — the effective sample size is smaller than the number of people enrolled", correct: true }
        : { text: "Smaller — variation between the subgroups is removed from the error term", correct: true },
      larger
        ? { text: "Smaller — variation between the subgroups is removed from the error term", tag: "cluster_confused_with_stratified_effect",
            explain: "That is what STRATIFICATION does: it samples within every subgroup and so takes between-subgroup variation out of the error. Cluster sampling does the opposite — it samples only a few groups, so between-group variation lands squarely inside the error." }
        : { text: "Larger — the effective sample size is smaller than the number of people enrolled", tag: "stratified_confused_with_cluster_effect",
            explain: "That is the cluster-sampling penalty: patients within a selected group resemble one another, so each extra one adds less than a full observation of information. Stratified sampling draws from every subgroup and suffers no such penalty." },
      { text: "Identical — the sampling design has no bearing on precision", tag: "design_effect_ignored",
        explain: "Design affects precision directly; this is what the design effect quantifies. Analysing a clustered sample as if it were a simple random one is one of the most common ways published confidence intervals end up too narrow." },
      { text: "Zero — every standard error vanishes once the design is probability-based", tag: "probability_sampling_confused_with_certainty",
        explain: "A probability design removes systematic bias, not sampling variability. Any sample short of the whole population leaves a standard error." },
    ]);
    return {
      _variant: variant, _params: { design: d, larger: larger ? 1 : 0 },
      q: `Compared with a simple random sample of the same size, the standard errors from this design are usually:`,
      scenario: `${procedureText(d, rng)} You now need to report a mean with a confidence interval.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Ask whether the design puts between-group variation into the error term or takes it out.",
      explain: larger
        ? `Cluster sampling pays a design-effect penalty: people within the same practice resemble each other, so 400 patients from 10 practices carry less information than 400 drawn independently. Standard errors are larger, and the analysis must say so.`
        : `Stratification samples within every subgroup, so differences BETWEEN subgroups no longer contribute to sampling error. For the same n it is at least as precise as simple random sampling — usually strictly better when the strata really differ.`,
    };
  },
};
