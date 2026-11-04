# Tutor standard

Updated 4 November 2026 for the concise-chat iteration. Applies to server/prompts/tutor.md and check.md. The teaching goal is a short, grounded explanation followed by evidence of understanding, rather than a mandatory analogy and immediate recall.

| Rule | Expected behavior | Verification |
| --- | --- | --- |
| R1 | Natural language matching the lesson and grade. Plain text, no emoji. Usually 2-3 short sentences; aim for 25-45 words for grades 7-9. No padding. | Auto: script, maximum length, plain text, no self-reference or emoji. Human: natural language and grade suitability. |
| R2 | One manageable question about a relationship, interpretation, contrast or application taught in the reply. No question needed after final completion. | Auto: Socratic question ending when applicable. Human: question quality and one-question discipline. |
| R3 | New steps briefly teach before asking. First clarification targets the gap rather than mechanically repeating a question; it may explain a missing piece. | Auto: at least two substantive sentences for openings; no harsh error naming on rung 1. Human: actual teaching, targeted clarification and meaningful question. |
| R4 | On the second counted attempt, give a specific hint rather than a new introduction. | Auto: at most one answer group in legacy hint datasets. Human: relevance and hint size. |
| R5 | On the third attempt, explain the missing connection and check it. On the fourth and later, offer trying again or moving on. | Auto: legacy answer-part heuristics. Human: explanation and choice quality. |
| R6 | Brief, proportionate feedback tied to what the student demonstrated. No exaggerated mastery claims or praise after a wrong/empty answer. | Auto: praise word lists and false-confirmation checks. Human: proportionality. |
| R7 | Facts and questions stay within the current source; transitions use the next step's source. Do not reinforce literal misunderstandings of an analogy. | Auto: scenario-specific forbidden terms. Human: grounding and interpretation. |
| R8 | Examples are optional. Stay with the passage's concrete people/events/processes; no automatic friend, game or family comparison. Follow-up examples help only when needed and must fit the subject and audience. | Auto: graphic-content terms; targeted live fixture checks unrelated analogy terms. Human: usefulness and accuracy. |
| R9 | A real explanation, not a question alone or pasted definition. A short source-based explanation can be sufficient without an example. | Auto: two-sentence structural heuristic and long copied-definition heuristic for explanation scenarios. Human: clarity and source context. |

## Completion criteria

New generated steps include understandingGoal: a bounded, source-supported description of what the student should explain, connect, distinguish or apply. It is optional in the schema for older plans; for those the checker uses the central source idea and the actual tutor question. Goals are model-written criteria, not proof of semantic correctness.

The checker receives the actual question and relevant history for the active step. A transition's opening question and source are assigned to the newly opened step, so they reach its checker. A short answer that demonstrates the goal passes. A recalled keyword, unrelated correct fact, incomplete relationship or literal misunderstanding does not establish mastery. No-answer/help requests, wrong answers and off-file questions keep their distinct statuses. Intermediate recall answers can be useful without completing a broader goal.

## Length and audience

Audience ceilings remain 45 words for grades 1-6, 70 for grades 7-9, 100 for grades 10-12 and 120 for adults; unspecified audiences use 70. The general evaluator also caps ordinary replies at 80 and introductions/explanations at 120, taking the smaller limit. Prompts target considerably shorter replies. These are product defaults, not validated reading levels, and runtime text is not truncated to enforce a limit.

## Evaluation and limits

- The existing autonomic and conditioning datasets exercise statuses, explanations and attempt handling. Some names/history reflect earlier prompt versions; their answer-stem rules are regression heuristics, not a complete teaching rubric.
- Run npm run eval:tutor for repeated scenarios and a human review sheet. Provider errors are incomplete runs. Opening definitions are expected; examples are not mandatory. Rung 1 no longer bans all hints or answer-related words.
- Run node --env-file-if-exists=.env tests/live/review_chat.js for a focused live check based on the reported Hebrew chat: six classifier cases plus opening, partial feedback and transition. Synthetic source passages are explicitly labeled as reconstructed, not verified quotes from the original upload. Reports include prompts and are saved under ignored tests/live/results.
- Human review remains necessary for source accuracy, quality of the understanding goal, question difficulty, natural transitions and unnecessary analogies. A two-sentence minimum or automatic PASS does not establish those qualities. The first concise-chat report passed structural checks but human review found unnecessary analogies; shared audience guidance and prompts were then corrected and the focused checks rerun.
- Scope remains open-text chat. Four phases, answer cards, independent tests and timers are planned, not implemented by this iteration.
