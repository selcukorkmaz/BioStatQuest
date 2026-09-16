// One-off broadcast sender for the September 2026 outage apology.
//
// Sends email-templates/service-restored.html to every account holder via
// Resend, one message per recipient. Dry-run by default — nothing leaves
// the machine until you pass --send.
//
// Why a script instead of pasting everyone into "to:" — a single message
// addressed to N people exposes every subscriber's address to every other
// subscriber. That is a data leak, and a particularly bad one to ship in
// an apology email. Individual sends cost nothing extra and avoid it.
//
// ── Usage ─────────────────────────────────────────────────────────────────
//   Recipients come either straight from Supabase (--from-supabase, needs
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) or from a CSV you export:
//
//        select distinct email from public.user_progress
//        where email is not null order by email;
//
//   Dry run — prints the recipient count, sends nothing:
//
//        node scripts/send-outage-email.mjs --from-supabase
//
//   Send to yourself first (one address in a file, then --send):
//
//        RESEND_API_KEY=re_xxx node scripts/send-outage-email.mjs me.csv --send
//
//   Real send:
//
//        RESEND_API_KEY=re_xxx node scripts/send-outage-email.mjs --from-supabase --send
//
// Progress is appended to .outage-sent.log (gitignored). Re-running skips
// anyone already logged, so an interrupted run resumes safely.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const TEMPLATE = resolve(ROOT, "email-templates/service-restored.html");
const SENT_LOG = resolve(ROOT, ".outage-sent.log");

const FROM = process.env.OUTAGE_FROM || "BioStat Quest <info@biostatquest.com>";
const REPLY_TO = process.env.OUTAGE_REPLY_TO || "info@biostatquest.com";
const SUBJECT = process.env.OUTAGE_SUBJECT || "We were down for two weeks. We're sorry.";

// Resend's free tier allows 100 emails/day and ~2 requests/second.
const RATE_LIMIT_MS = Number(process.env.OUTAGE_RATE_MS) || 600;
const DAILY_CAP = Number(process.env.OUTAGE_DAILY_CAP) || 100;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const args = process.argv.slice(2);
const send = args.includes("--send");
const fromSupabase = args.includes("--from-supabase");
const listPath = args.find((a) => !a.startsWith("--"));

if (!listPath && !fromSupabase) {
  console.error("usage: node scripts/send-outage-email.mjs <recipients.csv> [--send]");
  console.error("       node scripts/send-outage-email.mjs --from-supabase [--send]");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (send && !apiKey) {
  console.error("RESEND_API_KEY is required for --send");
  process.exit(1);
}

const html = readFileSync(TEMPLATE, "utf8");

// Pull every account email straight from user_progress. PostgREST caps a
// response at 1000 rows, so page through with Range until a short page.
async function fromSupabaseList() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("--from-supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const out = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const r = await fetch(`${url}/rest/v1/user_progress?select=email&email=not.is.null&order=email`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + page - 1}`,
      },
    });
    if (!r.ok) {
      console.error(`supabase query failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const rows = await r.json();
    out.push(...rows.map((x) => String(x.email || "").trim().toLowerCase()));
    if (rows.length < page) break;
  }
  return out;
}

// Parse a CSV: one address per line or first column. Anything that does not
// look like an address (header row, blank line) is dropped.
function fromCsvList(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].trim().replace(/^"|"$/g, "").toLowerCase());
}

const sourced = fromSupabase ? await fromSupabaseList() : fromCsvList(listPath);
const all = [...new Set(sourced.filter((v) => EMAIL_RE.test(v)))];

const alreadySent = new Set(
  existsSync(SENT_LOG)
    ? readFileSync(SENT_LOG, "utf8").split(/\r?\n/).map((l) => l.split("\t")[0]).filter(Boolean)
    : [],
);

const queue = all.filter((e) => !alreadySent.has(e));

console.log(`source     ${fromSupabase ? "supabase user_progress" : listPath}`);
console.log(`template   ${TEMPLATE}`);
console.log(`subject    ${SUBJECT}`);
console.log(`from       ${FROM}`);
console.log(`parsed     ${all.length} unique addresses`);
console.log(`already    ${all.length - queue.length} sent in a previous run (skipped)`);
console.log(`queue      ${queue.length}`);

if (queue.length > DAILY_CAP) {
  console.log(
    `\n! ${queue.length} recipients exceeds the ${DAILY_CAP}/day cap. The run will stop at ${DAILY_CAP};\n` +
    `  re-run tomorrow to continue, or raise OUTAGE_DAILY_CAP if your Resend plan allows.`,
  );
}

if (!send) {
  console.log("\nDRY RUN — nothing sent.");
  console.log(`Would deliver to ${Math.min(queue.length, DAILY_CAP)} address(es) on this run.`);
  console.log("Pass --show-list to print the addresses, or --send to deliver.");
  if (args.includes("--show-list")) for (const e of queue) console.log(`  ${e}`);
  process.exit(0);
}

const batch = queue.slice(0, DAILY_CAP);
let ok = 0;
let failed = 0;

for (const [i, email] of batch.entries()) {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: FROM, to: email, reply_to: REPLY_TO, subject: SUBJECT, html }),
    });
    if (!r.ok) {
      const body = await r.text();
      failed++;
      console.error(`  [${i + 1}/${batch.length}] FAIL ${email} — resend ${r.status}: ${body.slice(0, 160)}`);
    } else {
      ok++;
      appendFileSync(SENT_LOG, `${email}\t${new Date().toISOString()}\n`);
      console.log(`  [${i + 1}/${batch.length}] sent ${email}`);
    }
  } catch (e) {
    failed++;
    console.error(`  [${i + 1}/${batch.length}] FAIL ${email} — ${e?.message || e}`);
  }
  await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
}

console.log(`\ndone. sent=${ok} failed=${failed} remaining=${queue.length - batch.length}`);
