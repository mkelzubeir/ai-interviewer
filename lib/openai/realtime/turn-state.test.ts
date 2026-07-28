import { describe, expect, it } from "vitest";
import { normalizeRealtimeEvent } from "./events";
import { applyVoiceTurnEvent, canFinishAnswer, initialVoiceTurnState, resetVoiceTurnAfterResponse } from "./turn-state";

describe("voice turn state", () => {
  it("keeps Finish answer disabled before candidate speech", () => {
    expect(canFinishAnswer("connected", initialVoiceTurnState)).toBe(false);
  });

  it("tracks candidate speech-started and speech-stopped transitions", () => {
    const speaking = applyVoiceTurnEvent(initialVoiceTurnState, { type: "candidate.speech_started" }, 1000);
    expect(speaking.candidateSpeechStarted).toBe(true);
    expect(speaking.candidateSpeechActive).toBe(true);
    expect(speaking.currentTurnStartedAt).toBe(1000);
    expect(applyVoiceTurnEvent(speaking, { type: "candidate.speech_stopped" }).candidateSpeechActive).toBe(false);
  });

  it("disables manual completion after VAD commits the turn", () => {
    const withEvidence = applyVoiceTurnEvent(
      applyVoiceTurnEvent(initialVoiceTurnState, { type: "candidate.speech_started" }),
      { type: "candidate.final", text: "I led the migration." },
    );
    expect(canFinishAnswer("connected", withEvidence)).toBe(true);
    const committed = applyVoiceTurnEvent(withEvidence, { type: "candidate.turn_committed" });
    expect(canFinishAnswer("connected", committed)).toBe(false);
  });

  it("stops treating a turn as pending once the interviewer starts responding", () => {
    const ready = applyVoiceTurnEvent(
      applyVoiceTurnEvent(initialVoiceTurnState, { type: "candidate.speech_started" }),
      { type: "candidate.partial", text: "A concrete answer" },
    );
    expect(canFinishAnswer("connected", ready)).toBe(true);
    const responding = applyVoiceTurnEvent(ready, { type: "response.created" });
    expect(canFinishAnswer("connected", responding)).toBe(false);
  });

  it("reports nothing pending unless the session is connected", () => {
    const ready = applyVoiceTurnEvent(
      applyVoiceTurnEvent(initialVoiceTurnState, { type: "candidate.speech_started" }),
      { type: "candidate.final", text: "I led the migration." },
    );
    expect(canFinishAnswer("connected", ready)).toBe(true);
    expect(canFinishAnswer("failed", ready)).toBe(false);
    expect(canFinishAnswer("closed", ready)).toBe(false);
  });

  it("does not permit finishing or interrupting while interviewer audio is active", () => {
    const speaking = applyVoiceTurnEvent(initialVoiceTurnState, { type: "interviewer.started" });
    expect(speaking.interviewerSpeaking).toBe(true);
    expect(canFinishAnswer("connected", { ...speaking, candidateSpeechStarted: true, currentTurnHasEvidence: true })).toBe(false);
  });

  it("resets a completed voice turn for the next candidate answer", () => {
    const completed = { ...initialVoiceTurnState, candidateTurnCommitted: true, responseActive: false, currentTurnHasEvidence: true };
    expect(resetVoiceTurnAfterResponse(completed)).toEqual(initialVoiceTurnState);
  });
});

describe("Realtime event normalization", () => {
  it("normalizes VAD lifecycle events without treating them as manual commits", () => {
    expect(normalizeRealtimeEvent({ type: "input_audio_buffer.speech_started", item_id: "item_1" })).toMatchObject({ type: "candidate.speech_started" });
    expect(normalizeRealtimeEvent({ type: "input_audio_buffer.speech_stopped", item_id: "item_1" })).toMatchObject({ type: "candidate.speech_stopped" });
    expect(normalizeRealtimeEvent({ type: "input_audio_buffer.committed", item_id: "item_1" })).toMatchObject({ type: "candidate.turn_committed" });
  });
});
