import type { StoredSession, TranscriptEntry, VoiceTranscriptEntry } from "./schemas";

/**
 * Turn a spoken conversation into the transcript the report is built from.
 *
 * In voice mode the Realtime model asks the questions, so the local engine never
 * populates `transcript` — without this a voice-only interview would produce an
 * empty report. Pairing happens here, outside React, so the report generator
 * stays the single source of feedback for both modes.
 *
 * Each interviewer utterance opens a turn; every candidate utterance until the
 * next interviewer utterance is that turn's answer.
 */
export function pairVoiceTranscript(entries: VoiceTranscriptEntry[]): TranscriptEntry[] {
  const ordered = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const paired: TranscriptEntry[] = [];

  let prompt: string | null = null;
  let askedAt = 0;
  let answers: string[] = [];

  const flush = () => {
    const answer = answers.join(" ").trim();
    // A question the candidate never answered is not evidence; drop it rather
    // than inventing a skipped turn they did not choose.
    if (prompt && answer) {
      const index = paired.length;
      paired.push({
        question: {
          id: `voice-${index}`,
          prompt,
          competency: "Spoken response",
          topic: `voice-${index}`,
          kind: index === 0 ? "opening" : "behavioral",
        },
        answer,
        skipped: false,
        acknowledgement: "Thank you.",
        askedAt,
      });
    }
    answers = [];
  };

  for (const entry of ordered) {
    const text = entry.text.trim();
    if (!text) continue;
    if (entry.speaker === "interviewer") {
      flush();
      prompt = text;
      askedAt = entry.timestamp;
    } else if (prompt) {
      answers.push(text);
    }
    // Candidate speech before the interviewer has said anything is warm-up
    // chatter with no question attached, so it is ignored.
  }
  flush();

  return paired;
}

/**
 * The transcript a report should be generated from.
 *
 * Typed answers win when they exist: they are the mode the local engine drove.
 * A voice-only session falls back to the paired spoken conversation.
 */
export function transcriptForReport(session: StoredSession): TranscriptEntry[] {
  if (session.transcript.length) return session.transcript;
  return pairVoiceTranscript(session.voiceTranscript);
}
