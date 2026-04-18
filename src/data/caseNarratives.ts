// Authored case narratives — optional per case.
//
// A narrative upgrades a case from "flat story + random question slice" into a
// 4-act authored encounter: briefing → triage → reveal → recommendation → resolution.
//
// Cases without an entry here fall back to the existing flat loop. The runtime
// checks `getNarrative(caseId)` at each render point (CaseSelect briefing,
// CasePlay act intros, CaseResult resolution) and degrades gracefully.
//
// Canonical path: each act specifies `qids` in the order they should be asked.
// The flat concatenation of all acts' qids is the 6-question path pickQuestions
// returns for a narrative case. Replays use the same canonical path — consistent
// feel matters more than variety for a flagship case.

export type CaseBeat = {
  id: string;
  title: string;         // "Act 1 · Triage the problem"
  hook: string;          // One-paragraph scene-set shown at the start of the act
  reveal?: string;       // Optional mid-case reveal card (typically on Act 2+)
  qids: string[];        // Ordered qids belonging to this act
};

export type CaseResolution = {
  headline: string;      // One-liner closing the scene
  whatHappened: string;  // What the scenario actually played out as
  correctMove: string;   // The right statistical move and why
  costOfError: string;   // What the wrong call would have cost
};

export type CaseNarrative = {
  role: string;          // "You are ..."
  setting: string;       // Where/when this encounter happens
  stakes: string;        // One line: why the decision matters now
  decisionPrompt: string;// The question the case is ultimately asking
  arcSummary: string;    // "6 questions · 2 data reveals · 1 final call" (shown in briefing)
  acts: CaseBeat[];
  closingResolution: CaseResolution;
};

export const CASE_NARRATIVES: Record<string, CaseNarrative> = {
  // ------------------------------------------------------------------
  // p1 — The Screening Test Paradox
  // Flagship reference case. The authoring voice aims for a senior
  // mentor in a committee room: pressured, numerate, concrete.
  // ------------------------------------------------------------------
  p1: {
    role: "You are the biostatistician on the hospital screening committee.",
    setting: "Committee room, 8:45am. The board votes on the rollout at 9:30.",
    stakes:
      "A vote in your favor means 50,000 people screened this year. A bad PPV means hundreds of unnecessary confirmatory workups — and the anxiety that goes with them. A no-vote means ~95 real cases stay undetected until symptoms.",
    decisionPrompt:
      "Do you recommend approving the population-wide rollout as proposed?",
    arcSummary: "7 questions · 2 reveals · 1 final recommendation",
    acts: [
      {
        id: "triage",
        title: "Act 1 · Triage the numbers",
        hook:
          "The PI just handed you a slide deck: \"95% sensitive, 95% specific — a great test.\" Prevalence in the target cohort is cited at 1%. You have fifteen minutes to sanity-check the numbers before the board votes. Start with the 2×2 and see what the real-world PPV looks like.",
        qids: ["p1_0", "p1_1", "p1_2", "p1_3"],
      },
      {
        id: "complication",
        title: "Act 2 · New information",
        hook:
          "You're packing up your calculations when the PI circulates a revised memo. The pilot audit on last year's cohort found the actual prevalence is closer to **0.3%**, not 1%. The 2×2 you just built is wrong — it was too generous.",
        reveal:
          "The principle generalizes: even near-perfect tests fall apart at very low prevalence. Before you go back into the room, make sure you know where the floor is.",
        qids: ["p1_6", "p1_20"],
      },
      {
        id: "commit",
        title: "Act 3 · Make the call",
        hook:
          "The board reconvenes. One senior member pushes back: \"If the false-positive rate is the problem, just make the test more specific — problem solved.\" You have one minute. You need to name the bias that's driving the confusion and land a defensible recommendation.",
        qids: ["p1_21"],
      },
    ],
    closingResolution: {
      headline:
        "The committee deferred. Six months later, screening launched as a two-step protocol.",
      whatHappened:
        "Your analysis changed the rollout. The committee declined the single-test population screen and asked the PI to redesign: a high-sensitivity initial screen (catch everyone who might have the disease), followed by a high-specificity confirmatory test only on positives (rule in the ones who really do). Pilot ran for six months in a narrower, higher-prevalence cohort before expanding.",
      correctMove:
        "When a test produces P(test+ | disease), you have to multiply through by the base rate to get what the patient actually cares about: P(disease | test+). That is PPV. At low prevalence, even a 95/95 test has a PPV near 16% — most positives are false. The textbook failure mode is **base-rate neglect**: treating P(test+ | disease) and P(disease | test+) as the same number.",
      costOfError:
        "Had the single-test rollout been approved: roughly 500 false-positive confirmatory workups per year for every ~95 true cases caught. The invasive confirmatory test carries a ~0.5% complication rate. The expected harm from false-positive workups would have exceeded the benefit of earlier detection.",
    },
  },
};

export function getNarrative(caseId: string): CaseNarrative | null {
  return CASE_NARRATIVES[caseId] || null;
}

// Flat canonical question list for a narrative case.
export function getNarrativeQids(caseId: string): string[] {
  const n = CASE_NARRATIVES[caseId];
  if (!n) return [];
  return n.acts.flatMap((a) => a.qids);
}

// Which act (if any) does this question belong to? Returns act + index within
// the act. Used at runtime to decide whether to show an act-intro transition
// card before the current question.
export function getActForQid(caseId: string, qid: string): { act: CaseBeat; indexInAct: number; actIndex: number } | null {
  const n = CASE_NARRATIVES[caseId];
  if (!n) return null;
  for (let ai = 0; ai < n.acts.length; ai++) {
    const act = n.acts[ai];
    const i = act.qids.indexOf(qid);
    if (i >= 0) return { act, indexInAct: i, actIndex: ai };
  }
  return null;
}
