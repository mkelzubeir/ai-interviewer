import type { InterviewReport, StoredSession } from "./schemas";

/**
 * Deterministic feedback from the transcript alone. No model writes this, so
 * every criterion is an explicit, testable rule.
 *
 * The rubric for a behavioral answer: STAR (situation, task, action, result),
 * spoken in roughly 60–120 seconds — concise context, focused personal action,
 * a clear quantified result. Timing is estimated from word count at a spoken
 * pace of ~140 words per minute, because the transcript carries no durations.
 */
const SPOKEN_WORDS_PER_MINUTE = 140;
/** ~2 minutes of speech. Past this an answer is rambling, whatever its content. */
const RAMBLE_WORDS = 2 * SPOKEN_WORDS_PER_MINUTE;
/** ~1 minute of speech. Under this a story usually lacks situation or result. */
const TARGET_MIN_WORDS = SPOKEN_WORDS_PER_MINUTE;

const wordCount = (answer: string) => answer.trim().split(/\s+/).filter(Boolean).length;
const hasResult = (answer: string) => /\d|%|measured|metric|result|increase|decrease|reduc|improv|sav/i.test(answer);
const hasOwnership = (answer: string) => /\bI (led|owned|built|created|decided|drove|designed|launched)/i.test(answer);
/** Conditional or habitual phrasing with no concrete past-tense example behind it. */
const isHypothetical = (answer: string) =>
  /\b(I|we) (would|will|could|typically|usually|generally|always|tend to)\b/i.test(answer) &&
  !/\b(I|we) (led|owned|built|created|decided|drove|designed|launched|did|made|delivered|shipped|ran|worked)\b/i.test(answer);

function score(answer: string) {
  const words = wordCount(answer);
  const base = 45 + Math.min(100, words) / 3 + (hasResult(answer) ? 10 : 0) + (hasOwnership(answer) ? 7 : 0);
  // Rambling and hypothetical answers cost points the same way they cost credibility.
  const penalty = (words > RAMBLE_WORDS ? 6 : 0) + (isHypothetical(answer) ? 8 : 0);
  return Math.min(92, Math.max(42, base - penalty));
}

/** The single most important weakness of this answer, per the rubric. */
function weakened(answer: string): string {
  if (!answer.trim()) return "No answer was available to assess.";
  if (isHypothetical(answer)) return "The answer stayed hypothetical — describe a real example you actually lived, not what you would typically do.";
  if (wordCount(answer) > RAMBLE_WORDS) return "The answer ran past two minutes of speaking time. Tighten it toward 60–120 seconds: brief situation, your action, then the result.";
  if (/\bwe\b/i.test(answer) && !hasOwnership(answer)) return "Your personal ownership was not yet clear.";
  if (!hasResult(answer)) return "The answer skipped the result. Close every story with a measurable or observable outcome, or an explicit placeholder.";
  if (wordCount(answer) < TARGET_MIN_WORDS / 2) return "The answer was thin for a STAR story — add the situation and the concrete result around your action.";
  return "The answer could lead with its conclusion more directly.";
}

function improved(answer: string) {
  const clean = answer.trim();
  return clean
    ? `Lead with: “${clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean}” Then add: [specific situation], [your personal action], and [insert measurable result] only if those details are accurate.`
    : "Situation: [insert relevant situation]. Action: [insert your personal action]. Result: [insert measurable result or observable evidence].";
}

export function createReport(session: StoredSession): InterviewReport {
  const entries = session.transcript.filter((entry) => !entry.skipped && entry.answer.trim());
  const average = entries.length ? Math.round(entries.reduce((total, entry) => total + score(entry.answer), 0) / entries.length) : 0;
  const evidence = entries.filter((entry) => hasResult(entry.answer)).length;
  const rambling = entries.filter((entry) => wordCount(entry.answer) > RAMBLE_WORDS).length;
  const hypothetical = entries.filter((entry) => isHypothetical(entry.answer)).length;

  const concerns = [
    evidence < entries.length ? "Several outcomes need a metric, baseline, or observable indicator." : "Connect each metric more directly to your own decision.",
    "Avoid describing team work with “we” without naming your ownership.",
  ];
  if (rambling) concerns.push(`${rambling === 1 ? "One answer ran" : `${rambling} answers ran`} past two minutes of speaking time. Interviewers lose the thread; aim for 60–120 seconds per story.`);
  if (hypothetical) concerns.push(`${hypothetical === 1 ? "One answer stayed" : `${hypothetical} answers stayed`} hypothetical. “I would…” is not evidence — cite a real example every time.`);

  return {
    score: average,
    readiness: average >= 78 ? "Ready to practice live" : average >= 60 ? "Promising foundation" : "Build more evidence",
    summary: entries.length
      ? "You showed a credible operating profile. The next step is making ownership, choices, and evidence more explicit in each story."
      : "No answers were submitted, so this report uses preparation placeholders.",
    strongestDimension: evidence ? "Evidence-aware operating impact" : "Relevant strategic operations experience",
    improvementArea: "Make your personal role and the evidence behind outcomes unmistakable.",
    competencies: [
      { label: "Structured communication", score: Math.min(90, average + 3) },
      { label: "Strategic judgment", score: average },
      { label: "Stakeholder leadership", score: Math.max(35, average - 2) },
      { label: "Impact orientation", score: Math.max(30, average + (evidence ? 4 : -8)) },
    ],
    concerns,
    stories: session.transcript
      .filter((entry) => /\b(led|built|launched|coordinated|created)\b/i.test(entry.answer))
      .map((entry) => entry.question.prompt)
      .slice(0, 3)
      .concat(entries.length ? [] : ["[prepare one strategic initiative with a measurable outcome]"]),
    actions: [
      "Prepare two concise STAR stories — situation, task, your personal action, result — each speakable in 60–120 seconds.",
      "For every outcome, write down the metric, baseline, or observable evidence you can defend.",
      "Practice naming the decision you owned before describing the team's work.",
    ],
    questions: session.transcript.map((entry) => ({
      question: entry.question.prompt,
      answer: entry.skipped ? "[Skipped]" : entry.answer || "[No answer provided]",
      worked: entry.answer ? "You engaged with the topic and created material to refine." : "No answer was available to assess.",
      weakened: weakened(entry.answer),
      structure: "STAR in 60–120 seconds: situation and task in two sentences, your personal action, then the quantified result.",
      improvedExample: improved(entry.answer),
    })),
  };
}
