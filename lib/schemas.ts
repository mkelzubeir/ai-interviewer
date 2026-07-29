import { z } from "zod";

export const interviewTypeSchema = z.enum(["recruiter", "behavioral", "hiring-manager", "role-specific", "mixed"]);
export const durationSchema = z.union([z.literal(10), z.literal(20), z.literal(30)]);
export const decisionSchema = z.enum(["follow-up", "new-question", "revisit-claim", "end"]);

export const questionSchema = z.object({
  id: z.string(), prompt: z.string(), competency: z.string(), topic: z.string(), kind: z.enum(["opening", "resume", "motivation", "behavioral", "impact", "judgment", "follow-up", "revisit"]),
});
export const transcriptEntrySchema = z.object({ question: questionSchema, answer: z.string(), skipped: z.boolean(), acknowledgement: z.string(), askedAt: z.number() });
export const claimSchema = z.object({ text: z.string(), topic: z.string(), resolved: z.boolean() });
export const reportQuestionSchema = z.object({ question: z.string(), answer: z.string(), worked: z.string(), weakened: z.string(), structure: z.string(), improvedExample: z.string() });
export const reportSchema = z.object({ score: z.number(), readiness: z.string(), summary: z.string(), strongestDimension: z.string(), improvementArea: z.string(), competencies: z.array(z.object({ label: z.string(), score: z.number() })), concerns: z.array(z.string()), stories: z.array(z.string()), actions: z.array(z.string()), questions: z.array(reportQuestionSchema) });

export const voiceTranscriptEntrySchema = z.object({ id: z.string(), speaker: z.enum(["candidate", "interviewer"]), text: z.string(), timestamp: z.number(), final: z.boolean(), interrupted: z.boolean() });

const sessionCoreShape = {
  phase: z.enum(["setup", "interview", "report"]), sampleMode: z.boolean(), resume: z.string(), jobDescription: z.string(), interviewType: interviewTypeSchema, duration: durationSchema,
  startedAt: z.number().nullable(), questionBudget: z.number().int().positive(), questionsAsked: z.array(questionSchema), transcript: z.array(transcriptEntrySchema), topicsCovered: z.array(z.string()), competenciesTested: z.array(z.string()), competenciesNeedingEvidence: z.array(z.string()), claims: z.array(claimSchema), followUpDepth: z.number().int().nonnegative(), remainingBudget: z.number().int().nonnegative(), potentialStrengths: z.array(z.string()), potentialConcerns: z.array(z.string()), currentQuestion: questionSchema.nullable(), completedReport: reportSchema.nullable(),
};

export const interviewModeSchema = z.enum(["voice", "text"]);

/** Sessions written before AI consent and durable voice transcripts existed. */
export const sessionSchemaV2 = z.object({ version: z.literal(2), ...sessionCoreShape });

/** Sessions written before the interview had a voice/text mode preference. */
export const sessionSchemaV3 = z.object({
  version: z.literal(3),
  ...sessionCoreShape,
  aiConsent: z.boolean(),
  voiceTranscript: z.array(voiceTranscriptEntrySchema),
});

export const sessionSchema = z.object({
  version: z.literal(4),
  ...sessionCoreShape,
  /**
   * Explicit opt-in to sending resume and job-description text to OpenAI.
   * False keeps every turn on the local deterministic engine.
   */
  aiConsent: z.boolean(),
  voiceTranscript: z.array(voiceTranscriptEntrySchema),
  /**
   * The candidate's explicit mode choice. Null means "whatever this build can
   * offer", which is voice when a token endpoint is configured and they are
   * signed in. Persisted so recovery restores the same experience.
   */
  preferredMode: interviewModeSchema.nullable(),
});

export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type InterviewDuration = z.infer<typeof durationSchema>;
export type Question = z.infer<typeof questionSchema>;
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type Claim = z.infer<typeof claimSchema>;
export type InterviewDecision = z.infer<typeof decisionSchema>;
export type InterviewReport = z.infer<typeof reportSchema>;
export type StoredSession = z.infer<typeof sessionSchema>;
export type VoiceTranscriptEntry = z.infer<typeof voiceTranscriptEntrySchema>;
export type InterviewMode = z.infer<typeof interviewModeSchema>;

/**
 * Upgrade a stored session to the current version.
 *
 * Applied in layers so an interview in progress survives an app update rather
 * than being silently discarded. New capabilities always default to off.
 */
export function migrateSession(raw: unknown): StoredSession | null {
  const current = sessionSchema.safeParse(raw);
  if (current.success) return current.data;

  const v3 = sessionSchemaV3.safeParse(raw);
  if (v3.success) {
    const { version: _version, ...rest } = v3.data;
    return { version: 4, ...rest, preferredMode: null };
  }

  const v2 = sessionSchemaV2.safeParse(raw);
  if (v2.success) {
    const { version: _version, ...rest } = v2.data;
    return { version: 4, ...rest, aiConsent: false, voiceTranscript: [], preferredMode: null };
  }

  return null;
}
