import type { NormalizedRealtimeEvent, RealtimeConnectionState, VoiceTurnState } from "./types";

export const initialVoiceTurnState: VoiceTurnState = {
  candidateSpeechStarted: false,
  candidateSpeechActive: false,
  candidateTurnCommitted: false,
  responseActive: false,
  interviewerSpeaking: false,
  currentTurnStartedAt: null,
  currentTurnHasEvidence: false,
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
      };
    case "candidate.speech_stopped":
      return { ...state, candidateSpeechActive: false };
    case "candidate.partial":
    case "candidate.final":
      return { ...state, currentTurnHasEvidence: Boolean(event.text?.trim()) || state.currentTurnHasEvidence };
    case "candidate.turn_committed":
      return { ...state, candidateSpeechActive: false, candidateTurnCommitted: true };
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

/**
 * Whether an answer is in flight and still awaiting VAD finalization.
 *
 * Media-track WebRTC sessions have no valid client-side commit, so this drives
 * explanatory UI only — it never gates a Realtime event.
 */
export function canFinishAnswer(status: RealtimeConnectionState, state: VoiceTurnState) {
  return status === "connected"
    && !state.interviewerSpeaking
    && state.candidateSpeechStarted
    && state.currentTurnHasEvidence
    && !state.candidateTurnCommitted
    && !state.responseActive;
}

export function resetVoiceTurnAfterResponse(state: VoiceTurnState): VoiceTurnState {
  return { ...initialVoiceTurnState, interviewerSpeaking: state.interviewerSpeaking };
}
