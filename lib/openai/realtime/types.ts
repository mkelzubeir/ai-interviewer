export type RealtimeConnectionState = "idle" | "requesting-permission" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";
export type VoiceSpeaker = "candidate" | "interviewer";
export type VoiceTranscriptEntry = { id: string; speaker: VoiceSpeaker; text: string; timestamp: number; final: boolean; interrupted: boolean };
export type NormalizedRealtimeEvent = {
  type:
    | "candidate.partial"
    | "candidate.final"
    | "candidate.speech_started"
    | "candidate.speech_stopped"
    | "candidate.turn_committed"
    | "interviewer.partial"
    | "interviewer.final"
    | "interviewer.started"
    | "interviewer.stopped"
    | "response.created"
    | "response.done"
    | "error";
  id?: string;
  text?: string;
  message?: string;
};
export type RealtimeCredential = { value: string; expiresAt?: number; model: string; voice: string };

export type VoiceTurnState = {
  candidateSpeechStarted: boolean;
  candidateSpeechActive: boolean;
  candidateTurnCommitted: boolean;
  responseActive: boolean;
  interviewerSpeaking: boolean;
  currentTurnStartedAt: number | null;
  currentTurnHasEvidence: boolean;
  finishHintRequested: boolean;
};
