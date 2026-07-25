# AI Interviewer — Phase 1 Plan

## Architecture decisions

- Keep all Phase 1 behavior in the browser: there are no API calls, keys, user
  accounts, databases, or voice features.
- Model interviews as a typed state machine. The engine receives the prior
  transcript and coverage state, then returns a decision: follow up, ask a new
  question, revisit a claim, or conclude.
- Persist a versioned Zod-validated session in localStorage. An interrupted
  interview prompts the candidate to resume or start over; invalid storage is
  ignored safely.
- Use deterministic fixtures and rules for sample mode. It is clearly labelled
  a demonstration rather than AI generation.
- Produce feedback only from transcript evidence. Improved examples preserve
  the candidate's words and use placeholders where details are missing.

## Phase 1 implementation

1. Build landing, setup, live interview, recovery, and report routes/views.
2. Add interview type and duration controls plus local sample data for a
   Strategic Projects / Business Operations candidate.
3. Implement domain schemas, engine rules, session reducer, persistence, and
   report generator outside React components.
4. Build a responsive, keyboard-accessible interview interface with elapsed
   time, progress, compact transcript, skip, and end confirmation.
5. Add unit coverage for decision rules, limits, repetition, completion,
   schemas, recovery, report generation, and sample state transitions.

## File structure

```text
app/                       App Router landing and interview route
components/                interview shell and reusable UI pieces
lib/schemas.ts             domain + persisted session/report Zod schemas
lib/interview-engine.ts    dynamic question selection and state updates
lib/interview-session.ts   reducer and resilient localStorage operations
lib/report.ts              transcript-only deterministic feedback
lib/sample-data.ts         fictional Strategic Projects sample fixture
```

## Known limitations

- The local engine uses transparent rules, not natural-language model
  understanding; user-entered content receives generic but safe adaptations.
- Elapsed time is local browser time and does not enforce a hard session timer.
- Resume and job-description text are not semantically parsed; the app uses
  them as local context and for sample-mode personalization only. Resume PDFs
  with selectable text can be extracted locally; OCR for scanned PDFs remains
  out of scope.

## Phase 2 — OpenAI integration

- Add a server-only provider adapter protected by environment validation.
- Use structured generation for adaptive questions and feedback while retaining
  the Phase 1 rule engine as an offline fallback.
- Add rate limits, response schemas, privacy notice, failure recovery, and
  provider contract tests. An OpenAI API key will be required only for that
  optional mode.

## Phase 3 — Realtime voice interview

- Create a server-only Realtime client-secret endpoint and never expose the
  permanent API key.
- Establish browser WebRTC sessions after explicit microphone consent; use
  server VAD, audio output, input transcription, interruption handling, and a
  typed data-channel event adapter.
- Normalize, deduplicate, and persist finalized voice transcript entries into
  the existing durable interview session. The text engine remains the fallback
  and final report source.
- Keep the server session configuration compact: summaries and state strategy,
  not raw resume or job-description text on every update.
