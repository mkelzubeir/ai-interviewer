# AI Interviewer

## Current implementation

Phase 1 is a local, text-only mock interview application built with Next.js,
TypeScript, Tailwind CSS, and the App Router. It includes setup, five interview
formats, three durations, a deterministic adaptive interview engine, local
session recovery, and a transcript-based feedback report.

You can paste a resume or upload a PDF (up to 5 MB). Selectable text is
extracted locally in the browser and remains editable; scanned PDFs without a
text layer require pasted text.

Use **Try sample interview** to load a fictional Strategic Projects / Business
Operations candidate. Sample mode is a deterministic demonstration; it does
not claim to generate questions with AI and does not require an API key.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Playwright is not configured in this repository. The next browser-testing step
is a happy-path test that loads sample mode, submits responses, and verifies the
completed report after a refresh/recovery cycle.

## Planned / requires an OpenAI API key

Phase 2 includes a server-only Responses API adapter for adaptive turns. Add
`OPENAI_API_KEY` to `.env.local` (copy `.env.example`) to enable it. The app
retains deterministic local mode when the provider is unavailable.
Authentication, database storage, and OCR for scanned PDFs are not implemented.

## Voice (Realtime WebRTC)

The interview page includes an opt-in voice panel. It requests microphone
permission only after an explicit action, obtains a short-lived Realtime client
secret from the server, and negotiates WebRTC directly with OpenAI. The browser
never receives `OPENAI_API_KEY`. Server VAD enables automatic turn-taking;
mute, interruption, manual “I’m done answering,” retry, and text fallback are
available.

Set these values in `.env.local`:

```env
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=
OPENAI_REASONING_MODEL=
```

Use a current WebRTC-capable browser with a microphone. Microphone audio is
sent to OpenAI for live processing. The app does not intentionally retain raw
audio; Realtime transcription is an aid and may differ from what the model
heard. The automated suite mocks no live device or Realtime session; test a
real microphone/session manually before production use.
