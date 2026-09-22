import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only writes (bypasses RLS). Never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser — no VITE_ prefix, read only here.
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}
