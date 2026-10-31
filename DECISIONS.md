# Decisions

Working draft. Reviewers read this file, so it must match what the code does. Update it with each meaningful change.

## Main choices and why

- **React, Vite, Tailwind, Node.js/Express.** Required stack. Express serves the AI calls, so the API key stays on the server.
- **PDF and DOCX text extraction on a worker thread.** Extraction runs off the request thread with a 30-second timeout and a 128 MB memory limit, so a bad file cannot block the server. Only text is read. Images, diagrams, formulas and table layout are not interpreted, and the user is warned.
- **Upload limits.** 10 MB per file, at most 60 PDF pages, at most 20,000 words. Chosen to keep requests small and processing bounded.
- **Scaffolding first, features second.** The client is a placeholder until the teacher flow exists, so each commit builds.
- **One configuration.** Local and production use the same commands (`npm run build`, `npm start`) and the same names in `.env.example`. Node 22 is pinned in `.nvmrc`; line endings are LF via `.gitattributes`. The README is the single how-to. `render.yaml` holds the production settings for Option A below.
## Hosting (open: two options recorded)

Both options satisfy the assignment's requirement for a live front end and back end. Neither is chosen yet.

**Option A: Render, one web service (current `render.yaml`).**
- One process serves the built client and the API. No cross-origin setup.
- Free tier sleeps when idle; the first request after a pause is slow.
- Server state is in memory. A sleep or restart loses lesson progress until persistence is added.
- Limits to check before relying on them: free-tier request duration and request size.

**Option B: Vercel (client) + Railway (Node API) + Supabase (Postgres and file storage).**
- Persistence is built in: lesson and progress survive restarts.
- Two deploys and cross-origin settings to maintain.
- Free Supabase projects pause after inactivity, a risk during reviewer access. Needs a paid plan or a host that stays up during review.
- Keeps the AI key and database access on the server; the reviewer's key is never stored.
- Persistence would come after the teacher flow works, not before.

**Decide before:** the first public deploy. Criteria: reviewer access during review, lesson progress across restarts, and the free-tier limits above.

## Not decided yet

- [TODO: AI provider and model]
- [TODO: interactive lesson output: in-app preview, shareable link, or exported file]
- [TODO: teacher flow design]
- [TODO: student chat design]
- [TODO: per-request API key handling]

## Known weaknesses

- [TODO]

## What I would do with four more hours

- [TODO]

## How I know it works

- [TODO: test scenarios]
- `npm run build` passes.
- `npm test` runs no tests yet.
