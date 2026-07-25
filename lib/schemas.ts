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

export const sessionSchema = z.object({
  version: z.literal(2), phase: z.enum(["setup", "interview", "report"]), sampleMode: z.boolean(), resume: z.string(), jobDescription: z.string(), interviewType: interviewTypeSchema, duration: durationSchema,
  startedAt: z.number().nullable(), questionBudget: z.number().int().positive(), questionsAsked: z.array(questionSchema), transcript: z.array(transcriptEntrySchema), topicsCovered: z.array(z.string()), competenciesTested: z.array(z.string()), competenciesNeedingEvidence: z.array(z.string()), claims: z.array(claimSchema), followUpDepth: z.number().int().nonnegative(), remainingBudget: z.number().int().nonnegative(), potentialStrengths: z.array(z.string()), potentialConcerns: z.array(z.string()), currentQuestion: questionSchema.nullable(), completedReport: reportSchema.nullable(),
});

export type InterviewType = z.infer<typeof interviewTypeSchema>;
export type InterviewDuration = z.infer<typeof durationSchema>;
export type Question = z.infer<typeof questionSchema>;
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
export type Claim = z.infer<typeof claimSchema>;
export type InterviewDecision = z.infer<typeof decisionSchema>;
export type InterviewReport = z.infer<typeof reportSchema>;
export type StoredSession = z.infer<typeof sessionSchema>;
