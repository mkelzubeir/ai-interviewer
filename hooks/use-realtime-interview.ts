"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeInterviewClient } from "@/lib/openai/realtime/client";
import { userSafeRealtimeError } from "@/lib/openai/realtime/error";
import { normalizeTranscriptText } from "@/lib/openai/realtime/events";
import { applyVoiceTurnEvent, canFinishAnswer, initialVoiceTurnState, resetVoiceTurnAfterResponse } from "@/lib/openai/realtime/turn-state";
import type { NormalizedRealtimeEvent, RealtimeConnectionState } from "@/lib/openai/realtime/types";
import type { VoiceTranscriptEntry } from "@/lib/schemas";
import { withBasePath } from "@/lib/runtime-capabilities";

type Options = {
  context: Record<string, unknown>;
  /** Receives finalized turns for persistence into the durable session. */
  onFinalTranscript?: (entry: VoiceTranscriptEntry) => void;
};

export function useRealtimeInterview({ context, onFinalTranscript }: Options) {
  const client = useRef<RealtimeInterviewClient | null>(null);
  const id = useRef(crypto.randomUUID());
  const [status, setStatus] = useState<RealtimeConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [turn, setTurn] = useState(initialVoiceTurnState);

  // Held in a ref so a changing callback identity never re-creates `start`,
  // which would tear down a live session.
  const onFinal = useRef(onFinalTranscript);
  useEffect(() => { onFinal.current = onFinalTranscript; }, [onFinalTranscript]);

  const contextRef = useRef(context);
  useEffect(() => { contextRef.current = context; }, [context]);

  const close = useCallback(() => {
    client.current?.close();
    client.current = null;
  }, []);

  useEffect(() => close, [close]);

  const handleState = useCallback((next: RealtimeConnectionState) => {
    setStatus(next);
    // A dropped or closed session must release the client, otherwise `start`
    // short-circuits on the stale ref and voice can never be retried. The
    // interview itself is untouched: transcript entries already merged into the
    // session persist, and text mode stays available throughout.
    if (next === "failed" || next === "closed") {
      client.current?.close();
      client.current = null;
      setPartial("");
      setTurn(initialVoiceTurnState);
    }
  }, []);

  const handleEvent = useCallback((event: NormalizedRealtimeEvent | null) => {
    if (!event) return;
    if (event.type === "error") {
      if (process.env.NODE_ENV === "development") console.warn("Realtime event failed", event.message);
      setError(userSafeRealtimeError(event.message ?? ""));
      return;
    }
    if (event.type.endsWith("partial")) setPartial(normalizeTranscriptText(event.text ?? ""));
    if (event.type === "candidate.final" || event.type === "interviewer.final") {
      setPartial("");
      const text = normalizeTranscriptText(event.text ?? "");
      if (text) {
        onFinal.current?.({
          id: event.id ?? `${event.type}-${Date.now()}`,
          speaker: event.type === "candidate.final" ? "candidate" : "interviewer",
          text,
          timestamp: Date.now(),
          final: true,
          interrupted: false,
        });
      }
    }
    setTurn((current) => {
      const next = applyVoiceTurnEvent(current, event);
      return event.type === "response.done" ? resetVoiceTurnAfterResponse(next) : next;
    });
  }, []);

  const start = useCallback(async () => {
    if (client.current) return;
    setStatus("requesting-permission");
    setError(null);
    setTurn(initialVoiceTurnState);
    try {
      const response = await fetch(withBasePath("/api/realtime/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id.current, ...contextRef.current }),
      });
      const credential = await response.json();
      if (!response.ok) throw new Error(typeof credential.error === "string" ? credential.error : "Unable to start voice interview.");
      const next = new RealtimeInterviewClient(handleEvent, handleState);
      client.current = next;
      await next.connect(credential);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (process.env.NODE_ENV === "development") console.warn("Unable to start realtime interview", message);
      setError(userSafeRealtimeError(message));
      setStatus("failed");
      close();
    }
  }, [close, handleEvent, handleState]);

  return {
    status,
    error,
    partial,
    turn,
    awaitingTurnEnd: canFinishAnswer(status, turn),
    canInterrupt: status === "connected" && turn.interviewerSpeaking && turn.responseActive,
    start,
    close,
    mute: (value: boolean) => client.current?.setMuted(value),
    interrupt: () => {
      if (!turn.interviewerSpeaking || !turn.responseActive) return;
      client.current?.interrupt();
    },
  };
}
