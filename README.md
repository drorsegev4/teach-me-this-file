# Teach Me This File

Upload a file and write a teaching prompt; the app builds an interactive lesson from them. The teacher flow includes upload, plan review, automatic welcome and lesson overview and publishing; students use a streamed, open-text tutor chat. Gemini, teach-first prompts and grade guidance are implemented on the current branch. Structured lesson phases, answer cards, tests and a timer are planned. See `DECISIONS.md` for status and decisions.

## Stack

- **Client:** React, Vite, Tailwind CSS (JavaScript).
- **Server:** Node.js 22, Express 5.
- **Files:** PDF and DOCX text extraction (`pdfjs-dist`, `mammoth`), run in an isolated child process.
- **AI provider:** Gemini through its OpenAI-compatible REST API (see `DECISIONS.md`).
- **Production host:** Render, configured in `render.yaml`.

One process serves the API. In development a second process serves the client (Vite) and proxies `/api` to the API.

## Setup

Requires Node.js 22 (see `.nvmrc`) and npm. From the project root:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`: set `GEMINI_API_KEY` for AI calls. Get a key at https://aistudio.google.com/apikey. Never commit `.env` or paste a key into chat.

If `npm ci` fails on Windows with `Cannot find module @rollup/rollup-win32-x64-msvc`, delete `node_modules` and run `npm ci` again.

## Run locally (development)

Two terminals, from the project root:

```powershell
npm run server   # API on http://127.0.0.1:3001 (restarts on change)
npm run dev      # client on http://127.0.0.1:5173, proxies /api to the API
```

Open http://127.0.0.1:5173.

## Run the production build locally

Same code path as the host:

```powershell
npm run build    # writes the client to dist/
npm start        # API and client on http://127.0.0.1:3001
```

Check that `http://127.0.0.1:3001/api/health` returns `ok: true` and a `hostKey` boolean.

If a port is already in use, an old Node process is still running. Stop it in Task Manager or with `Get-Process node` before starting again.

## Configuration

Every setting has one source of truth:

| Name | Local | Production (Render) | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | `.env` | Dashboard secret (`render.yaml`: `sync: false`) | AI provider key. Server only. |
| `MATERIAL_TOKEN_BUDGET` | Optional `.env`, default 4000 | Optional dashboard variable | Estimated input budget for each internal document-mapping call. |
| `GEMINI_MODEL` | Optional `.env` override | Optional dashboard variable | Gemini model; defaults to `gemini-3.8-flash`. |
| `PORT` | `.env` (default 3001) | Set by Render | API port. Vite's proxy follows it locally. |
| `HOST` | Default `127.0.0.1` | `0.0.0.0` (`render.yaml`) | Interface the API listens on. |
| Node version | `.nvmrc` | `.nvmrc` | Node 22 on both. |
| Line endings | `.gitattributes` | same | LF in the repo. |

## Verify

```powershell
npm run build    # client builds
npm test         # software regression tests; no provider calls
```

## Deploy

Deployment is configured by `render.yaml`. In Render: New → Blueprint → select this repo, then set the `GEMINI_API_KEY` secret when prompted. The Blueprint currently targets `main` with `autoDeploy: true`. Configure the Gemini secret before merging/deploying; verify the actual service settings in Render. The first build is the check that Node 22 is used and that `npm ci && npm run build` succeeds.

Free Render services sleep after inactivity; the first request after a pause is slow.

Check the live URL in a private browser window before sharing it.

### Migrating an existing deployment

Replace the Render `GROQ_API_KEY` secret with `GEMINI_API_KEY`. Deploy the server and client together: reviewer keys now use `X-AI-Api-Key`. Existing Groq keys cannot be reused. `GEMINI_MODEL` optionally selects another Gemini model. After configuration, run `npm run check:key`, `npm run plan:sample`, `npm run eval:check`, and `npm run eval:tutor` to verify live behavior. Saved Groq eval results remain historical.

The adapter uses Google's documented compatibility endpoint: https://ai.google.dev/gemini-api/docs/openai.

## Current limits and next version

Plans contain 1-3 source-validated steps, with an understanding goal for each newly generated step, open-text answers and app-controlled progress. After generation, a welcome, short lesson overview and topic list appear automatically. Press Let's begin to start the teaching chat. The welcome separates the document-wide big picture from the selected lesson scope. Small files use one plan call; longer files use bounded internal mapping calls before planning. Review the plan and publish when ready. To change the goal, start a new lesson. The teacher no longer selects document parts: all readable sections are considered before selecting up to three ideas. Incomplete extraction or excessive input is refused instead of silently using the beginning. State is held in memory: restarting the server can invalidate links and lose progress. A failed replacement build can clear the existing preview.

A requested time limit is currently lesson metadata and a tutor instruction. It is not a timer or a verified duration. The agreed next version adds introduction, learning, practice and a short test; duration budgets; multiple choice and true/false; and a student timer. These features are not implemented yet. See [DECISIONS.md](DECISIONS.md) for status and evidence. References to removed docs in eval metadata and comments are historical provenance; the runnable datasets and rules remain in tests/evals/.

Live verification commands: `npm run check:key`, `npm run plan:sample`, `npm run eval:check`, and `npm run eval:tutor`. They call Gemini and can use quota.
