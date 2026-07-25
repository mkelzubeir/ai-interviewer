import { describe, expect, it } from "vitest";
import { emptySession, initialState, parseStoredSession, reducer } from "./interview-session";
import { sessionSchema } from "./schemas";
import { sampleJobDescription, sampleResume } from "./sample-data";

describe("session state and recovery", () => {
  it("moves a sample setup through an interview", () => {
    let state = reducer(initialState, { type: "SET_SETUP", resume: sampleResume, jobDescription: sampleJobDescription, interviewType: "mixed", duration: 10, sampleMode: true });
    state = reducer(state, { type: "START" });
    expect(state).toMatchObject({ phase: "interview", sampleMode: true, remainingBudget: 4 });
    state = reducer(state, { type: "ANSWER", answer: "I led a cross-functional project and it improved by 28%." });
    state = reducer(state, { type: "ADVANCE" });
    expect(state.phase).toBe("interview");
  });

  it("recovers a valid active session and ignores corrupted storage", () => {
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1, currentQuestion: { id: "q", prompt: "Question", competency: "Test", topic: "test", kind: "opening" as const }, questionsAsked: [{ id: "q", prompt: "Question", competency: "Test", topic: "test", kind: "opening" as const }] };
    expect(parseStoredSession(JSON.stringify(active))).toEqual(sessionSchema.parse(active));
    expect(parseStoredSession("not-json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ version: 99 }))).toBeNull();
  });

  it("creates a report when ended early", () => {
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1 };
    const ended = reducer({ ...active, hydrated: true, recovery: null, error: null, loading: false }, { type: "END" });
    expect(ended.phase).toBe("report");
    expect(ended.completedReport?.questions).toEqual([]);
  });
});
