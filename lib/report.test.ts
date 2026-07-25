import { describe, expect, it } from "vitest";
import { createReport } from "./report";
import { emptySession } from "./interview-session";

describe("final report", () => {
  it("uses a placeholder instead of inventing an achievement", () => {
    const question = { id: "q", prompt: "Tell me about impact.", competency: "Impact", topic: "impact", kind: "impact" as const };
    const session = { ...emptySession, transcript: [{ question, answer: "I worked with the team to improve the process.", skipped: false, acknowledgement: "Thank you.", askedAt: 1 }] };
    const report = createReport(session);
    expect(report.questions[0].improvedExample).toContain("[insert measurable result]");
    expect(report.score).toBeGreaterThan(0);
  });
});
