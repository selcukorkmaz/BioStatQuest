// POST /api/classes/invite
//
// Instructor invites a student (or co-instructor) by email. Creates or
// refreshes a class_invites row with a random token, then sends a join-
// link email via Resend. If email fails, the row still exists — the
// instructor gets a copy-paste `join_url` in the response.
//
// Request body:  { class_id: string, email: string, role?: "student" | "co-instructor" }
// Response 200:  { invite_id: string, expires_at: string, join_url: string, email_sent: boolean }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";
import { randomBytes } from "node:crypto";

const DEFAULT_FROM = "BioStat Quest <info@biostatquest.com>";
const SITE_URL = "https://www.biostatquest.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { supa, user } = a;

  const { class_id, email, role } = req.body ?? {};
  if (typeof class_id !== "string" || !/^[0-9a-f-]{36}$/i.test(class_id)) {
    return res.status(400).json({ error: "class_id required (uuid)" });
  }
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "valid email required" });
  }
  const inviteRole = role === "co-instructor" ? "co-instructor" : "student";

  // Generate 32-char URL-safe token.
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();

  // Upsert semantics: if an open invite already exists for (class, email),
  // refresh its token and expiry rather than erroring on the partial
  // unique index. Behaves like "resend invite".
  // Step 1: look up any existing open invite.
  const { data: existing, error: lookupErr } = await supa
    .from("class_invites")
    .select("id")
    .eq("class_id", class_id)
    .eq("invited_email", email.toLowerCase())
    .is("accepted_at", null)
    .maybeSingle();

  if (lookupErr) {
    return res.status(500).json({ error: lookupErr.message });
  }

  let inviteId: string;
  if (existing) {
    const { error: updErr } = await supa
      .from("class_invites")
      .update({ token, expires_at: expiresAt, role: inviteRole })
      .eq("id", existing.id);
    if (updErr) return res.status(500).json({ error: updErr.message });
    inviteId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supa
      .from("class_invites")
      .insert({
        class_id,
        invited_email: email.toLowerCase(),
        role: inviteRole,
        token,
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      // RLS may block here if the user isn't actually an instructor of
      // this class (or the class is lapsed / archived). Surface cleanly.
      return res.status(403).json({ error: insErr?.message || "not authorized to invite to this class" });
    }
    inviteId = inserted.id;
  }

  // Fetch class name + inviter display info for the email body.
  const { data: cls } = await supa
    .from("classes")
    .select("name, institution_name")
    .eq("id", class_id)
    .single();

  const joinUrl = `${SITE_URL}/join?token=${token}`;

  // Send via Resend; non-fatal if it fails — UI uses `email_sent: false`
  // to surface the copy-paste fallback.
  let emailSent = false;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.REENGAGEMENT_FROM || DEFAULT_FROM;

  if (resendKey) {
    try {
      const html = renderInviteEmail({
        className: cls?.name || "BioStat Quest class",
        institutionName: cls?.institution_name || undefined,
        inviterName: user.email || "Your instructor",
        joinUrl,
        role: inviteRole,
      });
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: `You've been invited to ${cls?.name || "a BioStat Quest class"}`,
          html,
        }),
      });
      emailSent = r.ok;
    } catch {
      emailSent = false;
    }
  }

  return res.status(200).json({
    invite_id: inviteId,
    expires_at: expiresAt,
    join_url: joinUrl,
    email_sent: emailSent,
  });
}

function renderInviteEmail(v: {
  className: string;
  institutionName?: string;
  inviterName: string;
  joinUrl: string;
  role: string;
}): string {
  // Inline template — matches the dark style used by magic-link.html.
  // Can be moved to email-templates/class-invite.html when it grows.
  const roleText = v.role === "co-instructor" ? "as a co-instructor" : "as a student";
  const institutionLine = v.institutionName
    ? `<p style="margin:0 0 8px; color:#94a3b8; font-size:13px;">${escapeHtml(v.institutionName)}</p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background-color:#05070f;font-family:'Inter','Segoe UI',sans-serif;color:#cbd5e1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#05070f" style="padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0f1e" style="max-width:560px;width:100%;background-color:#0a0f1e;border-radius:16px;border:1px solid rgba(139,92,246,0.25);box-shadow:0 20px 50px -18px rgba(139,92,246,0.15);">
<tr><td style="padding:40px 36px 8px;">
<div style="font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:24px;">&#127891; BioStat <span style="color:#fbbf24;">Quest</span></div>
<h1 style="margin:0 0 12px;color:#f1f5f9;font-size:26px;font-weight:800;line-height:1.15;letter-spacing:-0.02em;">You've been invited to a class.</h1>
${institutionLine}
<p style="margin:12px 0 0;color:#cbd5e1;font-size:15px;line-height:1.6;">${escapeHtml(v.inviterName)} has invited you to join <strong style="color:#f1f5f9;">${escapeHtml(v.className)}</strong> on BioStat Quest, ${roleText}.</p>
</td></tr>
<tr><td align="center" style="padding:28px 36px 8px;">
<a href="${v.joinUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#f5f3ff;font-weight:700;font-size:14px;text-decoration:none;border-radius:12px;box-shadow:0 8px 20px -6px rgba(139,92,246,0.55);">Accept invitation &rarr;</a>
<p style="margin:12px 0 0;color:#64748b;font-size:11px;">Link expires in 14 days.</p>
</td></tr>
<tr><td style="padding:26px 36px 8px;">
<hr style="border:none;border-top:1px solid rgba(148,163,184,0.12);margin:0 0 18px;">
<p style="margin:0;color:#64748b;font-size:12px;line-height:1.65;">By accepting you'll be able to work through case-based biostatistics with ${escapeHtml(v.inviterName)}. You'll be asked to explicitly consent to sharing your case-completion and accuracy data with the instructor on the join screen.</p>
</td></tr>
<tr><td style="padding:16px 36px 32px;text-align:center;border-top:1px solid rgba(148,163,184,0.08);">
<p style="margin:14px 0 6px;"><a href="${SITE_URL}" style="color:#94a3b8;text-decoration:none;font-weight:700;font-size:13px;">biostat<span style="color:#fbbf24;">quest</span>.com</a></p>
<p style="margin:0;color:#64748b;font-size:11px;line-height:1.6;">Didn't expect this? You can safely ignore it — the invite only works once.</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
