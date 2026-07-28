import { describe, expect, it } from "vitest";
import { mergeFinalTranscript, normalizeRealtimeEvent, normalizeTranscriptText } from "./events";
import type { VoiceTranscriptEntry } from "./types";

function entry(overrides: Partial<VoiceTranscriptEntry> & Pick<VoiceTranscriptEntry, "id" | "text">): VoiceTranscriptEntry {
  return { speaker: "candidate", timestamp: 1_000, final: true, interrupted: false, ...overrides };
}

describe("data-channel event adapter", () => {
  it("maps candidate transcription deltas and finals", () => {
    expect(normalizeRealtimeEvent({ type: "conversation.item.input_audio_transcription.delta", item_id: "item_1", delta: "I led" }))
      .toEqual({ type: "candidate.partial", id: "item_1", text: "I led" });
    expect(normalizeRealtimeEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "item_1", transcript: "I led the migration." }))
      .toEqual({ type: "candidate.final", id: "item_1", text: "I led the migration." });
  });

  it("maps interviewer audio transcript events", () => {
    expect(normalizeRealtimeEvent({ type: "response.output_audio_transcript.delta", item_id: "resp_1", delta: "Tell me" }))
      .toEqual({ type: "interviewer.partial", id: "resp_1", text: "Tell me" });
    expect(normalizeRealtimeEvent({ type: "response.output_audio_transcript.done", item_id: "resp_1", transcript: "Tell me about a tradeoff." }))
      .toEqual({ type: "interviewer.final", id: "resp_1", text: "Tell me about a tradeoff." });
  });

  it("maps response and audio-buffer lifecycle events", () => {
    expect(normalizeRealtimeEvent({ type: "response.created", response: { id: "resp_9" } })).toEqual({ type: "response.created", id: "resp_9" });
    expect(normalizeRealtimeEvent({ type: "response.done", response: { id: "resp_9" } })).toEqual({ type: "response.done", id: "resp_9" });
    expect(normalizeRealtimeEvent({ type: "output_audio_buffer.started", response_id: "resp_9" })).toEqual({ type: "interviewer.started", id: "resp_9" });
    expect(normalizeRealtimeEvent({ type: "output_audio_buffer.stopped", response_id: "resp_9" })).toEqual({ type: "interviewer.stopped", id: "resp_9" });
  });

  it("surfaces a provider error message", () => {
    expect(normalizeRealtimeEvent({ type: "error", error: { message: "buffer too small" } })).toEqual({ type: "error", message: "buffer too small" });
    expect(normalizeRealtimeEvent({ type: "error" })).toEqual({ type: "error", message: "Realtime connection error" });
  });

  it("ignores malformed or unknown events instead of throwing", () => {
    for (const value of [null, undefined, 42, "text", {}, { type: "response.audio.some_future_event" }]) {
      expect(normalizeRealtimeEvent(value)).toBeNull();
    }
  });

  it("falls back to a stable id when the provider omits one", () => {
    expect(normalizeRealtimeEvent({ type: "conversation.item.input_audio_transcription.delta", delta: "hi" })).toMatchObject({ id: "candidate" });
  });
});

describe("transcript normalization", () => {
  it("collapses the whitespace that streamed deltas leave behind", () => {
    expect(normalizeTranscriptText("  I  led\n the\tmigration.  ")).toBe("I led the migration.");
    expect(normalizeTranscriptText("   ")).toBe("");
  });
});

describe("transcript dedup and ordering", () => {
  it("appends a new finalized entry", () => {
    const merged = mergeFinalTranscript([], entry({ id: "a", text: "I led the migration." }));
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("I led the migration.");
  });

  it("normalizes text on the way in", () => {
    const merged = mergeFinalTranscript([], entry({ id: "a", text: "  I   led\nthe migration. " }));
    expect(merged[0].text).toBe("I led the migration.");
  });

  it("drops an empty final rather than storing a blank turn", () => {
    const existing = [entry({ id: "a", text: "I led the migration." })];
    expect(mergeFinalTranscript(existing, entry({ id: "b", text: "   " }))).toBe(existing);
  });

  it("replaces an entry when the provider corrects the same item id", () => {
    const existing = [entry({ id: "a", text: "I led the migration" })];
    const merged = mergeFinalTranscript(existing, entry({ id: "a", text: "I led the data migration." }));
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("I led the data migration.");
  });

  it("is idempotent when the identical final arrives twice under the same id", () => {
    const existing = [entry({ id: "a", text: "I led the migration." })];
    expect(mergeFinalTranscript(existing, entry({ id: "a", text: "I led the migration." }))).toBe(existing);
  });

  it("deduplicates an identical utterance re-emitted under a fresh id", () => {
    // A reconnect can replay the last turn with a new item id.
    const existing = [entry({ id: "a", text: "I led the migration." })];
    expect(mergeFinalTranscript(existing, entry({ id: "b", text: "I led the migration.", timestamp: 2_000 }))).toBe(existing);
  });

  it("keeps an identical utterance from the other speaker", () => {
    const existing = [entry({ id: "a", text: "Understood." })];
    const merged = mergeFinalTranscript(existing, entry({ id: "b", speaker: "interviewer", text: "Understood.", timestamp: 2_000 }));
    expect(merged).toHaveLength(2);
  });

  it("orders the transcript by timestamp regardless of arrival order", () => {
    let merged = mergeFinalTranscript([], entry({ id: "b", text: "Second answer.", timestamp: 3_000 }));
    merged = mergeFinalTranscript(merged, entry({ id: "a", text: "First answer.", timestamp: 1_000 }));
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
