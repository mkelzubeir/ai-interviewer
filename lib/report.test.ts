import { describe, expect, it } from "vitest";
import { createReport } from "./report";
import { emptySession } from "./interview-session";

const question = { id: "q", prompt: "Tell me about impact.", competency: "Impact", topic: "impact", kind: "impact" as const };

function reportFor(answer: string) {
  return createReport({ ...emptySession, transcript: [{ question, answer, skipped: false, acknowledgement: "Thank you.", askedAt: 1 }] });
}

describe("final report", () => {
  it("uses a placeholder instead of inventing an achievement", () => {
    const report = reportFor("I worked with the team to improve the process.");
    expect(report.questions[0].improvedExample).toContain("[insert measurable result]");
    expect(report.score).toBeGreaterThan(0);
  });

  it("coaches STAR structure with the 60–120 second target", () => {
    const report = reportFor("I led the migration and cut costs by 20%.");
    expect(report.questions[0].structure).toMatch(/STAR/);
    expect(report.questions[0].structure).toMatch(/60–120 seconds/);
    expect(report.actions.join(" ")).toMatch(/STAR/);
  });

  it("flags an answer that rambles past two minutes of speaking time", () => {
    const rambling = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const report = reportFor(`I led the rollout. ${rambling}`);
    expect(report.questions[0].weakened).toMatch(/past two minutes/);
    expect(report.concerns.join(" ")).toMatch(/60–120 seconds/);
  });

  it("flags an answer that stays hypothetical instead of citing a real example", () => {
    const report = reportFor("I would typically talk to the stakeholders first and we would usually align on a plan together before anything else happens.");
    expect(report.questions[0].weakened).toMatch(/hypothetical/);
    expect(report.concerns.join(" ")).toMatch(/hypothetical/i);
  });

  it("does not call a concrete past-tense story hypothetical", () => {
    const report = reportFor("I led the intake redesign across three teams and cut duplicate requests by 28% in one quarter.");
    expect(report.questions[0].weakened).not.toMatch(/hypothetical/);
  });

  it("flags an answer that skips the result", () => {
    const answer = Array.from({ length: 80 }, () => "context").join(" ") + " so I owned the plan and talked to everyone involved.";
    const report = reportFor(answer);
    expect(report.questions[0].weakened).toMatch(/skipped the result|needs verifiable|result/i);
  });
});
