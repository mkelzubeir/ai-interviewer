"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeInterviewClient } from "@/lib/openai/realtime/client";
import { userSafeRealtimeError } from "@/lib/openai/realtime/error";
import { applyVoiceTurnEvent, canFinishAnswer, initialVoiceTurnState, resetVoiceTurnAfterResponse } from "@/lib/openai/realtime/turn-state";
import { withBasePath } from "@/lib/runtime-capabilities";
import type { RealtimeConnectionState } from "@/lib/openai/realtime/types";

export function useRealtimeInterview(context: Record<string, unknown>) {
  const client = useRef<RealtimeInterviewClient | null>(null);
  const id = useRef(crypto.randomUUID());
  const [status, setStatus] = useState<RealtimeConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [turn, setTurn] = useState(initialVoiceTurnState);
  const [finishMessage, setFinishMessage] = useState<string | null>(null);

  const close = useCallback(() => {
    client.current?.close();
    client.current = null;
  }, []);

  useEffect(() => close, [close]);

  const handleEvent = useCallback((event: Parameters<ConstructorParameters<typeof RealtimeInterviewClient>[0]>[0]) => {
    if (!event) return;
    if (event.type === "error") {
      if (process.env.NODE_ENV === "development") console.warn("Realtime event failed", event.message);
      setError(userSafeRealtimeError(event.message ?? ""));
      return;
    }
    if (event.type.endsWith("partial")) setPartial(event.text ?? "");
    if (event.type.endsWith("final")) setPartial("");
    setTurn((current) => {
      const next = applyVoiceTurnEvent(current, event);
      return event.type === "response.done" ? resetVoiceTurnAfterResponse(next) : next;
    });
  }, []);

  const start = useCallback(async () => {
    if (client.current) return;
    setStatus("requesting-permission");
    setError(null);
    setFinishMessage(null);
    setTurn(initialVoiceTurnState);
    try {
      const response = await fetch(withBasePath("/api/realtime/session"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: id.current, ...context }),
      });
      const credential = await response.json();
      if (!response.ok) throw new Error(typeof credential.error === "string" ? credential.error : "Unable to start voice interview.");
      const next = new RealtimeInterviewClient(handleEvent, (nextState) => setStatus(nextState));
      client.current = next;
      await next.connect(credential);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (process.env.NODE_ENV === "development") console.warn("Unable to start realtime interview", message);
      setError(userSafeRealtimeError(message));
      setStatus("failed");
      close();
    }
  }, [close, context, handleEvent]);

  const finishAnswer = useCallback(() => {
    if (!canFinishAnswer(status, turn)) {
      setFinishMessage("I haven’t detected an answer yet. Start speaking, then use this button if automatic turn detection does not respond.");
      return;
    }
    // Server VAD owns media-track turn finalization. This intentionally emits no Realtime event.
    setTurn((current) => ({ ...current, finishHintRequested: true }));
    setFinishMessage("Automatic turn detection will finish your answer after a brief pause.");
  }, [status, turn]);

  const interrupt = useCallback(() => {
    if (!turn.interviewerSpeaking || turn.responseActive === false) return;
    client.current?.interrupt();
  }, [turn]);

  return {
    status,
    error,
    partial,
    turn,
    finishMessage,
    canFinish: canFinishAnswer(status, turn),
    canInterrupt: status === "connected" && turn.interviewerSpeaking && turn.responseActive,
    start,
    close,
    mute: (value: boolean) => client.current?.setMuted(value),
    done: finishAnswer,
    interrupt,
  };
}
