// Shared auth helper for /api/classes/* endpoints.
//
// Extracts the caller's Supabase JWT from the Authorization header and
// validates it by calling Supabase's GoTrue endpoint directly — NOT
// via supa.auth.getUser() which has SDK-version-specific quirks that
// can return "Auth session missing!" for JWTs that are actually valid
// (observed on Safari + newer SDK versions when persistSession is false).
//
// Returns an RLS-enforced Supabase client ready for downstream queries.
// Handlers that need to BYPASS RLS (accept-invite, join-by-code) should
// use supabaseAdmin() from ../_lib/supabaseAdmin instead.

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

  // Validate the JWT by asking Supabase auth directly. Reliable across
  // SDK versions and browser origins. Returns the user object on 200,
  // or a structured error on 401/403/etc.
  let userRes: Response;
  try {
    userRes = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${jwt}`,
      },
    });
  } catch (e: any) {
    console.error("[authed] network error calling /auth/v1/user:", e?.message);
    return { error: "auth endpoint unreachable", status: 502 };
  }

  if (!userRes.ok) {
    const text = await userRes.text().catch(() => "(no body)");
    console.error("[authed] /auth/v1/user returned", userRes.status, text.slice(0, 200));
    return {
      error: `auth failed: ${userRes.status} ${text.slice(0, 120)}`,
      status: 401,
    };
  }

  const user = (await userRes.json()) as User;
  if (!user?.id) {
    return { error: "auth failed: no user id in response", status: 401 };
  }

  // RLS-enforced client for the handler's downstream queries. The JWT
  // goes into the Authorization header so PostgREST knows who's asking
  // and applies the right row-level policies.
  const supa = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { supa, user };
}

export function isAuthedErr(x: AuthedOK | AuthedErr): x is AuthedErr {
  return (x as AuthedErr).error !== undefined;
}
