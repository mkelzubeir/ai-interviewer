"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { initialState, loadSession, reducer, saveSession } from "@/lib/interview-session";
import { sampleJobDescription, sampleResume } from "@/lib/sample-data";
import { extractResumePdfText } from "@/lib/pdf-text";
import { voiceModeAvailable, voiceNeedsSession, voiceUnavailableNotice } from "@/lib/runtime-capabilities";
import { VoiceInterviewStage } from "@/components/voice-interview-stage";
import { useAnonymousSession } from "@/hooks/use-anonymous-session";
import { useJobLinkImport } from "@/hooks/use-job-link-import";
import type { InterviewDuration, InterviewType, VoiceTranscriptEntry } from "@/lib/schemas";

const interviewStages: { id: InterviewType; label: string; description: string }[] = [
  { id: "recruiter", label: "Recruiter screen", description: "Qualifications, interest, and logistics." },
  { id: "hiring-manager", label: "Hiring manager", description: "Judgment, ownership, and how you'd approach the role." },
  { id: "behavioral", label: "Behavioral / team", description: "STAR stories, collaboration, and soft skills." },
  { id: "final", label: "Final round", description: "Fit, motivation, and long-term alignment." },
];

type Dispatch = React.Dispatch<Parameters<typeof reducer>[1]>;

function Header({ phase }: { phase: string }) {
  const index = phase === "setup" ? 0 : phase === "interview" ? 1 : 2;
  return (
    <header className="border-b border-slate-200 bg-[#f7f7f4]">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-slate-950 text-xs text-white">ip</span>
          <span className="hidden sm:block">interview practice</span>
        </Link>
        <ol className="flex gap-4 text-xs">
          {["Setup", "Interview", "Report"].map((label, i) => (
            <li key={label} className={`flex items-center gap-2 ${i === index ? "font-semibold text-[#3f675b]" : "text-slate-400"}`}>
              <span className={`grid size-5 place-items-center rounded-full text-[10px] ${i <= index ? "bg-[#dcebe0] text-[#315248]" : "bg-slate-200"}`}>{i + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}

function Button({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{children}</button>;
}

export function InterviewApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Silent anonymous session: no sign-in step, but the Edge Function still gets
  // a verifiable JWT and a user id to rate limit against.
  const session = useAnonymousSession();

  useEffect(() => { dispatch({ type: "HYDRATE", session: loadSession() }); }, []);
  useEffect(() => { saveSession(state); }, [state]);

  const onFinalTranscript = useCallback((entry: VoiceTranscriptEntry) => dispatch({ type: "VOICE_TRANSCRIPT", entry }), []);
  const voiceContext = useMemo(
    () => ({
      interviewType: state.interviewType,
      roleSummary: state.jobDescription.slice(0, 800),
      candidateSummary: state.resume.slice(0, 800),
      competencies: [],
      claims: [],
      remainingBudget: Math.max(1, state.remainingBudget),
    }),
    [state.interviewType, state.jobDescription, state.resume, state.remainingBudget],
  );

  if (!state.hydrated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f7f4]">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#3f675b]" />
          <p className="mt-4 text-sm text-slate-500">Restoring your interview…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-slate-950">
      <Header phase={state.phase} />
      {state.recovery && <Recovery dispatch={dispatch} />}
      {state.phase === "setup" && <Setup state={state} dispatch={dispatch} session={session} />}
      {state.phase === "interview" && (
        <VoiceInterviewStage
          context={voiceContext}
          transcript={state.voiceTranscript}
          onFinalTranscript={onFinalTranscript}
          onEnd={() => dispatch({ type: "END" })}
          getAccessToken={session.getAccessToken}
        />
      )}
      {state.phase === "report" && <Report state={state} dispatch={dispatch} />}
    </main>
  );
}

function Recovery({ dispatch }: { dispatch: Dispatch }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/35 p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">Session found</p>
        <h2 id="recovery-title" className="mt-3 text-2xl font-semibold tracking-tight">Resume your interview?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">Your setup, conversation and completed report are saved in this browser.</p>
        <div className="mt-7 flex justify-end gap-3">
          <Button onClick={() => dispatch({ type: "DISCARD" })} className="border border-slate-300 bg-white text-slate-700">Start over</Button>
          <Button autoFocus onClick={() => dispatch({ type: "RESUME" })} className="bg-slate-950 text-white">Resume interview</Button>
        </div>
      </section>
    </div>
  );
}

function Setup({ state, dispatch, session }: { state: typeof initialState; dispatch: Dispatch; session: ReturnType<typeof useAnonymousSession> }) {
  const set = (partial: Partial<{ resume: string; jobDescription: string; interviewType: InterviewType; duration: InterviewDuration; sampleMode: boolean }>) =>
    dispatch({
      type: "SET_SETUP",
      resume: partial.resume ?? state.resume,
      jobDescription: partial.jobDescription ?? state.jobDescription,
      interviewType: partial.interviewType ?? state.interviewType,
      duration: partial.duration ?? state.duration,
      sampleMode: partial.sampleMode ?? state.sampleMode,
    });

  const loadSample = () => set({ resume: sampleResume, jobDescription: sampleJobDescription, interviewType: "recruiter", duration: 20, sampleMode: true });
  const jobLink = useJobLinkImport(session);
  // Never offer a Start that cannot mint a token: wait for the session when one is needed.
  const blocked = !voiceModeAvailable || (voiceNeedsSession && session.status !== "ready");

  return (
    <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#bdd5c4] bg-[#edf6ef] px-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-[#315248]">
          <i aria-hidden="true" className="size-2 rounded-full bg-[#5b9a75]" /> Live voice interview
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Add your context, then start talking.</h1>
        <p className="mt-5 leading-7 text-slate-600">
          Paste or upload your resume{jobLink.available ? ", then paste the job description or a link to the posting" : " and the job description"}. The interviewer takes it from there.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-8">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Your interview brief</h2>
            <p className="mt-1 text-sm text-slate-500">Kept in this browser. Sent to OpenAI only to run the interview.</p>
          </div>
          <Button onClick={loadSample} className="border border-[#bdd5c4] bg-[#edf6ef] text-[#315248]">Use a sample brief</Button>
        </div>

        <div className="mt-7 grid gap-6">
          <Field label="Resume" id="resume" value={state.resume} onChange={(value) => set({ resume: value, sampleMode: false })} placeholder="Paste your resume here…" />
          <Field label="Job description" id="job" value={state.jobDescription} onChange={(value) => set({ jobDescription: value, sampleMode: false })} placeholder="Paste the job description, or a link to it, above…" linkImport={jobLink} />

          <div className="grid gap-6 md:grid-cols-[1fr_210px]">
            <fieldset>
              <legend className="text-sm font-semibold">Interview stage</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {interviewStages.map((stage) => (
                  <label key={stage.id} className={`cursor-pointer rounded-xl border p-3 text-sm ${state.interviewType === stage.id ? "border-[#6e9c7c] bg-[#edf6ef]" : "border-slate-200"}`}>
                    <input className="sr-only" type="radio" name="type" checked={state.interviewType === stage.id} onChange={() => set({ interviewType: stage.id })} />
                    <span className="block font-semibold">{stage.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{stage.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Length</legend>
              <div className="mt-3 space-y-2">
                {([10, 20, 30] as InterviewDuration[]).map((duration) => (
                  <label key={duration} className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${state.duration === duration ? "border-[#6e9c7c] bg-[#edf6ef] font-semibold" : "border-slate-200"}`}>
                    <span>{duration} minutes</span>
                    <input type="radio" name="duration" checked={state.duration === duration} onChange={() => set({ duration })} />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Using the product means having the interview, so starting it is the
            consent action. What that entails is stated plainly rather than
            hidden behind a checkbox nobody reads. */}
        <p className="mt-7 rounded-xl border border-[#c9d8e6] bg-[#f2f7fb] p-4 text-sm leading-6 text-slate-700">
          Starting the interview sends your resume and job description, and your microphone audio, to OpenAI to run the
          conversation. Raw audio is not intentionally retained by this app, and the OpenAI API key stays server-side —
          it is never exposed to this page.
          {jobLink.available && " Importing a link fetches that public page server-side and sends its text to OpenAI to pull out the role."}
        </p>

        {!voiceModeAvailable && <p role="status" className="mt-4 rounded-xl border border-[#e6d3b8] bg-[#fdf7ed] px-4 py-3 text-sm leading-6 text-[#7a5a2e]">{voiceUnavailableNotice}</p>}
        {voiceModeAvailable && session.status === "failed" && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
            {session.error} <button onClick={() => void session.retry()} className="font-semibold underline underline-offset-4">Try again</button>
          </p>
        )}
        {state.error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">{voiceNeedsSession && session.status === "loading" ? "Preparing your session…" : "A microphone is required."}</p>
          <Button onClick={() => dispatch({ type: "START" })} disabled={blocked} className="bg-slate-950 text-white">Start voice interview →</Button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, id, value, onChange, placeholder, linkImport }: { label: string; id: string; value: string; onChange: (value: string) => void; placeholder: string; linkImport?: ReturnType<typeof useJobLinkImport> }) {
  const [status, setStatus] = useState("");
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setStatus("Extracting text from your PDF…");
    try {
      onChange(await extractResumePdfText(file));
      setStatus(`${file.name} extracted locally. Review or edit the text below.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We could not read that PDF.");
    }
  };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label} <span className="font-normal text-slate-400">(required)</span></label>
      <div className="mt-2 rounded-xl border border-dashed border-[#9ebda7] bg-[#f4faf5] p-3">
        {linkImport?.available && <LinkImport id={id} linkImport={linkImport} onImported={(text) => { setStatus(""); onChange(text); }} />}
        <label htmlFor={`${id}-pdf`} className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-xs leading-5 text-slate-600">Upload a PDF instead. Up to 5 MB; text is extracted in your browser.</span>
          <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#315248] shadow-sm">Choose PDF</span>
          <input id={`${id}-pdf`} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => upload(event.target.files?.[0])} />
        </label>
        {status && <p role="status" className="mt-2 text-xs text-[#315248]">{status}</p>}
      </div>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-36 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none transition focus:border-[#6e9c7c] focus:bg-white focus:ring-4 focus:ring-[#dcebe0]" />
    </div>
  );
}

/**
 * Paste the link to the role instead of the role.
 *
 * A form rather than a bare input, so Enter submits it. What comes back is
 * written into the textarea below rather than hidden behind a reference to the
 * URL — the person applying gets to read and correct it before it becomes the
 * brief the interviewer works from.
 */
function LinkImport({ id, linkImport, onImported }: { id: string; linkImport: ReturnType<typeof useJobLinkImport>; onImported: (text: string) => void }) {
  const [url, setUrl] = useState("");
  const { busy, message, failed } = linkImport.state;

  return (
    <form
      className="mb-3 border-b border-[#cfe3d4] pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        void linkImport.importUrl(url, onImported);
      }}
    >
      <label htmlFor={`${id}-url`} className="text-xs leading-5 text-slate-600">Paste a link to the role and we will pull the description in.</label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id={`${id}-url`}
          // Deliberately not type="url": that rejects `jobs.example.com/role`
          // before it is submitted, which is exactly how a link gets pasted.
          // `normalizeJobUrl` adds the scheme and does the real validation.
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://jobs.example.com/senior-analyst"
          className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs outline-none transition focus:border-[#6e9c7c] focus:ring-4 focus:ring-[#dcebe0]"
        />
        {/* Never offer an import that cannot authenticate: the Edge Function
            verifies a JWT, and the silent session arrives a moment after load. */}
        <button type="submit" disabled={busy || !linkImport.ready || !url.trim()} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[#315248] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Reading…" : linkImport.ready ? "Import link" : "Preparing…"}
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-2 text-xs leading-5 ${failed ? "text-[#a13d2a]" : "text-[#315248]"}`}>{message}</p>
      )}
    </form>
  );
}

function Report({ state, dispatch }: { state: typeof initialState; dispatch: Dispatch }) {
  const report = state.completedReport!;
  return (
    <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">Interview complete</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-.045em] sm:text-5xl">Your practice report.</h1>
        <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">Built from what you actually said. Missing evidence stays a placeholder instead of becoming an invented accomplishment.</p>
      </div>

      {!report.questions.length && (
        <p role="status" className="mx-auto mt-8 max-w-2xl rounded-xl border border-[#e6d3b8] bg-[#fdf7ed] px-4 py-3 text-sm leading-6 text-[#7a5a2e]">
          The interview ended before you answered anything, so there is nothing to give feedback on yet. Start again and talk through at least one question.
        </p>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Overall practice score</p>
          <div className="mt-4 text-7xl font-semibold tracking-[-.07em]">{report.score || "—"}</div>
          <p className="mt-4 text-sm text-slate-300">{report.readiness}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-7">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">Executive summary</p>
          <p className="mt-4 text-sm leading-6 text-slate-700">{report.summary}</p>
          <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 text-sm">
            <div><dt className="text-slate-500">Strongest dimension</dt><dd className="mt-1 font-semibold">{report.strongestDimension}</dd></div>
            <div><dt className="text-slate-500">Most important improvement</dt><dd className="mt-1 font-semibold">{report.improvementArea}</dd></div>
          </dl>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-7">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">Competency breakdown</p>
          <div className="mt-5 space-y-4">
            {report.competencies.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm"><span>{item.label}</span><b>{item.score}</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#5b8b6d]" style={{ width: `${item.score}%` }} /></div>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-[#efd8cc] bg-[#fff7f3] p-7">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#a65339]">Likely interviewer concerns</p>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">{report.concerns.map((item) => <li key={item}>• {item}</li>)}</ul>
          <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#a65339]">Best stories to prepare</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">{report.stories.map((item) => <li key={item}>• {item}</li>)}</ul>
        </article>
      </div>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-7">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#3f675b]">Three preparation actions</p>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {report.actions.map((item, index) => <li key={item} className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><b className="text-[#3f675b]">0{index + 1}</b><p className="mt-2">{item}</p></li>)}
        </ol>
      </section>

      {report.questions.length > 0 && (
        <section className="mt-4 space-y-4">
          <h2 className="pt-5 text-2xl font-semibold tracking-tight">Question-by-question feedback</h2>
          {report.questions.map((item, index) => (
            <article key={index} className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-sm font-semibold">{item.question}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">What you said</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.answer}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#3f675b]">Better structure</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.structure}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#3f675b]">What worked</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.worked}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a65339]">What weakened it</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.weakened}</p></div>
              </div>
              <div className="mt-4 rounded-xl bg-[#edf6ef] p-4 text-sm leading-6 text-slate-700"><b>Improved example:</b> {item.improvedExample}</div>
            </article>
          ))}
        </section>
      )}

      <div className="mt-8 text-center">
        <Button onClick={() => dispatch({ type: "RESTART" })} className="border border-slate-300 bg-white text-slate-700">Start a new interview</Button>
      </div>
    </section>
  );
}
