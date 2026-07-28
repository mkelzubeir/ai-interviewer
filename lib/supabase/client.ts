import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withBasePath } from "@/lib/runtime-capabilities";

/**
 * Browser-side Supabase access.
 *
 * Only the publishable anon key ever reaches this bundle — that is what it is
 * designed for. Row Level Security on `interview_sessions` is the actual
 * security boundary: the anon key by itself grants no access to any row.
 *
 * Both variables are optional. With neither set the app runs exactly as it did
 * before Supabase existed: anonymous, local-only, localStorage for everything.
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

/**
 * Where the magic link returns to. Must be listed under Authentication →
 * URL Configuration → Redirect URLs in the Supabase dashboard, including the
 * /ai-interviewer subpath for the GitHub Pages deployment.
 */
export function authRedirectUrl() {
  return new URL(withBasePath("/interview"), window.location.origin).toString();
}
