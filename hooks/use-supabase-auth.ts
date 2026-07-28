"use client";

import { useCallback, useEffect, useState } from "react";
import { authRedirectUrl, getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; email: string | null };
export type AuthStatus = "unavailable" | "loading" | "signed-out" | "signed-in";

/**
 * Optional magic-link auth.
 *
 * When Supabase is not configured this reports "unavailable" and does nothing,
 * so anonymous local-only practice is completely unaffected.
 */
export function useSupabaseAuth() {
  const [client] = useState<SupabaseClient | null>(() => getSupabaseClient());
  const [status, setStatus] = useState<AuthStatus>(supabaseConfigured ? "loading" : "unavailable");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      const current = data.session?.user;
      setUser(current ? { id: current.id, email: current.email ?? null } : null);
      setStatus(current ? "signed-in" : "signed-out");
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const current = session?.user;
      setUser(current ? { id: current.id, email: current.email ?? null } : null);
      setStatus(current ? "signed-in" : "signed-out");
      if (current) setNotice(null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(async (email: string) => {
    if (!client) return;
    setNotice(null);
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: authRedirectUrl() } });
    setNotice(error ? `We could not send that link: ${error.message}` : `Check ${email} for a sign-in link. Your interview stays in this browser either way.`);
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setNotice(null);
  }, [client]);

  return { client, status, user, notice, signIn, signOut };
}
