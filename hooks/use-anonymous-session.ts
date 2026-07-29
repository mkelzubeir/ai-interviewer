"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";

export type SessionStatus = "unavailable" | "loading" | "ready" | "failed";

/**
 * A silent anonymous Supabase session.
 *
 * There is no sign-in step: the point is that a visitor lands, adds their
 * documents and starts talking. But the Realtime token endpoint is public and
 * spends real OpenAI credits, so it still verifies a JWT and rate limits per
 * user id. An anonymous user is a real row in `auth.users`, which satisfies
 * both without asking anyone for an email.
 *
 * Requires "Anonymous sign-ins" to be enabled for the Supabase project.
 */
export function useAnonymousSession() {
  const [client] = useState(() => getSupabaseClient());
  const [status, setStatus] = useState<SessionStatus>(supabaseConfigured ? "loading" : "unavailable");
  const [error, setError] = useState<string | null>(null);
  const establishing = useRef(false);

  const establish = useCallback(async () => {
    if (!client || establishing.current) return;
    establishing.current = true;
    try {
      // Nothing is set synchronously here: the first statement awaits, so this
      // is safe to kick off from an effect.
      const existing = await client.auth.getSession();
      if (existing.data.session) {
        setStatus("ready");
        return;
      }
      const { data, error: signInError } = await client.auth.signInAnonymously();
      if (signInError || !data.session) {
        // The most likely cause by far is the project toggle being off.
        setError(
          /anonymous/i.test(signInError?.message ?? "")
            ? "Voice mode needs anonymous sign-ins enabled for this Supabase project."
            : "Could not prepare a voice session. Reload to try again.",
        );
        setStatus("failed");
        return;
      }
      setStatus("ready");
    } catch {
      setError("Could not prepare a voice session. Reload to try again.");
      setStatus("failed");
    } finally {
      establishing.current = false;
    }
  }, [client]);

  useEffect(() => {
    // Establishing the session is synchronisation with an external system, and
    // every setState inside `establish` happens after an await — so this cannot
    // cascade renders. The lint rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void establish();
  }, [establish]);

  /**
   * Read the access token at the moment it is needed rather than mirroring it
   * into state. supabase-js owns refresh, so this cannot hand out a token that
   * expired earlier in a long interview.
   */
  const getAccessToken = useCallback(async () => {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  }, [client]);

  const retry = useCallback(() => {
    setStatus("loading");
    setError(null);
    return establish();
  }, [establish]);

  return { status, error, retry, getAccessToken };
}
