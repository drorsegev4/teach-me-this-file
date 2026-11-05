# Teach Me This File

A teacher uploads a file and writes a teaching prompt. The app builds a short lesson plan from the file, grounded in exact quotes. An AI tutor then teaches it to a student, one step at a time, and checks understanding before the lesson moves on.

**Live app:** https://teach-me-this-file-td3b.onrender.com

The free host sleeps after about 15 minutes. The first visit can take up to a minute. Start with a short file.

Choices, trade-offs and known weaknesses are in [DECISIONS.md](DECISIONS.md).

## How to use the app

1. Open the app. In **Settings**, paste your own Gemini API key. It stays in browser memory and is sent with each request. The server never stores or logs it. If you paste none, the app uses a key set on the host.
2. Upload a PDF or DOCX file.
3. Write the teaching prompt. For example: *Teach this file to 7th grade students, in English. Be Socratic. Check understanding after each step. Keep it under 15 minutes.*
4. Build the lesson and review the plan. Each step shows the exact quote from the file behind it.
5. Begin the lesson to try it as a student. **Stop** cuts a reply short.
6. When you are happy, press **Publish for students** and copy the link. To change the goal, start a new lesson.

A student answers in the chat. The lesson moves on only when the checker judges that the student understood. After several tries on one step, the student can try again or move on. "Source from the file" opens the quote behind the current step.

## Stack

- **Client:** React, Vite, Tailwind CSS (JavaScript).
- **Server:** Node.js 22, Express 5.
- **Files:** PDF and DOCX text extraction (`pdfjs-dist`, `mammoth`) in an isolated child process.
- **AI provider:** Gemini, through its OpenAI-compatible REST API.
- **Host:** Render, configured in `render.yaml`. One service serves the API and the built client.

## Setup

Requires Node.js 22 (see `.nvmrc`) and npm. From the project root:

```bash
npm ci
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` and set `GEMINI_API_KEY`. Get a key at https://aistudio.google.com/apikey. Never commit `.env`.

If `npm ci` fails on Windows with `Cannot find module @rollup/rollup-win32-x64-msvc`, delete `node_modules` and run `npm ci` again.

## Run locally

Development, in two terminals:

```bash
npm run server   # API on http://127.0.0.1:3001
npm run dev      # client on http://127.0.0.1:5173, proxies /api to the API
```

Open http://127.0.0.1:5173.

Production build, the same code path as the host:

```bash
npm run build    # writes the client to dist/
npm start        # API and client on http://127.0.0.1:3001
```

`http://127.0.0.1:3001/api/health` should return `ok: true`. To work on the interface without spending quota, set `AI_MODE=mock` in `.env`. Mock replies say nothing about teaching quality.

## Configuration

- `GEMINI_API_KEY`: host key, used when the user pastes none. Server only.
- `GEMINI_MODEL`: optional. Defaults to `gemini-3.8-flash`.
- `MATERIAL_TOKEN_BUDGET`: optional. Estimated tokens per document chunk. Default 4000.
- `AI_MODE`: set to `mock` for fake AI replies.
- `PORT` and `HOST`: API port (default 3001) and interface (`0.0.0.0` on Render).

## Tests and evals

```bash
npm run build
npm test                # regression tests, no provider calls
```

These call Gemini and use quota: `npm run check:key`, `npm run plan:sample`, `npm run eval:check`. The checker dataset and saved results are in `tests/evals/`. What they show is in [DECISIONS.md](DECISIONS.md).

## Deploy

`render.yaml` defines the service, with `autoDeploy: true` on `main`. In Render: New, Blueprint, select this repo, and set the `GEMINI_API_KEY` secret. After a deploy, open the live URL in a private browser window to check it.