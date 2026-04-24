// Method deep-dive library. Question.method fields reference a key here.
export type Method = {
  title: string;
  intuition: string;
  formula: string;
  assumptions: string[];
  pitfalls: string[];
  reading: string[];
};

const METHODS: Record<string, Method> = {
  cox_ph: {
    title: "Cox Proportional Hazards Regression",
    intuition: "Models the hazard (instantaneous event rate) as a baseline hazard multiplied by exp(Xβ). The baseline is left unspecified — we only estimate how covariates shift risk relative to it. exp(β) is a hazard ratio: >1 means faster event, <1 means protective.",
    formula: "h(t | X) = h₀(t) · exp(β₁x₁ + β₂x₂ + … + βₚxₚ)",
    assumptions: [
      "Proportional hazards: covariate effects constant over time. Test with Schoenfeld residuals (cox.zph).",
      "Independent censoring: being censored at t gives no information about future risk.",
      "Linearity of continuous covariates on log-hazard scale (check with splines / Martingale residuals).",
      "Non-informative, correct event/time coding (no immortal-time, no left truncation ignored)."
    ],
    pitfalls: [
      "Time-varying effects (e.g. early-vs-late) violate PH → stratify, add time interactions, or use time-varying coefficients.",
      "Competing risks inflate cause-specific HRs — use Fine-Gray subdistribution model if the quantity of interest is cumulative incidence.",
      "HR is not a risk ratio; it averages over follow-up. Report absolute risks alongside."
    ],
    reading: [
      "Therneau & Grambsch (2000), Modeling Survival Data: Extending the Cox Model",
      "R: survival::coxph + cox.zph; ggsurvfit and survminer for visualisation",
      "Hernán, 'The hazards of hazard ratios' (Epidemiology 2010)"
    ]
  },
  km_logrank: {
    title: "Kaplan–Meier & Log-rank Test",
    intuition: "KM is a nonparametric estimator of S(t) = P(T > t): multiply through conditional survival probabilities at each event time, treating censored subjects as 'left at risk' until censoring. Log-rank compares two or more KM curves by accumulating observed-minus-expected events across risk sets — sensitive to proportional differences.",
    formula: "Ŝ(t) = ∏_{tᵢ ≤ t} (1 − dᵢ/nᵢ)",
    assumptions: [
      "Censoring independent of future event risk (same as Cox).",
      "Log-rank has greatest power when hazards are proportional between groups.",
      "Complete information on event times and censoring times; no informative left truncation."
    ],
    pitfalls: [
      "Crossing curves violate PH — log-rank loses power. Consider restricted mean survival time (RMST) or weighted log-rank.",
      "Median survival is undefined if Ŝ never reaches 0.5 — report with a CI or landmark at a fixed horizon.",
      "Number at risk below each time point is essential reporting — don't publish a curve without it."
    ],
    reading: [
      "Kaplan & Meier (1958); Klein & Moeschberger textbook",
      "R: survival::survfit + survdiff; survminer::ggsurvplot",
      "Royston & Parmar (2013), 'Restricted mean survival time' — BMC MRM"
    ]
  },
  kappa: {
    title: "Cohen's Kappa (Inter-rater Agreement)",
    intuition: "Kappa corrects raw agreement for the portion expected by chance alone. κ = 0 means no better than chance; κ = 1 means perfect agreement. For ordered categories use weighted κ (linear or quadratic weights).",
    formula: "κ = (Pₒ − Pₑ) / (1 − Pₑ), where Pₒ = observed agreement and Pₑ = chance-expected agreement",
    assumptions: [
      "Raters are independent and classify the same units into mutually-exclusive categories.",
      "Marginal distributions of the raters are used to compute chance agreement.",
      "For κ-weighted: a principled weight matrix reflecting how much partial agreement matters."
    ],
    pitfalls: [
      "Kappa paradox: with very skewed prevalence, raw agreement can be high yet κ is low — report both.",
      "Bias index and prevalence index (Byrt et al., 1993) help interpret low κ despite high agreement.",
      "κ is scale-dependent — don't compare κ values across studies with different base rates."
    ],
    reading: [
      "Cohen (1960); Landis & Koch (1977) benchmarks (<0.20 poor → >0.80 almost perfect)",
      "Byrt, Bishop & Carlin (1993), 'Bias, prevalence and kappa'",
      "R: psych::cohen.kappa, irr::kappa2 (weighted) — returns CI via bootstrap"
    ]
  },
  iptw: {
    title: "Inverse Probability of Treatment Weighting (IPTW)",
    intuition: "Estimate each subject's propensity score e(X) = P(A=1 | X). Weight treated by 1/e and controls by 1/(1-e) to create a pseudo-population where treatment is independent of measured confounders. Outcome model on the weighted data then targets the average treatment effect (ATE).",
    formula: "wᵢ = Aᵢ/e(Xᵢ) + (1 − Aᵢ)/(1 − e(Xᵢ));   ATE = E_w[Y | A=1] − E_w[Y | A=0]",
    assumptions: [
      "No unmeasured confounders (conditional exchangeability).",
      "Positivity: every covariate pattern has non-trivial probability of both exposure levels.",
      "Correct specification of the propensity score model.",
      "SUTVA: one subject's treatment doesn't affect another's outcome."
    ],
    pitfalls: [
      "Extreme weights drive variance — trim (1st/99th percentile) or use stabilised weights (w* = P(A)/e(X) for treated).",
      "Positivity violation signals structural non-overlap; consider redefining target population.",
      "Report balance (standardised mean differences <0.1) after weighting — SMDs, not p-values."
    ],
    reading: [
      "Hernán & Robins, 'Causal Inference: What If' (online, free)",
      "Austin (2011), 'An Introduction to Propensity Score Methods'",
      "R: WeightIt, survey::svyglm for weighted outcome fits with robust SE"
    ]
  },
  mice: {
    title: "Multiple Imputation by Chained Equations (MICE)",
    intuition: "Fill in each incomplete variable by regressing it on all others, iteratively — one imputed dataset per cycle, repeat m times. Analyse each of the m datasets separately, then pool using Rubin's rules: pooled mean, variance = within + (1 + 1/m)·between.",
    formula: "T = W + (1 + 1/m)·B;  where W = mean(within-imputation var), B = between-imputation var",
    assumptions: [
      "Missing at random (MAR): given observed data, missingness doesn't depend on unobserved values.",
      "Imputation model correctly specified (include outcome + auxiliary variables).",
      "Congeniality: imputation model compatible with the analysis model."
    ],
    pitfalls: [
      "Too few imputations (m=5) are fine for small FMI, but FMI > 0.3 needs m ≥ 30–50 for stable SE.",
      "Excluding the outcome from the imputation biases regression coefficients toward the null.",
      "Derived variables (interactions, ratios): use 'passive imputation' or 'just-another-variable'.",
      "Chain convergence: inspect trace plots of means/SDs across iterations."
    ],
    reading: [
      "van Buuren (2018), 'Flexible Imputation of Missing Data' (online, free)",
      "R: mice + miceadds; micemd / jomo for multilevel structures",
      "White, Royston & Wood (2011), 'Multiple imputation using chained equations'"
    ]
  },
  e_value: {
    title: "E-value for Unmeasured Confounding",
    intuition: "Quantifies how strong an unmeasured confounder would need to be — on both the exposure and outcome — to fully explain away an observed association. Larger E-value = more robust finding. Reported on the risk-ratio scale; HRs and ORs are approximated.",
    formula: "E-value = RR + √[RR · (RR − 1)]   (for RR ≥ 1; invert 1/RR otherwise)",
    assumptions: [
      "Unmeasured confounder on the same scale as observed RR.",
      "For HRs: approximate HR → RR via the outcome prevalence (Hernán-style square-root for common outcomes).",
      "No collider bias, no selection bias, no measurement error — these require separate sensitivity tools."
    ],
    pitfalls: [
      "E-value is a lower bound; a confounder below this threshold cannot explain away the effect.",
      "Not informative for near-null estimates — E-value approaches 1 regardless of sample size.",
      "Context matters: judging 'plausibility' of the required confounder is domain knowledge, not statistics."
    ],
    reading: [
      "VanderWeele & Ding (2017), Annals of Internal Medicine",
      "https://evalue.hmdc.harvard.edu — interactive calculator",
      "R: EValue package"
    ]
  },
  t_test: {
    title: "Student's t-test (One-sample, Two-sample, Paired)",
    intuition: "Compares means under the assumption that the standardised difference follows a t-distribution. One-sample: mean vs constant. Two-sample: difference between groups. Paired: mean of within-subject differences.",
    formula: "t = (x̄₁ − x̄₂) / SE(x̄₁ − x̄₂);   df ≈ n₁ + n₂ − 2 (Welch adjusts df for unequal variances)",
    assumptions: [
      "Observations independent (except paired design, where pairs are independent).",
      "Outcome approximately normal or n large enough for CLT to apply.",
      "Welch's version relaxes equal-variance assumption — use it by default (R's t.test default)."
    ],
    pitfalls: [
      "Severe skew + small n → use Mann–Whitney (ordinal) or bootstrap the mean difference.",
      "Reporting only p-values hides effect size — always report mean difference + CI + Cohen's d.",
      "Applying two-sample t to paired data inflates SE and costs power."
    ],
    reading: [
      "Student (1908); Welch (1947)",
      "R: t.test(x, y, paired=, var.equal=FALSE); effectsize::cohens_d",
      "Wasserstein & Lazar (2016), 'The ASA statement on p-values'"
    ]
  },
  chi_square: {
    title: "Chi-square Test (Independence / Goodness-of-fit)",
    intuition: "Compares observed to expected cell counts in contingency tables. Under independence, χ² follows a chi-square distribution with (r−1)(c−1) df. Measures departure from the null of no association.",
    formula: "χ² = Σ (Oᵢ − Eᵢ)² / Eᵢ",
    assumptions: [
      "Independent observations.",
      "Expected count ≥ 5 in ≥ 80% of cells (otherwise use Fisher's exact).",
      "Categorical data — not for continuous or ordered data without collapsing."
    ],
    pitfalls: [
      "Large n makes even tiny associations significant — report effect size (Cramér's V, odds ratio).",
      "Small sparse tables: switch to Fisher's exact or mid-p variants.",
      "Matched/paired categorical data needs McNemar's test, not chi-square."
    ],
    reading: [
      "Pearson (1900); Agresti, 'Categorical Data Analysis'",
      "R: chisq.test, fisher.test, mcnemar.test",
      "Cramér's V via rcompanion::cramerV"
    ]
  },
  anova: {
    title: "One-way / Factorial ANOVA",
    intuition: "Decomposes variance into between-group and within-group components. F = MS_between / MS_within tests whether any group mean differs. Post-hoc (Tukey HSD, Dunnett) identifies which ones.",
    formula: "F = (SS_between / dfB) / (SS_within / dfW)",
    assumptions: [
      "Independent observations across and within groups.",
      "Normally distributed residuals (check Q–Q, Shapiro on residuals — not on raw Y).",
      "Homogeneity of variances (Levene's test; use Welch ANOVA or robust methods if violated)."
    ],
    pitfalls: [
      "Omnibus F significant says 'something differs' — always follow with corrected pairwise tests.",
      "Unbalanced designs: use Type III SS via car::Anova with contrasts set correctly.",
      "Repeated measures needs a mixed model (or aov with Error term)."
    ],
    reading: [
      "Fisher (1925); Maxwell & Delaney 'Designing Experiments and Analyzing Data'",
      "R: aov, lm + anova; emmeans for post-hoc; afex for factorial designs",
      "Welch/Brown-Forsythe alternatives under heteroscedasticity"
    ]
  },
  lm: {
    title: "Linear Regression (OLS)",
    intuition: "Models E[Y | X] = β₀ + β₁x₁ + … + βₚxₚ. Coefficients are the expected change in Y per unit change in that predictor, holding the others fixed. Fit by minimising squared residuals.",
    formula: "Y = Xβ + ε, ε ~ N(0, σ²I);   β̂ = (XᵀX)⁻¹XᵀY",
    assumptions: [
      "Linearity of E[Y|X] in the predictors (check residual-vs-fitted plot).",
      "Independent errors (residual autocorrelation, cluster structure → mixed model).",
      "Homoscedasticity — equal residual variance across fitted values.",
      "Normally distributed residuals matter for small-sample inference; OLS is robust asymptotically."
    ],
    pitfalls: [
      "Influential points (high Cook's D, DFFITS) — inspect and run sensitivity.",
      "Multicollinearity (VIF > 5) — coefficients unstable; consider regularisation or drop redundant predictors.",
      "Extrapolating beyond the observed X range is unsafe."
    ],
    reading: [
      "Weisberg, 'Applied Linear Regression'",
      "R: lm; performance::check_model for diagnostics; broom::tidy for output",
      "Harrell, 'Regression Modeling Strategies' (Springer)"
    ]
  },
  logistic: {
    title: "Logistic Regression",
    intuition: "Models the log-odds of a binary outcome as a linear function of predictors. exp(β) is an odds ratio per unit change. Fit by maximum likelihood; no closed form.",
    formula: "logit(P(Y=1|X)) = log(p/(1−p)) = Xβ",
    assumptions: [
      "Independent observations.",
      "Linearity on the logit scale for continuous predictors (check with splines / Box–Tidwell).",
      "No extreme multicollinearity or separation."
    ],
    pitfalls: [
      "OR ≠ RR except for rare outcomes; report risk differences for clinical communication.",
      "Complete/quasi-complete separation → infinite SEs. Use Firth's penalised likelihood (logistf).",
      "Events per variable rule of thumb: ≥ 10–20 events per covariate for stable estimates.",
      "Calibration should be checked, not just discrimination."
    ],
    reading: [
      "Hosmer, Lemeshow & Sturdivant, 'Applied Logistic Regression'",
      "R: glm(family=binomial); rms::lrm; pROC for ROC/AUC",
      "Riley et al. (2020), sample size for binary outcome prediction"
    ]
  },
  ci: {
    title: "Confidence Intervals & Standard Errors",
    intuition: "A 95% CI is an interval that, under repeated sampling from the same population, would cover the true parameter 95% of the time. Width is driven by SE, which depends on variability and sample size.",
    formula: "CI = estimate ± z_(α/2) · SE   (Wald); bootstrap and profile-likelihood CIs relax normality",
    assumptions: [
      "Estimator approximately normal (CLT) or small-sample distribution known (t for means).",
      "Correct SE formula accounting for design (robust SE for clusters, weighted SE for survey)."
    ],
    pitfalls: [
      "A 95% CI is NOT 'the probability the parameter lies in this interval' (that's Bayesian credible).",
      "Narrow CI near a null value doesn't imply 'no effect' — report effect magnitude and clinical margin.",
      "Back-transforming CIs on the log scale: compute CI on the log scale, then exponentiate endpoints."
    ],
    reading: [
      "Altman et al., 'Statistics with Confidence' (BMJ Books)",
      "R: confint, confint.default; boot package for BCa intervals",
      "Greenland et al. (2016), 'Statistical tests, P values, confidence intervals'"
    ]
  },
  bootstrap: {
    title: "Bootstrap Resampling",
    intuition: "Resample with replacement B times from the observed data; recompute the estimator on each resample to approximate its sampling distribution. Gives SEs, CIs, and bias estimates without distributional assumptions.",
    formula: "SE_boot = sd(θ̂*_1, …, θ̂*_B);  BCa CI corrects for bias and skewness",
    assumptions: [
      "Observations exchangeable or i.i.d. (or cluster-bootstrap if clustered).",
      "Estimator smooth enough (heavy tails, quantiles at boundaries need care).",
      "B large enough — 1,000 for SEs, 10,000+ for tail quantiles."
    ],
    pitfalls: [
      "Percentile CI biased if distribution is skewed — use BCa.",
      "Bootstrapping hypothesis tests needs resampling under the null, not under the observed.",
      "Highly influential points can destabilise bootstrap estimates."
    ],
    reading: [
      "Efron & Tibshirani, 'An Introduction to the Bootstrap'",
      "R: boot::boot, boot::boot.ci(type='bca'); rsample for tidy workflows",
      "Davison & Hinkley, 'Bootstrap Methods and their Application'"
    ]
  },
  power: {
    title: "Power & Sample Size",
    intuition: "Power = P(reject H₀ | H₁ true). Depends on effect size, α, variance, and n. A priori calculation fixes three, solves for the fourth (usually n).",
    formula: "For two-sample t: n/group ≈ 2·(z_{α/2} + z_β)² · σ² / Δ²",
    assumptions: [
      "Chosen effect size is clinically meaningful, not just an expected effect.",
      "Variance estimate is realistic (pilot data or published comparables).",
      "Distributional assumptions match the planned analysis (t, chi², survival, etc.)."
    ],
    pitfalls: [
      "Post-hoc power is uninformative — it's a deterministic function of the observed p-value.",
      "Underestimating dropout/non-adherence leads to underpowered trials.",
      "Multiple endpoints or interim analyses require alpha-spending or gatekeeping."
    ],
    reading: [
      "Cohen (1988); Chow, Shao & Wang, 'Sample Size Calculations in Clinical Research'",
      "R: pwr, WebPower, longpower; PASS or G*Power for GUI",
      "Schulz & Grimes (2005), 'Sample size calculations in randomised trials'"
    ]
  },
  multiple_testing: {
    title: "Multiple Testing Correction",
    intuition: "Testing K hypotheses at α each gives overall FWER up to ≈ Kα. Corrections control either the family-wise error rate (probability of any false positive) or the false discovery rate (expected proportion of false positives among rejections).",
    formula: "Bonferroni: α_adj = α/K;   BH-FDR: reject p_(k) if p_(k) ≤ k·α/K",
    assumptions: [
      "Bonferroni assumes nothing about dependence — conservative.",
      "Benjamini–Hochberg assumes PRDS (positive regression dependence) — common in practice.",
      "Number of hypotheses K defined prospectively, not after looking at p-values."
    ],
    pitfalls: [
      "Correcting only the hypotheses you chose to report inflates the family.",
      "Subgroup analyses are hypothesis-generating unless pre-specified.",
      "FDR is about expected proportion — a single BH-significant finding still requires replication."
    ],
    reading: [
      "Benjamini & Hochberg (1995)",
      "R: p.adjust(, method=); multcomp for structured contrasts",
      "Efron, 'Large-scale Inference'"
    ]
  },
  meta_analysis: {
    title: "Meta-analysis (Fixed & Random Effects)",
    intuition: "Pools effect estimates across studies weighted by precision. Fixed-effects assumes one true effect (only within-study error). Random-effects allows between-study heterogeneity with variance τ².",
    formula: "θ̂_pool = Σ wᵢ θ̂ᵢ / Σ wᵢ;   wᵢ = 1/(SEᵢ²)  (fixed) or 1/(SEᵢ² + τ²) (random)",
    assumptions: [
      "Studies estimate the same (or exchangeable) underlying effect.",
      "Publication not systematically biased (check with funnel plot, Egger's test).",
      "Effect estimates and SEs correctly extracted and on the same scale."
    ],
    pitfalls: [
      "I² ≥ 50% signals substantial heterogeneity — investigate with meta-regression or subgroup analysis.",
      "Small-study effects / publication bias inflate pooled estimate.",
      "Random-effects CI narrower than study-level CIs can still be over-precise if k < 5."
    ],
    reading: [
      "Borenstein et al., 'Introduction to Meta-Analysis'",
      "R: meta, metafor packages",
      "Higgins, Thompson et al., Cochrane Handbook"
    ]
  },
  bayes: {
    title: "Bayesian Inference (Priors, Posteriors, Credible Intervals)",
    intuition: "Combines prior belief with observed likelihood to produce a posterior distribution. A 95% credible interval contains the parameter with 95% probability given the data and prior — directly interpretable.",
    formula: "P(θ | data) ∝ P(data | θ) · P(θ)",
    assumptions: [
      "Prior reflects genuine prior knowledge (or weak/reference if uninformative).",
      "Likelihood correctly specified.",
      "MCMC / variational methods converged — check traceplots, R̂ < 1.01, effective sample size."
    ],
    pitfalls: [
      "Strong priors dominate small samples — run sensitivity analysis over prior families.",
      "Improper priors can yield improper posteriors — verify integrability.",
      "Bayesian p-value / ppc mis-used as frequentist p-value."
    ],
    reading: [
      "McElreath, 'Statistical Rethinking'",
      "Gelman et al., 'Bayesian Data Analysis'",
      "R: brms, rstanarm, cmdstanr, posterior"
    ]
  },
  roc_auc: {
    title: "ROC Curves & AUC",
    intuition: "Plots sensitivity vs 1 − specificity across all thresholds. AUC = probability that a randomly chosen positive scores higher than a randomly chosen negative (concordance).",
    formula: "AUC = ∫₀¹ TPR(FPR) d(FPR) = P(score_pos > score_neg)",
    assumptions: [
      "Classes defined by a binary reference standard.",
      "Scores comparable across subjects (not cohort-adjusted).",
      "For imbalanced data, AUC can mislead — complement with precision–recall AUC."
    ],
    pitfalls: [
      "AUC = 0.5 is chance; < 0.5 usually means you flipped the sign.",
      "AUC measures discrimination, not calibration or net benefit — add DCA for decisions.",
      "Comparing AUCs requires DeLong's test or bootstrap (not a naive difference)."
    ],
    reading: [
      "Hanley & McNeil (1982); Pepe, 'The Statistical Evaluation of Medical Tests'",
      "R: pROC, ROCR, yardstick",
      "DeLong et al. (1988) for correlated AUC comparison"
    ]
  },
  confounding: {
    title: "Confounding, DAGs & Adjustment Sets",
    intuition: "A confounder is a common cause of exposure and outcome; its back-door path creates spurious association. Draw a DAG, apply back-door criterion to identify a sufficient adjustment set, avoid conditioning on mediators or colliders.",
    formula: "Back-door criterion: Z blocks every back-door path from A to Y and contains no descendants of A",
    assumptions: [
      "DAG encodes true causal structure (including unmeasured variables as U nodes).",
      "Measured confounders suffice (no unmeasured confounding).",
      "Adjustment method (regression, matching, weighting) correctly specified."
    ],
    pitfalls: [
      "Conditioning on a collider (e.g. hospital admission) opens a non-causal path.",
      "Adjusting for mediators hides the total effect — decompose deliberately.",
      "'Throw everything in the regression' is not adjustment — it can open collider paths."
    ],
    reading: [
      "Pearl, Glymour & Jewell, 'Causal Inference in Statistics: A Primer'",
      "Hernán & Robins, 'Causal Inference: What If' (free online)",
      "Textor et al., DAGitty web tool and R package"
    ]
  },
  iv: {
    title: "Instrumental Variables (IV / 2SLS / Mendelian Randomisation)",
    intuition: "An instrument Z affects the outcome only through exposure A. Two-stage least squares: regress A on Z, then Y on the predicted Â. Identifies causal effect in the presence of unmeasured confounders.",
    formula: "β_IV = Cov(Z, Y) / Cov(Z, A);   LATE interpretation for compliers",
    assumptions: [
      "Relevance: Z strongly predicts A (F-stat > 10 rule of thumb).",
      "Exchangeability: Z independent of unmeasured confounders of A–Y.",
      "Exclusion restriction: Z affects Y only through A (no horizontal pleiotropy in MR)."
    ],
    pitfalls: [
      "Weak instruments amplify bias toward OLS — check F-statistic.",
      "LATE applies to compliers only, not the whole population.",
      "MR requires no pleiotropy; sensitivity (MR-Egger, weighted median) essential."
    ],
    reading: [
      "Angrist & Pischke, 'Mostly Harmless Econometrics'",
      "Davey Smith & Ebrahim, 'Mendelian randomization' (IJE 2003)",
      "R: ivreg, AER; TwoSampleMR for MR"
    ]
  },
  did: {
    title: "Difference-in-Differences",
    intuition: "Compares change over time between a treated and a control group. Under parallel trends, the treated group's counterfactual post-period equals its pre-period + the control group's change.",
    formula: "DiD = (Ȳ_T,post − Ȳ_T,pre) − (Ȳ_C,post − Ȳ_C,pre)",
    assumptions: [
      "Parallel pre-trends (inspect visually + formal test with pre-period leads).",
      "No anticipation effect in the pre-period.",
      "Composition of treated and control groups stable across periods (or adjusted for)."
    ],
    pitfalls: [
      "Two-way fixed effects with staggered adoption and heterogeneous effects can be biased — use Callaway-Sant'Anna or Sun-Abraham.",
      "Cluster SEs at the treatment-unit level (usually small k means biased SE — wild cluster bootstrap).",
      "Spillovers from treated to control violate SUTVA."
    ],
    reading: [
      "Angrist & Pischke; Callaway & Sant'Anna (2021)",
      "Roth et al. (2023) 'What's Trending in Difference-in-Differences?'",
      "R: did, fixest, DIDmultiplegtDYN"
    ]
  },
  rdd: {
    title: "Regression Discontinuity Design",
    intuition: "When treatment is assigned by a cutoff on a running variable, subjects just above vs just below the cutoff are exchangeable in expectation. Local linear regression estimates the treatment effect at the threshold.",
    formula: "τ̂_SRD = lim_{x↓c} E[Y|X=x] − lim_{x↑c} E[Y|X=x]",
    assumptions: [
      "No manipulation of the running variable around the cutoff (McCrary density test).",
      "Outcome continuous in X at the cutoff absent treatment.",
      "Bandwidth choice justifiable — optimal bandwidth via Imbens–Kalyanaraman or Calonico-Cattaneo-Titiunik."
    ],
    pitfalls: [
      "Effect is local to the cutoff — external validity limited.",
      "Fuzzy RD requires an IV interpretation; use 2SLS with the cutoff as instrument.",
      "Polynomial regression over wide bandwidths inflates bias — prefer local linear."
    ],
    reading: [
      "Imbens & Lemieux (2008); Cattaneo, Idrobo & Titiunik, 'A Practical Introduction to RDD'",
      "R: rdrobust, rddensity",
      "Lee & Lemieux (2010), JEL review"
    ]
  },
  psm: {
    title: "Propensity Score Matching",
    intuition: "Estimate the probability of treatment given covariates (propensity score e(X)), then match treated to control subjects with similar e(X). Effect estimated on matched sample.",
    formula: "e(X) = P(A=1 | X);  match on logit(e) with caliper (e.g. 0.2·SD of logit(e))",
    assumptions: [
      "No unmeasured confounders.",
      "Positivity (overlap in e(X) between groups).",
      "Correct propensity model specification."
    ],
    pitfalls: [
      "Unmatched treated subjects biased the estimand (ATT on matched).",
      "Matching on outcome-associated predictors only (not instruments) reduces bias and variance.",
      "Report standardised mean differences post-match, not p-values."
    ],
    reading: [
      "Rosenbaum & Rubin (1983); Stuart (2010), 'Matching methods for causal inference'",
      "R: MatchIt, cobalt for balance diagnostics",
      "Austin (2011), Multivariable Behav Res"
    ]
  },
  target_trial: {
    title: "Target Trial Emulation",
    intuition: "Specify the hypothetical randomised trial you'd run if you could, then emulate each component (eligibility, assignment, strategies, follow-up start, outcome, estimand) in the observational data. Clarifies ambiguities and exposes design flaws.",
    formula: "Protocol specification: eligibility → strategies → assignment → follow-up → outcome → estimand → analysis",
    assumptions: [
      "Consistency: the observed treatment values correspond to well-defined hypothetical interventions.",
      "Exchangeability via measured covariates (possibly time-varying).",
      "Positivity across strategies over time."
    ],
    pitfalls: [
      "Immortal time bias from misaligned follow-up start.",
      "Prevalent-user bias: include only new users (or handle via cloning).",
      "Selection bias from post-baseline exclusions."
    ],
    reading: [
      "Hernán & Robins (2016), AJE; Hernán et al. (2022), 'A target trial approach'",
      "Matthews et al. (2022), 'Target trial emulation: applying principles of randomized trials to observational studies'",
      "R: no single package; workflow in dplyr + survival + IPCW"
    ]
  },
  mediation: {
    title: "Causal Mediation Analysis",
    intuition: "Decomposes the total effect of A on Y into an indirect path through mediator M (NIE) and a direct path not through M (NDE). Identifiability requires no unmeasured confounding of A–Y, M–Y, and A–M, plus no M–Y confounding affected by A.",
    formula: "Total = NDE + NIE   under Pearl/VanderWeele counterfactual decomposition",
    assumptions: [
      "Sequential ignorability: A and M conditionally exchangeable given measured covariates.",
      "Cross-world independence (untestable).",
      "Correct specification of mediator and outcome models."
    ],
    pitfalls: [
      "Baron–Kenny approach is obsolete — use counterfactual definitions.",
      "Interaction between A and M complicates decomposition (use VanderWeele's 4-way decomp).",
      "Mediator measurement error biases estimates unpredictably."
    ],
    reading: [
      "VanderWeele (2015), 'Explanation in Causal Inference'",
      "Imai, Keele & Tingley (2010)",
      "R: mediation, CMAverse"
    ]
  },
  descriptive: {
    title: "Descriptive Statistics & Distributions",
    intuition: "Summarise a sample with location (mean, median, mode), spread (SD, IQR, range), and shape (skewness, kurtosis). Choose summaries matching the data's distribution and the audience's needs.",
    formula: "x̄ = Σx/n;  s² = Σ(xᵢ − x̄)²/(n−1);  IQR = Q3 − Q1",
    assumptions: [
      "Mean/SD informative only for roughly symmetric distributions.",
      "Median/IQR robust to skew and outliers.",
      "Mode meaningful for multimodal or discrete data."
    ],
    pitfalls: [
      "Reporting mean ± SD for skewed data misleads — show median (IQR) or a boxplot.",
      "Range grows with n — not a stable spread measure.",
      "Summary statistics hide multimodality — always plot a histogram or density."
    ],
    reading: [
      "Altman, 'Practical Statistics for Medical Research'",
      "Tukey, 'Exploratory Data Analysis'",
      "R: summary, skimr, gtsummary for publication tables"
    ]
  },
  clt_sampling: {
    title: "Central Limit Theorem & Sampling Distributions",
    intuition: "Means of sufficiently large i.i.d. samples are approximately normal regardless of the parent distribution, with SE σ/√n. Foundation for z/t-tests and Wald CIs.",
    formula: "x̄ ~ N(μ, σ²/n) as n → ∞",
    assumptions: [
      "Independent, identically-distributed draws (or approximately so).",
      "Finite variance (heavy-tailed distributions may require larger n or alternatives).",
      "Sample size large enough — rule of thumb n ≥ 30, smaller if parent is near-normal."
    ],
    pitfalls: [
      "Highly skewed or multimodal parents may need n ≫ 30 before CLT kicks in.",
      "CLT applies to the mean, not individual observations.",
      "Clustered data: effective sample size < n; SE must account for design."
    ],
    reading: [
      "Feller, 'An Introduction to Probability Theory and Its Applications'",
      "Casella & Berger, 'Statistical Inference'",
      "R: demonstration via replicate(10000, mean(rexp(30)))"
    ]
  },
  study_design: {
    title: "Study Design (RCT, Cohort, Case-Control, Cross-sectional)",
    intuition: "Choose the design that lets the data answer your question. RCTs remove confounding by randomisation; cohorts follow exposure groups forward; case-controls sample on outcome and look back at exposure; cross-sectional takes a single snapshot.",
    formula: "Design hierarchy (causal inference): RCT > prospective cohort > retrospective cohort > case-control > cross-sectional",
    assumptions: [
      "RCT: randomisation executed and preserved; adequate blinding.",
      "Cohort: exposure measured accurately at baseline; minimal loss to follow-up.",
      "Case-control: controls drawn from the source population of the cases; recall bias controlled."
    ],
    pitfalls: [
      "Selection bias at recruitment distorts all designs.",
      "Case-control cannot estimate incidence directly; use OR as RR only for rare outcomes.",
      "Cross-sectional cannot establish temporal order."
    ],
    reading: [
      "Rothman, Greenland & Lash, 'Modern Epidemiology'",
      "Grimes & Schulz (2002), Lancet series on epidemiologic methods",
      "STROBE reporting guidelines"
    ]
  },
  bias: {
    title: "Bias (Selection, Information, Confounding)",
    intuition: "A systematic error that distorts the estimate from the truth. Selection bias: sample not representative. Information bias: exposure/outcome mismeasured. Confounding: a third variable explains away the association.",
    formula: "E[θ̂] − θ = bias; standardise or restrict sample, validate measurements, adjust for confounders",
    assumptions: [
      "Bias sources can be named and anticipated from the design.",
      "Sensitivity analyses quantify plausible bias ranges.",
      "Quantitative bias analysis (QBA) uses external data to probe unmeasured bias."
    ],
    pitfalls: [
      "Non-differential misclassification usually biases toward the null, but not always — exceptions abound.",
      "Immortal time bias, lead-time bias, length-time bias are design-specific and must be explicitly addressed.",
      "Collider-stratification selection bias is subtle — draw a DAG."
    ],
    reading: [
      "Rothman, Greenland & Lash (Modern Epidemiology), Chapter on Bias",
      "Lash, Fox & Fink, 'Applying Quantitative Bias Analysis'",
      "Delgado-Rodríguez & Llorca (2004), J Epidemiol Community Health"
    ]
  },
  icc_agreement: {
    title: "Intraclass Correlation & Agreement",
    intuition: "ICC measures how much of total variance is between-subject vs within-subject (or rater). Values near 1 mean raters agree almost perfectly; values near 0 mean most variance is noise.",
    formula: "ICC = σ²_between / (σ²_between + σ²_within)   (exact form depends on 1-way vs 2-way, fixed vs random, single vs average)",
    assumptions: [
      "Targets measured on a continuous scale.",
      "Model form (one-way random, two-way random, two-way mixed) chosen by design.",
      "Balanced design — unbalanced designs use REML mixed models."
    ],
    pitfalls: [
      "Different ICC formulas give different numbers on the same data — name the model (McGraw & Wong 1996).",
      "ICC depends on between-subject variability in the sample; don't generalise across populations.",
      "For categorical data, use κ; for continuous data, use ICC or Lin's CCC."
    ],
    reading: [
      "Shrout & Fleiss (1979); McGraw & Wong (1996)",
      "R: psych::ICC, irr::icc",
      "Koo & Li (2016) guidelines for ICC reporting"
    ]
  },
  prob_dist: {
    title: "Common Probability Distributions",
    intuition: "Each distribution models a specific data-generating process. Binomial: count of successes in n Bernoulli trials. Poisson: rare events per unit time/space. Normal: sum of many small independent effects (CLT motivation). Exponential: waiting times between Poisson events (memoryless).",
    formula: "Binomial: Var = np(1−p); Poisson: Var = λ = mean; Normal: ~68/95/99.7% within ±1/2/3 SD",
    assumptions: [
      "Binomial: fixed n, independent trials, constant probability p.",
      "Poisson: events independent, constant rate; if Var > mean → overdispersion (use negative binomial).",
      "Normal: additive independent effects; check via Q-Q plot, not just skew/kurtosis.",
      "Exponential: constant hazard — often unrealistic for clinical survival."
    ],
    pitfalls: [
      "Fitting Poisson to overdispersed counts understates SEs — switch to quasi-Poisson or negative binomial.",
      "Normality shortcuts fail for small, heavy-tailed samples; use robust or resampling methods.",
      "Binomial with n=1 collapses to Bernoulli — handle n=1 cases deliberately."
    ],
    reading: [
      "Ross, 'Introduction to Probability Models'",
      "R: dbinom/pbinom, dpois/ppois, dnorm/pnorm, dexp/pexp",
      "Casella & Berger, 'Statistical Inference'"
    ]
  },
  variable_types: {
    title: "Variable Types & Measurement Scales",
    intuition: "Variables split by two intersecting taxonomies. By type — categorical (nominal or ordinal) vs. numeric (continuous or discrete). By Stevens scale — nominal (unordered categories like blood type), ordinal (ordered but unequal spacing like pain 0–10, BMI categories), interval (equal spacing, no true zero, like °C), and ratio (equal spacing with meaningful zero, like kg, mmHg). Continuous numeric variables can take any real value in a range (blood pressure, weight, time, lab results); discrete numeric variables are countable integers (ER visits, number of children, symptom counts). Taken together, type and scale dictate which summaries and tests are legal.",
    formula: "Nominal → mode, proportions, χ²;  Ordinal → median, rank tests;  Discrete counts → Poisson / negative binomial;  Continuous (interval/ratio) → mean, SD, t-tests, ANOVA, regression",
    assumptions: [
      "Nominal categorical: unordered labels; only equality comparisons are meaningful.",
      "Ordinal categorical: rank-ordered, but differences between levels are not comparable.",
      "Continuous numeric: any value is possible within a range (bounded only by measurement precision).",
      "Discrete numeric: countable integers; often ratio-scale, but counts usually need Poisson/NB rather than Normal models.",
      "Interval lacks a true zero (e.g., 0°C ≠ absence of temperature), so ratios are not meaningful; ratio has a true zero and ratios are meaningful."
    ],
    pitfalls: [
      "Averaging Likert scores treats ordinal as interval — report medians or use ordinal models (e.g., cumulative logit).",
      "Coding categorical as integers and running linear regression silently imposes ordering.",
      "Binning a continuous variable into categories (e.g., age → young/old) discards information and reduces power.",
      "Conflating 'continuous' with 'ratio' — blood pressure is both, but age in whole years is ratio yet effectively discrete; check whether any value in the range is possible, not just whether there is a true zero."
    ],
    reading: [
      "Stevens (1946), 'On the Theory of Scales of Measurement'",
      "Altman, 'Practical Statistics for Medical Research' — Ch. 2 (Types of data)",
      "Agresti, 'Analysis of Ordinal Categorical Data'",
      "R: factor(), ordered(), polr() in MASS, clm() in ordinal"
    ]
  },
  central_tendency: {
    title: "Central Tendency (Mean, Median, Mode)",
    intuition: "The mean is the arithmetic average — sensitive to outliers. The median is the middle value — robust to extremes and preferred for skewed data. The mode is the most common value — the only summary valid for nominal data. In a symmetric unimodal distribution, all three coincide.",
    formula: "mean x̄ = Σxᵢ/n;  median = middle (or mean of two middles);  mode = argmax frequency",
    assumptions: [
      "Mean requires interval/ratio scale.",
      "Median assumes at least ordinal scale.",
      "Mode is the only summary appropriate for nominal categorical data."
    ],
    pitfalls: [
      "Reporting the mean for right-skewed income, wait times, or costs misrepresents the 'typical' value.",
      "Median can be insensitive to meaningful changes in the tails when those matter clinically.",
      "Bimodal distributions have no single meaningful centre — always inspect the histogram."
    ],
    reading: [
      "Tukey, 'Exploratory Data Analysis'",
      "Wilcox, 'Introduction to Robust Estimation and Hypothesis Testing'",
      "R: mean(), median(), DescTools::Mode()"
    ]
  },
  spread_variability: {
    title: "Measures of Spread (SD, Variance, IQR, CV, Range)",
    intuition: "Variance and SD measure average squared distance from the mean — efficient but outlier-sensitive. IQR (Q3−Q1) is the spread of the middle 50% — robust. CV = SD/mean is unit-free and lets you compare variability across scales. Range depends only on extremes and grows with n.",
    formula: "s² = Σ(xᵢ−x̄)²/(n−1);  SD = √s²;  IQR = Q3 − Q1;  CV = SD/mean",
    assumptions: [
      "SD and variance assume roughly symmetric distributions to be interpretable as 'typical' spread.",
      "CV is meaningful only for ratio-scale data (true zero).",
      "IQR is scale-dependent; compare on the same units."
    ],
    pitfalls: [
      "Reporting SD with heavily skewed data — IQR or a boxplot communicates spread better.",
      "Treating range as a stable summary — it keeps growing as n grows.",
      "CV explodes near mean = 0, making it unstable for centred variables."
    ],
    reading: [
      "Altman, 'Practical Statistics for Medical Research'",
      "Tukey, 'Exploratory Data Analysis'",
      "R: sd(), var(), IQR(), range()"
    ]
  },
  normal_zscore: {
    title: "The Normal Distribution & z-Scores",
    intuition: "A z-score restates a value in 'standard deviations from the mean': z = (x − μ)/σ. In a normal distribution, ~68% of values lie within ±1 SD, ~95% within ±2 SD, and ~99.7% within ±3 SD. z-scores allow comparison across differently-scaled variables and are the basis of reference intervals.",
    formula: "z = (x − μ)/σ;  68-95-99.7 rule for ±1/2/3 SD",
    assumptions: [
      "The reference distribution is approximately normal.",
      "μ and σ are known or well-estimated.",
      "Tails behave as normal (no heavy-tail contamination)."
    ],
    pitfalls: [
      "Applying 68-95-99.7 to skewed or heavy-tailed data overstates how 'typical' a value is.",
      "Using sample mean/SD as μ/σ without acknowledging estimation error in small samples.",
      "Confusing z-scores with percentiles — the mapping is distributional."
    ],
    reading: [
      "Casella & Berger, 'Statistical Inference'",
      "Altman, 'Practical Statistics for Medical Research'",
      "R: pnorm(), qnorm(), scale()"
    ]
  },
  regression_diagnostics: {
    title: "Regression Diagnostics",
    intuition: "After fitting a regression, diagnostics check whether the model's assumptions hold. Residuals-vs-fitted plots reveal nonlinearity and heteroscedasticity. Cook's distance and leverage flag influential points. VIF catches multicollinearity. Durbin-Watson and DHARMa simulations check residual independence and distributional assumptions.",
    formula: "Cook's Dᵢ = (rᵢ²/p)·(hᵢᵢ/(1−hᵢᵢ)²);  VIFⱼ = 1/(1−Rⱼ²);  DW ≈ 2 under independence",
    assumptions: [
      "Linearity of the relationship between predictors and outcome.",
      "Homoscedasticity — constant residual variance.",
      "Independence and (for inference) approximate normality of residuals."
    ],
    pitfalls: [
      "Ignoring a funnel-shaped residuals plot leads to invalid SEs — use HC/sandwich or transform.",
      "Deleting high-Cook's-D points without investigation — they may reveal the most important story.",
      "VIF > 10 is only a rule of thumb; context and the question being asked matter."
    ],
    reading: [
      "Fox, 'Applied Regression Analysis and Generalized Linear Models'",
      "Hartig, DHARMa R package vignette",
      "R: plot(lm.fit), car::vif, car::influencePlot, lmtest::dwtest, DHARMa::simulateResiduals"
    ]
  },
  model_selection: {
    title: "Model Selection (AIC, BIC, LASSO, Ridge, Elastic Net)",
    intuition: "Model selection trades fit against complexity. AIC (=2k − 2logL) favours predictive accuracy; BIC (=k·log n − 2logL) penalises complexity more heavily and targets the 'true' model. LASSO adds an L1 penalty that can zero-out coefficients (variable selection); ridge adds L2 that shrinks them; elastic net blends both.",
    formula: "AIC = 2k − 2logL;  BIC = k·log n − 2logL;  LASSO: min ‖y−Xβ‖² + λ‖β‖₁;  Ridge: λ‖β‖₂²",
    assumptions: [
      "AIC/BIC compare likelihood-based models on the same data and outcome.",
      "Penalised methods assume predictors are standardised before fitting.",
      "Cross-validation is needed to tune λ in LASSO/ridge/elastic net."
    ],
    pitfalls: [
      "Comparing AIC across models fit to different datasets or with different response transforms.",
      "Using LASSO coefficient signs for inference without a debiasing step (e.g., post-selection).",
      "BIC is only asymptotically consistent — in small samples it can over-penalise."
    ],
    reading: [
      "Burnham & Anderson, 'Model Selection and Multimodel Inference'",
      "Hastie, Tibshirani & Friedman, 'Elements of Statistical Learning', ch. 3, 7",
      "R: AIC(), BIC(), glmnet, MASS::stepAIC"
    ]
  },
  mixed_models: {
    title: "Mixed-Effects & Longitudinal Models",
    intuition: "Repeated measures and nested designs break independence. Mixed models add random intercepts/slopes for within-cluster correlation. GEE gives marginal (population-averaged) effects; GLMM gives conditional (subject-specific) effects.",
    formula: "y_ij = Xβ + Zb_i + ε_ij,  b_i ~ N(0, G),  ε ~ N(0, R)",
    assumptions: [
      "Correct random-effects structure and covariance (CS, AR(1), unstructured).",
      "For GLMM: correct link function and conditional distribution.",
      "Clusters a random sample (when generalising beyond observed clusters)."
    ],
    pitfalls: [
      "Singular-fit warnings usually mean a variance component is at boundary 0 — simplify.",
      "Comparing fixed effects across REML fits — switch to ML for LRTs.",
      "Forgetting GEE and GLMM target different estimands."
    ],
    reading: [
      "Fitzmaurice, Laird & Ware, 'Applied Longitudinal Analysis'",
      "Gelman & Hill, 'Data Analysis Using Regression and Multilevel Models'",
      "R: lme4::lmer/glmer, nlme::lme, geepack::geeglm, lmerTest"
    ]
  },
  causal_assumptions: {
    title: "Identifiability Assumptions for Causal Effects",
    intuition: "To move from association to causation: exchangeability (A ⫫ Y^a | L), positivity (0<P(A|L)<1), consistency (Y = Y^a when A=a), and SUTVA (no interference + one version of treatment).",
    formula: "E[Y^a] = E[E[Y|A=a, L]]  under exchangeability + positivity + consistency",
    assumptions: [
      "No unmeasured confounders given L (exchangeability).",
      "Every covariate pattern has non-trivial probability of each treatment (positivity).",
      "Treatment is well-defined — same mechanism for all units (consistency/SUTVA)."
    ],
    pitfalls: [
      "Positivity violations hidden until propensity-score overlap is checked.",
      "Adjusting for 'more' covariates can create empty strata — losing positivity.",
      "Cross-world independence (for mediation) is untestable — do sensitivity analyses."
    ],
    reading: [
      "Hernán & Robins, 'Causal Inference: What If'",
      "Pearl, 'Causality'",
      "Petersen & van der Laan (2014)"
    ]
  },
  measurement_validity: {
    title: "Validity & Responsiveness of Measurement Scales",
    intuition: "A scale is only useful if it measures what it claims (validity) and is stable across time and raters (reliability). Criterion validity compares against a gold standard; construct validity checks expected correlations; responsiveness is sensitivity to real change.",
    formula: "SEM = SD·√(1−r),  SDC95 ≈ 2.77·SEM",
    assumptions: [
      "Criterion validity assumes the external criterion is itself valid.",
      "Construct validity requires theory-driven predictions about correlations.",
      "Responsiveness assessments need a defensible 'change' anchor."
    ],
    pitfalls: [
      "Very high Cronbach's α often reflects item redundancy, not good measurement.",
      "Floor/ceiling effects limit discrimination at the extremes.",
      "Treating ordinal scales as interval when summing or averaging items."
    ],
    reading: [
      "Streiner, Norman & Cairney, 'Health Measurement Scales'",
      "De Vet et al., 'Measurement in Medicine'",
      "COSMIN checklist (cosmin.nl)"
    ]
  },
  hypothesis_testing: {
    title: "Null Hypothesis Significance Testing",
    intuition: "A p-value is the probability of data at least as extreme as observed IF H0 were true. α is the pre-set Type I error rate — the chance of falsely rejecting a true null. 'Not significant' ≠ 'no effect'; it means evidence was insufficient at the chosen α given the sample size.",
    formula: "Reject H0 if p < α; Type I = α; Type II = β; Power = 1 − β",
    assumptions: [
      "α and the alternative are pre-specified (not chosen after peeking).",
      "Test assumptions (e.g., normality, independence) hold for the chosen statistic.",
      "Multiple comparisons are accounted for if several tests are run."
    ],
    pitfalls: [
      "Equating a large p-value with 'no effect' — it may just reflect low power.",
      "Dichotomizing evidence at 0.05 hides gradations; report effect size and CI instead.",
      "Running the same test with growing n until p < 0.05 (optional stopping) inflates Type I error."
    ],
    reading: [
      "Wasserstein & Lazar (2016), 'The ASA Statement on p-Values'",
      "Greenland et al. (2016), 'Statistical tests, P values, confidence intervals, and power'",
      "Amrhein, Greenland, McShane (2019), 'Retire statistical significance'"
    ]
  },
  sampling_methods: {
    title: "Sampling Methods (SRS, Stratified, Cluster, Multi-stage)",
    intuition: "How you draw the sample shapes both precision and representativeness. Simple random sampling (SRS) is the baseline. Stratified sampling forces representation of subgroups and usually reduces SE. Cluster sampling is cheaper but units in a cluster are correlated, so SE is larger than SRS. Multi-stage designs nest these to balance cost and precision. Convenience sampling is not a probability design and forfeits unbiased inference.",
    formula: "Design effect: DEFF = 1 + (m − 1)·ρ   (m = avg cluster size, ρ = intracluster correlation);   effective n ≈ n / DEFF",
    assumptions: [
      "Well-defined sampling frame covering the target population.",
      "Known, non-zero inclusion probabilities for every unit (needed for design-weighted estimation).",
      "Probability design — convenience / volunteer samples break inference."
    ],
    pitfalls: [
      "Applying SRS formulas to cluster or multi-stage data understates SE and overstates precision.",
      "Stratification only helps precision if strata are more homogeneous within than between — on an irrelevant stratifier it does nothing.",
      "Weighting fixes unequal selection but can inflate variance; always report design-based SEs.",
      "Convenience / non-response issues are selection bias, not sampling error — larger n does not fix them."
    ],
    reading: [
      "Lohr, 'Sampling: Design and Analysis'",
      "Cochran, 'Sampling Techniques'",
      "R: survey package (svydesign, svymean, svyglm)"
    ]
  },
  lln: {
    title: "Law of Large Numbers",
    intuition: "As n grows, the sample mean converges to the population mean. This is what lets you treat a large-enough average as a trustworthy estimate of μ. LLN says the mean gets close; CLT tells you how fast and with what shape.",
    formula: "x̄_n → μ   as n → ∞   (weak LLN: in probability;   strong LLN: almost surely)",
    assumptions: [
      "Observations are i.i.d. (or at least ergodic with a well-defined mean).",
      "Finite population mean — heavy-tailed distributions (e.g., Cauchy) have no mean and LLN fails.",
      "Identically distributed — systematic drift in the data-generating process breaks convergence."
    ],
    pitfalls: [
      "LLN is about averages, not about individual outcomes 'balancing out' — that's the gambler's fallacy.",
      "Convergence can be slow for skewed or heavy-tailed data; a large n is not automatically a 'safe' n.",
      "Selection bias, not sample size, is the usual culprit when large samples produce biased estimates — LLN does not fix a biased sampling frame."
    ],
    reading: [
      "Feller, 'An Introduction to Probability Theory and Its Applications', Vol. 1",
      "Casella & Berger, 'Statistical Inference', Ch. 5",
      "Billingsley, 'Probability and Measure' for the strong LLN"
    ]
  },
  bland_altman: {
    title: "Bland–Altman Limits of Agreement",
    intuition: "Plot the difference between two methods against their mean; draw limits at mean ± 1.96·SD of differences. If most points fall within clinically acceptable limits, methods agree.",
    formula: "LoA = d̄ ± 1.96 · s_d   (assumes differences approximately normal)",
    assumptions: [
      "Differences approximately normally distributed.",
      "Differences independent of magnitude (check for proportional bias).",
      "Methods intended to measure the same quantity on the same scale."
    ],
    pitfalls: [
      "Correlation coefficients are NOT agreement — two methods can be perfectly correlated yet systematically different.",
      "If variance depends on magnitude, log-transform or use a regression approach.",
      "Clinical acceptability of LoA is a domain judgement, not a statistical one."
    ],
    reading: [
      "Bland & Altman (1986), Lancet",
      "Giavarina (2015), Biochemia Medica — practical guide",
      "R: blandr, BlandAltmanLeh"
    ]
  }
};

export { METHODS };

// Method → branch attribution. Used by the Insights endpoint and
// dashboard to roll up per-method accuracy into the 8 branches without
// going through case_id (which gave the wrong answer when a case in
// branch X contained questions tagged with methods naturally belonging
// to branch Y).
//
// The mapping is hand-tuned against BRANCHES[*].desc in src/data/branches.ts,
// not auto-derived. If you add a method to METHODS, add it here too;
// the test suite (src/data/methods.test.ts) verifies every key in METHODS
// has a branch assignment.
import type { BranchId } from "./branches";

export const METHOD_BRANCH: Record<string, BranchId> = {
  // Foundations — data types, descriptive stats, distributions
  descriptive: "foundations",
  variable_types: "foundations",
  central_tendency: "foundations",
  spread_variability: "foundations",
  normal_zscore: "foundations",

  // Probability & Sampling — random variables, CLT, sampling, LLN
  prob_dist: "probability",
  clt_sampling: "probability",
  sampling_methods: "probability",
  lln: "probability",

  // Estimation & Inference — CIs, p-values, classical tests
  ci: "estimation_inference",
  bootstrap: "estimation_inference",
  t_test: "estimation_inference",
  chi_square: "estimation_inference",
  anova: "estimation_inference",
  hypothesis_testing: "estimation_inference",

  // Regression — linear, logistic, survival, mixed
  lm: "regression",
  logistic: "regression",
  cox_ph: "regression",
  km_logrank: "regression",
  regression_diagnostics: "regression",
  model_selection: "regression",
  mixed_models: "regression",

  // Study Design & Bias
  study_design: "design_bias",
  bias: "design_bias",

  // Missing Data & Measurement — imputation, reliability, validity, ROC
  mice: "missing_measurement",
  kappa: "missing_measurement",
  icc_agreement: "missing_measurement",
  bland_altman: "missing_measurement",
  measurement_validity: "missing_measurement",
  roc_auc: "missing_measurement",

  // Causal Inference
  iptw: "causal",
  e_value: "causal",
  confounding: "causal",
  iv: "causal",
  did: "causal",
  rdd: "causal",
  psm: "causal",
  mediation: "causal",
  causal_assumptions: "causal",
  target_trial: "causal",

  // Advanced & Bayesian — multiple testing, power, meta-analysis, Bayes
  multiple_testing: "advanced_bayesian",
  meta_analysis: "advanced_bayesian",
  bayes: "advanced_bayesian",
  power: "advanced_bayesian",
};
