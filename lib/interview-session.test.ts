import { describe, expect, it } from "vitest";
import { emptySession, initialState, parseStoredSession, reducer, type AppState } from "./interview-session";
import { sessionSchema } from "./schemas";
import { sampleJobDescription, sampleResume } from "./sample-data";
import type { ProviderResponse } from "./openai-provider";

const question = { id: "q", prompt: "Question", competency: "Test", topic: "test", kind: "opening" as const };

function app(session = emptySession): AppState {
  return { ...session, hydrated: true, recovery: null, error: null, loading: false };
}

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
    const active = { ...emptySession, phase: "interview" as const, startedAt: 1, currentQuestion: question, questionsAsked: [question] };
    expect(parseStoredSession(JSON.stringify(active))).toEqual(sessionSchema.parse(active));
    expect(parseStoredSession("not-json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ version: 99 }))).toBeNull();
    expect(parseStoredSession(null)).toBeNull();
  });

  it("migrates a v2 session instead of discarding an interview in progress", () => {
    const { aiConsent: _consent, voiceTranscript: _voice, preferredMode: _mode, ...core } = emptySession;
    const legacy = { ...core, version: 2, phase: "interview" as const, startedAt: 1, currentQuestion: question, questionsAsked: [question] };
    const migrated = parseStoredSession(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ version: 4, phase: "interview", aiConsent: false, voiceTranscript: [], preferredMode: null });
    expect(migrated?.questionsAsked).toEqual([question]);
  });

  it("migrates a v3 session, defaulting the mode to whatever the build offers", () => {
    const { preferredMode: _mode, ...core } = emptySession;
    const legacy = { ...core, version: 3, phase: "interview" as const, startedAt: 1, currentQuestion: question, questionsAsked: [question], aiConsent: true };
    const migrated = parseStoredSession(JSON.stringify(legacy));
    expect(migrated).toMatchObject({ version: 4, phase: "interview", aiConsent: true, preferredMode: null });
    expect(migrated?.questionsAsked).toEqual([question]);
  });

  it("creates a report when ended early", () => {
    const ended = reducer(app({ ...emptySession, phase: "interview", startedAt: 1 }), { type: "END" });
    expect(ended.phase).toBe("report");
    expect(ended.completedReport?.questions).toEqual([]);
  });
});

describe("AI consent", () => {
  it("defaults to off so nothing is sent without an explicit opt-in", () => {
    expect(emptySession.aiConsent).toBe(false);
  });

  it("records consent for the candidate's own materials", () => {
    expect(reducer(app(), { type: "SET_AI_CONSENT", value: true }).aiConsent).toBe(true);
  });

  it("refuses consent in sample mode, which is documented as needing no API key", () => {
    const sample = app({ ...emptySession, sampleMode: true });
    expect(reducer(sample, { type: "SET_AI_CONSENT", value: true }).aiConsent).toBe(false);
  });

  it("withdraws consent when the sample fixture is loaded afterwards", () => {
    const consented = reducer(app(), { type: "SET_AI_CONSENT", value: true });
    const sampled = reducer(consented, { type: "SET_SETUP", resume: sampleResume, jobDescription: sampleJobDescription, interviewType: "mixed", duration: 20, sampleMode: true });
    expect(sampled.aiConsent).toBe(false);
  });
});

describe("provider turns and fallback", () => {
  function midInterview() {
    let state = reducer(app(), { type: "SET_SETUP", resume: "I led a migration.", jobDescription: "Ops role.", interviewType: "mixed", duration: 20, sampleMode: false });
    state = reducer(state, { type: "START" });
    return reducer(state, { type: "ANSWER", answer: "I led the intake redesign and coordinated three teams." });
  }

  const turn: ProviderResponse = { decision: "new-question", acknowledgement: "Thank you.", question: { prompt: "How did you measure that?", competency: "Impact measurement", topic: "measurement", kind: "impact" } };

  it("tracks claims and missing evidence on a provider turn exactly as the local engine does", () => {
    const viaProvider = reducer(midInterview(), { type: "PROVIDER_TURN", turn });
    const viaEngine = reducer(midInterview(), { type: "ADVANCE" });

    // Without this the app would lose revisit material the moment it fell back.
    expect(viaProvider.claims.map((claim) => claim.text)).toEqual(viaEngine.claims.map((claim) => claim.text));
    expect(viaProvider.claims.length).toBeGreaterThan(0);
    expect(viaProvider.competenciesNeedingEvidence).toEqual(viaEngine.competenciesNeedingEvidence);
    expect(viaProvider.topicsCovered).toEqual(viaEngine.topicsCovered);
    expect(viaProvider.remainingBudget).toBe(viaEngine.remainingBudget);
  });

  it("falls back to the deterministic engine when a provider turn arrives with no answer to attach", () => {
    const beforeAnswering = reducer(reducer(app(), { type: "SET_SETUP", resume: "r", jobDescription: "j", interviewType: "mixed", duration: 20 }), { type: "START" });
    const result = reducer(beforeAnswering, { type: "PROVIDER_TURN", turn });
    expect(result.error).toMatch(/Submit or skip/);
  });

  it("ends the interview and builds a report when the provider decides to end", () => {
    const ended = reducer(midInterview(), { type: "PROVIDER_TURN", turn: { decision: "end", acknowledgement: "Thank you.", question: null } });
    expect(ended.phase).toBe("report");
    expect(ended.completedReport?.questions).toHaveLength(1);
  });
});

describe("durable voice transcript", () => {
  const entry = { id: "item_1", speaker: "candidate" as const, text: "I led the migration.", timestamp: 1_000, final: true, interrupted: false };

  it("persists finalized voice turns into the session", () => {
    const state = reducer(app(), { type: "VOICE_TRANSCRIPT", entry });
    expect(state.voiceTranscript).toHaveLength(1);
    expect(sessionSchema.safeParse({ ...emptySession, voiceTranscript: state.voiceTranscript }).success).toBe(true);
  });

  it("deduplicates a replayed turn rather than doubling it", () => {
    let state = reducer(app(), { type: "VOICE_TRANSCRIPT", entry });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry: { ...entry, id: "item_2", timestamp: 2_000 } });
    expect(state.voiceTranscript).toHaveLength(1);
  });

  it("keeps the text transcript and report intact when voice contributes turns", () => {
    let state = reducer(app({ ...emptySession, phase: "interview", startedAt: 1, currentQuestion: question, questionsAsked: [question] }), { type: "ANSWER", answer: "I owned the rollout and measured a 20% reduction." });
    state = reducer(state, { type: "VOICE_TRANSCRIPT", entry });
    state = reducer(state, { type: "END" });
    // The text engine remains the source of truth for the report.
    expect(state.completedReport?.questions).toHaveLength(1);
    expect(state.voiceTranscript).toHaveLength(1);
  });
});
