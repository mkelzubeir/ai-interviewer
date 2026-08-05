import { describe, expect, it } from "vitest";
import { assessAnswer, classifyQuestion, createReport } from "./report";
import { emptySession } from "./interview-session";

const question = { id: "q", prompt: "Tell me about impact.", competency: "Impact", topic: "impact", kind: "impact" as const };

function reportFor(answer: string, prompt = question.prompt) {
  return createReport({ ...emptySession, transcript: [{ question: { ...question, prompt }, answer, skipped: false, acknowledgement: "Thank you.", askedAt: 1 }] });
}

describe("question classification", () => {
  it.each([
    ["Thanks for joining. To start, tell me about yourself.", "intro"],
    ["Walk me through your resume.", "intro"],
    ["Tell me about a time you resolved a conflict with a teammate.", "behavioral"],
    ["Describe a situation where you missed a deadline. What did you do?", "behavioral"],
    ["Give me an example of going above and beyond what was asked.", "behavioral"],
    ["What's your biggest professional accomplishment and why is it relevant here?", "behavioral"],
    ["Why this company? What do you know about us?", "motivation"],
    ["Why are you looking to leave your current role?", "motivation"],
    ["Where do you see yourself in five years?", "motivation"],
    ["What motivates you?", "motivation"],
    ["What would make you turn down an offer?", "motivation"],
    ["How do you like to be managed?", "motivation"],
    ["How would you approach this role? What would your first 30/60/90 days look like?", "approach"],
    ["How do you prioritize when everything feels urgent?", "approach"],
    ["What are your salary expectations?", "logistics"],
    ["What's your availability? Are you OK with the hybrid setup?", "logistics"],
    ["Do you have any questions for me?", "reverse"],
    ["What questions do you have for me?", "reverse"],
  ])("%s → %s", (prompt, expected) => {
    expect(classifyQuestion(prompt)).toBe(expected);
  });

  it("defaults an unrecognized follow-up to the behavioral rubric", () => {
    expect(classifyQuestion("Tell me about impact.")).toBe("behavioral");
  });
});

describe("intro rubric", () => {
  const INTRO_PROMPT = "Thanks for joining. To start, tell me about yourself.";

  it("never judges an intro for skipping a result, and coaches present → past → future", () => {
    const feedback = assessAnswer(INTRO_PROMPT, "I run strategic operations at Harborline. I got here after leading an intake redesign across three teams. That mix is exactly what draws me to this role.");
    expect(feedback.type).toBe("intro");
    expect(feedback.weakened).not.toMatch(/result/i);
    expect(feedback.structure).toMatch(/Present → past → future/);
    expect(feedback.structure).toMatch(/Not STAR/);
    expect(feedback.improvedExample).not.toContain("[insert measurable result]");
  });

  it("flags biographical detail that does not earn its place", () => {
    const feedback = assessAnswer(INTRO_PROMPT, "I grew up in a small town and in high school I loved math. My parents were teachers. Then I studied economics and here I am.");
    expect(feedback.weakened).toMatch(/does not earn its place/);
  });

  it("flags an intro that trails off without landing on the role", () => {
    const long = Array.from({ length: 80 }, () => "context").join(" ");
    const feedback = assessAnswer(INTRO_PROMPT, `I am an operations manager. ${long}. I also did some other things.`);
    expect(feedback.weakened).toMatch(/did not land anywhere/);
  });

  it("flags an intro that runs past 90 seconds, not the behavioral two minutes", () => {
    const rambling = Array.from({ length: 230 }, (_, i) => `word${i}`).join(" ");
    const feedback = assessAnswer(INTRO_PROMPT, `I run operations today. ${rambling}. That is why this role fits.`);
    expect(feedback.weakened).toMatch(/past 90 seconds/);
  });

  it("builds the improved example from the candidate's own facts", () => {
    const feedback = assessAnswer(INTRO_PROMPT, "I run strategic operations at Harborline. Before that I led an intake redesign across three teams.");
    expect(feedback.improvedExample).toContain("I run strategic operations at Harborline.");
    expect(feedback.improvedExample).toContain("led an intake redesign");
  });
});

describe("motivation rubric", () => {
  const PROMPT = "Why this company?";

  it("flags praise generic enough to open any application", () => {
    const feedback = assessAnswer(PROMPT, "i think it is a great company with a great culture and i am passionate about the mission and excited to learn and grow.");
    expect(feedback.type).toBe("motivation");
    expect(feedback.weakened).toMatch(/specific to this company/);
  });

  it("flags trashing the current employer over everything else", () => {
    const feedback = assessAnswer("Why are you leaving your current role?", "Honestly my manager is toxic and I am fed up with Harborline. Meridian seems better.");
    expect(feedback.weakened).toMatch(/moving to/);
  });

  it("credits a concrete, forward-framed answer by quoting it", () => {
    const feedback = assessAnswer(PROMPT, "I followed the Meridian service-quality launch across three regions last year. My goal is to grow into exactly that kind of cross-functional work.");
    expect(feedback.worked).toContain("Meridian");
    expect(feedback.weakened).not.toMatch(/specific to this company/);
  });
});

describe("approach rubric", () => {
  const PROMPT = "How would you approach this role? What would your first 30/60/90 days look like?";

  it("does not flag a hypothetical answer — the question asks for one", () => {
    const feedback = assessAnswer(PROMPT, "First I would meet the regional leads to understand the current bottlenecks. Then I would prioritize the intake process because it matters most. I would not change anything before I learn how decisions get made.");
    expect(feedback.type).toBe("approach");
    expect(feedback.weakened).not.toMatch(/hypothetical/);
    expect(feedback.worked).toMatch(/sequence/i);
  });

  it("flags a stream of consciousness with no framework", () => {
    const feedback = assessAnswer(PROMPT, "I guess I'd talk to people and get involved with whatever comes up and see how things go and help where I can.");
    expect(feedback.weakened).toMatch(/stream of consciousness/);
  });
});

describe("logistics rubric", () => {
  it("wants a researched range stated plainly", () => {
    const vague = assessAnswer("What are your salary expectations?", "Oh, I'm sorry, I hope that's okay to discuss, whatever you think is fair really, I don't want to be difficult.");
    expect(vague.type).toBe("logistics");
    expect(vague.weakened).toMatch(/hedging/);

    const direct = assessAnswer("What are your salary expectations?", "Based on my research, I'm targeting 95 to 110, and I'm open on the full package.");
    expect(direct.worked).toContain("95 to 110");
  });
});

describe("reverse rubric", () => {
  it("flags having no questions, and logistics-only questions", () => {
    expect(assessAnswer("Do you have any questions for me?", "No, I think you covered everything.").weakened).toMatch(/No questions at all/);
    expect(assessAnswer("Do you have any questions for me?", "How much vacation do we get? And what are the hours?").weakened).toMatch(/Only logistics/);
  });

  it("credits substantive questions by quoting one", () => {
    const feedback = assessAnswer("Do you have any questions for me?", "What would success look like for this role in six months? And what is the team's biggest challenge right now?");
    expect(feedback.worked).toContain("What would success look like");
  });
});

describe("what worked is specific or honest, never filler", () => {
  it("quotes what the candidate actually said", () => {
    const report = reportFor("I led the intake redesign and cut duplicate requests by 28%.", "Tell me about a time you led a change.");
    expect(report.questions[0].worked).toContain("cut duplicate requests by 28%");
  });

  it("says so briefly when nothing stood out, without inventing praise", () => {
    const report = reportFor("Um, I am not sure. It went fine I guess.", "Tell me about a time you led a change.");
    expect(report.questions[0].worked).toMatch(/Nothing specific stood out/);
  });

  it("never emits the old filler anywhere in a report", () => {
    const serialized = JSON.stringify(reportFor("I did some things at work."));
    expect(serialized).not.toMatch(/engaged with the topic/);
    expect(serialized).not.toMatch(/created material to refine/);
  });
});

describe("a mixed transcript gets type-appropriate feedback per question", () => {
  it("intro, behavioral and motivation each score against their own rubric", () => {
    const transcript = [
      { question: { ...question, id: "q1", prompt: "Thanks for joining. To start, tell me about yourself." }, answer: "I run strategic operations at Harborline, focused on cross-functional delivery.", skipped: false, acknowledgement: "", askedAt: 1 },
      { question: { ...question, id: "q2", prompt: "Tell me about a time you led something through change." }, answer: "I would usually get everyone together and we would typically align on a plan.", skipped: false, acknowledgement: "", askedAt: 2 },
      { question: { ...question, id: "q3", prompt: "Why this role specifically?" }, answer: "It seems like a great opportunity and I am passionate about growth.", skipped: false, acknowledgement: "", askedAt: 3 },
    ];
    const report = createReport({ ...emptySession, transcript });

    const [intro, behavioral, motivation] = report.questions;
    expect(intro.structure).toMatch(/Present → past → future/);
    expect(intro.weakened).not.toMatch(/result|STAR|hypothetical/i);
    expect(behavioral.structure).toMatch(/STAR/);
    expect(behavioral.weakened).toMatch(/hypothetical/);
    expect(motivation.structure).toMatch(/concrete reason tied to this company/);
    expect(motivation.weakened).toMatch(/specific to this company/);

    // The hypothetical concern counts the behavioral answer only, not the intro.
    expect(report.concerns.join(" ")).toMatch(/1 behavioral answer|One behavioral answer/);
  });
});

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
