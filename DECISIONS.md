# Decisions

Working draft. Reviewers read this file, so it must match what the code does. Update it with each meaningful change.

## Main choices and why

- **React, Vite, Tailwind, Node.js/Express.** Required stack. Express serves the AI calls, so the API key stays on the server.
- **PDF and DOCX text extraction on a worker thread.** Extraction runs off the request thread with a 30-second timeout and a 128 MB memory limit, so a bad file cannot block the server. Only text is read. Images, diagrams, formulas and table layout are not interpreted, and the user is warned.
- **Upload limits.** 10 MB per file, at most 60 PDF pages, at most 20,000 words. Chosen to keep requests small and processing bounded.
- **Scaffolding first, features second.** The client is a placeholder until the teacher flow exists, so each commit builds.
- **One configuration.** Local and production use the same commands (`npm run build`, `npm start`) and the same names in `.env.example`. Node 22 is pinned in `.nvmrc`; line endings are LF via `.gitattributes`. The README is the single how-to. `render.yaml` holds the production settings for Option A below.
- **Chat turns: check, then reply.** Each student answer is first checked against the step's source (understood, keep going, or off the material). The tutor's reply is then written knowing that result, so it never confirms a step it has not passed. The check returns JSON; the reply streams as text.
- **Off-file questions are declined.** The tutor says the question is outside the material and returns to the current step. It does not answer, to keep teaching grounded in the file. The tutor writes this reply from `tutor.md`; it is no longer a fixed sentence, so the rule depends on the prompt following it.
- **Wrong answers climb a ladder.** Each wrong answer (`keep_going`) on a step raises that step's attempt count. Attempt 1 encourages and asks again more simply; attempt 2 names the misunderstanding and hints; attempt 3 and later give only the missing piece. A `no_attempt` reply does not name a misunderstanding. Known issue: on a real run, attempt 3 on the first step gave the definition itself.
- **Stop commits nothing.** The browser aborts the stream; the server cancels the model call and keeps progress and history unchanged. The student's message returns to the input box.
- **Progress lives in server state, not in the chat history.** Completed steps and the current step are stored separately from messages.
- **Mock mode (`AI_MODE=mock`).** Serves a saved plan and scripted replies, so the page can be built and tested without the provider. The real model is checked separately with `npm run plan:sample` and one live chat turn.


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

- `npm test` (43 unit tests) and `npm run build` pass.
- **check.md eval** (`npm run eval:check`): a 10-row golden dataset, labelled by a domain expert, run 3 times each against the real model. Results are saved with the prompt's commit.
  - Baseline at `164b1f6`: 8/10. Re-scoring the same results under the new rule gives 9/10. The new `no_attempt` label, plus that rule change, gives 10/10 at `4680baf`. The rule change accounts for one row, and the prompt change for one row.
  - Row 6 (a request to be told the answer is right) is now labelled `no_attempt`. It passes the rule, but the label is wrong for this message. It is open for the tutor eval.
- Tutor behavior (`tutor.md`) is not evaluated yet. Its output is free text, so it needs rule checks and rubric review rather than exact matches.
- `no_attempt` has no tutor branch yet. The chat treats it as `open`, which re-asks the opening question.
