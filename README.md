# BioStat Quest

**A gamified biostatistics trainer for learners who want the _why_ behind the methods — not just the right answer for a quiz.**

Live: <https://www.biostatquest.com>

50 clinical / research case playthroughs. 1,000 questions. 42 method deep-dives. Real R in your browser via WebR. FSRS-6 spaced repetition. Plays fully offline as a guest; optional sign-in syncs progress across devices.

---

## What's inside

**Content**
- **50 cases** across 8 biostatistics branches — manuscripts to critique, trials to design, studies to debug.
- **1,000 questions** — MCQ, multi-select, and numeric — every one method-tagged and de-duplicated (enforced by tests).
- **42 method deep-dives** — intuition, formula, assumptions, pitfalls, primary-literature references.
- **Glossary** — 30+ concept / measure / design / method entries, cross-linked to cases and methods.
- **Diagnostic assessment** — trust-first onboarding that scores a learner across branches and builds a personal 3-case study path.

**Play loop**
- Pick a case → pick a difficulty (Resident → Fellow → PI) → answer the question sequence in context.
- Streaks, time bonus, per-case perfect runs, level-ups — 28 badges across 8 categories to unlock.
- Daily review powered by **FSRS-6** (the current state-of-the-art spaced-repetition scheduler, via `ts-fsrs`) — missed questions come back exactly when you're about to forget them.

**Interactive Lab** — nine hands-on simulators (Power, CLT, ROC, Bayes, regression, bootstrap, multiple-testing, Simpson's paradox, CI coverage) that render live D3-style plots from slider-driven parameters.

**R Lab** — a full R environment in the browser via **WebR** (WebAssembly). 15 curated lessons from descriptive stats through Cox regression, each with editable code, inline base-graphics plots, a comprehension quiz, key takeaways, a stretch challenge, and related-lessons links. Nothing is sent to a server.

**Community**
- Opt-in public leaderboard (Supabase-backed, anonymised view).
- Achievement share cards — client-side 1200×630 SVG rasterised to PNG via canvas. Copy to clipboard, native share, or PNG download.
- Streak-at-risk nudge (in-app only, respects dismissal) for users about to break their streak.

**Monetization (scaffolded)**
- Stripe Checkout + Customer Portal wired via serverless Vercel functions. Free tier ships ~half the library; **Pro** ($9 / mo or $79 / yr, editable) unlocks the remaining cases, FSRS-6 scheduling, and per-method mastery analytics. See [`STRIPE_SETUP.md`](STRIPE_SETUP.md) for activation (~30 min).

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite 5 + React 18 + TypeScript |
| Styling | Tailwind v4 (via `@tailwindcss/vite`) + hand-authored dark-theme CSS tokens |
| State | `useState` + `localStorage` (guest) → Supabase sync (signed-in) |
| Auth / sync | Supabase (magic link + Google OAuth), RLS-secured per-user rows |
| Spaced repetition | `ts-fsrs` — FSRS-6 algorithm |
| In-browser R | [WebR](https://docs.r-wasm.org/webr/) loaded lazily, cached by the browser |
| Payments | Stripe (serverless functions under `api/stripe/*`) |
| Hosting | Vercel (static + serverless), deployed to `biostatquest.com` |
| Tests | Vitest (6 000+ structural tests over the content bank) |
| Analytics | Plausible (optional) + Vercel Analytics |

Everything is a module-imported TS / TSX file now. The earlier single-HTML / Babel-in-browser monolith is gone.

---

## Project structure

```
BioStatQuest/
├── index.html             # Landing page (static, dark theme, marketing)
├── biostat-quest.html     # The app shell — mounts src/main.tsx via Vite
├── about.html             # About page (static)
├── sources.html           # Sources page — 42 methods with filters/search/chips
├── privacy.html           # Privacy policy (static)
├── src/
│   ├── App.tsx            # Single-file app (~9,200 lines — see note below)
│   ├── main.tsx           # React bootstrap
│   ├── styles.css         # Tailwind v4 + app design tokens
│   ├── components/        # (intentionally empty — everything is in App.tsx)
│   ├── data/
│   │   ├── branches.ts         # 8 branch definitions (id, name, color, icon)
│   │   ├── cases.ts            # 50 cases, 1,000 questions
│   │   ├── caseNarratives.ts   # Per-case act structure / story beats
│   │   ├── methods.ts          # 42 method deep-dives
│   │   ├── glossary.ts         # 30+ glossary entries + search normaliser
│   │   ├── diagnostic.ts       # Onboarding diagnostic bank + scorer
│   │   ├── cases.test.ts       # Structural tests over cases.ts (6 000+ assertions)
│   │   └── glossary.test.ts    # Structural tests over glossary.ts
│   └── lib/
│       └── auth.ts        # Supabase wrapper (auth + remote state sync + realtime leaderboard)
├── api/
│   ├── _lib/              # Shared: Stripe client, Supabase admin
│   └── stripe/            # checkout.ts · portal.ts · webhook.ts
├── public/                # Static assets (favicon, OG image)
├── scripts/
│   └── generate-og.mjs    # Rebuilds og-image.png from og-image.svg (run `npm run og`)
├── email-templates/       # Supabase transactional email templates
├── supabase_schema.sql    # DB schema + RLS policies + leaderboard view
├── STRIPE_SETUP.md        # Step-by-step Stripe wiring guide
├── CONTENT_CHANGELOG.md   # Public-facing content-change log
├── vite.config.ts         # Multi-entry build (5 HTML pages)
├── vercel.json            # Headers, caching, clean URLs
└── tsconfig*.json         # TS config (app / node)
```

**On the monolithic `App.tsx`:** yes, 9,200 lines is a lot. The app is intentionally a single file during the content-heavy phase — faster to iterate, zero cross-file refactors when the shape of a case changes. Components are clearly sectioned with banner comments (search `// ====` in `App.tsx`). Split when the content stabilises, not before.

---

## Local development

```bash
npm install
npm run dev        # Vite dev server, default http://localhost:5173
npm run typecheck  # tsc --noEmit over src/
npm run test       # vitest — runs the structural test suite
npm run build      # tsc -b && vite build → dist/
npm run preview    # preview the production build
npm run og         # regenerate public/og-image.png from og-image.svg
```

Zero config needed to explore — guest mode works out of the box, stores progress in `localStorage`.

### Environment variables (optional)

Drop a `.env.local` with the variables below when wiring up optional features. Nothing is required for guest-mode dev.

```bash
# Supabase (auth + progress sync)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Stripe serverless functions (deploy-side, NOT exposed to the client)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_MONTHLY=price_...
STRIPE_PRICE_ID_YEARLY=price_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

The Supabase anon key is safe to ship in the bundle — RLS enforces per-user isolation. The service-role and Stripe keys must stay on the server.

---

## Deploying

**Recommended:** Vercel. Zero config.

```bash
npx vercel          # preview deploy
npx vercel --prod   # production
```

Vercel auto-detects the Vite build and the `api/` serverless functions. `vercel.json` already sets security headers, long-lived asset caching, and short-lived HTML caching.

**Email** — receiving on `info@biostatquest.com` is handled by Cloudflare Email Routing (free). See `DNS` note below.

**DNS checklist (once)**
- Point domain at Vercel (`A` or `CNAME` per Vercel's instructions)
- Cloudflare Email Routing enables the MX + TXT records automatically
- (Optional) Add DMARC TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:info@biostatquest.com`

---

## Optional: enable accounts & cross-device sync

1. Create a Supabase project at <https://supabase.com>.
2. In the SQL editor, paste & run `supabase_schema.sql`. It creates the `users_progress` table, RLS policies, and the anonymised `public.leaderboard` view.
3. Project Settings → API → copy the **URL** and **anon public** key into `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Authentication → URL Configuration → add your production domain to the redirect URLs allowlist.
5. Redeploy. Magic-link login works immediately.

**Google OAuth (optional):** Supabase → Authentication → Providers → Google → follow Supabase's guide. Authorized redirect URI goes back to your Supabase project.

**Transactional email:** the Supabase templates in `email-templates/` are branded to match the app. Copy each `*.html` into Supabase → Authentication → Email Templates. See `email-templates/SETUP.md`.

## Optional: enable Stripe billing

Follow `STRIPE_SETUP.md` end-to-end. In short: create the Pro product + two prices, copy price IDs into env, wire the webhook endpoint to `/api/stripe/webhook`, and flip on in production.

---

## Testing

The content bank is validated by **6 000+ structural assertions** in `src/data/cases.test.ts` and `glossary.test.ts`:

- Every question has exactly one correct option (for MCQ)
- Every `method:` tag references a real method in `methods.ts`
- Every case `branch:` references a real branch
- No duplicate `qid`s across the entire bank
- Numeric questions have finite, non-NaN answers and tolerances
- Glossary cross-references resolve

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
- **Signed-in:** only your email and a progress JSON (XP, SRS schedule, per-case scores) are stored in Supabase. RLS guarantees per-user isolation. Deletable on request.
- **Analytics:** Plausible (cookie-less, aggregate) + Vercel Analytics (no personal identifiers).
- Full policy: [`/privacy.html`](privacy.html).

---

## License & contribution

Content currently all-rights-reserved during the private beta. Corrections, reports, and suggestions are very welcome — email <info@biostatquest.com> or open an issue. Every report is read.

---

## Author

Built by **Selçuk Korkmaz, PhD** — researcher in biostatistics and applied statistical methodology, author of several R packages on CRAN.
[Website](https://selcukorkmaz.github.io/) · [GitHub](https://github.com/selcukorkmaz) · [Scholar](https://scholar.google.com/citations?user=TKOcnUwAAAAJ)
