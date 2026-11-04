// Focused live regression based on the reported chat. Uses Gemini quota, never prints credentials.
// Run: node --env-file-if-exists=.env tests/live/review_chat.js
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createAI, MODEL } from '../../server/src/ai.js';
import { wordCount, isPlainText } from '../evals/tutor-rules.js';

if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in .env.');
const dataset = JSON.parse(readFileSync(new URL('../evals/chat-final-review.json', import.meta.url), 'utf8'));
const ai = createAI({ apiKey: process.env.GEMINI_API_KEY });
const history = [{ role: 'tutor', text: dataset.question }];
const results = [];
for (const row of dataset.checks) {
  let actual;
  try {
    actual = (await ai.classify({ rules: dataset.rules, step: dataset.step, history, studentText: row.text })).status;
  } catch (error) { actual = `error: ${error.message}`; }
  results.push({ ...row, actual, pass: actual === row.expected });
  console.log(`${row.id}: ${actual === row.expected ? 'PASS' : 'FAIL'} (${actual})`);
}

const replies = [];
for (const scenario of [
  { name: 'opening', status: 'open', studentText: null, attempt: 0 },
  { name: 'partial-answer', status: 'keep_going', studentText: dataset.checks[1].text, attempt: 1 },
  { name: 'transition', status: 'understood', studentText: dataset.checks[0].text, attempt: 0 },
]) {
  try {
    const text = await ai.replyStream({ ...scenario, rules: dataset.rules, step: dataset.step,
      nextStep: scenario.status === 'understood' ? dataset.nextStep : null,
      history: scenario.status === 'open' ? [] : history, onChunk() {} });
    const words = wordCount(text);
    const questions = (text.match(/[?？]/gu) ?? []).length;
    const unrelatedTerms = dataset.unnecessaryAnalogyTerms.filter(term => text.includes(term));
    const pass = words <= 70 && questions === 1 && isPlainText(text) && unrelatedTerms.length === 0;
    replies.push({ ...scenario, text, words, questions, unrelatedTerms, pass, humanReview: 'Review grounding, brevity, no unnecessary analogy, natural feedback, and whether the question checks the goal.' });
    console.log(`${scenario.name}: ${pass ? 'PASS' : 'FAIL'} (${words} words)`);
  } catch (error) {
    replies.push({ ...scenario, pass: false, error: error.message });
    console.log(`${scenario.name}: ERROR`);
  }
}
const pass = results.every(row => row.pass) && replies.every(row => row.pass);
const date = new Date().toISOString();
const directory = new URL('./results/', import.meta.url);
mkdirSync(directory, { recursive: true });
const file = new URL(`chat-review-${date.replace(/[:.]/g, '-')}.json`, directory);
const prompts = Object.fromEntries(['check', 'tutor', 'lesson_plan'].map(name => [name,
  readFileSync(new URL(`../../server/prompts/${name}.md`, import.meta.url), 'utf8')]));
writeFileSync(file, JSON.stringify({ date, model: MODEL, dataset, prompts, pass, results, replies }, null, 2));
console.log(`Saved ${file.pathname}`);
console.log(pass ? 'Automatic checks PASS; human review required.' : 'FAIL; inspect the report.');
process.exitCode = pass ? 0 : 1;
