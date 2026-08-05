# AI Interviewer

Practice interviews **out loud**. Paste or upload a resume and a job
description, then have a real spoken conversation with an AI interviewer over
OpenAI Realtime. Afterwards you get an evidence-based feedback report built from
what you actually said — not from invented achievements.

No account, no sign-in, no typing. Resume, job description, talk.

**Live demo: https://mkelzubeir.github.io/ai-interviewer/**

## How it works

1. **Bring your context.** Paste or upload a resume, then paste the job
   description — or just **paste the link to the posting** and let the app pull
   the role out of the page. PDF text is extracted in your browser.
2. **Talk it through.** The interviewer asks, listens, follows up, and you can
   interrupt it mid-sentence. Semantic VAD waits for you to finish a thought
   instead of pouncing on the first pause.
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
| Job description from a link | ✅ via Edge Function | ✅ with `OPENAI_API_KEY` |
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
| `NEXT_PUBLIC_JOB_LINK_URL` | Static builds only: the `job-link` Edge Function URL. A URL, not a key. |

The environment is validated with Zod. A malformed value disables voice with a
logged reason instead of failing mid-interview.

## Job description from a link

Paste `https://boards.greenhouse.io/acme/jobs/1` into the job description field
and the role is written into the textarea, where you can read and correct it
before it becomes the brief the interviewer works from.

The fetch cannot happen in the browser — a job board on another origin is
unreadable from a page — so it runs server-side: the Next.js route handler
locally, the `job-link` Edge Function on the demo. Both share one pipeline in
`supabase/functions/_shared/job-link.ts`:

1. **Validate the URL.** http/https only, no credentials, and no private
   address. Decimal, octal and hex spellings normalise through the WHATWG URL
   parser before the check, so `http://2130706433/` is caught as loopback.
2. **Fetch it, following redirects by hand.** Automatic redirects would defeat
   step 1: a public URL is free to 302 to `169.254.169.254`. Every hop is
   re-validated, the body is capped at 2 MB while it streams, and the request is
   bounded by one timeout.
3. **Extract.** If the page carries a schema.org `JobPosting` block — Greenhouse,
   Lever, Workday and Ashby all publish one — that is used; otherwise the page is
   reduced to text with scripts, navigation and footers dropped.
4. **Distil.** The text goes to the Responses API, which returns the role under
   fixed headings and is told to invent nothing. The page is passed as untrusted
   data, never as instructions. If that call fails, the extracted text is
   returned as-is rather than failing the import — the field is editable either
   way.

A posting that needs a login, renders entirely in JavaScript, or answers `403`
to an identified bot cannot be imported. The app says which of those happened
and asks you to paste instead; it does not impersonate a browser to get around a
site that refused.

## Privacy

Starting an interview sends your resume, your job description, and your
microphone audio to OpenAI to run the conversation. That is stated on the setup
screen before anything is sent, and clicking **Start voice interview** is the
consent action — there is no separate opt-in, because the interview *is* the
product.

Importing a link fetches that public page from the server and sends its text to
OpenAI to pull out the role. That is stated on the setup screen too, and it only
happens when you press **Import link**.

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

Session configuration (model, voice, turn detection, transcription) is
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

supabase secrets set OPENAI_MODEL=gpt-5.6-terra            # optional, job-link only

supabase db push          # or paste supabase/migrations/000{2,3}_*.sql into the SQL editor
supabase functions deploy realtime-token
supabase functions deploy job-link
```

Then point the client at them:

```bash
gh variable set NEXT_PUBLIC_SUPABASE_URL --body 'https://<ref>.supabase.co'
gh variable set NEXT_PUBLIC_SUPABASE_ANON_KEY --body '<publishable key>'
gh variable set NEXT_PUBLIC_REALTIME_TOKEN_URL \
  --body 'https://<ref>.supabase.co/functions/v1/realtime-token'
gh variable set NEXT_PUBLIC_JOB_LINK_URL \
  --body 'https://<ref>.supabase.co/functions/v1/job-link'
```

`job-link` is public and spends OpenAI credits, so it carries the same
protections as the token function: JWT verification, the two-origin CORS
allowlist, and a Postgres-backed quota of 12 imports per user per 10 minutes via
`claim_job_link`. Leave `NEXT_PUBLIC_JOB_LINK_URL` unset and the demo simply
hides the import field.

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
hooks/use-job-link-import.ts      paste a link, get the job description back
hooks/use-realtime-interview.ts   WebRTC lifecycle, turn state, transcript
lib/job-link.ts                   endpoint choice + re-export of the pipeline
lib/schemas.ts                    persisted session schema (v5) and migration
lib/interview-session.ts          reducer and resilient localStorage operations
lib/voice-transcript.ts           pairs a spoken conversation into report turns
lib/report.ts                     transcript-only deterministic feedback
lib/openai/realtime/              Realtime client, event adapter, turn state
  └ token-endpoint.ts             picks route handler vs Edge Function
lib/supabase/client.ts            browser client (publishable key only)
supabase/functions/_shared/       session config, CORS, job-link pipeline (Deno)
supabase/functions/realtime-token Edge Function that mints client secrets
supabase/functions/job-link       Edge Function that imports a posting from a URL
supabase/migrations/              quota tables and claim functions
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
- **Link import reads what a page serves to a plain HTTP request.** Postings
  behind a login (LinkedIn, most Workday tenants) or rendered client-side return
  too little text to use, and are reported as such. There is no headless browser
  and no attempt to look like one.
- The report is generated deterministically from the transcript; it does not use
  a model to write feedback.
- Realtime transcription drives the report, so a misheard word becomes a
  misquoted answer.
- `supabase/migrations/0001_interview_sessions.sql` is legacy. Saved reports
  were removed along with accounts; the table can be dropped.
