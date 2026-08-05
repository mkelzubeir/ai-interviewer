import type { InterviewReport, StoredSession } from "./schemas";

/**
 * Deterministic feedback from the transcript alone. No model writes this, so
 * every criterion is an explicit, testable rule.
 *
 * A single rubric cannot judge every answer: STAR is right for "tell me about a
 * time…" and wrong for "tell me about yourself". Each question is therefore
 * classified first, and scored only against the rubric for its type.
 *
 * Timing is estimated from word count at a spoken pace of ~140 words per
 * minute, because the transcript carries no durations.
 */
const WPM = 140;

export type QuestionType = "intro" | "behavioral" | "motivation" | "approach" | "logistics" | "reverse";

/**
 * Classify by the question's own wording. Order matters: "tell me about
 * yourself" must land on intro before the behavioral "tell me about…" patterns
 * get a look, and "what would make you turn down an offer" is motivation, not a
 * hypothetical about how they would work.
 */
export function classifyQuestion(prompt: string): QuestionType {
  const q = prompt.toLowerCase();
  if (/questions?[^.?!]* for me|anything you(’|'| would| d)?[^.?!]*ask (me|us)/.test(q)) return "reverse";
  if (/tell me about yourself|walk me through your (resume|background|cv)|introduce yourself/.test(q)) return "intro";
  if (/salary|compensation|availability|notice period|start date|timeline|relocat|hybrid|remote|on-?site|location/.test(q)) return "logistics";
  if (/tell me about a time|describe a (situation|time)|give (me )?an example|time (you|when)|situation where|failure|mistake|conflict|accomplishment|above and beyond|hard feedback|persuade/.test(q)) return "behavioral";
  if (/why (this|our|us|the)\b|why are you (looking|leaving)|what are you looking for|where do you see yourself|motivates you|career goals|turn down an offer|like to be managed|how does your (experience|background)/.test(q)) return "motivation";
  if (/how would you|what would your|first (30|60|90|thirty|sixty|ninety)|30\/60\/90|how do you (prioritize|approach|handle|decide|manage|structure)/.test(q)) return "approach";
  // Follow-ups and anything unrecognised ask for a concrete real example, which
  // is what the behavioral rubric checks.
  return "behavioral";
}

/* ---------------------------------------------------------------- primitives */

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
/** A short verbatim quote, because "what worked" must cite what was said. */
const quote = (sentence: string) => `“${sentence.length > 110 ? `${sentence.slice(0, 107).trimEnd()}…` : sentence}”`;

const hasResult = (answer: string) => /\d|%|measured|metric|result|increase|decrease|reduc|improv|sav/i.test(answer);
const hasOwnership = (answer: string) => /\bI (led|owned|built|created|decided|drove|designed|launched)/i.test(answer);
const isHypothetical = (answer: string) =>
  /\b(I|we) (would|will|could|typically|usually|generally|always|tend to)\b/i.test(answer) &&
  !/\b(I|we) (led|owned|built|created|decided|drove|designed|launched|did|made|delivered|shipped|ran|worked)\b/i.test(answer);

/** A capitalized name mid-sentence, or a number: something that could not be said about any company. */
const namesSomethingConcrete = (answer: string) =>
  /\d/.test(answer) || sentences(answer).some((s) => s.split(/\s+/).slice(1).some((w) => w !== "I" && /^[A-Z][a-z]{2,}/.test(w)));

const trashesThePast = (answer: string) => /toxic|terrible|awful|hate[sd]?\b|worst|micromanag|incompetent|fed up|sick of|underpaid|burn(ed|t) out/i.test(answer);
const biographicalDrift = (answer: string) => /childhood|grew up|born in|high school|when i was (a kid|young)|my parents/i.test(answer);
const sequenced = (answer: string) => /\b(first|then|next|finally|after that|step|phase|start by|week one|day one|30|60|90)\b/i.test(answer);
const acknowledgesLearning = (answer: string) => /\b(learn|listen|understand|ask|meet|shadow|context|before (I|we) (change|decide))/i.test(answer);
const hedgesApologetically = (answer: string) => /\b(sorry|i hope that('|’)s (ok|okay|alright)|if that('|’)s (ok|okay|alright)|whatever you think|i don('|’)t know, maybe)\b/i.test(answer);

const firstMatching = (answer: string, pattern: RegExp) => sentences(answer).find((s) => pattern.test(s));
const NOTHING_WORKED = "Nothing specific stood out in this answer yet — the rewrite below shows the shape to aim for.";

/* ------------------------------------------------------------------- rubrics */

type QuestionFeedback = { type: QuestionType; score: number; worked: string; weakened: string; structure: string; improvedExample: string };

/** Criteria in, clamped score out. Same band as the original engine. */
const scoreFrom = (met: number, of: number, penalties: number) => Math.min(92, Math.max(42, Math.round(58 + (met / of) * 30 - penalties * 8)));

function introRubric(answer: string): QuestionFeedback {
  const count = words(answer);
  const landing = firstMatching(answer, /this (role|company|position|team|opportunity)|your (team|company)|which is why|next step|that('|’)s why i('|’)m here/i);
  const present = firstMatching(answer, /\bI ('|’)?(m|am|lead|run|manage|own|work|head)\b/i) ?? sentences(answer)[0];
  const pastBeat = firstMatching(answer, /\b(led|built|launched|moved|joined|spent|grew|delivered|before that)\b|\d/i);
  const drifted = biographicalDrift(answer);
  const rambled = count > (90 / 60) * WPM; // 90 seconds

  const flags = [
    drifted && "Biographical detail that does not earn its place — childhood and full history belong off the clock. Keep only the beats that point at this role.",
    rambled && "This ran past 90 seconds of speaking time. An intro is a trailer, not the film: present, two or three career beats, why you're here.",
    !landing && "It did not land anywhere — end pointed at this role and company instead of trailing off.",
    count < 70 && "Too thin for an intro — add the one or two career beats that make you the obvious candidate for this role.",
  ].filter((flag): flag is string => Boolean(flag));

  return {
    type: "intro",
    score: scoreFrom([present, pastBeat, landing].filter(Boolean).length, 3, flags.length),
    worked: landing ? `You ended it pointed at the role: ${quote(landing)}` : pastBeat ? `You picked a career beat worth keeping: ${quote(pastBeat)}` : present ? `You opened with where you are now: ${quote(present)}` : NOTHING_WORKED,
    weakened: flags[0] ?? "Tie each beat you kept more explicitly to what this role needs.",
    structure: "Present → past → future: what you do now, the two or three most relevant career beats, and why you're here — pointed at this role. 60–90 seconds. Not STAR.",
    improvedExample: `Now: ${present ? quote(present) : "[what you do today, in one sentence]"} The road here: ${pastBeat ? quote(pastBeat) : "[the one or two beats that qualify you for this role]"} The landing: “…which is exactly what draws me to this role.”`,
  };
}

function behavioralRubric(answer: string): QuestionFeedback {
  const count = words(answer);
  const rambled = count > 2 * WPM;
  const evidence = firstMatching(answer, /\d|%/);
  const ownership = firstMatching(answer, /\bI (led|owned|built|created|decided|drove|designed|launched)\b/i);

  const weakened = isHypothetical(answer)
    ? "The answer stayed hypothetical — describe a real example you actually lived, not what you would typically do."
    : rambled
      ? "The answer ran past two minutes of speaking time. Tighten it toward 60–120 seconds: brief situation, your action, then the result."
      : /\bwe\b/i.test(answer) && !hasOwnership(answer)
        ? "Your personal ownership was not yet clear."
        : !hasResult(answer)
          ? "The answer skipped the result. Close every story with a measurable or observable outcome, or an explicit placeholder."
          : count < WPM / 2
            ? "The answer was thin for a STAR story — add the situation and the concrete result around your action."
            : "The answer could lead with its conclusion more directly.";

  const base = 45 + Math.min(100, count) / 3 + (hasResult(answer) ? 10 : 0) + (hasOwnership(answer) ? 7 : 0);
  const penalty = (rambled ? 6 : 0) + (isHypothetical(answer) ? 8 : 0);

  const clean = answer.trim();
  return {
    type: "behavioral",
    score: Math.min(92, Math.max(42, base - penalty)),
    worked: evidence ? `You backed the story with evidence: ${quote(evidence)}` : ownership ? `You named your own action: ${quote(ownership)}` : NOTHING_WORKED,
    weakened,
    structure: "STAR in 60–120 seconds: situation and task in two sentences, your personal action, then the quantified result.",
    improvedExample: clean
      ? `Lead with: ${quote(sentences(clean)[0] ?? clean)} Then add: [specific situation], [your personal action], and [insert measurable result] only if those details are accurate.`
      : "Situation: [insert relevant situation]. Action: [insert your personal action]. Result: [insert measurable result or observable evidence].",
  };
}

function motivationRubric(answer: string): QuestionFeedback {
  const specific = namesSomethingConcrete(answer);
  const trashing = trashesThePast(answer);
  const aligned = /\b(next step|grow|goal|what i want|i('|’)m looking for|take that (further|next)|build on)\b/i.test(answer);
  const concreteLine = firstMatching(answer, /\d/) ?? sentences(answer).find((s) => s.split(/\s+/).slice(1).some((w) => w !== "I" && /^[A-Z][a-z]{2,}/.test(w)));

  const flags = [
    trashing && "It leaned on what you're escaping. Frame it toward what you're moving to — interviewers hear criticism of the last employer as a preview of themselves.",
    !specific && "Nothing here is specific to this company — the same words could open any application. Name one concrete thing you can point to.",
    !aligned && "It never connected their opening to your direction. Say what this role gives you that your current one cannot.",
  ].filter((flag): flag is string => Boolean(flag));

  return {
    type: "motivation",
    score: scoreFrom([specific, !trashing, aligned].filter(Boolean).length, 3, flags.length),
    worked: concreteLine && specific ? `You named something concrete: ${quote(concreteLine)}` : !trashing && aligned ? `You kept it pointed forward: ${quote(firstMatching(answer, /\b(next|grow|goal|want|looking)\b/i) ?? sentences(answer)[0] ?? answer)}` : NOTHING_WORKED,
    weakened: flags[0] ?? "Sharpen the link between what you named and what you personally want next.",
    structure: "One concrete reason tied to this company, one line connecting it to your own goals — framed toward what you're moving to, never against what you're leaving.",
    improvedExample: `“What draws me here is [one specific thing about this company or role you can point to]. ${concreteLine ? `In my own work, ${quote(concreteLine).slice(1, -1)} — ` : "[one line of your relevant experience] — "}and this role is where I want to take that next.”`,
  };
}

function approachRubric(answer: string): QuestionFeedback {
  const structured = sequenced(answer);
  const realistic = acknowledgesLearning(answer);
  const prioritized = /\b(most important|priorit|first thing|matters most|biggest|focus)\b/i.test(answer);
  const count = words(answer);
  const rambled = count > 2 * WPM;
  const sequenceLine = firstMatching(answer, /\b(first|then|next|start by|step|phase|30|60|90)\b/i);

  const flags = [
    !structured && "This was a stream of consciousness. Give it a spine: first X, then Y, then Z.",
    !realistic && "It jumps straight to acting. In a new role the credible first move is to learn — say what you'd need to understand, and from whom, before changing anything.",
    rambled && "This ran past two minutes. A framework answer should be tight: the shape matters more than exhaustive detail.",
    !prioritized && "Everything got equal weight. Say what matters most and what can wait.",
  ].filter((flag): flag is string => Boolean(flag));

  return {
    type: "approach",
    // A hypothetical framing is the point of this question type — never flagged here.
    score: scoreFrom([structured, realistic, prioritized].filter(Boolean).length, 3, flags.length),
    worked: sequenceLine ? `You gave it a sequence: ${quote(sequenceLine)}` : realistic ? `You started from learning, not acting: ${quote(firstMatching(answer, /\b(learn|listen|understand|ask|meet)\b/i) ?? answer)}` : NOTHING_WORKED,
    weakened: flags[0] ?? "Name the trade-off: what you would deliberately not do in that time.",
    structure: "A clear sequence: what you'd learn first and from whom, then what you'd prioritize and why — with one thing you'd deliberately leave for later.",
    improvedExample: `“First, [what you'd learn, and from whom]. ${sequenceLine ? `Then, as you put it, ${quote(sequenceLine).slice(1, -1)}. ` : "Then [your first concrete move]. "}The thing I'd protect above everything: [the one priority that matters most].”`,
  };
}

function logisticsRubric(answer: string): QuestionFeedback {
  const count = words(answer);
  const range = firstMatching(answer, /\d|range|between/i);
  const hedging = hedgesApologetically(answer);
  const rambled = count > 100;

  const flags = [
    hedging && "The apologetic hedging undercuts you. State the number or the constraint plainly — it is a normal question with a normal answer.",
    rambled && "This should take fifteen seconds, not a monologue. State it, add one line of rationale, stop.",
    !range && "No concrete figure or constraint was given. For salary, give a researched range and one line of why.",
  ].filter((flag): flag is string => Boolean(flag));

  return {
    type: "logistics",
    score: scoreFrom([Boolean(range), !hedging, !rambled].filter(Boolean).length, 3, flags.length),
    worked: range && !hedging ? `You gave a concrete answer: ${quote(range)}` : NOTHING_WORKED,
    weakened: flags[0] ?? "Keep it exactly this direct.",
    structure: "A direct answer in one or two sentences. For salary: a researched range with a one-line rationale, then stop talking.",
    improvedExample: "“Based on what I've seen for comparable roles, I'm targeting [researched range]. I'm flexible for the right fit, and happy to talk about the full package.”",
  };
}

function reverseRubric(answer: string): QuestionFeedback {
  const asked = (answer.match(/\?/g) ?? []).length;
  const substantive = /\b(team|role|success|challenge|priorit|roadmap|product|culture|expect|measure|onboard|learn)\b/i.test(answer);
  const logisticsOnly = asked > 0 && !substantive && /\b(pto|vacation|time off|hours|benefit|holiday|salary)\b/i.test(answer);
  const question = firstMatching(answer, /\?/);

  const flags = [
    asked === 0 && "No questions at all reads as no interest. Always bring at least two.",
    logisticsOnly && "Only logistics questions. PTO and hours are for the offer stage — here, ask about the team, the work, and what success looks like.",
    asked === 1 && "One question is a start; bring at least two so the conversation doesn't stall.",
  ].filter((flag): flag is string => Boolean(flag));

  return {
    type: "reverse",
    score: scoreFrom([asked >= 2, substantive].filter(Boolean).length, 2, flags.length),
    worked: question && substantive ? `You asked something worth asking: ${quote(question)}` : NOTHING_WORKED,
    weakened: flags[0] ?? "Good instinct — sharpen each question toward this team specifically.",
    structure: "Two or three researched questions about the team, the work, or how success is measured. Logistics can wait for the offer.",
    improvedExample: "Ask, for example: “What would a great first six months look like in this role?” and “What's the team's biggest challenge right now?”",
  };
}

const rubrics: Record<QuestionType, (answer: string) => QuestionFeedback> = {
  intro: introRubric,
  behavioral: behavioralRubric,
  motivation: motivationRubric,
  approach: approachRubric,
  logistics: logisticsRubric,
  reverse: reverseRubric,
};

export function assessAnswer(prompt: string, answer: string): QuestionFeedback {
  return rubrics[classifyQuestion(prompt)](answer);
}

/* -------------------------------------------------------------------- report */

export function createReport(session: StoredSession): InterviewReport {
  const entries = session.transcript.filter((entry) => !entry.skipped && entry.answer.trim());
  const assessed = entries.map((entry) => ({ entry, feedback: assessAnswer(entry.question.prompt, entry.answer) }));
  const average = assessed.length ? Math.round(assessed.reduce((total, item) => total + item.feedback.score, 0) / assessed.length) : 0;

  // Aggregate flags respect the classification: STAR-shaped concerns are
  // counted over behavioral answers only.
  const behavioral = assessed.filter((item) => item.feedback.type === "behavioral");
  const evidence = behavioral.filter((item) => hasResult(item.entry.answer)).length;
  const hypothetical = behavioral.filter((item) => isHypothetical(item.entry.answer)).length;
  const rambling = assessed.filter((item) => /past (two minutes|90 seconds)/.test(item.feedback.weakened)).length;
  const generic = assessed.filter((item) => item.feedback.type === "motivation" && !namesSomethingConcrete(item.entry.answer)).length;

  const concerns: string[] = [];
  if (behavioral.length && evidence < behavioral.length) concerns.push("Several outcomes need a metric, baseline, or observable indicator.");
  if (behavioral.length) concerns.push("Avoid describing team work with “we” without naming your ownership.");
  if (rambling) concerns.push(`${rambling === 1 ? "One answer ran" : `${rambling} answers ran`} long for its question type. Interviewers lose the thread; behavioral stories get 60–120 seconds, everything else less.`);
  if (hypothetical) concerns.push(`${hypothetical === 1 ? "One behavioral answer stayed" : `${hypothetical} behavioral answers stayed`} hypothetical. “I would…” is not evidence — cite a real example every time.`);
  if (generic) concerns.push("Your motivation answers could open any application. Research one concrete, nameable thing per company.");
  if (!concerns.length) concerns.push("No structural red flags stood out — the next gain is tightening specificity and timing in each answer.");

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
      { label: "Impact orientation", score: Math.max(30, average + (behavioral.length ? (evidence ? 4 : -8) : 0)) },
    ],
    concerns,
    stories: session.transcript
      .filter((entry) => /\b(led|built|launched|coordinated|created)\b/i.test(entry.answer))
      .map((entry) => entry.question.prompt)
      .slice(0, 3)
      .concat(entries.length ? [] : ["[prepare one strategic initiative with a measurable outcome]"]),
    actions: [
      "Prepare two concise STAR stories — situation, task, your personal action, result — each speakable in 60–120 seconds.",
      "Draft a 60–90 second intro that runs present → past → future and lands on this role.",
      "For every outcome, write down the metric, baseline, or observable evidence you can defend.",
    ],
    questions: session.transcript.map((entry) => {
      if (entry.skipped || !entry.answer.trim()) {
        const feedback = assessAnswer(entry.question.prompt, "");
        return {
          question: entry.question.prompt,
          answer: entry.skipped ? "[Skipped]" : "[No answer provided]",
          worked: "No answer was available to assess.",
          weakened: "No answer was available to assess.",
          structure: feedback.structure,
          improvedExample: feedback.improvedExample,
        };
      }
      const feedback = assessAnswer(entry.question.prompt, entry.answer);
      return {
        question: entry.question.prompt,
        answer: entry.answer,
        worked: feedback.worked,
        weakened: feedback.weakened,
        structure: feedback.structure,
        improvedExample: feedback.improvedExample,
      };
    }),
  };
}
