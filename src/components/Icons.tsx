// @ts-nocheck
// Icon system for BioStat Quest. Lifted out of App.tsx so that extracted
// component modules (AuthButton, CasePlay, DeepDive, …) can reference
// Ico/BranchGlyph without circular imports back into App.tsx.
//
// Four JSX maps drive the chrome:
//   - NAV_ICON     top-bar nav buttons
//   - BRANCH_ICON  statistically-meaningful icons for skill-tree branches
//   - LESSON_ICON  R-lab lesson icons
//   - UI_ICON      generic UI chrome (buttons, chips, headers)
// Plus ICON_MARKUP, a string map used for share-card SVGs and for any
// badge/celebration glyph where Ico falls back to innerHTML-rendered SVG.

import * as React from "react";
import { BRANCHES } from "../data/branches";

// Premium custom nav icons — unified stroke-based set (currentColor inherits
// from the button's text color, so active/inactive states just work).
const NAV_ICON = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 11.2 12 3.5l8.8 7.7V20a1 1 0 0 1-1 1h-4.5v-6.2h-6.6V21H4.2a1 1 0 0 1-1-1z"/>
    </svg>
  ),
  // Skill tree — root node branching up to two leaves (graph/tree metaphor)
  tree: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="19.5" r="2.25"/>
      <circle cx="6"  cy="5.5"  r="2.25"/>
      <circle cx="18" cy="5.5"  r="2.25"/>
      <path d="M12 17.25v-4M12 13.25c0-2 -2-3.5 -4-4.5M12 13.25c0-2 2-3.5 4-4.5"/>
    </svg>
  ),
  // Lab — Erlenmeyer flask with a subtle liquid line
  lab: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3.5h6"/>
      <path d="M10 3.5v5.7L4.6 19a1.2 1.2 0 0 0 1.05 1.8h12.7A1.2 1.2 0 0 0 19.4 19L14 9.2V3.5"/>
      <path d="M7.2 15.2h9.6"/>
    </svg>
  ),
  // R Lab — terminal window framing the R letter
  rlab: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.2"/>
      <path d="M3 8h18"/>
      <circle cx="6"  cy="6" r="0.4" fill="currentColor"/>
      <circle cx="8"  cy="6" r="0.4" fill="currentColor"/>
      <circle cx="10" cy="6" r="0.4" fill="currentColor"/>
      {/* stylized "R" */}
      <path d="M9.5 17v-5h2.6c1.1 0 1.9.8 1.9 1.8s-.8 1.8-1.9 1.8H9.5M12.5 15.6 14.7 17"/>
    </svg>
  ),
  // Badges — shield outline (monochrome) with a gold gradient-filled star.
  // Gold pairs with the app's .gold-text ramp (fbbf24 → f59e0b) used on XP/level chips.
  badges: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="navGoldBadges" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#fde68a"/>
          <stop offset="55%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
      </defs>
      <path d="M12 3 4.5 5.5v6c0 4.3 3.2 8.3 7.5 10 4.3-1.7 7.5-5.7 7.5-10v-6z"/>
      <path d="m12 8.8 1.25 2.55 2.8.4-2.03 1.98.48 2.79L12 15.3l-2.5 1.22.48-2.79-2.03-1.98 2.8-.4z"
            fill="url(#navGoldBadges)" stroke="#b45309" strokeWidth="0.8"/>
    </svg>
  ),
  // Leaders — monochrome podium with a gold gradient-filled "1st place" star on top.
  board: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="navGoldBoard" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#fde68a"/>
          <stop offset="55%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
      </defs>
      <path d="M3 21h18"/>
      <rect x="4"  y="13" width="5" height="8" rx="0.6"/>
      <rect x="9.5" y="7"  width="5" height="14" rx="0.6"/>
      <rect x="15" y="10" width="5" height="11" rx="0.6"/>
      <path d="M12 4.7l.55 1.1 1.22.18-.88.86.21 1.22-1.1-.58-1.1.58.21-1.22-.88-.86 1.22-.18z"
            fill="url(#navGoldBoard)" stroke="#b45309" strokeWidth="0.7"/>
    </svg>
  ),
  // Stats — three ascending bars, no axis (cleaner than typical chart icon)
  stats: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      <rect x="5"    y="14" width="3.2" height="6" rx="0.5"/>
      <rect x="10.4" y="9"  width="3.2" height="11" rx="0.5"/>
      <rect x="15.8" y="4.5" width="3.2" height="15.5" rx="0.5"/>
    </svg>
  ),
  // Glossary — open book with page lines
  glossary: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5.5V20"/>
      <path d="M12 5.5C9.5 3.9 7 3.5 4 3.5a.5.5 0 0 0-.5.5v14a.5.5 0 0 0 .5.5c3 0 5.5.4 8 2 2.5-1.6 5-2 8-2a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5c-3 0-5.5.4-8 2z"/>
      <path d="M6.5 8h3M6.5 11h3M14.5 8h3M14.5 11h3"/>
    </svg>
  ),
  // Misconceptions — magnifier with an exclamation inside the lens.
  // "Spot the trap" metaphor: the tool that catches recurring wrong-answer
  // patterns and surfaces them so the learner can see + fix them.
  misconceptions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.25"/>
      <path d="M15 15 L 20 20"/>
      {/* exclamation mark inside the lens */}
      <path d="M10.5 7.5 V 11"/>
      <circle cx="10.5" cy="13.2" r="0.55" fill="currentColor" stroke="none"/>
    </svg>
  ),
};

// Premium custom branch icons — unified stroke-based set, inherit branch color
// via currentColor. Statistically meaningful (CI bracket, bell curve, DAG, …)
// rather than generic (flask, compass, brain). Sized by parent container.
const BRANCH_ICON = {
  // Foundations — ascending bars with data points (descriptive statistics)
  foundations: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20.5h18"/>
      <rect x="5.5" y="13"  width="3" height="7.5"  rx="0.4"/>
      <rect x="10.5" y="8"  width="3" height="12.5" rx="0.4"/>
      <rect x="15.5" y="11" width="3" height="9.5"  rx="0.4"/>
      <circle cx="7"  cy="10" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="5"  r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="8"  r="0.9" fill="currentColor" stroke="none"/>
    </svg>
  ),
  // Probability & Sampling — normal curve with sample point at the mean
  probability: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 19h18"/>
      <path d="M3.5 19 C 6 19, 8 17.5, 10 11 C 11 8, 11.5 7, 12 7 C 12.5 7, 13 8, 14 11 C 16 17.5, 18 19, 20.5 19"/>
      <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  // Estimation & Inference — confidence interval with point estimate + axis ticks
  estimation_inference: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8v8"/>
      <path d="M20 8v8"/>
      <path d="M4 12h16"/>
      <circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>
      <path d="M4 19.5v2 M12 19.5v2 M20 19.5v2" strokeWidth="1.3"/>
    </svg>
  ),
  // Regression — scatter cloud with trend line (in an x/y frame)
  regression: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v18h18"/>
      <path d="M5.5 18 L 20 5.5"/>
      <circle cx="7"    cy="17" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="10.5" cy="13.5" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="13.5" cy="12.5" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="16"   cy="9"  r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="18.5" cy="7"  r="1.05" fill="currentColor" stroke="none"/>
    </svg>
  ),
  // Study Design & Bias — randomization tree (source → two arms)
  design_bias: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.5"/>
      <rect x="3"  y="16" width="7" height="5" rx="1"/>
      <rect x="14" y="16" width="7" height="5" rx="1"/>
      <path d="M11 7 Q 7  12 6.5 16"/>
      <path d="M13 7 Q 17 12 17.5 16"/>
    </svg>
  ),
  // Missing Data & Measurement — 3×3 grid with a dashed missing cell
  missing_measurement: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.5"/>
      <path d="M9 3v18 M15 3v18 M3 9h18 M3 15h18"/>
      <path d="M10.5 10.5l3 3 M13.5 10.5l-3 3" strokeDasharray="1.6 1.6" strokeWidth="1.5"/>
    </svg>
  ),
  // Causal Inference — DAG with directed arrows (classic confounder triangle)
  causal: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5"  cy="6"  r="2.2" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="6"  r="2.2" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="19" r="2.2" fill="currentColor" stroke="none"/>
      <path d="M6.7 7.8 L 10.5 16.8"/>
      <path d="M17.3 7.8 L 13.5 16.8"/>
      {/* arrowhead chevrons */}
      <path d="M9.3 15.4 L 10.6 17.1 L 11.6 15.1" strokeWidth="1.4"/>
      <path d="M14.7 15.4 L 13.4 17.1 L 12.4 15.1" strokeWidth="1.4"/>
    </svg>
  ),
  // Advanced & Bayesian — prior (wider, faded) overlaid with posterior (sharper)
  advanced_bayesian: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      <path d="M3.5 20 C 6 20, 8 18, 10 13 C 11 10, 11.5 9, 12 9 C 12.5 9, 13 10, 14 13 C 16 18, 18 20, 20.5 20" opacity="0.4"/>
      <path d="M7 20 C 9 20, 10.3 18, 11 12 C 11.3 8, 11.7 5, 12 5 C 12.3 5, 12.7 8, 13 12 C 13.7 18, 15 20, 17 20"/>
    </svg>
  ),
};

// ======================================================================
// Custom icon library — unified stroke-based set, viewBox 24×24, stroke
// currentColor, strokeWidth 1.75. Used across R Lab lessons, Interactive
// Lab cards/tabs, and UI chrome buttons. Emojis stay only in content
// positions (badge rewards, celebration, streak indicators, prose).
// ======================================================================

// R Lab lesson icons — keyed by lesson id. Each aims to be statistically
// meaningful (a histogram for descriptives, a step curve for KM, a forest
// plot for Cox, a bullseye for power, …) rather than generic.
const LESSON_ICON = {
  desc: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20.5h18"/>
      <rect x="4"    y="13"  width="2.8" height="7.5"  rx="0.4"/>
      <rect x="7.8"  y="9"   width="2.8" height="11.5" rx="0.4"/>
      <rect x="11.6" y="6.5" width="2.8" height="14"   rx="0.4"/>
      <rect x="15.4" y="10"  width="2.8" height="10.5" rx="0.4"/>
      <path d="M13 4.5v17" strokeDasharray="1.4 1.6" opacity="0.8"/>
    </svg>
  ),
  correlation: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v18h18"/>
      <path d="M6 18 L 20 5" strokeDasharray="1.6 1.6"/>
      <circle cx="7.5"  cy="17"   r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="10.5" cy="14"   r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="13"   cy="11.5" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="16"   cy="8.5"  r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="18.5" cy="6"    r="1.05" fill="currentColor" stroke="none"/>
    </svg>
  ),
  ttest: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      {/* group 1 — point + CI */}
      <path d="M7 8v10"/>
      <path d="M5 8h4 M5 18h4" strokeWidth="1.4"/>
      <circle cx="7" cy="13" r="1.6" fill="currentColor" stroke="none"/>
      {/* group 2 — shifted down, wider CI */}
      <path d="M17 5v11"/>
      <path d="M15 5h4 M15 16h4" strokeWidth="1.4"/>
      <circle cx="17" cy="10" r="1.6" fill="currentColor" stroke="none"/>
    </svg>
  ),
  paired: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 20h14" strokeDasharray="1.2 2"/>
      {/* baseline on left, post on right, linked */}
      <circle cx="7" cy="15" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="8" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M7 15 C 10 13, 14 10, 17 8"/>
      <circle cx="7" cy="12" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="6" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M7 12 C 10 10, 14 7, 17 6" opacity="0.7"/>
      <circle cx="7" cy="9" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="17" cy="4.5" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M7 9 C 10 8, 14 5.5, 17 4.5" opacity="0.5"/>
    </svg>
  ),
  wilcoxon: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* rank ticks ascending above a base line */}
      <path d="M4 17h17"/>
      <path d="M19 15l2 2-2 2" strokeWidth="1.4"/>
      <path d="M6 14v3 M9 12v5 M12 10v7 M15 8v9 M18 6v11" strokeWidth="1.3"/>
      <circle cx="9"  cy="17" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="15" cy="17" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  chisq: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.8"/>
      <path d="M12 3v18 M3 12h18"/>
      <circle cx="7.5"  cy="7.5"  r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16.5" cy="7.5"  r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="7.5"  cy="16.5" r="0.9" fill="currentColor" stroke="none"/>
      <circle cx="16.5" cy="16.5" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  lm: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v18h18"/>
      <path d="M5.5 18 L 20 5.5"/>
      <circle cx="7"    cy="17"   r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="10.5" cy="13.5" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="13.5" cy="12.5" r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="16"   cy="9"    r="1.05" fill="currentColor" stroke="none"/>
      <circle cx="18.5" cy="7"    r="1.05" fill="currentColor" stroke="none"/>
      {/* residual tick — signals this is a FIT, not just scatter */}
      <path d="M13.5 12.5 v2.5" strokeDasharray="1 1.2" opacity="0.7"/>
    </svg>
  ),
  logit: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v18h18"/>
      <path d="M5 19 C 10 19, 11 6, 20 5"/>
      <path d="M4 12h16" strokeDasharray="1.4 1.6" opacity="0.5"/>
    </svg>
  ),
  anova: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      <rect x="3.5"  y="10" width="4" height="6" rx="0.5"/>
      <path d="M3.5 13h4 M5.5 6v4 M5.5 16v3 M4.2 6h2.6 M4.2 19h2.6"/>
      <rect x="10" y="7"  width="4" height="7" rx="0.5"/>
      <path d="M10 10.5h4 M12 3v4 M12 14v5 M10.7 3h2.6 M10.7 19h2.6"/>
      <rect x="16.5" y="12" width="4" height="4" rx="0.5"/>
      <path d="M16.5 14h4 M18.5 8v4 M18.5 16v3 M17.2 8h2.6 M17.2 19h2.6"/>
    </svg>
  ),
  diagnostic: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.8"/>
      <path d="M12 3v18 M3 12h18"/>
      {/* TP (top-left) highlighted + check */}
      <rect x="3.5" y="3.5" width="8.5" height="8.5" rx="1" fill="currentColor" opacity="0.18" stroke="none"/>
      <path d="M5.5 8l2 2 3-3.5" strokeWidth="1.5"/>
      {/* TN (bottom-right) highlighted */}
      <rect x="12" y="12" width="8.5" height="8.5" rx="1" fill="currentColor" opacity="0.18" stroke="none"/>
      <path d="M14.5 16.5l2 2 3-3.5" strokeWidth="1.5"/>
    </svg>
  ),
  power: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="13" r="8"/>
      <circle cx="11" cy="13" r="5"/>
      <circle cx="11" cy="13" r="2" fill="currentColor" stroke="none"/>
      {/* arrow striking the target */}
      <path d="M21 3 L 11 13" strokeWidth="1.6"/>
      <path d="M18 3h3v3" strokeWidth="1.4"/>
    </svg>
  ),
  cox: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* forest plot — HR CIs and points around the null */}
      <path d="M12 3v18" strokeDasharray="1.4 1.6" opacity="0.6"/>
      <path d="M6 6h8"/>
      <circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M6 6v1.5 M14 6v1.5" strokeWidth="1.3"/>
      <path d="M10 12h9"/>
      <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M10 12v1.5 M19 12v1.5" strokeWidth="1.3"/>
      <path d="M8 18h5"/>
      <circle cx="10" cy="18" r="1.5" fill="currentColor" stroke="none"/>
      <path d="M8 18v1.5 M13 18v1.5" strokeWidth="1.3"/>
    </svg>
  ),
  km: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3v18h18"/>
      {/* step-down survival curve */}
      <path d="M4 5 h3 v4 h3 v3 h3 v4 h3 v3 h4"/>
      {/* censor tick marks on steps */}
      <path d="M8.5 6.5 v2.5 M11.5 10.5 v2.5 M14.5 13.5 v2.5" strokeWidth="1.3"/>
    </svg>
  ),
  poisson: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      <rect x="3.5"  y="15" width="2.3" height="5"  rx="0.3"/>
      <rect x="6.6"  y="8"  width="2.3" height="12" rx="0.3"/>
      <rect x="9.7"  y="4"  width="2.3" height="16" rx="0.3"/>
      <rect x="12.8" y="7"  width="2.3" height="13" rx="0.3"/>
      <rect x="15.9" y="12" width="2.3" height="8"  rx="0.3"/>
      <rect x="19"   y="17" width="2.3" height="3"  rx="0.3"/>
    </svg>
  ),
  boot: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* circular resampling arrow around a small sample */}
      <path d="M20 12 A 8 8 0 1 1 12 4"/>
      <path d="M12 2 L 14 4 L 12 6" strokeWidth="1.4"/>
      <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none"/>
      <circle cx="13.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>
      <circle cx="11" cy="14" r="1.3" fill="currentColor" stroke="none"/>
    </svg>
  ),
};

// UI chrome icons — used inside buttons, headers, and status chips.
// Each is a self-contained <svg/> sized via CSS (w-X h-X on the parent span).
const UI_ICON = {
  bolt: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2 L 4 14 h6 l-2 8 11-13 h-7 z"/>
    </svg>
  ),
  notebook: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="1.6"/>
      <path d="M5 7h2 M5 11h2 M5 15h2 M5 19h2"/>
      <path d="M10 7h6 M10 11h6 M10 15h4"/>
    </svg>
  ),
  bulb: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6"/>
      <path d="M10 21h4"/>
      <path d="M8.5 14a5 5 0 1 1 7 0c-.8.7-1.5 1.5-1.5 2.5v1h-4v-1c0-1-.7-1.8-1.5-2.5z"/>
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5"/>
      <circle cx="12" cy="12" r="5"/>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5.5V20"/>
      <path d="M12 5.5C9.5 3.9 7 3.5 4 3.5a.5.5 0 0 0-.5.5v14a.5.5 0 0 0 .5.5c3 0 5.5.4 8 2 2.5-1.6 5-2 8-2a.5.5 0 0 0 .5-.5V4a.5.5 0 0 0-.5-.5c-3 0-5.5.4-8 2z"/>
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v12"/>
      <path d="M7 11l5 5 5-5"/>
      <path d="M4 20h16"/>
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-3-6.3"/>
      <path d="M20 3v5h-5"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="1.5"/>
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4.5 L 19 12 L 7 19.5 z"/>
    </svg>
  ),
  hourglass: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12 M6 21h12"/>
      <path d="M6 3c0 4 6 6 6 9 0 3-6 5-6 9"/>
      <path d="M18 3c0 4-6 6-6 9 0 3 6 5 6 9"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5 11-12"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* bell curve — not a ringing bell — matches CLT */}
      <path d="M3 19h18"/>
      <path d="M3.5 19 C 6 19, 8 17.5, 10 11 C 11 8, 11.5 7, 12 7 C 12.5 7, 13 8, 14 11 C 16 17.5, 18 19, 20.5 19"/>
      <circle cx="12" cy="7" r="1.3" fill="currentColor" stroke="none"/>
    </svg>
  ),
  stethoscope: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* ROC curve — L-shape rising to (1,1) */}
      <path d="M4 3v18h18"/>
      <path d="M4 21 C 6 9, 10 5, 21 4"/>
      <path d="M4 21 L 21 4" strokeDasharray="1.4 1.6" opacity="0.5"/>
    </svg>
  ),
  swap: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h14 l-3-3 M18 8 l-3 3"/>
      <path d="M20 16H6 l3-3 M6 16 l3 3"/>
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1.5"/>
      <path d="M9 3v18 M15 3v18 M3 9h18 M3 15h18"/>
      <circle cx="6" cy="6"   r="1" fill="currentColor" stroke="none"/>
      <circle cx="18" cy="6"  r="1" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="6" cy="18"  r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  dice: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/>
      <circle cx="8"  cy="8"  r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="8"  r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="8"  cy="16" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  beaker: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3.5h6"/>
      <path d="M10 3.5v5.7L4.6 19a1.2 1.2 0 0 0 1.05 1.8h12.7A1.2 1.2 0 0 0 19.4 19L14 9.2V3.5"/>
      <path d="M7.2 15.2h9.6"/>
    </svg>
  ),
  terminal: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.2"/>
      <path d="M3 8h18"/>
      <path d="M7 12l2.5 2.5L7 17"/>
      <path d="M12.5 17h4"/>
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 L 22 20 H 2 Z"/>
      <path d="M12 10v5"/>
      <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  package: (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5 L 12 3 L 21 7.5 V 17 L 12 21 L 3 17 Z"/>
      <path d="M3 7.5 L 12 12 L 21 7.5 M 12 12 V 21"/>
    </svg>
  ),
  ruler: (
    // CI bracket [——•——] — an estimate with bars on each end
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h18"/>
      <path d="M3 9v6 M21 9v6"/>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  mask: (
    // Biased spectacles — two circles connected (sampling frame metaphor)
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="13" r="4"/>
      <circle cx="17" cy="13" r="4"/>
      <path d="M11 13h2"/>
      <path d="M3 11 c1-3 3-3 4-3 M21 11 c-1-3-3-3-4-3"/>
    </svg>
  ),
  p: (
    // a "p" histogram bin — uniform stretched toward 0 (p-value dist)
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18"/>
      <rect x="3.5"  y="4"   width="2.3" height="16" rx="0.3"/>
      <rect x="6.6"  y="10"  width="2.3" height="10" rx="0.3"/>
      <rect x="9.7"  y="13"  width="2.3" height="7"  rx="0.3"/>
      <rect x="12.8" y="14"  width="2.3" height="6"  rx="0.3"/>
      <rect x="15.9" y="15"  width="2.3" height="5"  rx="0.3"/>
      <rect x="19"   y="15.5" width="2.3" height="4.5" rx="0.3"/>
    </svg>
  ),
  link: (
    // Two chain links — for "Share link" buttons
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14 a4 4 0 0 1 0-5.5 l2-2 a4 4 0 0 1 5.6 5.6 l-1.3 1.3"/>
      <path d="M14 10 a4 4 0 0 1 0 5.5 l-2 2 a4 4 0 0 1 -5.6 -5.6 l1.3 -1.3"/>
    </svg>
  ),
  image: (
    // Picture frame — for "Copy image" button
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <circle cx="8.5" cy="9.5" r="1.5"/>
      <path d="M4 18 l5-5 4 4 3-3 4 4"/>
    </svg>
  ),
};

// Custom SVG icon markup (raw inner <svg> contents) — used for badges,
// achievements, and any chrome where we previously dropped a Unicode emoji
// or typographic glyph. Single source of truth: Ico renders these inline
// (React) and buildShareCardSVG embeds the same paths in its 1200×630 SVG.
// All paths assume viewBox 0 0 24 24, stroke=currentColor, strokeWidth≈1.75.
const ICON_MARKUP: Record<string, string> = {
  // Badge & celebration icons (swapped in for emoji reward characters)
  droplet:         `<path d="M12 3 C 9 8 5 11 5 15 a7 7 0 0 0 14 0 c 0 -4 -4 -7 -7 -12 z"/>`,
  folder:          `<path d="M3 7.5 a 1.5 1.5 0 0 1 1.5 -1.5 H 9.5 l 2 2 H 19.5 A 1.5 1.5 0 0 1 21 9.5 V 18 a 1.5 1.5 0 0 1 -1.5 1.5 H 4.5 A 1.5 1.5 0 0 1 3 18 z"/>`,
  "medal-ribbon":  `<path d="M8 3 L 10.5 10.5 M 16 3 L 13.5 10.5 M 7 3 h 10"/><circle cx="12" cy="16" r="5"/><path d="M9.8 15.8 L 11.3 17.3 L 14.3 14"/>`,
  books:           `<rect x="4" y="4" width="3.5" height="16" rx="0.4"/><rect x="9.5" y="6" width="3.5" height="14" rx="0.4"/><path d="M15.5 6 l 4.5 1.2 l -2.9 13.8 l -4.5 -1.2 z"/>`,
  hundred:         `<path d="M4 7 h 3 v 10 h -3 z M 12.5 7 h 3 v 10 h -3 z M 17 7 h 3 v 10 h -3 z"/><path d="M7 9 h 3 M 7 15 h 3"/>`,
  flame:           `<path d="M12 3 C 12.5 7 16.5 9 16.5 14 a 5 5 0 0 1 -9 0 c 0 -2 1 -3.5 2 -4.5 C 10 11 11 11 11 8.5 c 0 -2 1 -3.5 1 -5.5 z"/>`,
  tree:            `<path d="M12 3 L 6 13 h 3 l -3 5 h 12 l -3 -5 h 3 z"/><path d="M11 18 v 3 h 2 v -3"/>`,
  globe:           `<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12 h 18"/>`,
  orb:             `<circle cx="12" cy="13" r="7"/><path d="M9 10.5 a 3 3 0 0 1 3 -3"/><path d="M18 4 l 0.6 1.6 L 20 6 l -1.4 0.6 L 18 8 l -0.6 -1.4 L 16 6 l 1.4 -0.4 z" fill="currentColor" stroke="none"/>`,
  shield:          `<path d="M12 3 L 4 6 v 6 c 0 4.5 3.5 8 8 9 4.5 -1 8 -4.5 8 -9 V 6 z"/><path d="M9 12 l 2 2 l 4 -4"/>`,
  swords:          `<path d="M3 4 L 13 14 L 11 16 L 4 9 z"/><path d="M3 4 h 2 L 13 14"/><path d="M21 4 L 11 14 L 13 16 L 20 9 z"/><path d="M21 4 h -2 L 11 14"/><path d="M7 17 L 10 20 M 17 17 L 14 20"/>`,
  magnifier:       `<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15 L 20 20"/>`,
  burst:           `<path d="M12 2 L 13.8 8.8 L 20.5 7.5 L 16.2 12 L 21 16.5 L 14.4 15.4 L 15 22 L 11.5 16.6 L 7 21 L 8 14.3 L 2 13 L 8 10 L 5 4.5 L 10.5 8 z"/>`,
  laptop:          `<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19 h 20"/><path d="M10 19 h 4"/>`,
  dna:             `<path d="M8 3 C 16 6 8 12 16 15 C 8 18 16 21 8 23" stroke-linejoin="round"/><path d="M16 3 C 8 6 16 12 8 15 C 16 18 8 21 16 23" stroke-linejoin="round"/><path d="M9 6 h 6 M 9.5 11 h 5 M 9.5 18 h 5 M 9 21 h 6" stroke-width="1.2"/>`,
  diamond:         `<path d="M6 3 h 12 l 4 6 l -10 12 l -10 -12 z"/><path d="M9 3 L 12 9 L 15 3 M 2 9 H 22"/>`,
  brain:           `<path d="M11.5 4.5 a 2.5 2.5 0 0 0 -5 0.5 a 2.5 2.5 0 0 0 -1.8 3.5 a 2.5 2.5 0 0 0 -0.2 4 a 2.5 2.5 0 0 0 1.5 3.5 a 2.5 2.5 0 0 0 2.5 3 h 3 z"/><path d="M12.5 4.5 a 2.5 2.5 0 0 1 5 0.5 a 2.5 2.5 0 0 1 1.8 3.5 a 2.5 2.5 0 0 1 0.2 4 a 2.5 2.5 0 0 1 -1.5 3.5 a 2.5 2.5 0 0 1 -2.5 3 h -3 z"/><path d="M12 4 v 15"/>`,
  compass:         `<circle cx="12" cy="12" r="9"/><path d="M15 9 L 13 13 L 9 15 L 11 11 z" fill="currentColor" stroke="none"/>`,
  calendar:        `<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10 h 18"/><path d="M8 3 v 4 M 16 3 v 4"/><circle cx="8"  cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14.5" r="1" fill="currentColor" stroke="none"/>`,
  "calendar-week": `<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10 h 18"/><path d="M8 3 v 4 M 16 3 v 4"/><path d="M6 13.5 h 12 M 6 17 h 12" stroke-width="1.2"/>`,
  recycle:         `<path d="M8 8 L 5 13 H 9 L 12 18 L 15 13 H 19 L 16 8"/><path d="M5 13 l -1 3 l 3 -1 M 12 18 l 3 -1 l -2 3 M 19 13 l 1 -3 l -3 1"/>`,
  cap:             `<path d="M2 9 L 12 5 L 22 9 L 12 13 z"/><path d="M6 10.5 V 16 C 6 17.5 9 18.5 12 18.5 s 6 -1 6 -2.5 V 10.5"/><path d="M22 9 V 14"/>`,
  trophy:          `<path d="M7 4 h 10 v 5 a 5 5 0 0 1 -10 0 z"/><path d="M7 6 H 4 c 0 3 1 5 3 5.5 M 17 6 H 20 c 0 3 -1 5 -3 5.5"/><path d="M10 14 h 4 v 4 h -4 z M 8 21 h 8"/>`,
  "star-shine":    `<path d="M12 3 L 14 9.5 L 20.5 10 L 15.5 14.5 L 17 21 L 12 17.5 L 7 21 L 8.5 14.5 L 3.5 10 L 10 9.5 z"/><circle cx="4" cy="4" r="0.8" fill="currentColor" stroke="none"/><circle cx="20" cy="19" r="0.8" fill="currentColor" stroke="none"/>`,
  stopwatch:       `<circle cx="12" cy="14" r="7"/><path d="M12 14 L 12 10 M 12 14 L 15 14"/><path d="M10 3 h 4 M 12 3 v 4 M 18.5 5.5 l 2 2"/>`,
  "chart-bar":     `<path d="M4 20 h 16"/><rect x="6"  y="12" width="3" height="8"  rx="0.4"/><rect x="11" y="7"  width="3" height="13" rx="0.4"/><rect x="16" y="14" width="3" height="6"  rx="0.4"/>`,
  scale:           `<path d="M12 4 v 17 M 4 21 h 16 M 4 7 h 16"/><path d="M7 7 L 4 13 a 3 3 0 0 0 6 0 z"/><path d="M17 7 L 14 13 a 3 3 0 0 0 6 0 z"/>`,
  "chart-up":      `<path d="M4 4 v 16 h 16"/><path d="M7 16 L 11 12 L 14 14 L 19 8"/><path d="M15 8 h 4 v 4"/>`,
  "set-square":    `<path d="M4 4 V 20 H 20 z"/><path d="M7 17 V 14 H 10"/>`,
  confetti:        `<path d="M4 20 L 9 5 L 19 15 z"/><circle cx="15" cy="4"  r="1" fill="currentColor" stroke="none"/><circle cx="20" cy="8"  r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="20" r="1" fill="currentColor" stroke="none"/><circle cx="4"  cy="5"  r="1" fill="currentColor" stroke="none"/>`,
  "thumbs-up":     `<path d="M6 21 H 4.5 a 1 1 0 0 1 -1 -1 V 11 a 1 1 0 0 1 1 -1 H 6 z"/><path d="M6 10 L 11 3 a 2 2 0 0 1 2 2 v 4 h 6 a 2 2 0 0 1 2 2 l -1.2 7 a 2 2 0 0 1 -2 2 H 6"/>`,
  clipboard:       `<rect x="5"  y="5" width="14" height="16" rx="1.5"/><rect x="8.5" y="3" width="7"  height="4"  rx="1"/><path d="M8 12 h 8 M 8 16 h 5"/>`,
  home:            `<path d="M3 11 L 12 3 L 21 11"/><path d="M5 10 V 20 h 5 v -6 h 4 v 6 h 5 V 10"/>`,
  lock:            `<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11 V 7 a 4 4 0 0 1 8 0 v 4"/>`,
  medal:           `<path d="M8 3 L 11 11 M 16 3 L 13 11 M 7 3 h 10"/><circle cx="12" cy="16" r="5"/><path d="M10 16 L 11.3 17.3 L 14 14.5"/>`,
  // Medal numerals use SVG <text> so the glyph is a real font character — much
  // more legible than hand-drawn paths and visually consistent across 1/2/3.
  // stroke="none" opts out of the inherited stroke so we get a clean filled glyph.
  "medal-1":       `<circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="800" fill="currentColor" stroke="none">1</text>`,
  "medal-2":       `<circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="800" fill="currentColor" stroke="none">2</text>`,
  "medal-3":       `<circle cx="12" cy="12" r="9"/><text x="12" y="16" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="12" font-weight="800" fill="currentColor" stroke="none">3</text>`,
  camera:          `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7 L 9 4 h 6 l 1 3"/><circle cx="12" cy="13.5" r="3.5"/>`,
  "alarm-clock":   `<circle cx="12" cy="13" r="7"/><path d="M12 9 V 13 L 15 15"/><path d="M5 5 L 3 7 M 19 5 l 2 2"/>`,
  refresh:         `<path d="M4 12 a 8 8 0 0 1 14 -5"/><path d="M18 3 v 5 h -5"/><path d="M20 12 a 8 8 0 0 1 -14 5"/><path d="M6 21 v -5 h 5"/>`,
  cross:           `<path d="M6 6 L 18 18 M 18 6 L 6 18" stroke-width="2.25"/>`,
  close:           `<path d="M6 6 L 18 18 M 18 6 L 6 18"/>`,
  star:            `<path d="M12 3 L 14.4 9.2 L 21 10 L 16 14.4 L 17.4 21 L 12 17.5 L 6.6 21 L 8 14.4 L 3 10 L 9.6 9.2 z" fill="currentColor" stroke="none"/>`,
  "arrow-up-right":`<path d="M7 17 L 17 7"/><path d="M9 7 h 8 v 8"/>`,
  flag:            `<path d="M5 3 V 21"/><path d="M5 4 H 18 L 15 8 L 18 12 H 5"/>`,
  "check-circle":  `<circle cx="12" cy="12" r="9"/><path d="M8 12 L 11 15 L 16 9"/>`,
  "cross-circle":  `<circle cx="12" cy="12" r="9"/><path d="M9 9 L 15 15 M 15 9 L 9 15"/>`,
};

// Wrap raw ICON_MARKUP inner-SVG strings into an <svg> and hand them to React
// via dangerouslySetInnerHTML. The existing UI_ICON / LESSON_ICON JSX maps
// still take precedence when a name is defined in both places.
function renderIconMarkup(name: string) {
  const inner = ICON_MARKUP[name];
  if (!inner) return null;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Build an SVG <g> fragment (string) for the given icon name, translated and
// scaled to the requested size. Used inside buildShareCardSVG where we emit
// raw SVG markup rather than React elements.
function iconSvgFragment(name: string, x: number, y: number, size: number, color = "#f1f5f9", strokeWidth = 2) {
  const inner = ICON_MARKUP[name];
  if (!inner) return "";
  const scale = size / 24;
  return `<g transform="translate(${x},${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
}

// Lightweight wrapper so we can write <Ico name="bolt" size={16}/>. Picks
// its color from the parent's text color via currentColor. An inline-flex
// span keeps it aligned with adjacent text (button labels, chip copy).
function Ico({ name, size = 16, className = "" }) {
  const svg = UI_ICON[name] || LESSON_ICON[name] || null;
  if (svg) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 align-[-0.15em] ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {svg}
      </span>
    );
  }
  const markup = renderIconMarkup(name);
  if (!markup) return null;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-[-0.15em] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

// Small inline branch icon — used next to branch names in text lines
// (Daily Challenge card, CaseSelect header, etc.). Picks up the branch's
// color and falls back to the emoji if an SVG isn't defined yet.
function BranchGlyph({ k, className = "w-4 h-4" }) {
  const b = BRANCHES[k];
  if (!b) return null;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-[-0.2em] ${className}`}
      style={{ color: b.color }}
      aria-hidden="true"
    >
      {BRANCH_ICON[k] || <Ico name={b.icon} size={16}/>}
    </span>
  );
}

export { NAV_ICON, BRANCH_ICON, LESSON_ICON, UI_ICON, ICON_MARKUP, renderIconMarkup, iconSvgFragment, Ico, BranchGlyph };
