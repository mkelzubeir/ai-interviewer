import { createReport } from "./report";
import { budgetForDuration, decideNext, extractClaims, firstQuestion } from "./interview-engine";
import { mergeFinalTranscript } from "./openai/realtime/events";
import { transcriptForReport } from "./voice-transcript";
import { migrateSession, type InterviewDuration, type InterviewMode, type InterviewType, type StoredSession, type VoiceTranscriptEntry } from "./schemas";
import type { ProviderResponse } from "./openai-provider";

export type AppState = StoredSession & { hydrated: boolean; recovery: StoredSession | null; error: string | null; loading: boolean };
export type Action =
  | { type: "HYDRATE"; session: StoredSession | null }
  | { type: "RESUME" } | { type: "DISCARD" }
  | { type: "SET_SETUP"; resume: string; jobDescription: string; interviewType: InterviewType; duration: InterviewDuration; sampleMode?: boolean }
  | { type: "SET_AI_CONSENT"; value: boolean }
  | { type: "SET_MODE"; mode: InterviewMode }
  | { type: "START" } | { type: "ANSWER"; answer: string } | { type: "SKIP" } | { type: "ADVANCE" } | { type: "PROVIDER_TURN"; turn: ProviderResponse } | { type: "VOICE_TRANSCRIPT"; entry: VoiceTranscriptEntry } | { type: "END" } | { type: "SET_LOADING"; value: boolean } | { type: "ERROR"; message: string | null } | { type: "RESTART" };

export const emptySession: StoredSession = { version: 4, phase: "setup", sampleMode: false, resume: "", jobDescription: "", interviewType: "mixed", duration: 20, startedAt: null, questionBudget: 7, questionsAsked: [], transcript: [], topicsCovered: [], competenciesTested: [], competenciesNeedingEvidence: [], claims: [], followUpDepth: 0, remainingBudget: 7, potentialStrengths: [], potentialConcerns: [], currentQuestion: null, completedReport: null, aiConsent: false, voiceTranscript: [], preferredMode: null };
export const initialState: AppState = { ...emptySession, hydrated: false, recovery: null, error: null, loading: false };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE": return action.session && action.session.phase !== "setup" ? { ...emptySession, hydrated: true, recovery: action.session, error: null, loading: false } : { ...(action.session ?? emptySession), hydrated: true, recovery: null, error: null, loading: false };
    case "RESUME": return state.recovery ? { ...state.recovery, hydrated: true, recovery: null, error: null, loading: false } : state;
    case "DISCARD": return { ...emptySession, hydrated: true, recovery: null, error: null, loading: false };
    case "SET_SETUP": {
      const sampleMode = action.sampleMode ?? state.sampleMode;
      // Switching to the sample fixture withdraws consent: it is documented as
      // requiring no API key and must never reach a provider.
      return { ...state, resume: action.resume, jobDescription: action.jobDescription, interviewType: action.interviewType, duration: action.duration, sampleMode, aiConsent: sampleMode ? false : state.aiConsent, error: null };
    }
    // Consent is only meaningful for the candidate's own materials; the sample
    // fixture never reaches a provider.
    case "SET_AI_CONSENT": return { ...state, aiConsent: action.value && !state.sampleMode, error: null };
    case "SET_MODE": return { ...state, preferredMode: action.mode, error: null };
    case "START": {
      if (!state.resume.trim() || !state.jobDescription.trim()) return { ...state, error: "Add both a resume and job description, or choose the sample interview." };
      const budget = budgetForDuration(state.duration); const question = firstQuestion(state.interviewType, state.sampleMode);
      return { ...state, phase: "interview", startedAt: Date.now(), questionBudget: budget, remainingBudget: budget, questionsAsked: [question], currentQuestion: question, error: null, completedReport: null, voiceTranscript: [] };
    }
    case "ANSWER": return state.currentQuestion ? { ...state, error: null, transcript: [...state.transcript, entry(state, action.answer, false)] } : state;
    case "SKIP": return state.currentQuestion ? { ...state, transcript: [...state.transcript, entry(state, "", true)], potentialConcerns: unique([...state.potentialConcerns, "A question was skipped; prepare a concise response before a live interview."]) } : state;
    case "ADVANCE": return advance(state);
    case "PROVIDER_TURN": return applyProviderTurn(state, action.turn);
    case "VOICE_TRANSCRIPT": return { ...state, voiceTranscript: mergeFinalTranscript(state.voiceTranscript, action.entry) };
    case "END": return finish({ ...state, currentQuestion: null });
    case "SET_LOADING": return { ...state, loading: action.value };
    case "ERROR": return { ...state, error: action.message, loading: false };
    case "RESTART": return { ...emptySession, hydrated: true, recovery: null, error: null, loading: false };
  }
}

/**
 * Fold the most recently answered question into coverage state.
 *
 * Both the deterministic engine and the provider path go through this, so an
 * AI-driven turn tracks claims and missing evidence exactly like a local one —
 * otherwise falling back mid-interview would lose revisit material and skew the
 * report.
 */
function absorbLatestAnswer(state: AppState) {
  const latest = state.transcript.at(-1);
  if (!latest) return state;
  const claims = latest.skipped ? state.claims : [...state.claims, ...extractClaims(latest.answer).map((text) => ({ text, topic: latest.question.topic, resolved: false }))];
  const needsEvidence = !latest.skipped && !/\d|%|measured|metric/i.test(latest.answer) ? unique([...state.competenciesNeedingEvidence, latest.question.competency]) : state.competenciesNeedingEvidence;
  return {
    ...state,
    claims,
    topicsCovered: unique([...state.topicsCovered, latest.question.topic]),
    competenciesTested: unique([...state.competenciesTested, latest.question.competency]),
    competenciesNeedingEvidence: needsEvidence,
    remainingBudget: Math.max(0, state.remainingBudget - 1),
  };
}

function finish(state: AppState): AppState {
  const completed = { ...state, phase: "report" as const, currentQuestion: null };
  // A voice-only interview has no typed answers, so the report is generated
  // from the paired spoken conversation instead of an empty transcript.
  return { ...completed, completedReport: createReport({ ...completed, transcript: transcriptForReport(completed) }) };
}

function applyProviderTurn(state: AppState, turn: ProviderResponse): AppState {
  const latest = state.transcript.at(-1); if (!latest || !state.currentQuestion) return advance(state);
  const base = absorbLatestAnswer(state);
  if (turn.decision === "end" || !turn.question) return finish(base);
  const question = { ...turn.question, id: `openai-${Date.now()}` };
  return { ...base, currentQuestion: question, questionsAsked: [...base.questionsAsked, question], followUpDepth: turn.decision === "follow-up" ? base.followUpDepth + 1 : 0, error: null };
}

function entry(state: AppState, answer: string, skipped: boolean) {
  const question = state.currentQuestion!; const acknowledgement = skipped ? "We can move on." : "Thank you.";
  return { question, answer, skipped, acknowledgement, askedAt: Date.now() };
}

function advance(state: AppState): AppState {
  const latest = state.transcript.at(-1);
  if (!latest || latest.question.id !== state.currentQuestion?.id) return { ...state, error: "Submit or skip this question before continuing." };
  const base = absorbLatestAnswer(state);
  const result = decideNext(base, latest.answer);
  if (result.decision === "end" || !result.question) return finish({ ...base, potentialStrengths: unique([...base.potentialStrengths, latest.skipped ? "Stayed focused on questions you could address." : "Provided usable interview evidence."]) });
  const isFollowUp = result.decision === "follow-up";
  return { ...base, currentQuestion: result.question, questionsAsked: [...base.questionsAsked, result.question], followUpDepth: isFollowUp ? base.followUpDepth + 1 : 0, potentialStrengths: unique([...base.potentialStrengths, /\d|%|measured|metric/i.test(latest.answer) ? "Connected an answer to evidence." : "Shared relevant operational experience."]), potentialConcerns: unique([...base.potentialConcerns, /\bwe\b/gi.test(latest.answer) && !/\bI (led|owned|built|created|decided)/i.test(latest.answer) ? "Personal ownership may need clarification." : ""]).filter(Boolean), error: null };
}
function unique(values: string[]) { return [...new Set(values)]; }

const storageKey = "ai-interviewer-phase-1-v2";
export function parseStoredSession(raw: string | null): StoredSession | null { if (!raw) return null; try { return migrateSession(JSON.parse(raw)); } catch { return null; } }
export function loadSession(): StoredSession | null { try { return parseStoredSession(window.localStorage.getItem(storageKey)); } catch { return null; } }
export function saveSession(state: AppState) { try { const { hydrated, recovery, loading, error: _error, ...session } = state; if (hydrated && !recovery && !loading) window.localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* localStorage is optional */ } }
export function clearSession() { try { window.localStorage.removeItem(storageKey); } catch { /* localStorage is optional */ } }
