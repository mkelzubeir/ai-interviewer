# AI Interviewer

Practice interviews **out loud**. Paste or upload a resume and a job
description, then have a real spoken conversation with an AI interviewer over
OpenAI Realtime. Afterwards you get an evidence-based feedback report built from
what you actually said — not from invented achievements.

No account, no sign-in, no typing. Resume, job description, talk.

**Live demo: https://mkelzubeir.github.io/ai-interviewer/**

## How it works

1. **Bring your context.** Paste or upload a resume and a job description (or
   load the sample brief). PDF text is extracted in your browser.
2. **Talk it through.** The interviewer asks, listens, follows up, and you can
   interrupt it mid-sentence. Server VAD handles turn-taking.
3. **Leave with a plan.** Every finalized turn is paired into a transcript and
   run through the report generator.

The whole interview is spoken. There is no typed-answer mode.

## What runs where

The demo is a static export on GitHub Pages, which cannot run a Next.js route
handler. Voice needs exactly one server-side step — minting a short-lived
Realtime client secret — so that moves to a Supabase Edge Function.

| | Live demo | Local (`npm run dev`) |
|---|---|---|
| Resume / job description, PDF extraction | ✅ | ✅ |
| Spoken interview | ✅ via Edge Function | ✅ with `OPENAI_API_KEY` |
| Session recovery after a refresh | ✅ | ✅ |
| Feedback report | ✅ | ✅ |

`OPENAI_API_KEY` is never present in client code, build output, or any
`NEXT_PUBLIC_` variable in any build. The browser only ever holds an ephemeral
`ek_…` secret that expires in two minutes.

## Run locally

```bash
npm install
cp .env.example .env.local     # add OPENAI_API_KEY
npm run dev
```

Open http://localhost:3000. A local server build mints its own client secret
through `app/api/realtime/session/route.server.ts`, so no Supabase project and
no session are needed for local development.

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Required for voice. **Server-only.** |
| `OPENAI_REALTIME_MODEL` | Default `gpt-realtime`. |
| `OPENAI_REALTIME_VOICE` | Default `marin`. |
| `OPENAI_REQUEST_TIMEOUT_MS` | Default `15000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Static builds only: project hosting the Edge Function. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key; safe in the client bundle. |
| `NEXT_PUBLIC_REALTIME_TOKEN_URL` | Static builds only: the Edge Function URL. A URL, not a key. |

The environment is validated with Zod. A malformed value disables voice with a
logged reason instead of failing mid-interview.

## Privacy

Starting an interview sends your resume, your job description, and your
microphone audio to OpenAI to run the conversation. That is stated on the setup
screen before anything is sent, and clicking **Start voice interview** is the
consent action — there is no separate opt-in, because the interview *is* the
product.

The app does not intentionally retain raw audio. Realtime transcription is an
aid and may differ from what the model heard. Your in-progress interview is
stored only in this browser's localStorage.

## Voice on the static demo

The browser negotiates WebRTC directly with OpenAI using the ephemeral secret,
exactly as it does locally. Only the minting step differs.

`lib/openai/realtime/token-endpoint.ts` picks the source at build time: a server
build always prefers its own route handler; a static build uses
`NEXT_PUBLIC_REALTIME_TOKEN_URL`.

Because that function is publicly reachable and spends real OpenAI credits, it:

- **requires a valid JWT** — verified server-side with `auth.getUser()`, so the
  publishable key alone is rejected;
- **rate limits per user** — 5 sessions per 10 minutes, enforced in Postgres via
  `claim_voice_token`, because Edge Functions are stateless and an in-memory
  counter would reset on every cold start;
- **allows exactly two origins** — `https://mkelzubeir.github.io` and
  `http://localhost:3000`. Any other origin gets no CORS headers at all.

There is no sign-in step. The app opens a **silent anonymous Supabase session**,
which is a real row in `auth.users` — enough to satisfy JWT verification and
per-user rate limiting without asking anyone for an email.

> **Requires "Anonymous sign-ins" to be enabled** for the Supabase project
> (Authentication → Sign In / Providers). Without it every token request fails
> and the setup screen says so instead of offering a dead button.

Session configuration (model, voice, server VAD timings, transcription) is
shared by both callers from `supabase/functions/_shared/realtime-session.ts`, so
the two paths cannot drift.

A spoken interview has no typed answers, so `lib/voice-transcript.ts` pairs each
interviewer utterance with the answer that follows it and feeds that to the
report generator.

### Deploying the function

```bash
supabase login
supabase link --project-ref <project-ref>

# Secrets live in Supabase, never in the repo or a NEXT_PUBLIC_ variable.
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_REALTIME_MODEL=gpt-realtime   # optional
supabase secrets set OPENAI_REALTIME_VOICE=marin          # optional

supabase db push          # or paste supabase/migrations/0002_*.sql into the SQL editor
supabase functions deploy realtime-token
```

Then point the client at it:

```bash
gh variable set NEXT_PUBLIC_SUPABASE_URL --body 'https://<ref>.supabase.co'
gh variable set NEXT_PUBLIC_SUPABASE_ANON_KEY --body '<publishable key>'
gh variable set NEXT_PUBLIC_REALTIME_TOKEN_URL \
  --body 'https://<ref>.supabase.co/functions/v1/realtime-token'
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
into Edge Functions automatically; do not set them yourself.

## Checks

```bash
npm run lint
npm run typecheck
npm test              # unit tests (vitest)
npm run build         # server build, includes the route handler
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

## Architecture

Engine, report and persistence logic live outside React components.

```text
app/                              App Router landing and interview route
app/api/**/route.server.ts        server-only route; excluded from the static export
components/interview-app.tsx      setup → interview → report shell
components/voice-interview-stage.tsx   the spoken interview surface
hooks/use-anonymous-session.ts    silent Supabase session for the Edge Function
hooks/use-realtime-interview.ts   WebRTC lifecycle, turn state, transcript
lib/schemas.ts                    persisted session schema (v5) and migration
lib/interview-session.ts          reducer and resilient localStorage operations
lib/voice-transcript.ts           pairs a spoken conversation into report turns
lib/report.ts                     transcript-only deterministic feedback
lib/openai/realtime/              Realtime client, event adapter, turn state
  └ token-endpoint.ts             picks route handler vs Edge Function
lib/supabase/client.ts            browser client (publishable key only)
supabase/functions/_shared/       session config + CORS, shared with Deno
supabase/functions/realtime-token Edge Function that mints client secrets
supabase/migrations/              voice quota table and claim function
e2e/                              Playwright specs against the static export
```

### Static export

`BUILD_TARGET=static npm run build` emits `out/` with `basePath` and
`assetPrefix` set to `/ai-interviewer`. The route handler is named
`route.server.ts` and only registered through `pageExtensions` in the server
build, so it is absent from the export rather than merely disabled.

## Known limitations

- **A microphone is required.** There is no typed fallback: the product is the
  spoken interview.
- **OCR for scanned PDFs is out of scope.** A PDF with no text layer is rejected
  with a message asking you to paste the text instead.
- The report is generated deterministically from the transcript; it does not use
  a model to write feedback.
- Realtime transcription drives the report, so a misheard word becomes a
  misquoted answer.
- `supabase/migrations/0001_interview_sessions.sql` is legacy. Saved reports
  were removed along with accounts; the table can be dropped.
