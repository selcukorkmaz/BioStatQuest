# BioStat Quest — email setup checklist

Everything below takes ~15 minutes end-to-end. Templates are ready to paste;
the account-creation / DNS / dashboard clicks are the parts only you can do.

## Part A · Paste the templates (5 min, Supabase Dashboard)

Open your project → **Authentication** → **Email Templates**.
There are five tabs. For each one, set the subject and paste the full HTML from the corresponding file.

| Tab in Supabase          | Subject heading                           | File to paste                  |
|--------------------------|-------------------------------------------|--------------------------------|
| Confirm signup           | `Confirm your BioStat Quest email`        | `confirm-signup.html`          |
| Magic Link               | `Your BioStat Quest sign-in link`         | `magic-link.html`              |
| Change Email Address     | `Confirm your new BioStat Quest email`    | `change-email.html`            |
| Reset Password           | `Reset your BioStat Quest password`       | `reset-password.html`          |
| Invite user              | `You've been invited to BioStat Quest`    | `invite-user.html`             |

For each tab:
1. Click the tab.
2. Replace the **Subject heading** with the row above.
3. Select all inside the **Message body (HTML)** box and paste the file contents.
4. Click **Save changes** (bottom right).

The `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`
placeholders inside the HTML are Supabase's templating — leave them exactly as written.

## Part B · Fix the "From:" address (10 min, Resend + Supabase)

Right now mail is sent by `noreply@mail.app.supabase.io`. To get
`BioStat Quest <hello@biostatquest.com>`, you need a custom SMTP provider.
Resend is simplest for a solo project (3 000 emails/month free).

### B1. Create a Resend account

1. Go to <https://resend.com> → **Sign Up**.
2. Sign in → **Domains** → **Add Domain** → enter `biostatquest.com`.
3. Resend shows 3 DNS records (one SPF `TXT`, one or two DKIM `TXT`, optional MX).

### B2. Add the DNS records at your registrar

Same DNS panel where you set the Vercel `A`/`CNAME`. Copy each record from Resend:

- `TXT` at `@` for SPF (starts with `v=spf1`)
- `TXT` at `resend._domainkey` (or similar) for DKIM — long base64 string
- Optional: `MX` record if you want to receive bounces (skip if unsure)

Save. Back on Resend → click **Verify DNS Records**. Usually green within 5 min.

### B3. Generate a Resend API key

Resend dashboard → **API Keys** → **Create API Key** → permission **Sending access** → copy the key (starts with `re_…`). Save it somewhere safe; you can't see it again.

### B4. Wire SMTP into Supabase

Supabase Dashboard → **Project Settings** → **Authentication** → **SMTP Settings** → toggle **Enable Custom SMTP**. Fill in:

| Field         | Value                                |
|---------------|--------------------------------------|
| Host          | `smtp.resend.com`                    |
| Port          | `465`                                |
| Username      | `resend`                             |
| Password      | your Resend API key (`re_…`)         |
| Sender email  | `hello@biostatquest.com`             |
| Sender name   | `BioStat Quest`                      |

Save. Click **Send test email** to yourself. It should arrive from
`BioStat Quest <hello@biostatquest.com>`.

### B5. Loosen the rate limit (optional)

With Resend wired, the default Supabase limit of a few mails/hour still applies
unless you bump it. **Authentication** → **Rate Limits** → raise "Emails per hour"
(200 is fine for early users). Go higher only when you need to.

## Part C · URL configuration (2 min, Supabase Dashboard)

Even with the pretty email, clicking the button fails if redirect URLs don't match
the live domain.

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://www.biostatquest.com`
- **Redirect URLs** (one per line or comma-sep):
  ```
  https://www.biostatquest.com/**
  https://biostatquest.com/**
  https://biostat-quest.vercel.app/**
  http://localhost:5500/**
  ```

Save. Done.

## Part D · End-to-end check (2 min)

1. Open an incognito tab → `https://biostatquest.com` → sign up with a fresh email.
2. The email lands from `BioStat Quest <hello@biostatquest.com>`, branded like the template.
3. Click the button → lands on `https://www.biostatquest.com/...` → session is active.
4. Sign out. Sign back in. Magic-link flow works.

If any step fails, the two most common culprits are:

- **"Redirect URL not allowed"** → Part C missed a URL.
- **Email arrives but still from supabase.io** → Part B4 SMTP wasn't saved, or
  the API key was wrong. Go back and click **Save** again; try the test button.

That's the whole thing.
