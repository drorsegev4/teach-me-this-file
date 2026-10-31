# Decisions

Working draft. Reviewers read this file, so it must match what the code does. Update it with each meaningful change.

## Main choices and why

- **React, Vite, Tailwind, Node.js/Express.** Required stack. Express serves the AI calls, so the API key stays on the server.
- **PDF and DOCX text extraction on a worker thread.** Extraction runs off the request thread with a 30-second timeout and a 128 MB memory limit, so a bad file cannot block the server. Only text is read. Images, diagrams, formulas and table layout are not interpreted, and the user is warned.
- **Upload limits.** 10 MB per file, at most 60 PDF pages, at most 20,000 words. Chosen to keep requests small and processing bounded.
- **Scaffolding first, features second.** The client is a placeholder until the teacher flow exists, so each commit builds.

## Not decided yet

- [TODO: AI provider and model]
- [TODO: interactive lesson output: in-app preview, shareable link, or exported file]
- [TODO: teacher flow design]
- [TODO: student chat design]
- [TODO: hosting]
- [TODO: per-request API key handling]

## Known weaknesses

- [TODO]

## What I would do with four more hours

- [TODO]

## How I know it works

- [TODO: test scenarios]
- `npm run build` passes.
- `npm test` runs no tests yet.
