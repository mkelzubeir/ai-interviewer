import { describe, expect, it } from "vitest";
import { fromSessionRow, savedSessionRowSchema, toSessionRow } from "./sessions";
import { emptySession } from "@/lib/interview-session";
import { createReport } from "@/lib/report";
import { supabaseConfigured } from "./client";

const question = { id: "q", prompt: "Tell me about impact.", competency: "Impact", topic: "impact", kind: "impact" as const };

function completed() {
  const session = { ...emptySession, phase: "report" as const, interviewType: "behavioral" as const, duration: 30 as const, transcript: [{ question, answer: "I led the rollout and measured a 20% reduction.", skipped: false, acknowledgement: "Thank you.", askedAt: 1 }] };
  return { ...session, completedReport: createReport(session) };
}

describe("supabase configuration", () => {
  it("stays disabled when no public env vars are set, keeping anonymous mode intact", () => {
    expect(supabaseConfigured).toBe(false);
  });
});

describe("session row mapping", () => {
  it("maps a completed interview to an insertable row", () => {
    const row = toSessionRow(completed(), "user-1");
    expect(row).toMatchObject({ user_id: "user-1", interview_type: "behavioral", duration: 30, sample_mode: false });
    expect(row.transcript).toHaveLength(1);
    expect(row.score).toBeGreaterThan(0);
  });

  it("refuses to save an interview that has no report", () => {
    expect(() => toSessionRow(emptySession, "user-1")).toThrowError(/completed interview/i);
  });

  it("never writes resume or job-description text to the table", () => {
    const withDocuments = { ...completed(), resume: "SECRET RESUME TEXT", jobDescription: "SECRET JD TEXT" };
    const serialized = JSON.stringify(toSessionRow(withDocuments, "user-1"));
    expect(serialized).not.toContain("SECRET RESUME TEXT");
    expect(serialized).not.toContain("SECRET JD TEXT");
  });

  it("round-trips a stored row back into the shape the report view needs", () => {
    const session = completed();
    const stored = { id: "row-1", created_at: "2026-07-28T12:00:00Z", ...toSessionRow(session, "user-1") };
    const parsed = savedSessionRowSchema.safeParse(stored);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(fromSessionRow(parsed.data)).toMatchObject({ id: "row-1", interviewType: "behavioral", duration: 30 });
    expect(fromSessionRow(parsed.data).report.questions).toHaveLength(1);
  });

  it("rejects a row whose report does not match the schema", () => {
    expect(savedSessionRowSchema.safeParse({ id: "row-1", created_at: "now", interview_type: "mixed", duration: 20, sample_mode: false, score: 1, report: { nope: true }, transcript: [] }).success).toBe(false);
  });
});
