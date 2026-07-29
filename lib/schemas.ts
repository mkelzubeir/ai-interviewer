import { z } from "zod";

export const interviewTypeSchema = z.enum(["recruiter", "behavioral", "hiring-manager", "role-specific", "mixed"]);
export const durationSchema = z.union([z.literal(10), z.literal(20), z.literal(30)]);

/** A turn in the interview, derived from the spoken conversation at the end. */
export const questionSchema = z.object({
  id: z.string(), prompt: z.string(), competency: z.string(), topic: z.string(), kind: z.enum(["opening", "resume", "motivation", "behavioral", "impact", "judgment", "follow-up", "revisit"]),
});
export const transcriptEntrySchema = z.object({ question: questionSchema, answer: z.string(), skipped: z.boolean(), acknowledgement: z.string(), askedAt: z.number() });
export const reportQuestionSchema = z.object({ question: z.string(), answer: z.string(), worked: z.string(), weakened: z.string(), structure: z.string(), improvedExample: z.string() });
export const reportSchema = z.object({ score: z.number(), readiness: z.string(), summary: z.string(), strongestDimension: z.string(), improvementArea: z.string(), competencies: z.array(z.object({ label: z.string(), score: z.number() })), concerns: z.array(z.string()), stories: z.array(z.string()), actions: z.array(z.string()), questions: z.array(reportQuestionSchema) });

export const voiceTranscriptEntrySchema = z.object({ id: z.string(), speaker: z.enum(["candidate", "interviewer"]), text: z.string(), timestamp: z.number(), final: z.boolean(), interrupted: z.boolean() });

/**
 * The persisted interview.
 *
 * Version 5 is the voice-only shape: the local question engine and the typed
 * answer flow are gone, so the state the engine needed went with them. The
 * spoken conversation is the record; `transcript` is derived from it when the
 * interview ends and is what the report is built from.
 */
export const sessionSchema = z.object({
  version: z.literal(5),
  phase: z.enum(["setup", "interview", "report"]),
  sampleMode: z.boolean(),
  resume: z.string(),
  jobDescription: z.string(),
  interviewType: interviewTypeSchema,
  duration: durationSchema,
  startedAt: z.number().nullable(),
  questionBudget: z.number().int().positive(),
  remainingBudget: z.number().int().nonnegative(),
  voiceTranscript: z.array(voiceTranscriptEntrySchema),
  transcript: z.array(transcriptEntrySchema),
  completedReport: reportSchema.nullable(),
});

export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type InterviewDuration = z.infer<typeof durationSchema>;
export type Question = z.infer<typeof questionSchema>;
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type InterviewReport = z.infer<typeof reportSchema>;
export type StoredSession = z.infer<typeof sessionSchema>;
export type VoiceTranscriptEntry = z.infer<typeof voiceTranscriptEntrySchema>;

/**
 * Anything written before the app became voice-only. Those sessions describe a
 * typed interview driven by a question engine that no longer exists, so only
 * the parts that still mean something are carried across: the candidate's
 * documents and any report they already finished.
 */
const legacySessionSchema = z.object({
  version: z.number(),
  resume: z.string().optional(),
  jobDescription: z.string().optional(),
  interviewType: interviewTypeSchema.optional(),
  duration: durationSchema.optional(),
  completedReport: reportSchema.nullable().optional(),
  transcript: z.array(transcriptEntrySchema).optional(),
  voiceTranscript: z.array(voiceTranscriptEntrySchema).optional(),
});

export function migrateSession(raw: unknown): StoredSession | null {
  const current = sessionSchema.safeParse(raw);
  if (current.success) return current.data;

  const legacy = legacySessionSchema.safeParse(raw);
  if (!legacy.success) return null;

  const report = legacy.data.completedReport ?? null;
  const duration = legacy.data.duration ?? 20;
  return {
    version: 5,
    // A finished report is still worth reading; an interview mid-flight in the
    // old typed format cannot be resumed as a spoken one, so it returns to setup.
    phase: report ? "report" : "setup",
    sampleMode: false,
    resume: legacy.data.resume ?? "",
    jobDescription: legacy.data.jobDescription ?? "",
    interviewType: legacy.data.interviewType ?? "mixed",
    duration,
    startedAt: null,
    questionBudget: budgetForDuration(duration),
    remainingBudget: budgetForDuration(duration),
    voiceTranscript: legacy.data.voiceTranscript ?? [],
    transcript: report ? legacy.data.transcript ?? [] : [],
    completedReport: report,
  };
}

/** How many interviewer turns a chosen duration is worth. */
export function budgetForDuration(duration: number) {
  return duration === 10 ? 4 : duration === 20 ? 7 : 10;
}
