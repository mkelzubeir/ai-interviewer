"use client";

import { useState } from "react";
import { useRealtimeInterview } from "@/hooks/use-realtime-interview";
import { interviewer } from "@/lib/sample-data";
import type { VoiceTranscriptEntry } from "@/lib/schemas";

type VoiceContext = {
  interviewType: string;
  roleSummary: string;
  candidateSummary: string;
  competencies: string[];
  claims: string[];
  remainingBudget: number;
};

const statusLabel: Record<string, string> = {
  idle: "Ready when you are",
  "requesting-permission": "Waiting for microphone permission…",
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
  failed: "Voice ended",
  closed: "Voice ended",
};

/**
 * The interview: a spoken conversation with the interviewer.
 *
 * Every finalized turn is merged into the durable session as it arrives, so a
 * dropped connection, a refresh or an early end still yields a report from
 * whatever was actually said.
 */
export function VoiceInterviewStage({
  context,
  transcript,
  onFinalTranscript,
  onEnd,
  getAccessToken,
}: {
  context: VoiceContext;
  transcript: VoiceTranscriptEntry[];
  onFinalTranscript: (entry: VoiceTranscriptEntry) => void;
  onEnd: () => void;
  getAccessToken?: () => Promise<string | null>;
}) {
  const voice = useRealtimeInterview({ context, onFinalTranscript, getAccessToken });
  const [muted, setMuted] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const live = voice.status === "connected";
  const started = voice.status !== "idle";
  const ended = voice.status === "failed" || voice.status === "closed";
  // A resumed interview must show what was already said, not hide it behind the
  // start prompt.
  const resuming = !started && transcript.length > 0;

  const speaking = voice.turn.interviewerSpeaking ? "Interviewer is speaking" : voice.turn.candidateSpeechActive ? "Listening to you" : live ? "Your turn — start speaking" : statusLabel[voice.status] ?? voice.status;

  return (
    <section className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-[#edf4ee] px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-[#3f675b] font-semibold text-white">{interviewer.initials}</span>
            <div>
              <p className="font-semibold">{interviewer.name}</p>
              <p className="text-xs text-slate-500">{interviewer.role}</p>
            </div>
          </div>
          <p aria-live="polite" className="flex items-center gap-2 text-xs font-semibold text-[#315248]">
            <i aria-hidden="true" className={`size-2 rounded-full ${live ? "animate-pulse bg-[#5b9a75]" : "bg-slate-400"}`} />
            {speaking}
          </p>
        </header>

        <div className="min-h-64 px-6 py-7">
          {!started && (
            <div className="py-8 text-center">
              <h1 className="text-2xl font-semibold tracking-[-.03em]">{resuming ? "Pick up where you left off" : "Ready for a spoken interview?"}</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
                Your browser will ask for microphone access. Speak naturally and pause when you are done — the interviewer takes its turn automatically.
              </p>
              <button onClick={() => void voice.start()} className="mt-7 rounded-full bg-[#315248] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#274238]">
                Allow microphone &amp; {resuming ? "continue" : "begin"}
              </button>
            </div>
          )}

          {(started || transcript.length > 0) && (
            <ol className="space-y-5">
              {transcript.map((entry) => (
                <li key={entry.id} className={entry.speaker === "interviewer" ? "" : "pl-6 sm:pl-10"}>
                  <p className={`text-xs font-bold uppercase tracking-[.14em] ${entry.speaker === "interviewer" ? "text-[#3f675b]" : "text-slate-400"}`}>
                    {entry.speaker === "interviewer" ? interviewer.name : "You"}
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-700">{entry.text}</p>
                </li>
              ))}
              {voice.partial && (
                <li className="pl-6 sm:pl-10">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">You</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{voice.partial}</p>
                </li>
              )}
              {!transcript.length && !voice.partial && (
                <li className="py-6 text-center text-sm text-slate-500">{live ? "Say hello to get started." : statusLabel[voice.status] ?? ""}</li>
              )}
            </ol>
          )}

          {voice.error && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{voice.error}</p>}
          {ended && (
            <p aria-live="polite" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              Voice has ended. Everything said so far is saved — retry, or end and read your report.
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {live ? (
              <>
                <button onClick={() => { const next = !muted; setMuted(next); voice.mute(next); }} className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700">
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button onClick={voice.interrupt} disabled={!voice.canInterrupt} className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Interrupt
                </button>
              </>
            ) : started ? (
              <button onClick={() => void voice.start()} className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700">
                Retry voice
              </button>
            ) : null}
          </div>
          <button onClick={() => setConfirmEnd(true)} className="rounded-full bg-slate-950 px-5 py-2.5 text-xs font-semibold text-white">
            End &amp; get report
          </button>
        </footer>
      </div>

      {confirmEnd && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/35 p-5">
          <div role="dialog" aria-modal="true" aria-labelledby="end-voice-title" className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
            <h2 id="end-voice-title" className="text-xl font-semibold">End the interview?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Your report is built from what you have said so far.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmEnd(false)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700">Keep going</button>
              <button onClick={() => { try { voice.close(); } finally { onEnd(); } }} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">End and view report</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
