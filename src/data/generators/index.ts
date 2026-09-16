// Public surface of the item-generator layer. App.tsx imports only from here.
export * from "./core";

import type { QuestionFamily } from "./core";
import { instantiate } from "./core";
import { PPV_FAMILY } from "./diagnostic";
import { CI_FAMILY } from "./estimation";
import {
  VARIABLE_TYPE_FAMILY, CENTER_OUTLIER_FAMILY, DESCRIPTIVE_OUTPUT_FAMILY,
  CV_FAMILY, ZSCORE_FAMILY,
} from "./foundations";
import {
  BINOMIAL_FAMILY, CLT_SE_FAMILY, SAMPLING_DESIGN_FAMILY,
} from "./probability";
import {
  LM_INTERPRET_FAMILY, LOGISTIC_OR_FAMILY, SURVIVAL_HR_FAMILY, MODEL_SELECTION_FAMILY,
} from "./regression";
import { STUDY_DESIGN_FAMILY, BIAS_FAMILY } from "./design";
import { CONFOUNDING_FAMILY, CAUSAL_ROLE_FAMILY } from "./causal";
import { MISSING_MECHANISM_FAMILY, VALIDITY_FAMILY, KAPPA_FAMILY } from "./measurement";
import type { GeneratedQuestion } from "./core";

export const FAMILIES: readonly QuestionFamily[] = [
  // Foundations
  VARIABLE_TYPE_FAMILY,
  CENTER_OUTLIER_FAMILY,
  DESCRIPTIVE_OUTPUT_FAMILY,
  CV_FAMILY,
  ZSCORE_FAMILY,
  // Probability & sampling
  BINOMIAL_FAMILY,
  CLT_SE_FAMILY,
  SAMPLING_DESIGN_FAMILY,
  // Regression
  LM_INTERPRET_FAMILY,
  LOGISTIC_OR_FAMILY,
  SURVIVAL_HR_FAMILY,
  MODEL_SELECTION_FAMILY,
  // Study design & bias
  STUDY_DESIGN_FAMILY,
  BIAS_FAMILY,
  // Causal inference
  CONFOUNDING_FAMILY,
  CAUSAL_ROLE_FAMILY,
  // Missing data & measurement
  MISSING_MECHANISM_FAMILY,
  VALIDITY_FAMILY,
  KAPPA_FAMILY,
  // Estimation & diagnostic accuracy
  CI_FAMILY,
  PPV_FAMILY,
];

export const FAMILY_BY_ID: ReadonlyMap<string, QuestionFamily> = new Map(
  FAMILIES.map((f) => [f.fid, f]),
);

export const isFamilyQid = (qid: string | undefined | null): boolean =>
  !!qid && FAMILY_BY_ID.has(qid);

/** Families whose method appears among `methods` — how a case claims them. */
export function familiesForMethods(methods: Iterable<string>): QuestionFamily[] {
  const set = new Set(methods);
  return FAMILIES.filter((f) => set.has(f.method));
}

const randomSeed = () => (Math.floor(Math.random() * 0xffffffff) >>> 0);

/** Fresh instance of one family. Seed defaults to random — that is the point. */
export function drawFamilyQuestion(fid: string, seed = randomSeed()): GeneratedQuestion | null {
  const fam = FAMILY_BY_ID.get(fid);
  return fam ? instantiate(fam, seed) : null;
}

/** Fresh instances of every family eligible for a case's methods. */
export function drawForMethods(methods: Iterable<string>, seed = randomSeed()): GeneratedQuestion[] {
  return familiesForMethods(methods).map((f, i) => instantiate(f, (seed + i * 7919) >>> 0));
}
