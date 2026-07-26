"use client";

import { useState } from "react";
import { useRealtimeInterview } from "@/hooks/use-realtime-interview";

type VoiceContext = {
  interviewType: string;
  roleSummary: string;
  candidateSummary: string;
  competencies: string[];
  claims: string[];
  remainingBudget: number;
};

export function VoiceInterviewPanel({ context }: { context: VoiceContext }) {
  const voice = useRealtimeInterview(context);
  const [consent, setConsent] = useState(false);
  const [muted, setMuted] = useState(false);
  const live = voice.status === "connected";

  // Media-track WebRTC sessions use server VAD; there is no safe client-side manual commit.
  // Keep the control visible as an accessibility explanation, but never emit an invalid event.
  const finishDisabled = true;
  const finishHelp = voice.turn.interviewerSpeaking
    ? "Finish answer is unavailable while the interviewer is speaking."
    : voice.canFinish
      ? "Automatic turn detection will finish your answer after a brief pause."
      : "I haven’t detected an answer yet. Start speaking, then pause briefly for automatic turn detection.";

  return (
    <section className="mx-auto mb-5 max-w-5xl rounded-xl border border-[#bcd3c2] bg-[#f3faf4] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#315248]">Live voice interview</p>
          <p className="mt-1 text-xs text-slate-600">Microphone audio is sent to OpenAI for live processing. Raw audio is not intentionally retained by this app.</p>
        </div>
        {!live ? (
          <button onClick={() => (consent ? void voice.start() : setConsent(true))} className="rounded-full bg-[#315248] px-4 py-2 text-sm font-semibold text-white">
            {consent ? "Allow microphone & start" : "Start voice interview"}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { const next = !muted; setMuted(next); voice.mute(next); }} className="rounded-full border border-[#9db7a4] bg-white px-3 py-2 text-xs">
              {muted ? "Unmute" : "Mute"}
            </button>
            <button disabled={finishDisabled} aria-describedby="finish-answer-help" className="rounded-full bg-[#315248] px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">
              Finish answer
            </button>
            <button onClick={voice.interrupt} disabled={!voice.canInterrupt} className="rounded-full border border-[#9db7a4] bg-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">
              Interrupt
            </button>
          </div>
        )}
      </div>
      {live && <p id="finish-answer-help" className="mt-2 text-xs text-slate-500">{finishHelp}</p>}
      <p aria-live="polite" className="mt-3 text-xs text-slate-500">Voice status: {voice.status}. Text mode remains available below.</p>
      {voice.finishMessage && <p aria-live="polite" className="mt-2 text-xs text-slate-600">{voice.finishMessage}</p>}
      {voice.error && <p role="alert" className="mt-2 text-xs text-red-700">{voice.error} Continue in text mode or retry voice.</p>}
      {voice.partial && <p className="mt-2 text-xs text-slate-600">Live transcript: {voice.partial}</p>}
    </section>
  );
}
