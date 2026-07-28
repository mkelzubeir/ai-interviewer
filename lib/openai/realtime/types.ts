export type RealtimeConnectionState = "idle" | "requesting-permission" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";
// The persisted shape is the source of truth so the durable session and the
// realtime adapter cannot drift apart.
export type { VoiceTranscriptEntry } from "@/lib/schemas";
export type VoiceSpeaker = "candidate" | "interviewer";
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
};
