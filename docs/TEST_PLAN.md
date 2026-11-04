# Test and eval plan

Updated 4 November 2026 against the working tree on feat/gemini-api. This is a verification inventory, not a record of tests run today. Production was not verified in this session.

## Evidence available

| Area | Existing evidence | Remaining gap |
| --- | --- | --- |
| Software suite | 116 tests passed in a clean committed-code export after npm ci on 4 November; 120 in the workspace including four ignored dev-tool tests | Deployed and browser checks remain separate |
| Production build | Fresh npm ci and production build passed in the clean export; frontend/assets, health, empty chat and disabled dev routes passed a production-mode smoke test | Live Render deployment/browser verification |
| Gemini key and plan | Live key check succeeded; sample lesson passed on first generation attempt | Real browser upload-to-completion journey and adverse inputs |
| Tutor | Live opening smoke tests and direct grade-comparison replies | Full current Gemini datasets, transition/grade comparisons and human quality review |
| Classifier | Unit tests and saved historical Groq golden-set results | Full Gemini classifier evaluation; historical 10/10 is not a Gemini result |
| Streaming/Stop | Adapter stream test; HTTP streaming, abort and unchanged progress tests; live tutor reply | Browser interruption and deployed stream behavior |
| Publishing/sessions | publish.test.js covers isolated progress, stable publish ids, published copies and invalid sessions/links | Multiple real browsers, reloads, eviction and production restart behavior |
| Document extraction | PDF/DOCX, invalid/empty input and filename tests; material splitting/coverage tests | Scan, formula/table, prompt injection and multilingual live fixtures |
| Keys | Header/schema/no-key/provider-error tests and malformed-key rejection without echo | Comprehensive capture of logs and responses, history secret scan |
| Grade adaptation | Audience format tests; shared evaluator limits; live seventh-grade/adult replies | Validate comprehension and attention with students; prompted limits are not enforced at runtime |
| Four phases and answer cards | Product direction only | Implementation and tests still required |
| Duration/timer/test score | No implementation; timeLimit is metadata/instructions | Budget rules, controls, elapsed-time tracking, scoring and expiry behavior |

## Whole-document coverage checks

- material.test.js verifies all lines/pages survive internal chunking, deduplication, input bounds and explicit refusal of partial extraction.
- document-map.test.js verifies end-of-document evidence reaches the planner, source quotes are verified, malformed maps get one repair, plan retries reuse the map, and short files skip mapping.
- upload.test.js verifies the real HTTP build considers final content, returns no parts selector metadata, refuses stale part-selection requests and cannot publish after a late mapping failure.
- ai.test.js verifies the final map request does not duplicate raw document text.
- Run node --env-file-if-exists=.env tests/live/review_document.js for a synthetic ten-page Gemini coverage check with the requested topic on pages 9-10. Reports are ignored and are not evidence about the user's original uploaded file.

## Automated checks

Run npm test and npm run build. In the restricted Windows sandbox, child-process spawn EPERM prevented execution; successful checks used approved execution outside that sandbox. A sandbox failure is not a failing application assertion.

Relevant suites: ai.test.js, audience.test.js, lessonPlan.test.js, chat.test.js, publish.test.js, upload.test.js, documents.test.js, material.test.js, eval-score.test.js and tutor-rules.test.js. The local ignored devTools.test.js adds tests in this workspace but is absent from a clean clone.

Plan checks enforce 1-3 steps and exact bounded quotes. The old 12,000-character rejection expectation is obsolete: long files are mapped internally in bounded chunks. Incomplete PDF extraction is refused rather than used as a partial lesson.

## Live model checks

- npm run check:key: small structured request through the real adapter, without printing credentials.
- npm run plan:sample: validates a generated plan and saves output under ignored tests/live/results.
- npm run eval:check: classifier dataset, repeated runs, saved results and scoring. Provider errors count as failed runs.
- npm run eval:tutor: repeated tutor scenarios, automatic rules and human review sheet. Target a small smoke run with -- --only 1 --runs 1, or select --dataset conditioning. Provider errors are incomplete, not successes or behavior failures.

Tutor review must cover teaching before questioning, grade-appropriate language, example accuracy, natural transitions, feedback after partial answers, no_attempt, requested false confirmation, off-file questions and Stop. Brief source-based explanations at a new step are expected; examples are optional; the old opening-no-answer rule no longer applies. First-turn clarification may explain a gap; the old no-hint rule was removed. Later attempts retain hints, explanation and the fourth-turn choice.

Read docs/TUTOR_STANDARD.md for current limits and heuristics. A passing automated report does not certify pedagogical quality. Existing datasets are mainly two Hebrew subjects; direct English grade checks do not replace a broader corpus. Results generated against dirty prompts cannot be reproduced from a prompt commit alone.

## Focused concise-chat regression

Run node --env-file-if-exists=.env tests/live/review_chat.js. It checks six status cases and three tutor replies against a labeled synthetic reconstruction of the user report; it does not verify the original uploaded file. Review the actual replies even when automated checks pass. Unit coverage also verifies understanding-goal bounds/backward compatibility and that next-step questions enter next-step history.

## Required regression additions

1. Failed replacement build preserves the prior plan, published reference and chat progress. Fix the behavior before asserting this guarantee.
2. Capture build/chat logs and responses with a synthetic key and assert no disclosure. Scan Git history before public release.
3. Exercise scans/no text, Hebrew material with English goal, another requested language, no teachable content, instruction injection and whole-document and final-section coverage. Verify no silently omitted material claims.
4. Compare openings and transitions across elementary, middle-school, high-school and adult audiences, including unspecified audience fallback. Human reviewers check whether the question follows from the taught example.
5. When activities exist: validate answer formats, one correct multiple-choice answer, test answers withheld until submission, retries, grading and malformed submissions. Keep correct answers out of student-facing data before submission.
6. When timing exists: budget each phase, pause/resume, reload behavior, expiry during a reply/test, overtime, completion and different student speeds. Label durations as estimates until calibrated.

## Teacher review cost check

After a successful build, show the prepared overview without an opening tutor request. Let's begin starts the first tutor turn; viewing the welcome must not create chat progress. A failed build must not start the tutor. Publish does not call the model. A stopped or failed opening shows recovery on the welcome without regenerating the plan. The teacher change textbox is removed; New lesson returns to setup. Mobile should switch from Create to Preview when the welcome is ready, and keep recovery errors visible.

## Manual and deployment checks

Walk teacher setup, upload, whole-document preparation, plan review, welcome, explicit Begin and live preview, publish and student start with a real Gemini key. Check independent browsers and phone/RTL layouts. Exercise errors, Stop, retry, refresh, completion and old links after rebuild/restart. Verify secrets and current Render settings, cold start, production health and streamed requests in a private window.

## Release checklist

- [x] Current suite and production build pass in a clean committed-code export with dependencies installed from the lockfile.
- [ ] Current Gemini datasets and human-reviewed examples are recorded, including failures.
- [ ] Document and key-handling regressions are covered or limitations explicitly listed.
- [ ] Mobile/RTL and deployed private-window journeys are recorded.
- [ ] History secret scan is clean before public release.
- [ ] Documentation matches shipped behavior and clearly labels planned features.

Do not treat the proposed timer and activity work as completed release evidence.
