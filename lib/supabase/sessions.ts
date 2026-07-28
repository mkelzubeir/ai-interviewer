import { z } from "zod";
import { reportSchema, transcriptEntrySchema, type InterviewReport, type StoredSession } from "@/lib/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

export const sessionsTable = "interview_sessions";

/** A completed interview as stored in Postgres. Keys are snake_case per SQL convention. */
export const savedSessionRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  interview_type: z.string(),
  duration: z.number(),
  sample_mode: z.boolean(),
  score: z.number().nullable(),
  report: reportSchema,
  transcript: z.array(transcriptEntrySchema),
});

export type SavedSessionRow = z.infer<typeof savedSessionRowSchema>;
export type SavedSession = { id: string; createdAt: string; interviewType: string; duration: number; sampleMode: boolean; score: number | null; report: InterviewReport };

export type SaveResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Build the insert payload for a finished interview.
 *
 * Pure and exported so the mapping is unit-testable without a network call.
 * `user_id` is set explicitly because the RLS insert policy checks it against
 * auth.uid(); a mismatched value is rejected by the database, not by this code.
 */
export function toSessionRow(session: StoredSession, userId: string) {
  if (!session.completedReport) throw new Error("Only a completed interview can be saved.");
  return {
    user_id: userId,
    interview_type: session.interviewType,
    duration: session.duration,
    sample_mode: session.sampleMode,
    score: session.completedReport.score,
    report: session.completedReport,
    transcript: session.transcript,
  };
}

export function fromSessionRow(row: SavedSessionRow): SavedSession {
  return { id: row.id, createdAt: row.created_at, interviewType: row.interview_type, duration: row.duration, sampleMode: row.sample_mode, score: row.score, report: row.report };
}

export async function saveCompletedSession(client: SupabaseClient, session: StoredSession, userId: string): Promise<SaveResult> {
  try {
    const { data, error } = await client.from(sessionsTable).insert(toSessionRow(session, userId)).select("id").single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, id: String(data.id) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save this report." };
  }
}

/**
 * List the signed-in user's saved reports. No user filter is needed or
 * trusted here — the RLS select policy restricts rows to auth.uid().
 */
export async function listSavedSessions(client: SupabaseClient): Promise<SavedSession[]> {
  const { data, error } = await client
    .from(sessionsTable)
    .select("id, created_at, interview_type, duration, sample_mode, score, report, transcript")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  // A row written by an older schema version should not break the list.
  return data.flatMap((row) => {
    const parsed = savedSessionRowSchema.safeParse(row);
    return parsed.success ? [fromSessionRow(parsed.data)] : [];
  });
}

export async function deleteSavedSession(client: SupabaseClient, id: string) {
  const { error } = await client.from(sessionsTable).delete().eq("id", id);
  return !error;
}
