import { createReport } from "./report";
import { budgetForDuration, decideNext, extractClaims, firstQuestion } from "./interview-engine";
import { sessionSchema, type InterviewDuration, type InterviewType, type StoredSession } from "./schemas";
import type { ProviderResponse } from "./openai-provider";

export type AppState = StoredSession & { hydrated: boolean; recovery: StoredSession | null; error: string | null; loading: boolean };
export type Action =
  | { type: "HYDRATE"; session: StoredSession | null }
  | { type: "RESUME" } | { type: "DISCARD" }
  | { type: "SET_SETUP"; resume: string; jobDescription: string; interviewType: InterviewType; duration: InterviewDuration; sampleMode?: boolean }
  | { type: "START" } | { type: "ANSWER"; answer: string } | { type: "SKIP" } | { type: "ADVANCE" } | { type: "PROVIDER_TURN"; turn: ProviderResponse } | { type: "END" } | { type: "SET_LOADING"; value: boolean } | { type: "ERROR"; message: string | null } | { type: "RESTART" };

export const emptySession: StoredSession = { version: 2, phase: "setup", sampleMode: false, resume: "", jobDescription: "", interviewType: "mixed", duration: 20, startedAt: null, questionBudget: 7, questionsAsked: [], transcript: [], topicsCovered: [], competenciesTested: [], competenciesNeedingEvidence: [], claims: [], followUpDepth: 0, remainingBudget: 7, potentialStrengths: [], potentialConcerns: [], currentQuestion: null, completedReport: null };
export const initialState: AppState = { ...emptySession, hydrated: false, recovery: null, error: null, loading: false };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE": return action.session && action.session.phase !== "setup" ? { ...emptySession, hydrated: true, recovery: action.session, error: null, loading: false } : { ...(action.session ?? emptySession), hydrated: true, recovery: null, error: null, loading: false };
    case "RESUME": return state.recovery ? { ...state.recovery, hydrated: true, recovery: null, error: null, loading: false } : state;
    case "DISCARD": return { ...emptySession, hydrated: true, recovery: null, error: null, loading: false };
    case "SET_SETUP": return { ...state, resume: action.resume, jobDescription: action.jobDescription, interviewType: action.interviewType, duration: action.duration, sampleMode: action.sampleMode ?? state.sampleMode, error: null };
    case "START": {
      if (!state.resume.trim() || !state.jobDescription.trim()) return { ...state, error: "Add both a resume and job description, or choose the sample interview." };
      const budget = budgetForDuration(state.duration); const question = firstQuestion(state.interviewType);
      return { ...state, phase: "interview", startedAt: Date.now(), questionBudget: budget, remainingBudget: budget, questionsAsked: [question], currentQuestion: question, error: null, completedReport: null };
    }
    case "ANSWER": return state.currentQuestion ? { ...state, error: null, transcript: [...state.transcript, entry(state, action.answer, false)] } : state;
    case "SKIP": return state.currentQuestion ? { ...state, transcript: [...state.transcript, entry(state, "", true)], potentialConcerns: unique([...state.potentialConcerns, "A question was skipped; prepare a concise response before a live interview."]) } : state;
    case "ADVANCE": return advance(state);
    case "PROVIDER_TURN": return applyProviderTurn(state, action.turn);
    case "END": { const completed = { ...state, phase: "report" as const, currentQuestion: null }; return { ...completed, completedReport: createReport(completed) }; }
    case "SET_LOADING": return { ...state, loading: action.value };
    case "ERROR": return { ...state, error: action.message, loading: false };
    case "RESTART": return { ...emptySession, hydrated: true, recovery: null, error: null, loading: false };
  }
}

function applyProviderTurn(state: AppState, turn: ProviderResponse): AppState {
  const latest = state.transcript.at(-1); if (!latest || !state.currentQuestion) return advance(state);
  const base = { ...state, remainingBudget: Math.max(0, state.remainingBudget - 1), topicsCovered: unique([...state.topicsCovered, latest.question.topic]), competenciesTested: unique([...state.competenciesTested, latest.question.competency]) };
  if (turn.decision === "end" || !turn.question) { const completed = { ...base, phase: "report" as const, currentQuestion: null }; return { ...completed, completedReport: createReport(completed) }; }
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
  const claims = latest.skipped ? state.claims : [...state.claims, ...extractClaims(latest.answer).map((text) => ({ text, topic: latest.question.topic, resolved: false }))];
  const covered = unique([...state.topicsCovered, latest.question.topic]); const tested = unique([...state.competenciesTested, latest.question.competency]);
  const needsEvidence = !latest.skipped && !/\d|%|measured|metric/i.test(latest.answer) ? unique([...state.competenciesNeedingEvidence, latest.question.competency]) : state.competenciesNeedingEvidence;
  const base = { ...state, claims, topicsCovered: covered, competenciesTested: tested, competenciesNeedingEvidence: needsEvidence, remainingBudget: Math.max(0, state.remainingBudget - 1) };
  const result = decideNext(base, latest.answer);
  if (result.decision === "end" || !result.question) { const completed = { ...base, phase: "report" as const, currentQuestion: null, potentialStrengths: unique([...base.potentialStrengths, latest.skipped ? "Stayed focused on questions you could address." : "Provided usable interview evidence."]) }; return { ...completed, completedReport: createReport(completed) }; }
  const isFollowUp = result.decision === "follow-up"; const next = { ...base, currentQuestion: result.question, questionsAsked: [...base.questionsAsked, result.question], followUpDepth: isFollowUp ? base.followUpDepth + 1 : 0, potentialStrengths: unique([...base.potentialStrengths, /\d|%|measured|metric/i.test(latest.answer) ? "Connected an answer to evidence." : "Shared relevant operational experience."]), potentialConcerns: unique([...base.potentialConcerns, /\bwe\b/gi.test(latest.answer) && !/\bI (led|owned|built|created|decided)/i.test(latest.answer) ? "Personal ownership may need clarification." : ""]).filter(Boolean), error: null };
  return next;
}
function unique(values: string[]) { return [...new Set(values)]; }

const storageKey = "ai-interviewer-phase-1-v2";
export function parseStoredSession(raw: string | null): StoredSession | null { if (!raw) return null; try { const parsed = sessionSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; } catch { return null; } }
export function loadSession(): StoredSession | null { try { return parseStoredSession(window.localStorage.getItem(storageKey)); } catch { return null; } }
export function saveSession(state: AppState) { try { const { hydrated, recovery, error, loading, ...session } = state; if (hydrated && !recovery && !loading && !error) window.localStorage.setItem(storageKey, JSON.stringify(session)); } catch { /* localStorage is optional */ } }
export function clearSession() { try { window.localStorage.removeItem(storageKey); } catch { /* localStorage is optional */ } }
