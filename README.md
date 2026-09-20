# BioStat Quest

**A gamified biostatistics trainer for learners who want the _why_ behind the methods — not just the right answer for a quiz.**

Live: <https://www.biostatquest.com>

50 clinical / research case playthroughs. 1,019 authored questions plus 28 procedurally generated item families. 46 method deep-dives. Real R in your browser via WebR. FSRS-6 spaced repetition. Plays fully offline as a guest; optional sign-in syncs progress across devices.

**Everything is free.** Paid plans were withdrawn on 2026-09-17 — see [Access & pricing](#access--pricing).

---

## What's inside

**Content**
- **50 cases** across 8 biostatistics branches — manuscripts to critique, trials to design, studies to debug.
- **1,019 authored questions** — MCQ, multi-select, and numeric — every one method-tagged and de-duplicated (enforced by tests).
- **28 procedural item families** (`src/data/generators/`) that draw fresh parameterised questions on demand, so review sessions don't recycle the same wording. Metadata is loaded eagerly; the generator functions are code-split and pulled in only when a family is actually drawn.
- **46 method deep-dives** — intuition, formula, assumptions, pitfalls, primary-literature references.
- **Glossary** — 76 entries (16 concept · 8 measure · 6 design · 46 method), cross-linked to cases and methods.
- **Diagnostic assessment** — trust-first onboarding that scores a learner across branches and builds a personal study path.

**Play loop**
- Pick a case → pick a difficulty (Intern → Resident → Fellow → PI) → answer the question sequence in context.
- Streaks, time bonus, per-case perfect runs, level-ups — **28 badges** across 8 categories to unlock.
- Daily review powered by **FSRS-6** (via `ts-fsrs`) — missed questions come back exactly when you're about to forget them.
- **Adaptive selection** biases the picker toward the methods you're weakest on. Heuristic, not IRT — item-level calibration needs volume the bank hasn't seen yet.

**Practice exam** (`/exam`) — pick branches and a length, run a timed linear paper with no reveal and no FSRS grading, then review overall score, per-branch breakdown, and every question.

**Interactive Lab** (`/lab`) — six hands-on simulators (Power, CLT, ROC, Bayes, Regression, Bootstrap) that render live plots from slider-driven parameters.

**R Lab** (`/rlab`) — a full R environment in the browser via **WebR** (WebAssembly). 15 curated lessons from descriptive stats through Cox regression, each with editable code, inline base-graphics plots, a comprehension quiz, key takeaways, a stretch challenge, and related-lessons links. Nothing is sent to a server.

**Learner analytics**
- **Skill Tree** (`/tree`) — collapsible per-branch case browser with completion state.
- **Competency map** (`/competency`) — a per-branch ladder, plus a print-ready **Statement of Competency**. Rendered with `@media print` CSS so the browser saves the PDF; each issued statement gets a deterministic Doc ID recorded server-side and independently checkable at `/verify`.
- **My Misconceptions** (`/misconceptions`) — every misconception tag you've matched in the last 60 days, with the example question, the distractor that earned it, and its pedagogical correction.
- **AI explainer** — a single-turn, post-reveal explainer scoped to one question, behind a weekly quota. Deliberately narrow: no multi-turn chat, no reaching outside the question context. Runs through an AI gateway (default model `anthropic/claude-haiku-4-5`).

**Classes** (`/teach`, `/join`) — instructors create a class, invite by email or join code, and see a roster with per-student progress and class-level insights. Students join from an invite link or a code.

**Community**
- Opt-in public leaderboard (Supabase-backed, anonymised view).
- Achievement share cards — client-side 1200×630 SVG rasterised to PNG via canvas.
- Streak-at-risk nudge (in-app only, respects dismissal).

**Admin dashboard** (`/admin`, email-gated) — Overview, Users, Content, Activity, Telemetry, Waitlist, Reports. Live-session panel, needs-attention triage, question-accuracy and misconception telemetry, and traffic figures aggregated server-side over real time windows (see [`docs/admin-analytics-rpcs.sql`](docs/admin-analytics-rpcs.sql)).

---

## Access & pricing

BioStat Quest is **free for everyone**. There is no paid tier, no paywall, and nothing to buy.

Paid Pro plans and the institutional per-seat offer were withdrawn on **2026-09-17**. Nobody held an active paid subscription at the time, so there was no migration to run. The kill switch lives in two places that must stay in sync:

- `PAYMENTS_ENABLED` in [`src/lib/launchFlags.ts`](src/lib/launchFlags.ts) — client gating. While `false`, `effectivelyPro()` returns true for everyone and no checkout surface is rendered or routed.
- `PAYMENTS_ENABLED` in [`api/_lib/payments.ts`](api/_lib/payments.ts) — the real enforcement point. Every money-moving endpoint answers `410 Gone`. The UI removal is convenience, not security: a stale tab or a hand-rolled POST still hits this.

Webhook handlers are deliberately **not** switched off — they're inbound-only and staying live means a late provider retry still reconciles.

The Stripe and Lemon Squeezy integrations remain in the tree, dormant, so sales can be re-opened without rebuilding them. To do that: flip both flags, restore the pricing sections in `index.html` / `for-educators.html` from git history, and re-add the `upgrade` route. Provider wiring notes are in [`STRIPE_SETUP.md`](STRIPE_SETUP.md) and [`docs/lemonsqueezy-setup.md`](docs/lemonsqueezy-setup.md).

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5.6 |
| Styling | Tailwind v4 (via `@tailwindcss/vite`) + hand-authored dark-theme CSS tokens |
| Design system | `src/design/` — Btn, Card, Chip, Field, Stat, SectionLabel + tokens, with a11y and token tests |
| State | `useState` + `localStorage` (guest) → Supabase sync (signed-in) |
| Auth / sync | Supabase (magic link + optional Google OAuth), RLS-secured per-user rows |
| Spaced repetition | `ts-fsrs` — FSRS-6 algorithm |
| In-browser R | [WebR](https://docs.r-wasm.org/webr/) loaded lazily, cached by the browser |
| Serverless | Vercel functions under `api/` (dispatcher routes to stay inside the Hobby 12-function cap) |
| Email | Resend (re-engagement + health alerts); Cloudflare Email Routing for inbound |
| Payments | Stripe + Lemon Squeezy, both **dormant** (see above) |
| Hosting | Vercel (static + serverless), deployed to `biostatquest.com` |
| Tests | Vitest — 6,805 assertions across 33 files |
| Analytics | Vercel Analytics + a first-party `events` table, both gated on cookie consent |

Everything is a module-imported TS / TSX file. The earlier single-HTML / Babel-in-browser monolith is gone.

---

## Project structure

```
BioStatQuest/
├── index.html             # Landing page (static, dark theme, marketing)
├── biostat-quest.html     # The app shell — mounts src/main.tsx via Vite
├── about.html  sources.html  for-educators.html
├── privacy.html  terms.html  cookies.html  verify.html
├── src/
│   ├── App.tsx            # App core (~8,300 lines — see note below)
│   ├── main.tsx           # React bootstrap
│   ├── styles.css         # Tailwind v4 + app design tokens
│   ├── styles-legacy.css  # Pre-Tailwind classes still referenced by older views
│   ├── components/        # CasePlay · DeepDive · TeachView · JoinView · AuthButton
│   │                      # SubscriptionPanel · SimulationReveal · MyClassesBand · Icons · Confetti
│   ├── views/             # Exam · Competency · SkillTree · Glossary · MyMisconceptions
│   ├── design/            # Design-system primitives + tokens
│   ├── data/
│   │   ├── branches.ts         # 8 branch definitions
│   │   ├── cases.ts            # 50 cases, 1,019 questions
│   │   ├── caseNarratives.ts   # Per-case act structure / story beats
│   │   ├── methods.ts          # 46 method deep-dives
│   │   ├── glossary.ts         # 76 glossary entries + search normaliser
│   │   ├── diagnostic.ts       # Onboarding diagnostic bank + scorer
│   │   └── generators/         # 28 procedural item families + lazy loader + manifest
│   └── lib/                    # auth · access · billing · classesApi · srs · adaptive
│                               # exam · competency · misconceptions · insightsRollup
│                               # stats · simulate · streak · xp · launchFlags · viewRoutes …
├── api/
│   ├── _lib/              # authed · supabaseAdmin · stripe · ls · payments · health
│   ├── _classes/          # Nine classes handlers (underscore = not routed directly)
│   ├── classes/[action].ts    # Dispatcher → _classes/*
│   ├── billing/[action].ts    # Dispatcher → checkout · portal · cancel (all 410 today)
│   ├── ai/explain.ts          # Single-turn question explainer
│   ├── statements/issue.ts    # Record an issued Statement of Competency
│   ├── verify.ts              # Public Doc-ID verification
│   ├── health.ts              # Sign-in path probes
│   ├── cron/                  # reengagement (daily 10:00 UTC) · healthcheck (07:00 UTC)
│   └── {stripe,lemonsqueezy}/webhook.ts   # Inbound only — intentionally still live
├── docs/                  # classes-design · v2-strategy · uptime-monitoring
│                          # lemonsqueezy-setup · admin-analytics-rpcs.sql · SQL utilities
├── public/                # Static assets (favicon, OG image)
├── scripts/generate-og.mjs
├── email-templates/       # Supabase transactional email templates
├── supabase_schema.sql              # Core: user_progress, events, reports, reviews, leaderboard
├── supabase_schema_v2.sql           # question_attempts, ai_chats, misconception + admin RPCs
├── supabase_schema_v3_statements.sql# statements (Statement of Competency)
├── supabase_schema_classes.sql      # institutions, classes, class_members, class_invites
├── supabase_schema_billing_provider.sql  # billing_provider column migration
├── vite.config.ts         # Multi-entry build (9 HTML pages) + manual vendor chunks
├── vercel.json            # Crons, clean URLs, SPA rewrites, headers, caching
└── tsconfig*.json
```

**On the size of `App.tsx`:** it's down from ~9,200 to ~8,300 lines as views and components were extracted, and extraction continues where a route can be made lazy-loadable. It stays large on purpose during the content-heavy phase — faster to iterate, no cross-file refactors when the shape of a case changes. Sections are marked with banner comments (search `// ====`).

---

## Local development

```bash
npm install
npm run dev        # Vite dev server, default http://localhost:5173
npm run typecheck  # tsc -b --noEmit
npm run test       # vitest — runs the full suite
npm run build      # tsc -b && vite build → dist/
npm run preview    # preview the production build
npm run og         # regenerate public/og-image.png from og-image.svg
```

Zero config needed to explore — guest mode works out of the box and stores progress in `localStorage`.

### Environment variables

Nothing is required for guest-mode dev. Add a `.env.local` when wiring optional features.

```bash
# --- Client (VITE_*, shipped in the bundle) ---
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_GOOGLE_AUTH_ENABLED=true          # render the Google sign-in button
VITE_BQ_ADMIN_EMAILS=you@example.com   # comma-separated; gates the /admin UI
VITE_OPEN_BETA_PRO=false               # legacy open-beta override; inert while payments are off

# --- Server only (never exposed to the client) ---
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
CRON_SECRET=<random 32+ chars>         # Vercel sends this to /api/cron/*

# AI explainer
AI_GATEWAY_URL=https://api.groq.com/openai/v1/chat/completions
AI_GATEWAY_API_KEY=...
AI_GATEWAY_MODEL=anthropic/claude-haiku-4-5
AI_FREE_WEEKLY_QUOTA=5

# Email (Resend) — re-engagement cron + health alerts
RESEND_API_KEY=re_...
REENGAGEMENT_FROM=...   REENGAGEMENT_DORMANT_DAYS=...   REENGAGEMENT_DRY_RUN=true
HEALTHCHECK_FROM=...    HEALTHCHECK_ALERT_TO=...

# Payments — only needed if sales are re-opened
STRIPE_SECRET_KEY=sk_...   STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...   STRIPE_PRICE_ID_YEARLY=price_...
LEMONSQUEEZY_TEST_MODE=false
```

The Supabase anon key is safe to ship — RLS enforces per-user isolation. The service-role, AI, email, and payment keys must stay server-side.

**`VITE_BQ_ADMIN_EMAILS` is a UX gate only.** The security boundary is the admin email check inside the SECURITY DEFINER functions in `supabase_schema_v2.sql` and `docs/admin-analytics-rpcs.sql` — keep the two lists in sync.

---

## Deploying

**Recommended:** Vercel. Zero config.

```bash
npx vercel          # preview deploy
npx vercel --prod   # production
```

Vercel auto-detects the Vite build and the `api/` functions. `vercel.json` sets security headers, long-lived asset caching, short-lived HTML caching, clean URLs, the SPA rewrites for every in-app route, and the two cron schedules.

**Function budget:** Vercel Hobby caps a deployment at 12 serverless functions, which is why `api/classes/[action].ts` and `api/billing/[action].ts` are dispatchers over handlers in `_`-prefixed directories rather than one file per endpoint. Add new endpoints to a dispatcher, not as new top-level files.

**Email** — inbound on `info@biostatquest.com` via Cloudflare Email Routing (free); outbound via Resend.

**DNS checklist (once)**
- Point the domain at Vercel (`A` or `CNAME` per Vercel's instructions)
- Cloudflare Email Routing adds the MX + TXT records automatically
- (Optional) DMARC TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:info@biostatquest.com`

**Uptime** — `/api/health` probes the sign-in path for an external monitor; `api/cron/healthcheck.ts` is the in-repo backstop. See [`docs/uptime-monitoring.md`](docs/uptime-monitoring.md).

---

## Supabase setup

1. Create a project at <https://supabase.com>.
2. In the SQL editor, run the schema files **in this order** — each is idempotent and re-runnable:

   | File | Adds |
   |---|---|
   | `supabase_schema.sql` | `user_progress`, `events`, `question_reports`, `reviews`, `email_signups`, `email_sends`, the anonymised `leaderboard` view, RLS policies |
   | `supabase_schema_v2.sql` | `question_attempts`, `ai_chats`, misconception RPCs, admin telemetry RPCs |
   | `supabase_schema_v3_statements.sql` | `statements` (Statement of Competency) |
   | `supabase_schema_classes.sql` | `institutions`, `classes`, `class_members`, `class_invites` |
   | `supabase_schema_billing_provider.sql` | `billing_provider` column on `user_progress` |
   | `docs/admin-analytics-rpcs.sql` | Server-side admin analytics aggregation + `admin_emails()` |

3. Project Settings → API → copy the **URL** and **anon public** key into `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Authentication → URL Configuration → add the production domain to the redirect allowlist.
5. Redeploy. Magic-link login works immediately.

**Google OAuth (optional):** Supabase → Authentication → Providers → Google, then set `VITE_GOOGLE_AUTH_ENABLED=true`.

**Transactional email:** the templates in `email-templates/` are branded to match the app. Copy each `*.html` into Supabase → Authentication → Email Templates. See `email-templates/SETUP.md`.

---

## Testing

**6,805 assertions across 33 files.** The content bank carries most of them (`src/data/cases.test.ts`), with unit tests for every `src/lib/` module, a11y tests over the design system, and component tests for the case-play surfaces.

What the content tests enforce:

- Every MCQ has exactly one correct option
- Every `method:` tag references a real method in `methods.ts`
- Every case `branch:` references a real branch
- No duplicate `qid`s across the entire bank
- Numeric questions have finite, non-NaN answers and tolerances
- Generator families produce valid, in-range items across seeds
- Glossary cross-references resolve, 1:1 with `METHODS`

Run before every commit:

```bash
npm run test && npm run typecheck && npm run build
```

Content authoring uses a small `Q(...)` helper in `cases.ts` that auto-wires `qid`s and method tags. See the top of `cases.ts` for conventions, or the `biostatquest-add-question` skill if you have it.

---

## Content & methodology

- Questions, explanations, and deep-dives are personally authored and reviewed — not paraphrased from another source.
- Every method deep-dive links to primary literature. The full index is on [`/sources.html`](sources.html) — filterable by branch, searchable by keyword.
- Content changes are logged publicly in [`CONTENT_CHANGELOG.md`](CONTENT_CHANGELOG.md).

---

## Privacy

- **Guest mode:** everything in `localStorage`, nothing leaves the browser.
- **Signed-in:** your email and a progress JSON (XP, SRS schedule, per-case scores) in Supabase, with RLS enforcing per-user isolation. Deletable on request.
- **Analytics are opt-in.** The cookie banner gates the first-party `events` table, the pseudonymous `visitor_id`, and landing-variant tagging. Decline and none of them are written — not even for signed-in users.
- Vercel Analytics collects no personal identifiers.
- Full policy: [`/privacy.html`](privacy.html) · cookie detail: [`/cookies.html`](cookies.html).

---

## License & contribution

Content is all-rights-reserved. Corrections, reports, and suggestions are very welcome — email <info@biostatquest.com> or open an issue. Every report is read.

---

## Author

Built by **Selçuk Korkmaz, PhD** — researcher in biostatistics and applied statistical methodology, author of several R packages on CRAN.
[Website](https://selcukorkmaz.github.io/) · [GitHub](https://github.com/selcukorkmaz) · [Scholar](https://scholar.google.com/citations?user=TKOcnUwAAAAJ)
