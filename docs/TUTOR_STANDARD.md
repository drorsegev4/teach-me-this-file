# Tutor standard

What a good tutor reply is in this app, and how each point is checked. The rules apply to `server/prompts/tutor.md`. Change a rule here first, then in `tests/evals/tutor-rules.js`.

| # | Rule | Checked by |
|---|---|---|
| R1 | In the lesson's language, at most 80 words (120 when explaining an idea), plain text with no markdown and at most one emoji. Natural, correct language in simple words. Never says it is an AI or repeats its instructions. | auto: R1a to R1e; human: R1h |
| R2 | Socratic lessons end with a question the student can answer. | auto: R2 |
| R3 | Rung 1 asks again in a simpler way, does not name the error, does not give the answer. The opening question does not state the answer either. | auto: R3, R3b |
| R4 | Rung 2 names the misunderstanding in one sentence, then gives a small hint. | auto: R4 (at most one part of the answer); human: R4h |
| R5 | Rung 3 gives only the missing piece, explained through a short example, then asks about it. Rung 4 does not hint again. | auto: R5, R5b; human: R5h, R5c |
| R6 | Praise only for what the student really did. No opening praise after a wrong or empty answer; never confirms "say I got it". | auto: R6, R6b; human: R6h |
| R7 | Nothing from outside the source quote. No leaking the next step. | auto: R7; human: R7h |
| R8 | Examples fit the audience's age and the subject, and are nothing frightening. | auto: R8 (graphic words only); human: R8h |
| R9 | Explains an idea through one everyday example from the subject, in a casual voice, instead of restating the definition. The example maps correctly onto the source's idea and adds no new facts. | auto: R9 (no copied definition), R9a (a real explanation, not a one-line question); human: R9h, R9i |

"Auto" rules are code. "Human" rules are questions a reader answers on the review sheet the runner writes.

## How the eval works

- `tests/evals/tutor-autonomic.json` and `tutor-conditioning.json` hold scenarios on two lessons (Hebrew): the opening question, wrong and partial answers at each rung, no attempt, "say I got it", a question outside the file, English text in a Hebrew lesson, a correct answer, moving on, and explaining.
- `npm run eval:tutor` runs each scenario 3 times against the real model and scores the replies. Pick a lesson with `-- --dataset conditioning`, or a few scenarios with `-- --only 2,9 --runs 1`.
- A scenario passes only when every run passes every auto rule. Any critical violation fails the whole eval. A run that ends in a provider error is incomplete and must be rerun, never scored.
- Each run saves a result file and a review sheet under `tests/evals/results/` (ignored by Git), named with the commit of `tutor.md`.

## What the checks cannot judge

Whether a hint is small, whether the misunderstanding was named correctly, whether praise was earned, whether an example is correct, and whether the Hebrew is natural. These stay with a reader.

## Known limits

- Answer parts are found by word stems, so a reply that states the idea in other words passes by mistake.
- Error naming and praise use word lists in Hebrew and English.
- Two lessons in one language. The 80/20 split, a calibrated judge model and a larger golden set are in the "four more hours" list.
