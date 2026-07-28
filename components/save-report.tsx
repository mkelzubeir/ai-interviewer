"use client";

import { useState } from "react";
import { saveCompletedSession } from "@/lib/supabase/sessions";
import type { useSupabaseAuth } from "@/hooks/use-supabase-auth";
import type { StoredSession } from "@/lib/schemas";

type Auth = ReturnType<typeof useSupabaseAuth>;

/**
 * Opt-in persistence of a finished report. localStorage remains the store of
 * record for the in-progress interview; this only ever copies a *completed*
 * report to the signed-in user's account.
 */
export function SaveReport({ auth, session }: { auth: Auth; session: StoredSession }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (auth.status === "unavailable") return null;

  if (auth.status !== "signed-in") {
    return <p className="mt-6 text-center text-xs text-slate-500">Sign in from the header to keep this report in your account. Practice never requires an account.</p>;
  }

  const save = async () => {
    if (!auth.client || !auth.user) return;
    setState("saving");
    const result = await saveCompletedSession(auth.client, session, auth.user.id);
    setState(result.ok ? "saved" : "error");
    setMessage(result.ok ? "Saved to your account." : result.message);
  };

  return (
    <div className="mt-6 text-center">
      <button
        onClick={() => void save()}
        disabled={state === "saving" || state === "saved"}
        className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "saved" ? "Saved to your account" : state === "saving" ? "Saving…" : "Save this report to my account"}
      </button>
      {message && <p aria-live="polite" className={`mt-2 text-xs ${state === "error" ? "text-red-700" : "text-slate-500"}`}>{message}</p>}
    </div>
  );
}
