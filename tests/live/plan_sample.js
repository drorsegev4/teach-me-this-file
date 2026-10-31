// Generates one plan from the hardcoded sample file and teacher prompt, using the real provider.
// Usage: npm run plan:sample
// Saves the raw output and the check result under tests/live/results/ (ignored by git).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createAI } from '../../server/src/ai.js';
import { generateLessonPlan, PlanError } from '../../server/src/lessonPlan.js';

const documentText = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');
const teacherPrompt = 'Teach this to 7th graders, in English. Be Socratic. Keep it under 15 minutes.';

const ai = createAI({ apiKey: process.env.GROQ_API_KEY });
const started = Date.now();
let outcome;
try {
  const plan = await generateLessonPlan({ ai, text: documentText, teacherPrompt });
  outcome = { ok: true, plan, attempts: plan.attempts };
} catch (error) {
  if (!(error instanceof PlanError)) throw error;
  outcome = { ok: false, reason: error.message, attempts: error.attempts };
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);

const result = { createdAt: new Date().toISOString(), seconds, teacherPrompt, ...outcome };
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const file = new URL(`./results/plan-sample-${Date.now()}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(result, null, 2));

console.log(outcome.ok ? `PASS after ${outcome.attempts.length} attempt(s)` : `FAIL after ${outcome.attempts.length} attempt(s): ${outcome.reason}`);
console.log(`Seconds: ${seconds}`);
console.log(JSON.stringify(outcome.ok ? { rules: outcome.plan.rules, steps: outcome.plan.steps } : outcome.attempts.at(-1).raw, null, 2));
console.log(`Saved: ${file.pathname}`);
