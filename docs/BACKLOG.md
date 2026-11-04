# Backlog

Updated 4 November 2026. Implemented work is listed separately so it is not mistaken for future scope. See DECISIONS.md for rationale and TEST_PLAN.md for verification gaps.

## Next: structured interactive lessons

- Introduce four phases: introduction, learn, practice, short test. Define explicit activities and phase transitions, with app-controlled progression and scoring.
- Add teacher-selected duration and grade-aware content/activity budgets. Suggested presets: 5, 15, 30 minutes and Custom. Counts and allocations are provisional until tested with students.
- Add a student timer. Proposed behavior: start on Start lesson, count active time, pause/resume, preserve work at expiry and offer finishing or continuing. Decide how this interacts with streaming, reloads, tests and overtime.
- Add single-answer multiple choice alongside existing open answers, then true/false cards. Practice gives feedback and retries; test answers are independent with results and explanations afterward. Define test retry and submission rules.
- Review vocabulary, question difficulty, attention load and examples across grades. Remove repetitive guessing and canned transitions; keep explanations grounded in material.

## Current reliability gaps

- Keep the previous plan/chat when a replacement build fails. The current flow clears the preview and resets the session before generation succeeds.
- Add persistence for drafts, published plans and student progress. Today restarts/eviction can invalidate links and lose progress.
- Verify Gemini on the deployed service; configure secrets and deploy client/server together. render.yaml currently enables automatic deployment of main.
- Walk mobile/RTL flows with a real keyboard, including setup, answering, Stop, errors and completion.
- Improve ending recap and remaining interface labels in the lesson language. Welcome and overview are implemented, but they are not a full phase-based lesson engine.
- Document and verify missing-key, rejected-key, dropped-stream and cold-start experiences end to end.

## Optional teacher demo (discussion only)

- A Run simulation action could show a clearly labeled scripted sample without API calls, or explicitly run the real tutor with quota cost. Neither mode is implemented. A scripted demo must not be presented as validation of an uploaded lesson.

## Evaluation and documentation

- Re-run full Gemini check/tutor datasets after the prompt changes; existing Groq results are historical.
- Add grade-comparison scenarios and human review of explanations, concrete examples, answerable questions and transitions.
- Add future phase, interaction, scoring and timer tests when those features exist.
- Add adverse document/input fixtures and a comprehensive key/log non-disclosure test. Run a history secret scan before public release.
- Simulated-student journeys may use the local ignored devTools runner; it is not part of a clean checkout.
- Keep DECISIONS.md and README.md aligned with implementation; private working history stays in ignored LOGS.md.

## Long documents: remaining work

- Whole-document mapping and automatic idea selection are implemented. Remaining work: quality review across subjects/languages, richer source context and visible preparation-stage progress.
- Calibrate token estimates and request budgets against the configured Gemini model. Old Groq free-tier measurements are not Gemini limits.
- Student-time background preparation and hierarchical maps beyond current input bounds remain deferred. Consider caching identical builds only with explicit scope/credential isolation.

## Implemented (verification scope in TEST_PLAN.md)

- One to three focused steps; short welcome/lesson overview generated in the plan call and shown in teacher/student views. No tutor question until Begin.

- Teacher upload, goal, plan review, automatic welcome/overview, explicit Begin and publish flow; /l/:id student page.
- Per-session drafts/chat and immutable published plan copies, within in-memory limits.
- Student Gemini key entry when the host has none; request-scoped keys and host fallback.
- Internal whole-document mapping, no teacher part selector, separate document overview and lesson scope, and explicit failure on incomplete extraction.
- Gemini adapter/configuration, teach-first prompts and audience guidance.
- Open-text questions, streamed replies, Stop, progress outcomes and move-on choice after four counted attempts.

## Deferred

Accounts, authorization, OCR, analytics, full localization, persistent storage and a separate static frontend host. No commitment to a particular persistence provider yet.
