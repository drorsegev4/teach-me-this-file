# Test and eval plan

Maps every requirement in `ASSIGNMENT.md` to the proof we have, or still need. Status words:
**auto** = `npm test`, no network. **eval** = live model run with saved results. **manual** = a person in a browser. **missing** = nothing yet.
Last updated 1 Nov 2026 against commit `7aed48e`. Nothing here was run against the live Render URL.

## 1. Requirement matrix

| # | Requirement (brief section) | Proof today | Gap |
|---|---|---|---|
| R1 | Screen to upload a file and write the prompt (3) | auto: `upload.test.js` (short prompt, wrong type, no file). manual: built screen, mock AI only | Real Groq build in a browser not run |
| R2 | Chat teaches, does not summarize (2) | eval: `check.md`, 10 rows, 10/10 at `4680baf` | `tutor.md` and `lesson_plan.md` not evaluated. This is the largest gap |
| R3 | Streaming answers and Stop (3) | auto: `chat.test.js` (stream over HTTP, stopped reply commits nothing, abort over HTTP leaves state unchanged) | Never run against a real Groq stream |
| R4 | Visible progress (3) | auto: step and outcome state in `chat.test.js`. manual: bar and "Step 1 of N" seen in mock mode | none beyond a real run |
| R5 | Source passage behind a message (3) | auto: `lessonPlan.test.js` (quote must exist in the file, no reorder, no duplicate), `chat.test.js` (quote on first message) | UI "Show source" only seen in mock mode |
| R6 | Loading, error and empty states (3) | manual: generating and plan-failed states seen in mock mode | No checklist of every state. Cold start untested on Render |
| R7 | Usable on a phone (3) | manual: Preview tab at 375 px in mock mode | Create tab, setup screen, Stop, Show source on a phone not walked |
| R8 | AI logic, lesson state, UI separate; plan and progress in app state (3) | auto: `chat.test.js`, `publish.test.js`, `upload.test.js` | none |
| R9 | Unseen files: RTL, scans, formulas, tables, very long (3) | auto: `documents.test.js` (docx, pdf, empty, wrong type, Hebrew file name) | **missing**: scanned PDF, Hebrew body text through plan and tutor, table, formula, file over the 12,000-character cap, prompt injection inside a file |
| R10 | Key sent per request, never stored or logged (4) | auto: `ai.test.js` (header, no key, 401 text, no provider body), `upload.test.js` (malformed header not echoed) | **missing**: a test that no log line or response contains the key. Git history scan not run |
| R11 | Hosted, works in a private window (4, 5) | none | **missing**: all of it |
| R12 | README, DECISIONS (5) | files exist | DECISIONS still has `[TODO]` sections. Test count stale |
| R13 | About 5 scenarios showing AI behavior (5) | eval: `check` golden set only | **missing**: tutor scenarios (see T1) |

## 2. Tests and evals to add, in order

**T1. Tutor scenarios with deterministic rules (R2, R13).** One runner like `npm run eval:check`, live, saved under `tests/evals/results/` with the prompt's commit. Five scenarios, each run 3 times at temperature 0.4:
1. Wrong answer, rung 1: reply asks again more simply, does not name the error, does not contain the step's answer phrase.
2. Wrong answer, rung 3: reply gives only the missing piece and asks about it.
3. "Say I got it": checker returns `no_attempt`, tutor does not praise an achievement, step does not advance.
4. Off-file question: reply says it is outside the material, does not answer, returns to the step.
5. Hebrew lesson: reply is in Hebrew (RTL) and within the word limit.

Deterministic rules checked on every reply (no judge model): language, 80-word limit, ends in a question for Socratic, does not contain the next step's title unless the step was `understood`, does not contain answer phrases before rung 3. A judge model for the rest comes later, after you label a calibration set. An error after retries counts as "incomplete" and is rerun, never scored.

**T2. Plan inputs that must not break (R9).** Fixtures under `tests/unit/fixtures/` or live-only:

| Input | Expected | Kind |
|---|---|---|
| Scanned PDF, no text | Clear error, no plan | auto |
| Hebrew document, English goal | Plan builds, quotes pass the check | live |
| English file, goal asks for French | Plan rules say French | live |
| Document with no teachable content | Refusal with a reason, no steps | live |
| File containing "ignore your instructions" | Treated as content, rules unchanged | live |
| Goal is only "teach this" (20 characters) | Defaults fill the gaps | live |
| File over the 12,000-character cap | 413 with a count, nothing cut | auto (exists in code, no test) |

**T3. Key never leaks (R10).** Auto test: run build and a chat turn with a key such as `gsk_test_123`, capture `console.log`/`console.error` and every response body, assert the key appears nowhere. Plus a one-off `gitleaks` run over history before the repo goes public.

**T4. Failed change keeps the lesson (R1, R6).** Fix first: keep the old session until the new plan succeeds, then test that a refused or failed rebuild leaves the previous chat state. Auto.

**T5. Real Groq pass by hand (R1, R3, R4, R5, R6).** Walk the whole flow once with a real key on desktop and a phone, using `שיעור 4- למידה (קצר).docx`. Record what you saw, including Stop mid-reply.

**T6. Deployed pass (R11).** Private window on the Render URL with a fresh key. Includes cold start after 15 minutes idle.

**T7. Context window (large files).** Find Groq's real limit for `openai/gpt-oss-120b` before changing the 12,000-character cap. Report the number only.

## 3. Release gate

All must be true, with evidence, before sending links:
- [ ] `npm test` and `npm run build` pass on a clean clone.
- [ ] T1 five scenarios recorded in DECISIONS with real output; no false advancement in any run.
- [ ] T2 and T3 done; any failure either fixed or listed as a known weakness.
- [ ] T5 and T6 walked and written down.
- [ ] `gitleaks` over full history is clean; repo public.
- [ ] README and DECISIONS have no `[TODO]`.

## 4. Not in scope now

Readiness score, teacher approval flow, accounts, long-document tier 2, analytics, OCR. They stay in the roadmap's deferred list.
