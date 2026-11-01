# Backlog

Items agreed to do later. Not started unless marked. Newest first. See `TEST_PLAN.md` for tests and evals.

## UX

- **Template shows a worked example, not brackets.** The "Use the template" chip should fill the goal box with a realistic filled-in goal, for example `Teach photosynthesis to 7th grade students, in English. Be Socratic. Check understanding after each step. Keep it under 15 minutes.` The teacher sees what a good goal looks like and can edit it. Today it inserts `Teach [topic] to [grade] students, in [language]. ... under [minutes] minutes.` with green brackets that block Build. Decide then: keep the brackets as an optional second chip, or drop them. (Added 1 Nov 2026.)

## Product and architecture (from the 1 Nov audit)

- Publish flow: a Publish button in the Create panel makes a lesson id and a link `/l/:id`. The student page is the chat alone, full screen, no goal or plan visible. "Open as student" keeps the key in memory in the same tab.
- Server state keyed by lesson id and student session id. Today there is one global session and one shared plan, so two people on the live URL overwrite each other.
- Student page asks for a Groq key when the host has none.
- Long files: the 12,000-character cap rejects about 4 pages. Dror has a proposed approach; discuss before building. First measure Groq's real context window.
- A failed change or rebuild keeps the previous lesson. Today it clears the preview and the server resets the session first.
- Cold start: serve the client from a Render static site so the first page load does not wait for the API to wake.

## Student experience

- Welcome message: topic, number of steps, how it works, "you can ask me questions".
- Interface labels in the lesson's language (Send, Step N of M, Show source, finish message). Full i18n stays parked.
- Ending: a recap with steps understood and steps moved on from.
- Student error states: key rejected, cold start, stream dropped mid-lesson.
- Phone walk with the real keyboard open.

## Evals and docs

- Tutor scenarios (T1), plan inputs (T2), key-not-logged test (T3). See `TEST_PLAN.md`.
- Simulated-student journeys using the runner in `server/src/devTools.js`.
- README and DECISIONS: no `[TODO]` left; about five real AI behavior scenarios with observed outputs.
- Note in DECISIONS: step source quotes reach every browser, so teacher and student are not separated by permissions.

## Long documents (added 1 Nov 2026)

- Step 1 is done: a lesson is built from the start of the file that fits a token budget, and the teacher sees what was used. Next: let the teacher choose which pages or sections to use (outline with ticks), then the outline-and-select approach (extractive outline, one selection call, one plan call, streamed stage progress). Model-written chunk summaries only when the key's limit is much higher than 8,000 tokens per minute.
- Real numbers (Groq, `openai/gpt-oss-120b`, free key): 8,000 tokens per minute, 1,000 requests per day. About 2.9 Hebrew characters per token and 5.5 English. One lesson build uses most of a minute.
