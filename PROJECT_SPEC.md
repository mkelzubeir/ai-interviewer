# AI Interviewer — project specification

> Reconstructed from PLAN.md, README.md and the implementation. The original
> file in this repository contained a shell heredoc that re-emitted AGENTS.md
> rather than a specification.

## Purpose

A mock interview practice tool. A candidate supplies a resume and a job
description, chooses an interview style and length, answers one question at a
time, and receives an evidence-based feedback report built from their own
transcript.

## Principles

1. **Local-first.** The complete experience — setup, adaptive interview,
   recovery, report — runs in the browser with no account, no API key and no
   network calls. Everything beyond that is opt-in.
2. **No invented achievements.** Feedback is derived only from what the
   candidate actually said. Missing details stay as bracketed placeholders
   rather than being filled in.
3. **Deterministic sample mode.** "Try sample interview" loads a fictional
   Strategic Projects / Business Operations candidate and is labelled a
   demonstration, not AI generation. Its behaviour is fixed and documented.
4. **Secrets stay on the server.** `OPENAI_API_KEY` is never exposed to the
   browser. Voice uses a short-lived Realtime client secret minted server-side.
5. **Consent before transmission.** Resume and job-description text reach a
   provider only after an explicit opt-in.

## Scope

### Phase 1 — local text interview
- Landing, setup, live interview, recovery and report views.
- Five interview types (recruiter, behavioral, hiring manager, role-specific,
  mixed) and three durations (10/20/30 minutes) mapped to question budgets.
- A typed state machine: given the transcript and coverage state, the engine
  decides to follow up, ask a new question, revisit a claim, or conclude.
- A versioned, Zod-validated session in localStorage. An interrupted interview
  offers resume or start over; invalid storage is ignored safely.
- Domain schemas, engine rules, session reducer and report generation live
  outside React components.
- Resume PDFs with selectable text are extracted locally in the browser.

### Phase 2 — optional OpenAI adaptive turns
- A server-only Responses API adapter behind validated environment config.
- Structured, schema-validated output for the next interview turn.
- The Phase 1 rule engine remains the fallback whenever the provider is
  unavailable, misconfigured or returns something unusable.
- Rate limiting, a privacy notice, failure recovery and provider contract
  tests.

### Phase 3 — optional Realtime voice
- A server-only Realtime client-secret endpoint; the permanent key never
  leaves the server.
- Browser WebRTC after explicit microphone consent, with server VAD, audio
  output, input transcription, interruption handling and a typed data-channel
  event adapter.
- Finalized voice transcript entries are normalized, deduplicated and
  persisted into the durable session. The text engine remains the fallback and
  the sole source of the final report.
- A dropped session degrades to text without losing interview state.

### Phase 4 — optional accounts
- Client-side magic-link auth that works on static hosting.
- Completed reports stored per user with Row Level Security as the security
  boundary. Anonymous local-only practice keeps working unchanged.

## Explicitly out of scope

- **OCR for scanned PDFs.** A PDF with no text layer is rejected with a message
  asking the candidate to paste their resume text instead.
- Semantic parsing of resume or job-description content. Both are used as
  local context and for sample-mode personalization only.
- A hard session timer. Elapsed time is displayed but not enforced.
- Scoring a candidate as a hiring signal. The report is practice feedback.

## Constraints

- TypeScript strict mode.
- Engine, report and persistence logic stay outside React components.
- Lint, typecheck, unit tests and a production build must pass before any
  change is considered complete.
- Real secrets live only in `.env.local` and are never committed.
