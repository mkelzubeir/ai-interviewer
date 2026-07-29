import { describe, expect, it } from "vitest";
import { pairVoiceTranscript, transcriptForReport } from "./voice-transcript";
import { emptySession } from "./interview-session";
import { createReport } from "./report";
import type { VoiceTranscriptEntry } from "./schemas";

let clock = 0;
function say(speaker: "interviewer" | "candidate", text: string, timestamp = (clock += 1000)): VoiceTranscriptEntry {
  return { id: `${speaker}-${timestamp}`, speaker, text, timestamp, final: true, interrupted: false };
}

describe("pairing a spoken conversation into transcript turns", () => {
  it("pairs each interviewer question with the answer that follows", () => {
    const paired = pairVoiceTranscript([
      say("interviewer", "Tell me about a tradeoff you made."),
      say("candidate", "I chose a phased rollout over a single cutover."),
      say("interviewer", "How did you measure it?"),
      say("candidate", "Weekly ticket backlog against a baseline."),
    ]);

    expect(paired).toHaveLength(2);
    expect(paired[0]).toMatchObject({ answer: "I chose a phased rollout over a single cutover.", skipped: false });
    expect(paired[0].question.prompt).toBe("Tell me about a tradeoff you made.");
    expect(paired[1].question.prompt).toBe("How did you measure it?");
  });

  it("joins a multi-part answer into one turn", () => {
    const paired = pairVoiceTranscript([
      say("interviewer", "Walk me through the rollout."),
      say("candidate", "We started in one region."),
      say("candidate", "Then expanded once support caught up."),
    ]);
    expect(paired).toHaveLength(1);
    expect(paired[0].answer).toBe("We started in one region. Then expanded once support caught up.");
  });

  it("orders by timestamp regardless of arrival order", () => {
    const paired = pairVoiceTranscript([
      say("candidate", "Second answer.", 4000),
      say("interviewer", "Second question?", 3000),
      say("interviewer", "First question?", 1000),
      say("candidate", "First answer.", 2000),
    ]);
    expect(paired.map((entry) => entry.question.prompt)).toEqual(["First question?", "Second question?"]);
  });

  it("drops a question the candidate never answered rather than inventing a skip", () => {
    const paired = pairVoiceTranscript([
      say("interviewer", "Tell me about impact."),
      say("candidate", "I reduced duplicate requests by 28%."),
      say("interviewer", "And what would you do differently?"),
    ]);
    expect(paired).toHaveLength(1);
  });

  it("ignores candidate speech before the interviewer has asked anything", () => {
    const paired = pairVoiceTranscript([
      say("candidate", "Hello, can you hear me?"),
      say("interviewer", "Yes. Tell me about your background."),
      say("candidate", "I led operations for three years."),
    ]);
    expect(paired).toHaveLength(1);
    expect(paired[0].answer).toBe("I led operations for three years.");
  });

  it("produces an empty transcript for an empty conversation", () => {
    expect(pairVoiceTranscript([])).toEqual([]);
  });

  it("emits turns that satisfy the persisted transcript schema", () => {
    const paired = pairVoiceTranscript([say("interviewer", "Why this role?"), say("candidate", "I like ambiguous operational problems.")]);
    expect(paired[0].question.kind).toBe("opening");
    expect(typeof paired[0].askedAt).toBe("number");
  });
});

describe("choosing the transcript a report is built from", () => {
  it("prefers typed answers when they exist", () => {
    const question = { id: "q", prompt: "Typed question", competency: "Impact", topic: "impact", kind: "impact" as const };
    const session = { ...emptySession, transcript: [{ question, answer: "A typed answer with 20% impact.", skipped: false, acknowledgement: "Thank you.", askedAt: 1 }], voiceTranscript: [say("interviewer", "Spoken question"), say("candidate", "A spoken answer.")] };
    expect(transcriptForReport(session)[0].question.prompt).toBe("Typed question");
  });

  it("falls back to the spoken conversation for a voice-only interview", () => {
    const session = { ...emptySession, voiceTranscript: [say("interviewer", "Spoken question?"), say("candidate", "A spoken answer.")] };
    expect(transcriptForReport(session)[0].question.prompt).toBe("Spoken question?");
  });
});

describe("report generation from a spoken interview", () => {
  it("produces real feedback rather than an empty report", () => {
    const session = {
      ...emptySession,
      voiceTranscript: [
        say("interviewer", "Tell me about a time you owned a difficult rollout."),
        say("candidate", "I led the phased rollout across three regions and measured a 28% drop in duplicate requests."),
        say("interviewer", "What would you change?"),
        say("candidate", "We moved too fast in the second region before support was ready."),
      ],
    };
    const report = createReport({ ...session, transcript: transcriptForReport(session) });

    // The regression this guards: a voice-only interview used to score 0 with
    // no question feedback, because only typed answers reached the report.
    expect(report.questions).toHaveLength(2);
    expect(report.score).toBeGreaterThan(0);
    expect(report.questions[0].answer).toContain("phased rollout");
  });
});
