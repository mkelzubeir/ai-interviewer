import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase access.
 *
 * Only the publishable anon key ever reaches this bundle — that is what it is
 * designed for. It exists solely to obtain an anonymous session, whose JWT the
 * realtime-token Edge Function verifies before minting a client secret.
 *
 * Both variables are optional and unused by a local server build, which mints
 * secrets through its own route handler.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseConfigured || typeof window === "undefined") return null;
  client ??= createClient(url, anonKey, {
    auth: {
      // PKCE completes entirely in the browser, which is what lets magic-link
      // sign-in work on a static export with no server to exchange the code.
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

