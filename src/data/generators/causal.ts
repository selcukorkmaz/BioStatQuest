// Item families for the Causal Inference branch.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate } from "./core";

const f2 = (x: number) => x.toFixed(2);

// ============================================================
// Confounding — crude versus adjusted
// ============================================================
type CrudeCtx = { exposure: string; outcome: string; confounder: string; setting: string };

const CRUDE_CONTEXTS: readonly CrudeCtx[] = [
  { exposure: "the newer anticoagulant", outcome: "major bleeding", confounder: "baseline renal function", setting: "a claims-database analysis" },
  { exposure: "early mobilisation", outcome: "30-day readmission", confounder: "admission frailty score", setting: "a multicentre cohort" },
  { exposure: "inhaled corticosteroid use", outcome: "pneumonia", confounder: "COPD severity", setting: "a respiratory registry" },
  { exposure: "statin therapy", outcome: "all-cause mortality", confounder: "baseline cardiovascular risk", setting: "a primary-care cohort" },
  { exposure: "ICU admission", outcome: "in-hospital death", confounder: "illness severity at presentation", setting: "an emergency-care audit" },
  { exposure: "hormone therapy", outcome: "coronary events", confounder: "socioeconomic position", setting: "an observational cohort" },
];

export const CONFOUNDING_FAMILY: QuestionFamily = {
  fid: "gen_confounding",
  title: "Confounding — reading crude against adjusted estimates",
  method: "confounding",
  diffMin: "resident",
  variants: ["percent_change", "detect", "direction"],
  gen: (rng) => {
    const c = rng.pick(CRUDE_CONTEXTS);
    const adjusted = rng.int(55, 260) / 100;
    const material = rng.next() < 0.55;
    // Ratio of crude to adjusted: either clearly past the 10% rule or clearly inside it.
    const ratio = material
      ? (rng.next() < 0.5 ? rng.int(60, 82) : rng.int(122, 185)) / 100
      : rng.int(96, 104) / 100;
    const crude = +(adjusted * ratio).toFixed(2);
    if (crude <= 0.05) degenerate("crude estimate collapsed");
    const change = ((crude - adjusted) / adjusted) * 100;
    if (material && Math.abs(change) < 14) degenerate("material draw landed too near the 10% rule");
    if (!material && Math.abs(change) > 7) degenerate("null draw landed too near the 10% rule");
    const setup = `${c.setting[0].toUpperCase()}${c.setting.slice(1)} of ${c.exposure} and ${c.outcome} reports a crude risk ratio of ${f2(crude)}. After adjustment for ${c.confounder}, the risk ratio is ${f2(adjusted)}.`;
    const variant = rng.pick(["percent_change", "detect", "direction"] as const);

    if (variant === "percent_change") {
      return {
        _variant: variant, _params: { crude, adjusted, change },
        q: `By what percentage does adjustment change the estimate, relative to the adjusted value? Give the size of the change as a positive percentage.`,
        scenario: setup,
        type: "numeric",
        answer: +Math.abs(change).toFixed(2),
        tol: Math.max(0.3, +(Math.abs(change) * 0.02).toFixed(2)),
        hint: "The conventional rule compares the two estimates against the ADJUSTED one, since that is the less biased of the pair.",
        explain: `|${f2(crude)} − ${f2(adjusted)}| / ${f2(adjusted)} × 100 ≈ ${Math.abs(change).toFixed(1)}%. The customary threshold is about 10%: a shift that size or larger is taken as evidence that ${c.confounder} was confounding the crude comparison. The rule is a convention, not a test — it has no p-value behind it.`,
      };
    }

    if (variant === "detect") {
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        material
          ? { text: `Yes — the estimate moves by about ${Math.abs(change).toFixed(0)}%, well past the conventional 10% rule.`, correct: true }
          : { text: `No — the estimate barely moves (about ${Math.abs(change).toFixed(0)}%), so ${c.confounder} was not confounding this comparison materially.`, correct: true },
        material
          ? { text: `No — the estimate barely moves, so ${c.confounder} was not confounding this comparison.`,
              tag: "material_confounding_dismissed",
              explain: `The estimate moves from ${f2(crude)} to ${f2(adjusted)}, a change of about ${Math.abs(change).toFixed(0)}% — several times the usual 10% threshold. A shift that size means the crude comparison was mixing the effect of ${c.exposure} with that of ${c.confounder}.` }
          : { text: `Yes — any change at all in the estimate demonstrates confounding.`,
              tag: "any_change_read_as_confounding",
              explain: `Estimates move a little whenever a covariate is added, through sampling noise and model form alone. The change here is about ${Math.abs(change).toFixed(0)}%, comfortably inside the conventional 10% band, so there is no evidence that ${c.confounder} was distorting the comparison.` },
        { text: `It cannot be judged without the p-value for ${c.confounder} in the adjusted model.`,
          tag: "confounding_assessed_by_significance",
          explain: `Confounding is about how much the EFFECT ESTIMATE moves, not about whether the covariate is itself significant. A strongly significant covariate can leave the estimate untouched, and a non-significant one can shift it substantially — which is why "significant predictors only" is a poor way to build an adjustment set.` },
        { text: `It cannot be judged, because adjusted estimates are always closer to the truth by construction.`,
          tag: "adjustment_assumed_to_guarantee_truth",
          explain: `Adjustment removes the bias from the variables you measured and modelled correctly, and nothing else. It can leave residual confounding, and adjusting for the wrong variable — a mediator or a collider — makes matters worse, not better.` },
      ]);
      return {
        _variant: variant, _params: { crude, adjusted, change, material: material ? 1 : 0 },
        q: `Was ${c.confounder} confounding the crude comparison?`,
        scenario: setup,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Compare the two estimates on a relative scale, then hold the result against the usual rule of thumb.",
        explain: `The estimate moves by about ${Math.abs(change).toFixed(0)}% on adjustment, which is ${material ? "well past" : "well inside"} the conventional 10% rule — so ${material ? "the crude figure was materially confounded" : "there is no material confounding by this variable"}. Note what the rule does NOT require: statistical significance of the covariate itself.`,
      };
    }

    // direction — did the confounder inflate or mask the association?
    const crudeFurther = Math.abs(crude - 1) > Math.abs(adjusted - 1);
    if (Math.abs(Math.abs(crude - 1) - Math.abs(adjusted - 1)) < 0.05) degenerate("distances from the null too close to call");
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      crudeFurther
        ? { text: `It exaggerated the association — the crude estimate sits further from 1 than the adjusted one.`, correct: true }
        : { text: `It masked the association — the crude estimate sits closer to 1 than the adjusted one.`, correct: true },
      crudeFurther
        ? { text: `It masked the association — the crude estimate sits closer to 1 than the adjusted one.`,
            tag: "confounding_direction_reversed",
            explain: `Compare the distances from the null: crude ${f2(crude)} is ${Math.abs(crude - 1).toFixed(2)} away from 1, adjusted ${f2(adjusted)} is ${Math.abs(adjusted - 1).toFixed(2)}. The crude estimate is the further of the two, so confounding was inflating the apparent effect, not hiding it.` }
        : { text: `It exaggerated the association — the crude estimate sits further from 1 than the adjusted one.`,
            tag: "confounding_direction_reversed",
            explain: `Compare the distances from the null: crude ${f2(crude)} is ${Math.abs(crude - 1).toFixed(2)} away from 1, adjusted ${f2(adjusted)} is ${Math.abs(adjusted - 1).toFixed(2)}. The crude estimate is the CLOSER of the two, so confounding was pulling the association toward the null and hiding part of it.` },
      { text: `Confounding always biases estimates away from the null, so it must have exaggerated it.`,
        tag: "confounding_assumed_to_always_exaggerate",
        explain: `There is no such law. Negative confounding — where the common cause pulls the estimate toward 1, or even past it — is entirely possible, and is why an apparently null crude result can hide a real effect.` },
      { text: `The direction cannot be determined without knowing which way ${c.confounder} is associated with each variable.`,
        tag: "direction_thought_unknowable_from_the_estimates",
        explain: `That information tells you which way to EXPECT the bias before you look. But once you have both the crude and the adjusted estimate, the direction is simply read off: whichever sits further from the null shows where confounding was pushing you.` },
    ]);
    return {
      _variant: variant, _params: { crude, adjusted, crudeFurther: crudeFurther ? 1 : 0 },
      q: `Which way was ${c.confounder} biasing the crude estimate?`,
      scenario: setup,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Measure each estimate's distance from the null value of 1. Whichever is further away shows where the bias was pushing.",
      explain: `Crude ${f2(crude)} lies ${Math.abs(crude - 1).toFixed(2)} from the null; adjusted ${f2(adjusted)} lies ${Math.abs(adjusted - 1).toFixed(2)}. So confounding by ${c.confounder} was ${crudeFurther ? "inflating the apparent association" : "pulling the association toward the null and masking part of it"}.`,
    };
  },
};

// ============================================================
// Confounder, mediator, collider — and what adjustment does to each
// ============================================================
export type CausalRole = "confounder" | "mediator" | "collider" | "instrument";

const ROLE_LABEL: Record<CausalRole, string> = {
  confounder: "A confounder", mediator: "A mediator",
  collider: "A collider", instrument: "An instrumental variable",
};
const ROLE_DEF: Record<CausalRole, string> = {
  confounder: "a common CAUSE of both the exposure and the outcome",
  mediator: "a variable that lies ON the causal pathway, caused by the exposure and in turn causing the outcome",
  collider: "a common EFFECT of the exposure and the outcome, caused by both",
  instrument: "a variable that affects the exposure and reaches the outcome only through it",
};
const ROLE_ADJUST: Record<CausalRole, { verdict: string; why: string }> = {
  confounder: { verdict: "Yes — adjusting removes the bias it creates.",
    why: "blocking a back-door path from exposure to outcome is exactly what adjustment is for" },
  mediator: { verdict: "No, not if you want the TOTAL effect — adjusting removes the part of the effect that travels through it.",
    why: "conditioning on a step in the pathway holds constant the very mechanism you were trying to measure" },
  collider: { verdict: "No — adjusting for it CREATES an association that was not there.",
    why: "conditioning on a common effect makes its two causes informative about each other, manufacturing a spurious link" },
  instrument: { verdict: "No — adjusting for it throws away the variation that identifies the effect.",
    why: "its usefulness comes precisely from the fact that it moves the exposure without touching the outcome directly" },
};

type RoleEntry = { role: CausalRole; tmpl: (r: RNG) => string; match: RegExp };

const OLD_DRUGS = ["the older sulfonylurea", "the first-generation antipsychotic", "warfarin", "the conventional NSAID", "the older antiepileptic"] as const;
const HARD_OUTCOMES = ["death", "a major cardiovascular event", "an emergency admission", "a fracture", "renal failure"] as const;
const SOFT_EXPOSURES = ["the rehabilitation programme", "the nurse-led clinic", "the intensive diet programme", "the digital self-management app"] as const;

const ROLE_ENTRIES_BASE: readonly RoleEntry[] = [
  { role: "confounder", match: /both raises the chance of being prescribed/,
    tmpl: (r) => `Age, which both raises the chance of being prescribed ${r.pick(OLD_DRUGS)} and independently raises the risk of ${r.pick(HARD_OUTCOMES)}.` },
  { role: "confounder", match: /drives both the decision to admit/,
    tmpl: (r) => `Illness severity at presentation, which drives both the decision to admit to ${r.pick(["intensive care", "a high-dependency bed", "the coronary care unit"] as const)} and the risk of ${r.pick(HARD_OUTCOMES)}.` },
  { role: "confounder", match: /influences both whether .+ is started and whether/,
    tmpl: (r) => `Baseline ${r.pick(["cardiovascular risk", "bleeding risk", "frailty"] as const)}, which influences both whether ${r.pick(["a statin", "an anticoagulant", "preventive therapy"] as const)} is started and whether ${r.pick(HARD_OUTCOMES)} occurs.` },
  { role: "mediator", match: /the drug lowers LDL cholesterol/,
    tmpl: (r) => `LDL cholesterol: the drug lowers LDL cholesterol, and that reduction is what lowers the rate of ${r.pick(["myocardial infarction", "ischaemic stroke", "coronary revascularisation"] as const)} over ${r.int(2, 8)} years.` },
  { role: "mediator", match: /produces weight loss, and that weight loss/,
    tmpl: (r) => `Weight loss: ${r.pick(SOFT_EXPOSURES)} produces weight loss, and that weight loss is what improves ${r.pick(["HbA1c", "blood pressure", "exercise tolerance"] as const)}.` },
  { role: "mediator", match: /lowers blood pressure, and the lower pressure/,
    tmpl: (r) => `Blood pressure: the ${r.pick(["ACE inhibitor", "calcium-channel blocker", "thiazide"] as const)} lowers blood pressure, and the lower pressure is what prevents ${r.pick(["strokes", "heart failure admissions", "renal decline"] as const)}.` },
  { role: "collider", match: /each independently make admission more likely/,
    tmpl: (r) => `Hospital admission: ${r.pick(["the exposure", "the drug", "the risk factor"] as const)} and ${r.pick(HARD_OUTCOMES)} each independently make admission more likely, and the study enrolled only the ${r.int(3, 20) * 100} inpatients.` },
  { role: "collider", match: /entry into the registry requires either/,
    tmpl: (r) => `Registry membership: entry into the registry requires either the exposure or ${r.pick(["the disease", "a confirmed diagnosis", "a positive test"] as const)} to be present, and all ${r.int(2, 18) * 500} analysed patients are registry members.` },
  { role: "collider", match: /caused both by maternal smoking/,
    tmpl: (r) => `Birth weight: low birth weight is caused both by maternal smoking and by ${r.pick(["congenital malformation", "an underlying genetic syndrome", "placental insufficiency"] as const)}, and the analysis is restricted to the ${r.int(4, 30) * 100} low-birth-weight infants.` },
];

export const ROLE_ENTRIES = ROLE_ENTRIES_BASE;

const ALL_ROLES = Object.keys(ROLE_LABEL) as CausalRole[];

export const CAUSAL_ROLE_FAMILY: QuestionFamily = {
  fid: "gen_causal_role",
  title: "Confounder, mediator or collider — and whether to adjust",
  method: "causal_assumptions",
  diffMin: "fellow",
  variants: ["classify", "adjust", "consequence"],
  gen: (rng) => {
    const e = rng.pick(ROLE_ENTRIES);
    const variant = rng.pick(["classify", "adjust", "consequence"] as const);
    const framing = rng.pick([
      "You are estimating the effect of an exposure on an outcome and are deciding what to put in the model.",
      "A reviewer asks why a particular variable is, or is not, in your adjustment set.",
      "You are drawing the causal diagram for an observational analysis before fitting anything.",
      "A collaborator proposes adding one more covariate to the model.",
    ] as const);
    const scenario = `${framing} Consider this third variable: ${e.tmpl(rng)}`;

    if (variant === "classify") {
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
        ALL_ROLES.map<Choice>((r) => r === e.role
          ? { text: ROLE_LABEL[r], correct: true }
          : {
              text: ROLE_LABEL[r],
              tag: `${e.role}_classified_as_${r}`,
              explain: `${ROLE_LABEL[r]} is ${ROLE_DEF[r]}. That is not the structure described here, where the variable is ${ROLE_DEF[e.role]}.`,
            }),
      );
      return {
        _variant: variant, _params: { role: e.role },
        q: `What role does this variable play?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Draw the two arrows. Does the variable point INTO both the exposure and the outcome, sit BETWEEN them, or receive arrows FROM both?",
        explain: `It is ${ROLE_LABEL[e.role].toLowerCase()} — ${ROLE_DEF[e.role]}. The three roles can look identical in a correlation matrix and demand opposite handling, which is why the causal diagram has to be drawn before the model is fitted.`,
      };
    }

    if (variant === "adjust") {
      const correct = ROLE_ADJUST[e.role];
      const others = ALL_ROLES.filter((r) => r !== e.role && ROLE_ADJUST[r].verdict !== correct.verdict);
      const decoys: CausalRole[] = [];
      const pool = others.slice();
      while (decoys.length < 3 && pool.length) decoys.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: correct.verdict, correct: true },
        ...decoys.map<Choice>((r) => ({
          text: ROLE_ADJUST[r].verdict,
          tag: `${e.role}_handled_as_${r}`,
          explain: `That is the right call for ${ROLE_LABEL[r].toLowerCase()}, because ${ROLE_ADJUST[r].why}. This variable is ${ROLE_LABEL[e.role].toLowerCase()} instead: ${ROLE_DEF[e.role]}, so ${correct.why}.`,
        })),
      ]);
      return {
        _variant: variant, _params: { role: e.role },
        q: `Should this variable go into the adjustment set?`,
        scenario,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "\"Adjust for everything you measured\" is the instinct that this question exists to break. Two of the three roles get worse when you condition on them.",
        explain: `${correct.verdict} Here, ${correct.why}. The asymmetry is the point: the same regression command removes bias, removes signal, or manufactures bias depending on a structure that no amount of staring at the data will reveal.`,
      };
    }

    // consequence — what adjusting for it actually does
    const CONSEQ: Record<CausalRole, string> = {
      confounder: "The estimate moves closer to the causal effect, because a back-door path is blocked.",
      mediator: "The estimate shrinks toward zero, because the part of the effect travelling through this variable is held constant.",
      collider: "A spurious association appears between exposure and outcome where there was none.",
      instrument: "Precision falls and the estimate stays biased, because the variation used to identify the effect has been removed.",
    };
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng,
      ALL_ROLES.map<Choice>((r) => r === e.role
        ? { text: CONSEQ[r], correct: true }
        : {
            text: CONSEQ[r],
            tag: `${e.role}_adjustment_consequence_read_as_${r}`,
            explain: `That is what happens when you adjust for ${ROLE_LABEL[r].toLowerCase()} — ${ROLE_DEF[r]}. Here the variable is ${ROLE_DEF[e.role]}, so ${ROLE_ADJUST[e.role].why}.`,
          }),
    );
    return {
      _variant: variant, _params: { role: e.role },
      q: `What happens to your estimate if you DO adjust for this variable?`,
      scenario,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Adjustment is not a neutral act. Work out what the variable's arrows do before deciding whether conditioning helps.",
      explain: `${CONSEQ[e.role]} Because ${ROLE_ADJUST[e.role].why}. Collider bias is the most counter-intuitive of the three: it produces an association out of nothing, and it grows with the sample size rather than shrinking.`,
    };
  },
};
