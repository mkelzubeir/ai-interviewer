# AI Interviewer

Practice interviews **out loud**. Bring a resume and a job description, have a
real spoken conversation with an AI interviewer over OpenAI Realtime, and get
an evidence-based feedback report built from what you actually said — not from
invented achievements.

Voice is the primary experience. A written interview is available as a fallback
throughout: same engine, same report, no account or microphone required.

**Live demo: https://mkelzubeir.github.io/ai-interviewer/**

## What works where

The demo is a static export on GitHub Pages. It has no server, so anything
needing a route handler is absent there rather than broken. Voice is the
exception: its one server-side step moves to a Supabase Edge Function.

| | Live demo | Local (`npm run dev`) |
|---|---|---|
| Sample interview | ✅ | ✅ |
| Your own resume / job description | ✅ | ✅ |
| PDF resume text extraction | ✅ | ✅ |
| Deterministic adaptive engine | ✅ | ✅ |
| Session recovery after a refresh | ✅ | ✅ |
| Feedback report | ✅ | ✅ |
| AI-adaptive questions (OpenAI) | ❌ needs a server | ✅ with `OPENAI_API_KEY` |
| Live voice interview (Realtime) | Requires the Edge Function deployed and `NEXT_PUBLIC_REALTIME_TOKEN_URL` set — see below | ✅ with `OPENAI_API_KEY` |
| Sign in and save reports | ✅ | ✅ if Supabase is configured |

On the static build the app detects that no route handler is present and runs
adaptive text turns on the local deterministic engine instead. Voice can still
run there once the Edge Function is deployed, because client-secret minting
moves to it — see [Voice on the static demo](#voice-on-the-static-demo).

`OPENAI_API_KEY` is never present in client code, build output, or any
`NEXT_PUBLIC_` variable in any build.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Nothing else is required — the full interview,
recovery and report flow works with no key and no account.

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional.

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables AI-adaptive questions and voice. **Server-only.** |
| `OPENAI_MODEL` | Model for adaptive text turns. Default `gpt-5.6-terra`. |
| `OPENAI_REALTIME_MODEL` | Default `gpt-realtime`. |
| `OPENAI_REALTIME_VOICE` | Default `marin`. |
| `OPENAI_REQUEST_TIMEOUT_MS` | Default `15000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Enables sign-in and saved reports. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key; safe in the client bundle. |
| `NEXT_PUBLIC_REALTIME_TOKEN_URL` | Edge Function URL enabling voice on a static build. A URL, not a key. |

The environment is validated with Zod at request time. A malformed value
disables the affected mode with a logged reason instead of failing a live
interview — the deterministic engine always keeps working.

## Privacy

By default nothing leaves your browser. The setup screen carries an explicit,
unchecked-by-default opt-in; only after you check it does your resume and job
description get sent to OpenAI, and only then can the spoken interview start.
Sample mode can never opt in.

Voice sends microphone audio to OpenAI for live processing. The app does not
intentionally retain raw audio. Realtime transcription is an aid and may differ
from what the model heard.

## Voice (Realtime WebRTC)

Once a key is configured and you have consented, the interview opens in voice
mode by default. It requests microphone permission only after an explicit
action, obtains a short-lived Realtime client secret from the server, and
negotiates WebRTC directly with OpenAI. The browser never receives
`OPENAI_API_KEY`. "Switch to text mode" is available at every point.

Server VAD owns turn-taking: it decides when your answer has ended. There is
deliberately **no** manual "I'm done answering" control — over a WebRTC media
track a client-side `input_audio_buffer.commit` targets an empty buffer and can
produce a duplicate response. Mute, interruption, retry and text fallback are
available. If the session drops, voice releases cleanly, the transcript and
interview state are preserved, and you continue in text mode or retry.

Use a current WebRTC-capable browser with a microphone. The automated suite
mocks no live device or Realtime session; test a real microphone manually
before relying on it.

### Voice on the static demo

> **Status:** the Edge Function is written and unit-tested but is not deployed
> yet. Until the checklist below is completed, `NEXT_PUBLIC_REALTIME_TOKEN_URL`
> is unset and the deployed demo runs the written interview only.

GitHub Pages cannot run a route handler, so the deployed demo mints its client
secret from a Supabase Edge Function instead. Everything after that is
unchanged — the browser negotiates WebRTC directly with OpenAI using the
ephemeral secret, exactly as it does locally.

The token source is chosen at build time by
`lib/openai/realtime/token-endpoint.ts`: a server build always prefers its own
route (no sign-in needed, so local dev works with nothing but an API key), and
a static build uses `NEXT_PUBLIC_REALTIME_TOKEN_URL`.

Because that function is publicly reachable and spends real OpenAI credits, it:

- **requires a signed-in user** — the JWT is verified server-side with
  `auth.getUser()`, so the publishable key alone is rejected. Signed-out
  visitors get a "sign in to start a voice interview" screen — not a text form —
  with text mode one click away;
- **rate limits per user** — 5 sessions per 10 minutes, enforced in Postgres via
  `claim_voice_token`, because Edge Functions are stateless and an in-memory
  counter would reset on every cold start;
- **allows exactly two origins** — `https://mkelzubeir.github.io` and
  `http://localhost:3000`. Any other origin gets no CORS headers at all.

Session configuration (model, voice, server VAD timings, transcription) is
shared by both callers from `supabase/functions/_shared/realtime-session.ts`,
so the two paths cannot drift.

A spoken interview has no typed answers, so `lib/voice-transcript.ts` pairs each
interviewer utterance with the answer that follows it and feeds that to the
same report generator. Voice and text therefore produce the same kind of
feedback from the same code path.

#### Deploying the function

```bash
supabase login
supabase link --project-ref <project-ref>

# Secrets live in Supabase, never in the repo or a NEXT_PUBLIC_ variable.
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_REALTIME_MODEL=gpt-realtime   # optional
supabase secrets set OPENAI_REALTIME_VOICE=marin          # optional

# Rate-limit table and the claim function.
supabase db push          # or paste supabase/migrations/0002_*.sql into the SQL editor

supabase functions deploy realtime-token
```

Then point the client at it — only after the function is live, so the demo
never advertises a voice mode that 404s:

```bash
gh variable set NEXT_PUBLIC_REALTIME_TOKEN_URL \
  --body 'https://<project-ref>.supabase.co/functions/v1/realtime-token'
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected into Edge Functions automatically; do not set them yourself.

## Accounts and saved reports (optional)

With Supabase configured, a magic-link sign-in appears in the header and a
completed report can be saved to your account. Sign-in is client-side PKCE, so
it works on static hosting.

Only the publishable anon key ships to the client — that is what it is for.
**Row Level Security is the security boundary.** `interview_sessions` has RLS
enabled with select/insert/delete policies scoped to `auth.uid()`, and no
update policy, so reports are immutable once written. Resume and
job-description text are never written to the table. localStorage remains the
store of record for an in-progress interview, and anonymous local-only practice
works exactly as it does without Supabase.

### Setup

1. Create a Supabase project.
2. Run `supabase/migrations/0001_interview_sessions.sql` in the SQL editor.
3. Under **Authentication → URL Configuration**, add redirect URLs for
   `https://mkelzubeir.github.io/ai-interviewer/interview` and
   `http://localhost:3000/interview`.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` locally,
   and as GitHub repository **variables** for the deployed demo.

## Checks

```bash
npm run lint
npm run typecheck
npm test              # unit tests (vitest)
npm run build         # server build, includes the API routes
```

Browser tests run against the **production static export**, served from the
`/ai-interviewer` subpath, so basePath and asset-prefix bugs fail in CI rather
than on the live demo:

```bash
npm run build:static
npm run test:e2e
```

To run the same specs against the deployed demo:

```bash
E2E_BASE_URL=https://mkelzubeir.github.io/ai-interviewer/ npm run test:e2e
```

CI runs lint, typecheck, unit tests, the static build and the browser suite on
every push, then deploys to Pages from `main`.

## Architecture

Engine, report and persistence logic live outside React components.

```text
app/                              App Router landing and interview route
app/api/**/route.server.ts        server-only routes; excluded from the static export
components/                       interview shell and UI pieces
hooks/                            realtime voice and Supabase auth hooks
lib/schemas.ts                    domain + persisted session/report Zod schemas, v2→v3 migration
lib/interview-engine.ts           question selection rules and the two question banks
lib/interview-session.ts          reducer and resilient localStorage operations
lib/report.ts                     transcript-only deterministic feedback
lib/sample-data.ts                fictional Strategic Projects sample fixture
lib/runtime-capabilities.ts       static-vs-server detection and basePath helpers
lib/server-env.ts                 Zod validation of server environment
lib/openai-provider.ts            Responses API adapter with typed failures
lib/rate-limit.ts                 per-key fixed-window limiter with eviction
lib/openai/realtime/              Realtime client, event adapter, turn state
  └ token-endpoint.ts             picks route handler vs Edge Function
lib/voice-transcript.ts           pairs a spoken conversation into report turns
lib/supabase/                     browser client and saved-report row mapping
supabase/functions/_shared/       session config + CORS, shared with Deno
supabase/functions/realtime-token Edge Function that mints client secrets
supabase/migrations/              SQL schema, RLS policies, voice quota
e2e/                              Playwright specs against the static export
```

### Static export

`BUILD_TARGET=static npm run build` emits `out/` with `basePath` and
`assetPrefix` set to `/ai-interviewer` and unoptimized images. Route handlers
are named `route.server.ts` and only registered through `pageExtensions` in the
server build, so the OpenAI adapter and the Realtime endpoint are not merely
disabled in the export — they are absent from it.

### Interview engine

Sample mode uses a fixed question bank built around the fictional Avery Morgan
/ Meridian Works fixture. Everyone else gets a persona-neutral bank with the
same ids, topics, competencies and kinds, so selection rules, budgets and
follow-ups behave identically while nobody is asked about someone else's job.

## Known limitations

- **OCR for scanned PDFs is explicitly out of scope.** A PDF with no text layer
  is rejected with a message asking you to paste the text instead.
- The local engine uses transparent rules, not natural-language understanding.
- Resume and job-description text are not semantically parsed.
- Elapsed time is local browser time; there is no enforced session timer.
- The report is always generated deterministically from the transcript.
  AI-generated feedback is specified in PLAN.md but not implemented.
