import type { InterviewDecision, InterviewType, Question, StoredSession } from "./schemas";

// Sample mode is a documented deterministic demonstration built around the
// fictional Avery Morgan / Meridian Works fixture, so these prompts must not
// change. Everyone else gets `generalLibrary` below, which names no persona.
const sampleLibrary: Question[] = [
  { id: "opening-strategic", prompt: "Avery, to start, what draws you to Strategic Projects at Meridian Works at this point in your career?", competency: "Motivation", topic: "motivation", kind: "opening" },
  { id: "resume-prioritization", prompt: "Your resume mentions building a cross-functional intake and prioritization process. How did you decide what the process needed to solve?", competency: "Problem framing", topic: "prioritization", kind: "resume" },
  { id: "motivation-meridian", prompt: "Which part of Meridian's operating model feels most aligned with work you have done, and where would you need to ramp up?", competency: "Role motivation", topic: "role-fit", kind: "motivation" },
  { id: "behavioral-alignment", prompt: "Tell me about a time stakeholders disagreed on the right path for an operational initiative.", competency: "Stakeholder alignment", topic: "alignment", kind: "behavioral" },
  { id: "impact-measurement", prompt: "How do you decide whether a strategic project has made a meaningful difference?", competency: "Impact measurement", topic: "measurement", kind: "impact" },
  { id: "judgment-tradeoffs", prompt: "Describe a difficult tradeoff you have made when capacity, urgency, and stakeholder expectations were in tension.", competency: "Judgment", topic: "tradeoffs", kind: "judgment" },
  { id: "manager-ambiguity", prompt: "When a senior group agrees a problem matters but not what to do about it, how do you create momentum?", competency: "Execution", topic: "ambiguity", kind: "behavioral" },
  { id: "recruiter-transition", prompt: "What would make this role the right next move for you, beyond the title?", competency: "Career intent", topic: "career", kind: "motivation" },
];

// Same ids, topics, competencies and kinds as the sample fixture — only the
// wording differs — so selection rules, budgets and follow-ups behave identically.
const generalLibrary: Question[] = [
  { id: "opening-strategic", prompt: "To start, what draws you to this role at this point in your career?", competency: "Motivation", topic: "motivation", kind: "opening" },
  { id: "resume-prioritization", prompt: "Pick something from your background that you had to scope yourself. How did you decide what the work actually needed to solve?", competency: "Problem framing", topic: "prioritization", kind: "resume" },
  { id: "motivation-meridian", prompt: "Which part of this role feels closest to work you have already done, and where would you need to ramp up?", competency: "Role motivation", topic: "role-fit", kind: "motivation" },
  { id: "behavioral-alignment", prompt: "Tell me about a time stakeholders disagreed on the right path forward.", competency: "Stakeholder alignment", topic: "alignment", kind: "behavioral" },
  { id: "impact-measurement", prompt: "How do you decide whether a piece of work has made a meaningful difference?", competency: "Impact measurement", topic: "measurement", kind: "impact" },
  { id: "judgment-tradeoffs", prompt: "Describe a difficult tradeoff you have made when capacity, urgency, and expectations were in tension.", competency: "Judgment", topic: "tradeoffs", kind: "judgment" },
  { id: "manager-ambiguity", prompt: "When a senior group agrees a problem matters but not what to do about it, how do you create momentum?", competency: "Execution", topic: "ambiguity", kind: "behavioral" },
  { id: "recruiter-transition", prompt: "What would make this role the right next move for you, beyond the title?", competency: "Career intent", topic: "career", kind: "motivation" },
];

export function questionLibrary(sampleMode: boolean) { return sampleMode ? sampleLibrary : generalLibrary; }

const typeTopics: Record<InterviewType, string[]> = {
  recruiter: ["motivation", "career", "role-fit", "alignment"], behavioral: ["alignment", "tradeoffs", "ambiguity", "measurement"], "hiring-manager": ["prioritization", "alignment", "measurement", "tradeoffs"], "role-specific": ["prioritization", "measurement", "ambiguity", "tradeoffs"], mixed: ["motivation", "prioritization", "alignment", "measurement", "tradeoffs"],
};

export function budgetForDuration(duration: number) { return duration === 10 ? 4 : duration === 20 ? 7 : 10; }
export function containsOwnershipGap(answer: string) { const we = (answer.match(/\bwe\b/gi) ?? []).length; return we >= 2 && !/\bI (led|owned|decided|created|built|managed|recommended|proposed)/i.test(answer); }
export function hasOutcomeWithoutEvidence(answer: string) { return /\b(result|outcome|improved|reduced|increased|impact|success)\b/i.test(answer) && !/\d|%|percent|baseline|measured|metric/i.test(answer); }
export function hasTradeoff(answer: string) { return /\btradeoff|trade-off|alternative|option|versus|instead|priorit/i.test(answer); }
export function extractClaims(answer: string) { const matches = answer.match(/\b(?:led|built|created|reduced|increased|improved|launched|coordinated)\b[^.!?]{0,120}/gi) ?? []; return matches.slice(0, 2); }

export function decideNext(session: StoredSession, answer: string): { decision: InterviewDecision; question: Question | null; acknowledgement: string } {
  const current = session.currentQuestion;
  if (!current || session.remainingBudget <= 1) return { decision: "end", question: null, acknowledgement: "Thank you. That gives me a useful picture of your approach." };
  if (session.followUpDepth < 2 && containsOwnershipGap(answer)) return { decision: "follow-up", question: followUp(current, "ownership"), acknowledgement: "Thank you." };
  if (session.followUpDepth < 2 && answer.trim().split(/\s+/).filter(Boolean).length < 24) return { decision: "follow-up", question: followUp(current, "example"), acknowledgement: "I see." };
  if (session.followUpDepth < 2 && hasOutcomeWithoutEvidence(answer)) return { decision: "follow-up", question: followUp(current, "evidence"), acknowledgement: "Understood." };
  if (session.followUpDepth < 2 && hasTradeoff(answer)) return { decision: "follow-up", question: followUp(current, "tradeoff"), acknowledgement: "That is helpful context." };
  const unresolved = session.claims.find((claim) => !claim.resolved && !session.topicsCovered.includes(`revisited-${claim.topic}`));
  if (unresolved && session.questionsAsked.length >= 3) return { decision: "revisit-claim", question: { id: `revisit-${unresolved.topic}`, prompt: `Earlier, you mentioned “${unresolved.text}.” What was your personal role, and how did you know the work was effective?`, competency: "Ownership and impact", topic: `revisited-${unresolved.topic}`, kind: "revisit" }, acknowledgement: "I would like to return to one point you raised." };
  const next = chooseNewQuestion(session);
  return next ? { decision: "new-question", question: next, acknowledgement: "Thank you." } : { decision: "end", question: null, acknowledgement: "Thank you. That concludes our conversation." };
}

function followUp(question: Question, rule: "example" | "ownership" | "evidence" | "tradeoff"): Question {
  const prompts = { example: "Could you walk me through one concrete example—what was the situation, what did you do, and what changed?", ownership: "You mentioned the team's work. What did you personally own or decide within that effort?", evidence: "How was that outcome measured, and what evidence gave you confidence it was meaningful?", tradeoff: "What alternatives did you consider, and what did you give up by choosing that path?" };
  return { id: `${question.id}-follow-up-${rule}`, prompt: prompts[rule], competency: question.competency, topic: question.topic, kind: "follow-up" };
}

function chooseNewQuestion(session: StoredSession) {
  const library = questionLibrary(session.sampleMode);
  const desired = typeTopics[session.interviewType];
  return library.find((question) => desired.includes(question.topic) && !session.questionsAsked.some((asked) => asked.topic === question.topic)) ?? library.find((question) => !session.questionsAsked.some((asked) => asked.topic === question.topic));
}

export function firstQuestion(type: InterviewType, sampleMode: boolean) {
  const library = questionLibrary(sampleMode);
  return type === "recruiter" ? library.find((q) => q.id === "recruiter-transition")! : library[0];
}
