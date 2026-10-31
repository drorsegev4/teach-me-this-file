# Teach Me This File

Upload a file and write a teaching prompt; the app builds an interactive lesson from them. Current state: scaffolding only. The teacher flow and the student chat are not built yet. See `DECISIONS.md` for status and decisions.

## Stack

- **Client:** React, Vite, Tailwind CSS (JavaScript).
- **Server:** Node.js 22, Express 5.
- **Files:** PDF and DOCX text extraction (`pdfjs-dist`, `mammoth`), run in a worker thread.
- **AI provider:** Groq (not yet wired; see `DECISIONS.md`).
- **Production host:** Render, configured in `render.yaml`.

One process serves the API. In development a second process serves the client (Vite) and proxies `/api` to the API.

## Setup

Requires Node.js 22 (see `.nvmrc`) and npm. From the project root:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`: set `GROQ_API_KEY` when AI calls exist. Never commit `.env` or paste a key into chat.

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

Check that `http://127.0.0.1:3001/api/health` returns `{"ok":true}`.

If a port is already in use, an old Node process is still running. Stop it in Task Manager or with `Get-Process node` before starting again.

## Configuration

Every setting has one source of truth:

| Name | Local | Production (Render) | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | `.env` | Dashboard secret (`render.yaml`: `sync: false`) | AI provider key. Server only. |
| `PORT` | `.env` (default 3001) | Set by Render | API port. Vite's proxy follows it locally. |
| `HOST` | Default `127.0.0.1` | `0.0.0.0` (`render.yaml`) | Interface the API listens on. |
| Node version | `.nvmrc` | `.nvmrc` | Node 22 on both. |
| Line endings | `.gitattributes` | same | LF in the repo. |

## Verify

```powershell
npm run build    # client builds
npm test         # no tests yet; the teacher-flow tests come with the first feature
```

## Deploy

Deployment is configured by `render.yaml`. In Render: New → Blueprint → select this repo, then set the `GROQ_API_KEY` secret when prompted. Auto-deploy is off; deploy the branch from the Render dashboard. The first build is the check that Node 22 is used and that `npm ci && npm run build` succeeds.

Free Render services sleep after inactivity; the first request after a pause is slow.

Check the live URL in a private browser window before sharing it.
