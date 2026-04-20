// Shared auth helper for /api/classes/* endpoints.
//
// Extracts the caller's Supabase JWT from the Authorization header and
// returns a Supabase client configured to use that JWT. All queries made
// through this client are subject to RLS as the authenticated user —
// which is what we want for every endpoint except the two handlers that
// intentionally bypass RLS via supabaseAdmin() (accept-invite, join-by-code).

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

export type AuthedOK = { supa: SupabaseClient; user: User };
export type AuthedErr = { error: string; status: number };

export async function authedClient(req: VercelRequest): Promise<AuthedOK | AuthedErr> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { error: "server config missing SUPABASE_URL / SUPABASE_ANON_KEY", status: 500 };
  }

  const header = req.headers.authorization || "";
  const jwt = header.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { error: "unauthorized", status: 401 };

  const supa = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supa.auth.getUser(jwt);
  if (error || !data?.user) return { error: "unauthorized", status: 401 };

  return { supa, user: data.user };
}

export function isAuthedErr(x: AuthedOK | AuthedErr): x is AuthedErr {
  return (x as AuthedErr).error !== undefined;
}
