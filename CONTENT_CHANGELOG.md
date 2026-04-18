# Content Changelog

Every content-facing change to the question bank, explanations, glossary, or
authored narratives is logged here. Public-facing. The goal is to make trust
legible: users, reviewers, and institutions can see exactly what changed and why.

Conventions:
- One entry per content change. Bundle adjacent fixes within the same batch.
- Format: `YYYY-MM-DD — qid(s) — category — short note`.
- Categories: `correctness` (answer key or explanation wrong), `clarity`
  (rewording, unchanged semantics), `distractor` (distractor quality fix),
  `format` (punctuation, whitespace), `meta` (method tag, difficulty, tol).

---

## 2026-04-18 — Length-bias sweep (Phases I–O)

- 146 questions — `distractor` — Expanded short distractors to remove answer-length
  bias (correct answer was systematically longer than wrong options, letting
  test-takers pick "the long one" and win). Correct answers and `explain` fields
  preserved verbatim; only distractors were lengthened.
- 0 items remain with length ratio ≥ 1.8×.

## 2026-04-17 — Quality Phase 1 (pre-length-bias)

- 4 items — `correctness` — Numeric tolerance bugs fixed (tol too tight or too loose).
- 28 items — `distractor` — Giveaway distractors replaced ("same as placebo",
  tautologies, obvious nonsense).
- 30 items — `clarity` — Explanations extended from single-clause stubs to full
  reasoning sentences.

## Audit cadence

- Target: 50 highest-risk questions reviewed per week.
- Risk score: `difficulty_tier × method_complexity × explanation_length`.
- Reviewer: Selçuk Korkmaz (single-reviewer model, signed off publicly).
- Triage of user-submitted `question_reports` resolves in < 72 h.
