import { describe, expect, it } from "vitest";
import { budgetForDuration, containsOwnershipGap, decideNext, firstQuestion, questionLibrary } from "./interview-engine";
import { emptySession } from "./interview-session";

function session(sampleMode = true) {
  const first = firstQuestion("mixed", sampleMode);
  return { ...emptySession, phase: "interview" as const, interviewType: "mixed" as const, sampleMode, currentQuestion: first, questionsAsked: [first], remainingBudget: 6 };
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
    const first = firstQuestion("mixed", true);
    const state = { ...session(), followUpDepth: 2, questionsAsked: [first, { ...first, id: "done", topic: "prioritization" }] };
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

describe("question libraries", () => {
  const sample = questionLibrary(true);
  const general = questionLibrary(false);

  it("keeps the documented sample fixture exactly as demonstrated", () => {
    expect(firstQuestion("mixed", true).prompt).toBe(
      "Avery, to start, what draws you to Strategic Projects at Meridian Works at this point in your career?",
    );
    expect(firstQuestion("recruiter", true).id).toBe("recruiter-transition");
  });

  it("never puts the sample persona in front of a candidate using their own materials", () => {
    for (const question of general) {
      expect(question.prompt).not.toMatch(/Avery|Meridian|Harborline|Strategic Projects/i);
    }
  });

  it("keeps both libraries structurally identical so selection rules behave the same", () => {
    const shape = (questions: typeof sample) => questions.map(({ id, competency, topic, kind }) => ({ id, competency, topic, kind }));
    expect(shape(general)).toEqual(shape(sample));
  });

  it("selects new questions from the library matching the session mode", () => {
    const own = decideNext({ ...session(false), followUpDepth: 2 }, "I led the work and measured a 20% reduction against baseline.");
    expect(own.question?.prompt).not.toMatch(/Meridian/i);
  });
});
