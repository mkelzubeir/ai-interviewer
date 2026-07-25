export type RealtimeConnectionState = "idle" | "requesting-permission" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";
export type VoiceSpeaker = "candidate" | "interviewer";
export type VoiceTranscriptEntry = { id: string; speaker: VoiceSpeaker; text: string; timestamp: number; final: boolean; interrupted: boolean };
export type NormalizedRealtimeEvent = { type: "candidate.partial" | "candidate.final" | "interviewer.partial" | "interviewer.final" | "interviewer.started" | "interviewer.stopped" | "error"; id?: string; text?: string; message?: string };
export type RealtimeCredential = { value: string; expiresAt?: number; model: string; voice: string };
