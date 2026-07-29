import { createReport } from "./report";
import { mergeFinalTranscript } from "./openai/realtime/events";
import { transcriptForReport } from "./voice-transcript";
import { budgetForDuration, migrateSession, type InterviewDuration, type InterviewType, type StoredSession, type VoiceTranscriptEntry } from "./schemas";

export type AppState = StoredSession & { hydrated: boolean; recovery: StoredSession | null; error: string | null };
export type Action =
  | { type: "HYDRATE"; session: StoredSession | null }
  | { type: "RESUME" }
  | { type: "DISCARD" }
  | { type: "SET_SETUP"; resume: string; jobDescription: string; interviewType: InterviewType; duration: InterviewDuration; sampleMode?: boolean }
  | { type: "START" }
  | { type: "VOICE_TRANSCRIPT"; entry: VoiceTranscriptEntry }
  | { type: "END" }
  | { type: "ERROR"; message: string | null }
  | { type: "RESTART" };

export const emptySession: StoredSession = {
  version: 5,
  phase: "setup",
  sampleMode: false,
  resume: "",
  jobDescription: "",
  interviewType: "mixed",
  duration: 20,
  startedAt: null,
  questionBudget: 7,
  remainingBudget: 7,
  voiceTranscript: [],
  transcript: [],
  completedReport: null,
};

export const initialState: AppState = { ...emptySession, hydrated: false, recovery: null, error: null };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return action.session && action.session.phase !== "setup"
        ? { ...emptySession, hydrated: true, recovery: action.session, error: null }
        : { ...(action.session ?? emptySession), hydrated: true, recovery: null, error: null };
    case "RESUME":
      return state.recovery ? { ...state.recovery, hydrated: true, recovery: null, error: null } : state;
    case "DISCARD":
      return { ...emptySession, hydrated: true, recovery: null, error: null };
    case "SET_SETUP":
      return { ...state, resume: action.resume, jobDescription: action.jobDescription, interviewType: action.interviewType, duration: action.duration, sampleMode: action.sampleMode ?? state.sampleMode, error: null };
    case "START": {
      if (!state.resume.trim() || !state.jobDescription.trim()) {
        return { ...state, error: "Add both a resume and a job description, or load the sample." };
      }
      const budget = budgetForDuration(state.duration);
      return { ...state, phase: "interview", startedAt: Date.now(), questionBudget: budget, remainingBudget: budget, voiceTranscript: [], transcript: [], completedReport: null, error: null };
    }
    case "VOICE_TRANSCRIPT": {
      const voiceTranscript = mergeFinalTranscript(state.voiceTranscript, action.entry);
      // Each interviewer turn consumes a turn of the budget, which the session
      // config passes on so the model knows how much runway is left.
      const asked = voiceTranscript.filter((item) => item.speaker === "interviewer").length;
      return { ...state, voiceTranscript, remainingBudget: Math.max(0, state.questionBudget - asked) };
    }
    case "END":
      return finish(state);
    case "ERROR":
      return { ...state, error: action.message };
    case "RESTART":
      return { ...emptySession, hydrated: true, recovery: null, error: null };
  }
}

function finish(state: AppState): AppState {
  // The spoken conversation is the record. Pair it into transcript turns and
  // write them into state so the report and anything reading the session agree.
  const completed = { ...state, phase: "report" as const };
  const withTranscript = { ...completed, transcript: transcriptForReport(completed) };
  return { ...withTranscript, completedReport: createReport(withTranscript) };
}

const storageKey = "ai-interviewer-phase-1-v2";

export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    return migrateSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadSession(): StoredSession | null {
  try {
    return parseStoredSession(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

export function saveSession(state: AppState) {
  try {
    const { hydrated, recovery, error: _error, ...session } = state;
    if (hydrated && !recovery) window.localStorage.setItem(storageKey, JSON.stringify(session));
  } catch {
    /* localStorage is optional */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* localStorage is optional */
  }
}
