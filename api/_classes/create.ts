// POST /api/classes/create
//
// Creates a class atomically with the caller as the first instructor.
// Uses the SECURITY DEFINER `create_class` RPC so the RLS chicken-and-egg
// (need class_members row to insert class; can't create one before the
// class exists) is resolved at the database layer.
//
// Request body:  { name: string, institution_name?: string, description?: string }
// Response 200:  { id: string, code: string, name: string }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { supa } = a;

  const { name, institution_name, description } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name required" });
  }
  if (name.length > 120) {
    return res.status(400).json({ error: "name too long (max 120 chars)" });
  }

  const { data: newId, error } = await supa.rpc("create_class", {
    class_name: name.trim(),
    institution_name_in: typeof institution_name === "string" ? institution_name.trim() : null,
    description_in: typeof description === "string" ? description.trim() : null,
  });

  if (error || !newId) {
    return res.status(500).json({ error: error?.message || "failed to create class" });
  }

  // Read the freshly-created class so we can return code + name without a second rpc.
  const { data: cls, error: clsErr } = await supa
    .from("classes")
    .select("id, code, name")
    .eq("id", newId as string)
    .single();

  if (clsErr || !cls) {
    return res.status(500).json({ error: clsErr?.message || "class created but could not be read back" });
  }

  return res.status(200).json({ id: cls.id, code: cls.code, name: cls.name });
}
