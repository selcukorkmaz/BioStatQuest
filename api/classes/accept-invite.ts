// POST /api/classes/accept-invite
//
// Token-based class join. Uses the service-role Supabase client to look
// up the invite (tokens must be resolvable by non-members who hold them).
// Re-checks class state (archived / lapsed) at consume time because RLS
// bypass means the existing write-time guards don't apply here.
//
// Request body:  { token: string, consent: true }
// Response 200:  { class_id: string, class_name: string, role: string }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { user } = a;

  const { token, consent } = req.body ?? {};
  if (typeof token !== "string" || token.length < 16) {
    return res.status(400).json({ error: "token required" });
  }
  if (consent !== true) {
    return res.status(400).json({ error: "consent required — instructor will see your progress in this class" });
  }

  const admin = supabaseAdmin();

  // 1. Resolve token → invite row. Must be unaccepted and unexpired.
  const { data: invite, error: inviteErr } = await admin
    .from("class_invites")
    .select("id, class_id, role, expires_at, accepted_at")
    .eq("token", token)
    .is("accepted_at", null)
    .maybeSingle();

  if (inviteErr) return res.status(500).json({ error: inviteErr.message });
  if (!invite) return res.status(404).json({ error: "invite not found or already accepted" });
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return res.status(404).json({ error: "invite expired" });
  }

  // 2. Re-check class state. RLS was bypassed for the token lookup; we
  // must enforce the archived/lapsed read-only semantic here ourselves.
  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, name, archived_at, subscription_status")
    .eq("id", invite.class_id)
    .single();

  if (clsErr || !cls) return res.status(404).json({ error: "class not found" });
  if (cls.archived_at || cls.subscription_status === "lapsed") {
    return res.status(409).json({ error: "class unavailable (archived or lapsed)" });
  }

  // 3. Upsert membership — symmetric with join-by-code so a student who
  // previously left is reactivated cleanly. joined_at is preserved on
  // conflict (we don't include it in the DO UPDATE SET list).
  const { error: memErr } = await admin
    .from("class_members")
    .upsert(
      {
        class_id: invite.class_id,
        user_id: user.id,
        role: invite.role,
        consented_to_instructor_visibility: true,
        left_at: null,
      },
      { onConflict: "class_id,user_id" }
    );

  if (memErr) return res.status(500).json({ error: memErr.message });

  // 4. Mark the invite as accepted. Non-fatal — the membership exists
  // even if this fails; the partial unique index then blocks further
  // invites to the same (class, email) pair until manual cleanup.
  await admin
    .from("class_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);

  return res.status(200).json({
    class_id: cls.id,
    class_name: cls.name,
    role: invite.role,
  });
}
