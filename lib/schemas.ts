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

/** Sessions written before AI consent and durable voice transcripts existed. */
export const sessionSchemaV2 = z.object({ version: z.literal(2), ...sessionCoreShape });

export const sessionSchema = z.object({
  version: z.literal(3),
  ...sessionCoreShape,
  /**
   * Explicit opt-in to sending resume and job-description text to OpenAI.
   * False keeps every turn on the local deterministic engine.
   */
  aiConsent: z.boolean(),
  voiceTranscript: z.array(voiceTranscriptEntrySchema),
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

/** Upgrade a v2 session in place: consent defaults to off, voice history starts empty. */
export function migrateSession(raw: unknown): StoredSession | null {
  const current = sessionSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = sessionSchemaV2.safeParse(raw);
  if (!legacy.success) return null;
  const { version: _version, ...rest } = legacy.data;
  return { version: 3, ...rest, aiConsent: false, voiceTranscript: [] };
}
