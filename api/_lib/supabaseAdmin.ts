// Service-role Supabase client — server-side only. Never import from the
// browser bundle; the SUPABASE_SERVICE_ROLE_KEY bypasses RLS.
//
// Vercel functions get process.env at runtime from the project settings.
// Set:
//   SUPABASE_URL               (same as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  (Supabase dashboard → Project settings → API)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
