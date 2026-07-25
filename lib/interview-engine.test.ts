import { describe, expect, it } from "vitest";
import { budgetForDuration, containsOwnershipGap, decideNext, firstQuestion } from "./interview-engine";
import { emptySession } from "./interview-session";

function session() {
  const first = firstQuestion("mixed");
  return { ...emptySession, phase: "interview" as const, interviewType: "mixed" as const, currentQuestion: first, questionsAsked: [first], remainingBudget: 6 };
}

describe("dynamic interview engine", () => {
  it("chooses a targeted follow-up for a very short answer", () => {
    expect(decideNext(session(), "I like the role.").decision).toBe("follow-up");
  });

  it("asks for individual ownership when we is repeated", () => {
    const answer = "We met with teams and we agreed to change the plan. We then worked with Operations to deliver it over the next quarter.";
    expect(containsOwnershipGap(answer)).toBe(true);
    expect(decideNext(session(), answer).question?.prompt).toMatch(/personally own/i);
  });

  it("limits follow-up depth and moves to a new question", () => {
    const state = { ...session(), followUpDepth: 2 };
    expect(decideNext(state, "We improved the outcome.").decision).toBe("new-question");
  });

  it("does not repeat an already covered topic", () => {
    const state = { ...session(), followUpDepth: 2, questionsAsked: [firstQuestion("mixed"), { ...firstQuestion("mixed"), id: "done", topic: "prioritization" }] };
    const next = decideNext(state, "I led a project and measured the impact at 20%.");
    expect(next.question?.topic).not.toBe("prioritization");
  });

  it("ends when the question budget is exhausted", () => {
    expect(decideNext({ ...session(), remainingBudget: 1 }, "I led the work and measured 20% impact.").decision).toBe("end");
  });

  it("maps duration to a bounded budget", () => {
    expect([budgetForDuration(10), budgetForDuration(20), budgetForDuration(30)]).toEqual([4, 7, 10]);
  });
});
