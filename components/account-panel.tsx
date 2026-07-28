"use client";

import { useState } from "react";
import type { useSupabaseAuth } from "@/hooks/use-supabase-auth";

type Auth = ReturnType<typeof useSupabaseAuth>;

/**
 * Optional sign-in control. Renders nothing at all when Supabase is not
 * configured, which is what keeps anonymous local-only mode unchanged.
 */
export function AccountPanel({ auth }: { auth: Auth }) {
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);

  if (auth.status === "unavailable" || auth.status === "loading") return null;

  if (auth.status === "signed-in") {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="hidden text-slate-500 sm:inline">{auth.user?.email}</span>
        <button onClick={() => void auth.signOut()} className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="relative text-xs">
      <button onClick={() => setOpen((value) => !value)} className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700">
        Sign in to save reports
      </button>
      {open && (
        <form
          onSubmit={(event) => { event.preventDefault(); if (email.trim()) void auth.signIn(email.trim()); }}
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <label htmlFor="account-email" className="font-semibold">Email a sign-in link</label>
          <p className="mt-1 leading-5 text-slate-500">Optional. Saving a report to your account is the only thing this unlocks — practice works signed out.</p>
          <input
            id="account-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 outline-none focus:border-[#6e9c7c] focus:bg-white"
          />
          <button type="submit" className="mt-3 w-full rounded-full bg-slate-950 px-3 py-2 font-semibold text-white">Send link</button>
          {auth.notice && <p aria-live="polite" className="mt-3 leading-5 text-slate-600">{auth.notice}</p>}
        </form>
      )}
    </div>
  );
}
