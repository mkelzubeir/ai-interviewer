"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeInterviewClient } from "@/lib/openai/realtime/client";
import type { RealtimeConnectionState } from "@/lib/openai/realtime/types";

export function useRealtimeInterview(context: Record<string, unknown>) {
  const client = useRef<RealtimeInterviewClient | null>(null); const id = useRef(crypto.randomUUID()); const [status, setStatus] = useState<RealtimeConnectionState>("idle"); const [error, setError] = useState<string | null>(null); const [partial, setPartial] = useState("");
  const close = useCallback(() => { client.current?.close(); client.current = null; }, []); useEffect(() => close, [close]);
  const start = useCallback(async () => { if (client.current) return; setStatus("requesting-permission"); try { const response = await fetch("/api/realtime/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: id.current, ...context }) }); const credential = await response.json(); if (!response.ok) throw new Error(credential.error); const next = new RealtimeInterviewClient((event) => { if (event?.type === "error") setError(event.message ?? "Realtime error"); if (event?.type.endsWith("partial")) setPartial(event.text ?? ""); if (event?.type.endsWith("final")) setPartial(""); }, (nextState) => setStatus(nextState)); client.current = next; await next.connect(credential); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to start voice interview."); setStatus("failed"); close(); } }, [close, context]);
  return { status, error, partial, start, close, mute: (value: boolean) => client.current?.setMuted(value), done: () => client.current?.doneAnswering(), interrupt: () => client.current?.interrupt() };
}
