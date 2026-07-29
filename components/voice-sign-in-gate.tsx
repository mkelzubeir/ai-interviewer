"use client";

/**
 * What a signed-out visitor sees when voice is the configured experience.
 *
 * Deliberately not a text form: the product is the spoken interview, so the
 * primary action is signing in. Text remains one click away as the fallback.
 */
export function VoiceSignInGate({ onUseText }: { onUseText: () => void }) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="rounded-2xl border border-[#bdd5c4] bg-white p-8 text-center shadow-xl shadow-slate-900/5 sm:p-12">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#bdd5c4] bg-[#edf6ef] px-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-[#315248]">
          <i aria-hidden="true" className="size-2 rounded-full bg-[#5b9a75]" /> Live voice interview
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Sign in to start a voice interview</h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-slate-600">
          The spoken interview runs a live speech-to-speech session through OpenAI. This hosted demo limits it to signed-in
          users so the running costs stay under control. Use <b>Sign in to save reports</b> in the header — it is a magic
          link, no password.
        </p>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-slate-600">
          Not ready to sign in? The written interview needs no account and produces the same feedback report.
        </p>
        <button onClick={onUseText} className="mt-8 rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-500">
          Continue in text mode instead
        </button>
      </div>
    </section>
  );
}
