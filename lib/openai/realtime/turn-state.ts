import type { NormalizedRealtimeEvent, RealtimeConnectionState, VoiceTurnState } from "./types";

export const initialVoiceTurnState: VoiceTurnState = {
  candidateSpeechStarted: false,
  candidateSpeechActive: false,
  candidateTurnCommitted: false,
  responseActive: false,
  interviewerSpeaking: false,
  currentTurnStartedAt: null,
  currentTurnHasEvidence: false,
  finishHintRequested: false,
};

export function applyVoiceTurnEvent(
  state: VoiceTurnState,
  event: NormalizedRealtimeEvent,
  now = Date.now(),
): VoiceTurnState {
  switch (event.type) {
    case "candidate.speech_started":
      return {
        ...state,
        candidateSpeechStarted: true,
        candidateSpeechActive: true,
        candidateTurnCommitted: false,
        currentTurnStartedAt: state.currentTurnStartedAt ?? now,
        finishHintRequested: false,
      };
    case "candidate.speech_stopped":
      return { ...state, candidateSpeechActive: false };
    case "candidate.partial":
    case "candidate.final":
      return { ...state, currentTurnHasEvidence: Boolean(event.text?.trim()) || state.currentTurnHasEvidence };
    case "candidate.turn_committed":
      return { ...state, candidateSpeechActive: false, candidateTurnCommitted: true, finishHintRequested: false };
    case "response.created":
      return { ...state, responseActive: true };
    case "response.done":
      return { ...state, responseActive: false };
    case "interviewer.started":
      return { ...state, interviewerSpeaking: true, responseActive: true };
    case "interviewer.stopped":
      return { ...state, interviewerSpeaking: false };
    default:
      return state;
  }
}

export function canFinishAnswer(status: RealtimeConnectionState, state: VoiceTurnState) {
  return status === "connected"
    && !state.interviewerSpeaking
    && state.candidateSpeechStarted
    && state.currentTurnHasEvidence
    && !state.candidateTurnCommitted
    && !state.responseActive
    && !state.finishHintRequested;
}

export function resetVoiceTurnAfterResponse(state: VoiceTurnState): VoiceTurnState {
  return { ...initialVoiceTurnState, interviewerSpeaking: state.interviewerSpeaking };
}
