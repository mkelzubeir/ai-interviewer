import type { NormalizedRealtimeEvent, VoiceTranscriptEntry } from "./types";

export function normalizeRealtimeEvent(event: unknown): NormalizedRealtimeEvent | null {
  if (!event || typeof event !== "object" || !("type" in event)) return null;
  const value = event as Record<string, unknown>; const type = value.type;
  if (type === "conversation.item.input_audio_transcription.delta") return { type: "candidate.partial", id: String(value.item_id ?? "candidate"), text: String(value.delta ?? "") };
  if (type === "conversation.item.input_audio_transcription.completed") return { type: "candidate.final", id: String(value.item_id ?? "candidate"), text: String(value.transcript ?? "") };
  if (type === "input_audio_buffer.speech_started") return { type: "candidate.speech_started", id: String(value.item_id ?? "candidate") };
  if (type === "input_audio_buffer.speech_stopped") return { type: "candidate.speech_stopped", id: String(value.item_id ?? "candidate") };
  if (type === "input_audio_buffer.committed") return { type: "candidate.turn_committed", id: String(value.item_id ?? "candidate") };
  if (type === "response.output_audio_transcript.delta") return { type: "interviewer.partial", id: String(value.item_id ?? "interviewer"), text: String(value.delta ?? "") };
  if (type === "response.output_audio_transcript.done") return { type: "interviewer.final", id: String(value.item_id ?? "interviewer"), text: String(value.transcript ?? "") };
  if (type === "output_audio_buffer.started") return { type: "interviewer.started", id: String(value.response_id ?? "response") };
  if (type === "output_audio_buffer.stopped") return { type: "interviewer.stopped", id: String(value.response_id ?? "response") };
  if (type === "response.created") return { type: "response.created", id: String((value.response as Record<string, unknown> | undefined)?.id ?? "response") };
  if (type === "response.done") return { type: "response.done", id: String((value.response as Record<string, unknown> | undefined)?.id ?? "response") };
  if (type === "error") return { type: "error", message: String((value.error as Record<string, unknown> | undefined)?.message ?? "Realtime connection error") };
  return null;
}

/** Collapse the whitespace that streamed transcription deltas leave behind. */
export function normalizeTranscriptText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Merge one finalized entry into the durable voice transcript.
 *
 * Realtime can deliver the same utterance more than once — a corrected final for
 * an item id already seen, or an identical final re-emitted under a fresh id
 * after a reconnect — so both shapes are deduplicated here rather than in the
 * component that renders them.
 */
export function mergeFinalTranscript(entries: VoiceTranscriptEntry[], entry: VoiceTranscriptEntry) {
  const text = normalizeTranscriptText(entry.text);
  if (!text) return entries;
  const normalized = { ...entry, text };

  const existing = entries.findIndex((current) => current.id === normalized.id);
  if (existing >= 0) {
    if (entries[existing].text === text) return entries;
    return byTimestamp(entries.map((current, index) => (index === existing ? normalized : current)));
  }

  const last = entries.at(-1);
  if (last && last.speaker === normalized.speaker && last.text === text) return entries;
  return byTimestamp([...entries, normalized]);
}

function byTimestamp(entries: VoiceTranscriptEntry[]) {
  return [...entries].sort((a, b) => a.timestamp - b.timestamp);
}
