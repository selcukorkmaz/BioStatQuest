# Uptime monitoring

Written after the September 2026 outage: the Supabase project was suspended
by the provider and sign-in was broken for ~15 days before anyone noticed.

## Why a plain uptime check would not have caught it

`biostatquest.com` is static HTML on Vercel. It kept returning `200 OK` for
the entire outage. Only the calls *behind* the page — GoTrue, PostgREST —
were failing. Anything watching the homepage would have stayed green.

So the probe has to exercise the sign-in path itself. That is what
`api/_lib/health.ts` does.

## What is checked

| Check | Proves | Catches |
|---|---|---|
| `auth_service` | `GET /auth/v1/health` answers | project paused/deleted, DNS gone, GoTrue down |
| `auth_providers` | `external.email` and `external.google` are `true` | someone toggling a provider off in the dashboard |
| `database_read` | service-role `HEAD` on `user_progress` | Postgres down, PostgREST down, stale schema cache, wrong keys |

Each check has an 8s timeout. A missing env var is reported as an outage
rather than a crash, so the monitor sees a readable 503 instead of a 500.

## Two consumers

### 1. `GET /api/health` — the fast one (set this up)

Public. Returns `200` when healthy, `503` when not.

```bash
curl -i https://www.biostatquest.com/api/health
```

Anonymous callers get check names and pass/fail only. For the full report
including error strings and row counts, pass the cron secret:

```bash
curl "https://www.biostatquest.com/api/health?token=$CRON_SECRET"
```

**Point an external monitor at this URL.** Free tiers that do 1–5 minute
intervals: UptimeRobot, BetterStack, Cronitor. Configure it to alert on any
non-200. An external monitor is the primary alarm because it keeps working
when Vercel itself is down — a Vercel cron cannot.

### 2. `GET /api/cron/healthcheck` — the backstop

Runs the same probes on a schedule and emails `HEALTHCHECK_ALERT_TO` via
Resend when anything fails. It exists so an owned, in-repo alarm survives
the external monitor's account lapsing.

Registered in `vercel.json` as `0 7 * * *` (07:00 UTC daily). **Vercel Hobby
allows 2 cron jobs, once per day each** — this project is now at that limit
(reengagement + healthcheck). On Pro, tighten to `*/15 * * * *`; be aware
there is no alert throttling, so a long outage sends one email per run.

The alert path touches only Resend, never Supabase — Supabase is assumed
broken whenever it fires.

## Environment variables

Already set for the reengagement cron:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`

Newly required — confirm these exist on Vercel production:

- `SUPABASE_ANON_KEY` (or `VITE_SUPABASE_ANON_KEY`) — used for the two auth probes

Optional:

- `HEALTHCHECK_ALERT_TO` — default `info@biostatquest.com`
- `HEALTHCHECK_FROM` — default `BioStat Quest <info@biostatquest.com>`

## Verifying after deploy

```bash
curl -s https://www.biostatquest.com/api/health | jq
```

Expect `{"ok": true, ...}` with all three checks passing. To test the alert
email end-to-end, trigger the cron by hand:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://www.biostatquest.com/api/cron/healthcheck | jq
```

To confirm the alarm actually fires, temporarily point `SUPABASE_URL` on a
preview deployment at a non-existent project ref and hit `/api/health` — it
should return 503 with `fetch failed` on all three checks.
