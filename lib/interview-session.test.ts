import { describe, expect, it } from "vitest";
import { emptySession, initialState, parseStoredSession, reducer, type AppState } from "./interview-session";
import { sessionSchema } from "./schemas";
import { sampleJobDescription, sampleResume } from "./sample-data";
import type { VoiceTranscriptEntry } from "./schemas";

function app(session = emptySession): AppState {
  return { ...session, hydrated: true, recovery: null, error: null };
}

let clock = 0;
function say(speaker: "interviewer" | "candidate", text: string): VoiceTranscriptEntry {
  clock += 1000;
  return { id: `${speaker}-${clock}`, speaker, text, timestamp: clock, final: true, interrupted: false };
}

describe("setup and start", () => {
  it("requires both documents before an interview can begin", () => {
    const blocked = reducer(app(), { type: "START" });
    expect(blocked.phase).toBe("setup");
    expect(blocked.error).toMatch(/resume and a job description/i);
  });

  it("goes straight from setup into the interview", () => {
    let state = reducer(initialState, { type: "SET_SETUP", resume: sampleResume, jobDescription: sampleJobDescription, interviewType: "mixed", duration: 10, sampleMode: true });
    state = reducer(state, { type: "START" });
    expect(state).toMatchObject({ phase: "interview", sampleMode: true, remainingBudget: 4, questionBudget: 4 });
    expect(state.startedAt).toBeTypeOf("number");
  });

  it("clears any previous conversation when a new interview starts", () => {
    const stale = app({ ...emptySession, resume: "r", jobDescription: "j", voiceTranscript: [say("interviewer", "Old question?")], completedReport: null });
    expect(reducer(stale, { type: "START" }).voiceTranscript).toEqual([]);
  });
});

describe("recovery", () => {
  it("offers to resume an interview in progress", () => {
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1, resume: "r", jobDescription: "j" };
    const hydrated = reducer(initialState, { type: "HYDRATE", session: active });
    expect(hydrated.recovery).toEqual(active);
    expect(reducer(hydrated, { type: "RESUME" })).toMatchObject({ phase: "interview", recovery: null });
  });

  it("discards to a clean setup", () => {
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1 };
    const hydrated = reducer(initialState, { type: "HYDRATE", session: active });
    expect(reducer(hydrated, { type: "DISCARD" })).toMatchObject({ phase: "setup", recovery: null, resume: "" });
  });

  it("ignores corrupted storage", () => {
    expect(parseStoredSession("not-json")).toBeNull();
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession(JSON.stringify({ nope: true }))).toBeNull();
  });

  it("round-trips a current session", () => {
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1, resume: "r", jobDescription: "j" };
    expect(parseStoredSession(JSON.stringify(active))).toEqual(sessionSchema.parse(active));
  });
});

describe("migrating sessions written before the app became voice-only", () => {
  it("keeps a finished report readable", () => {
    const report = { score: 70, readiness: "Promising foundation", summary: "s", strongestDimension: "d", improvementArea: "i", competencies: [], concerns: [], stories: [], actions: [], questions: [] };
    const legacy = { version: 4, resume: "old resume", jobDescription: "old jd", interviewType: "behavioral", duration: 30, completedReport: report, transcript: [], voiceTranscript: [] };
    const migrated = parseStoredSession(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ version: 5, phase: "report", resume: "old resume", interviewType: "behavioral", duration: 30 });
    expect(migrated?.completedReport?.score).toBe(70);
  });

  it("returns an unfinished typed interview to setup, keeping the documents", () => {
    // A half-finished typed interview cannot be resumed as a spoken one.
    const legacy = { version: 3, phase: "interview", resume: "old resume", jobDescription: "old jd", completedReport: null };
    const migrated = parseStoredSession(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ version: 5, phase: "setup", resume: "old resume", jobDescription: "old jd" });
  });
});

describe("the spoken conversation", () => {
  it("persists finalized turns", () => {
    const state = reducer(app(), { type: "VOICE_TRANSCRIPT", entry: say("interviewer", "Why this role?") });
    expect(state.voiceTranscript).toHaveLength(1);
    expect(sessionSchema.safeParse({ ...emptySession, voiceTranscript: state.voiceTranscript }).success).toBe(true);
  });

  it("deduplicates a turn replayed after a reconnect", () => {
    const entry = say("candidate", "I led the migration.");
    let state = reducer(app(), { type: "VOICE_TRANSCRIPT", entry });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: { ...entry, id: "other-id", timestamp: entry.timestamp + 1 } });
    expect(state.voiceTranscript).toHaveLength(1);
  });

  it("spends a turn of the budget per interviewer question", () => {
    let state = app({ ...emptySession, questionBudget: 4, remainingBudget: 4 });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("interviewer", "First question?") });
    expect(state.remainingBudget).toBe(3);
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("candidate", "An answer.") });
    expect(state.remainingBudget).toBe(3);
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("interviewer", "Second question?") });
    expect(state.remainingBudget).toBe(2);
  });

  it("never drives the budget below zero", () => {
    let state = app({ ...emptySession, questionBudget: 1, remainingBudget: 1 });
    for (let i = 0; i < 4; i += 1) state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("interviewer", `Question ${i}?`) });
    expect(state.remainingBudget).toBe(0);
  });
});

describe("ending the interview", () => {
  it("builds a report from what was actually said", () => {
    let state = app({ ...emptySession, phase: "interview", startedAt: 1 });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("interviewer", "Tell me about a rollout you owned.") });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: say("candidate", "I led it across three regions and cut duplicates by 28%.") });
    const ended = reducer(state, { type: "END" });

    expect(ended.phase).toBe("report");
    expect(ended.transcript).toHaveLength(1);
    expect(ended.completedReport?.questions).toHaveLength(1);
    expect(ended.completedReport?.score).toBeGreaterThan(0);
  });

  it("produces an empty report rather than throwing when nothing was said", () => {
    const ended = reducer(app({ ...emptySession, phase: "interview", startedAt: 1 }), { type: "END" });
    expect(ended.phase).toBe("report");
    expect(ended.completedReport?.questions).toEqual([]);
  });

  it("starts over from the report", () => {
    const ended = reducer(app({ ...emptySession, phase: "interview", startedAt: 1 }), { type: "END" });
    expect(reducer(ended, { type: "RESTART" })).toMatchObject({ phase: "setup", resume: "", voiceTranscript: [] });
  });
});
