<claude-mem-context>
# Memory Context

# [BioStatQuest] recent context, 2026-05-01 6:19pm GMT+3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,494t read) | 1,331,361t work | 98% savings

### Apr 21, 2026
4 9:10p 🟣 Glossary Promotional Image Generated via Headless Chrome HTML Rendering
5 " 🔵 BioStatQuest Glossary Data: 31 Core Entries + Method-Derived Entries from methods.ts
### Apr 25, 2026
16 2:35a 🔵 BioStatQuest Deep Dive Matching Quality Requirements Identified
17 2:36a 🔵 BioStatQuest Deep Dive Architecture: Method-Keyed Panel with No Question-Level Matching
18 " 🔵 BioStatQuest Case Context Rendering Logic Fully Mapped in CasePlay.tsx
19 " 🔵 BioStatQuest Data Scale: 1,019 Questions, 49 Cases, 42 Methods — Context Coverage Gap Quantified
20 2:37a 🔵 methods.ts Content Confirms Deep Dive Mismatch — clt_sampling Covers CLT Math Not Sampling Taxonomy
22 2:41a 🔵 glossary.test.ts Enforces 1:1 METHODS-to-GLOSSARY Coverage Constraint
25 " 🔴 P2 Pilot: Case p2 Question Method Remapping and Standalone Flags Applied
26 " 🟣 All 6,163 BioStatQuest Tests Pass After P2 Pilot Changes
27 2:43a 🔵 BioStatQuest cases.ts Full Case Inventory — 49 Cases Mapped
29 " 🟣 Case f1 — standalone:true Added to 7 Context-Independent Questions
### May 1, 2026
54 9:08a 🔵 OpenClaw GitHub Release Info — macOS ARM64 Install Attempt
55 " 🔵 OpenClaw v0.3 Release Asset is Windows-Only
56 " 🔵 OpenClaw macOS Build Requirements and Game Data Dependencies
57 9:09a 🔵 OpenClaw (openclaw.ai) is an AI Assistant — Different Product Than Game Reimplementation
58 " 🔵 OpenClaw Install Script Inspected Before Execution
59 " 🔵 OpenClaw Installer Architecture — Key Functions Mapped
60 9:10a 🟣 OpenClaw AI Assistant Successfully Installed on macOS
61 12:45p ⚖️ BioStat Quest 2.0 Product Strategy Planning Initiated
62 12:55p 🔵 BioStatQuest v1 Architecture Deep-Dive for v2.0 Planning
63 " 🔵 BioStatQuest v1 Full Architecture Inventory — State, Auth, SRS, Branches, and Dev History
64 " 🔵 BioStatQuest v1 Full Content and Backend Inventory — 50 Cases, 49 Methods, Vercel API Routes
66 " 🔵 BioStatQuest v1.0 Complete Architecture Snapshot — Full Report for v2.0 Planning
67 " ⚖️ BioStatQuest Free vs Pro Tier Feature Allocation Strategy Defined
65 12:56p 🔵 Vercel API Auth Pattern — Direct GoTrue JWT Validation Instead of SDK
68 1:07p ⚖️ User Confirmed: Save v2.0 Strategy to docs/v2-strategy.md
69 1:19p 🟣 Section 15 "Tier Strategy" Appended to docs/v2-strategy.md
70 2:50p ⚖️ F1 Phase-0 Kickoff with Parallel Lemon Squeezy Setup
71 2:52p 🔵 BioStatQuest Uses Vite as Dev Server
72 2:57p 🔵 BioStatQuest Vite Dev Server Runs on Port 5174
73 3:00p 🔵 Screenshot Taken of BioStatQuest App for Pilot Feature Visual Verification
74 3:01p 🔵 Supabase user_progress Query Returns 400 Bad Request
75 3:07p 🔵 Playwright Visual Test Blocked by Shell Permission Restrictions
76 3:15p 🔵 Playwright Visual Test Produced Zero Output Despite Process Running
77 3:17p 🔵 Python Stdout Buffering Caused Silent Playwright Test — Fixed with PYTHONUNBUFFERED + tee
S65 Verify F1 distractor feedback accuracy — still waiting for Playwright Monitor to emit pilot question hit (May 1 at 3:18 PM)
S66 Verify F1 distractor feedback via Playwright — v2 test running with correct navigation after recon revealed onboarding gate (May 1 at 3:19 PM)
78 3:20p 🔵 Playwright Test Stuck on Landing Page — Case Navigation Failed
79 " 🔵 Playwright Navigation Failure Root Cause: ?view=skillTree URL Param Does Not Navigate Past Landing Page
80 " 🔵 Playwright Recon Reveals App Navigation Path Through Onboarding Gate
81 " 🟣 Playwright Visual Test v2 Written with Correct Navigation Path
82 " 🟣 Playwright Visual Test v2 Launched with Correct Navigation — Monitor Armed
S67 Verify F1 distractor feedback via Playwright v2 test — still running, awaiting Monitor events (May 1 at 3:22 PM)
S68 Verify F1 distractor feedback via Playwright v2 — still awaiting Monitor results (May 1 at 3:23 PM)
S69 Verify F1 distractor feedback via Playwright v2 — Monitor b1zgwiet3 still running, no events yet (May 1 at 3:23 PM)
S72 F2 telemetri başlat — Lemon Squeezy webhook ve telemetry ile paralel (F1 doğrulama tamamlandıktan sonra F2'ye geçiş) (May 1 at 3:23 PM)
83 3:23p 🔵 Playwright v2 Entered Diagnostic Quiz Instead of Skill Tree — f1 Case Unreachable
84 " 🔵 Playwright v2 Stuck in Diagnostic Quiz Loop — reset_seen Does Not Clear Diagnostic State
85 3:25p 🔵 pkill -9 Required to Kill Playwright Processes — Regular pkill Insufficient
86 " 🔄 DistractorFeedback Exported from CasePlay.tsx to Enable Unit Testing
88 " 🔵 DistractorFeedback Unit Tests: 5 Pass, 3 Fail Due to Text Assertion Mismatches
90 " 🔴 F1 Distractor Feedback Verified: All 8 Unit Tests Pass, Full Suite 6291/6291 Green
87 " 🔵 Test Stack Confirmed: Vitest + jsdom + @testing-library/react
89 3:27p 🔵 DistractorFeedback Test Failures: Text Case Mismatch + DOM Leak Between Tests
91 3:28p ⚖️ F2 Telemetry Phase Selected as Next Work Item
S71 User chose F2 telemetry (Lemon Squeezy webhook) as next task, but session still showing repeated E2E test failures and F1 verification summary (May 1 at 3:28 PM)
S70 F1 distractor feedback verification and user_progress schema migration decision (May 1 at 3:28 PM)
S73 F2 telemetri başlat — Lemon Squeezy webhook + question_attempts telemetry paralel track; A1 migration SQL yazıldı (May 1 at 5:16 PM)
S74 F2 telemetri başlat — Track A (per-attempt telemetry → question_attempts table) ve Track B (Lemon Squeezy webhook billing) paralel implementasyon; TypeScript clean + 6296 test passing ile tamamlandı (May 1 at 5:18 PM)
**Investigated**: - Stripe webhook ve portal endpoint'lerinin yapısı incelendi (api/stripe/webhook.ts, api/stripe/portal.ts) — LS endpoint'leri için blueprint olarak kullanıldı
    - LS REST API: JSON:API format (Content-Type: application/vnd.api+json), checkouts + customers endpoint'leri
    - HMAC SHA256 signature verification: X-Signature header, hex-encoded, crypto.timingSafeEqual ile timing-safe karşılaştırma
    - billing_provider column: Stripe ve LS'in stripe_* sütun setini paylaşma stratejisi

**Learned**: - LS webhook eventName = event.meta.event_name; supabase_user_id = event.meta.custom_data.supabase_user_id (custom_data round-trip pattern)
    - LS subscription statuses: on_trial/active/past_due → 'pro', paused/cancelled/expired/unpaid → 'free'
    - LS "current period end" = renews_at (active) ?? ends_at (cancelled/expired) — iki farklı alan
    - portal.ts: billing_provider != 'lemonsqueezy' ise 409 dön; client doğru provider'a route etsin
    - applySubscription fallback chain: by user_id → by stripe_customer_id (LS customer id burada) → by user_email
    - tsc --noEmit + 6296 vitest tests (16 files) temiz — hiç regresyon yok

**Completed**: **Track A — F2 Telemetri (A1-A4):**
    - `supabase_schema_v2.sql`: question_attempts tablosu (id, user_id FK, qid, case_id, q_type, chosen jsonb, correct, ms_to_answer, timed_out, hint_used, deep_dive_opened, misconception_tag, difficulty, run_id, created_at) + 5 index + RLS (insert_own + select_own) + billing_provider column + Stripe backfill
    - `src/lib/auth.ts`: QuestionAttempt type export + logQuestionAttempt fire-and-forget (consent-gated, hata yutma) + BQAuth export'a eklendi
    - `src/components/CasePlay.tsx`: runId (crypto.randomUUID frozen state) + shownAt (per-stepIdx reset) + checkAnswer içinde fire-and-forget telemetry çağrısı; misconceptionTag, timedOut, msToAnswer tüm path'ler
    - `src/lib/auth.test.ts`: 5 smoke test (@vitest-environment jsdom ile); telemetri asla play loop'u kırmıyor

    **Track B — Lemon Squeezy (B1-B4):**
    - `api/_lib/lemonsqueezy.ts`: LS REST helper (lsCreateCheckout, lsCustomerPortalUrl) + 5 env getter fonksiyonu
    - `api/lemonsqueezy/checkout.ts`: POST /api/lemonsqueezy/checkout — Bearer auth, plan param (monthly/yearly), variantId + storeId env check, lsCreateCheckout çağrısı
    - `api/lemonsqueezy/webhook.ts`: POST /api/lemonsqueezy/webhook — bodyParser:false, verifySignature (HMAC SHA256 timingSafeEqual), planFromStatus, applySubscription (3-way fallback), 9 event type handler
    - `api/lemonsqueezy/portal.ts`: POST /api/lemonsqueezy/portal — Bearer auth, billing_provider mismatch → 409, lsCustomerPortalUrl
    - `docs/lemonsqueezy-setup.md`: 8-adım setup rehberi (account, products, API key, webhook, env vars, DB migration, E2E test, live mode) + ops notes + code touchpoints tablosu

    **Final verification:** `npx tsc --noEmit` temiz, `npx vitest run` → 16 files, 6296 tests passed (2.54s)

**Next Steps**: Kullanıcıya seçenek sunuldu:
    - **C**: Commit (8 yeni dosya + 4 değişiklik + 2 doc — F1 distractor fix + F2 A+B track)
    - **D**: SubscriptionPanel.tsx UI cutover — yeni alımları LS'e yönlendir, billing_provider'a göre portal route
    - **E**: F4 adaptive engine başlangıcı (telemetri akmaya başlayınca anlamlı)
    - **F**: F2 IRT batch job iskeleti (Vercel Python function)
    - **G**: F1 pilot içerik genişletme (5 → 20 soru)

    Kullanıcının yapması gereken operasyonel adımlar: supabase_schema_v2.sql çalıştırma, LS dashboard kurulum (account + store + variants + webhook), 5 Vercel env var ekleme, redeploy, test mode E2E test.


Access 1331k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>