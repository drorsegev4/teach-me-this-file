// Runs the golden dataset through the current check.md with the real model.
// Usage: npm run eval:check. Costs runs x rows model calls. Results are saved under tests/evals/results/.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAI } from '../../server/src/ai.js';
import { scoreEval } from './score.js';

const dataset = JSON.parse(readFileSync(new URL('./check-autonomic.json', import.meta.url), 'utf8'));
const material = readFileSync(new URL(`../../${dataset.material}`, import.meta.url), 'utf8');
if (!material.includes(dataset.step.source)) throw new Error('The step source is not an exact quote from the material.');
if (!process.env.GROQ_API_KEY) throw new Error('Set GROQ_API_KEY in .env. The eval calls the real model.');

const runs = dataset.thresholds.runsPerRow;
const ai = createAI({ apiKey: process.env.GROQ_API_KEY });
const history = [{ role: 'tutor', text: dataset.openingQuestion }];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Rate limits (429) and transient provider errors are retried with backoff, so a run measures the
// prompt, not the quota. A call that still fails is recorded as an error and counts as a failed run.
async function classifyWithRetry(studentText) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await sleep(1500);
      const { status } = await ai.classify({ rules: dataset.rules, step: dataset.step, history, studentText });
      return status;
    } catch (error) {
      lastError = error;
      await sleep(2000 * 2 ** attempt);
    }
  }
  return `error: ${lastError.message}`;
}

const rows = [];
for (const row of dataset.rows) {
  const actual = [];
  for (let run = 0; run < runs; run++) actual.push(await classifyWithRetry(row.studentMessage));
  rows.push({ id: row.id, studentMessage: row.studentMessage, expected: row.expected, mustNeverFail: row.mustNeverFail, actual });
  console.log(`row ${row.id} done`);
}

const result = scoreEval(rows, { runs, passRate: dataset.thresholds.overallPassRate });
const checkCommit = execSync('git log -1 --format=%h -- server/prompts/check.md', { encoding: 'utf8' }).trim();
const checkDirty = execSync('git status --porcelain -- server/prompts/check.md', { encoding: 'utf8' }).trim() !== '';
const date = new Date().toISOString();

console.log(`\ncheck.md commit ${checkCommit}${checkDirty ? ' (UNCOMMITTED CHANGES: this run is not reproducible from git)' : ''}`);
console.log('row  expected     actual (x3)                                   result');
for (const row of result.scored) {
  const label = `${row.id}`.padEnd(4);
  console.log(`${label} ${row.expected.padEnd(12)} ${row.actual.join(', ').padEnd(45)} ${row.passed ? 'PASS' : 'FAIL'}${row.mustNeverFail ? '  [mustNeverFail]' : ''}`);
}
console.log(`\nTotal: ${result.passed}/${result.total} rows pass (${Math.round(result.rate * 100)}%, need ${dataset.thresholds.overallPassRate * 100}%)`);
console.log(`mustNeverFail: ${result.guardedRows} row(s), ${result.guardViolations} understood across all runs ${result.guardViolations === 0 ? '(OK)' : '(FAILS THE EVAL)'}`);
console.log(`OVERALL: ${result.pass ? 'PASS' : 'FAIL'}`);

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const file = new URL(`./results/check-${date.replace(/[:.]/g, '-')}-${checkCommit}.json`, import.meta.url);
writeFileSync(file, JSON.stringify({
  date, checkCommit, checkDirty, dataset: dataset.name, runs,
  passed: result.passed, total: result.total, rate: result.rate,
  guardViolations: result.guardViolations, pass: result.pass, rows: result.scored,
}, null, 2) + '\n');
console.log(`Saved: ${file.pathname}`);
process.exitCode = result.pass ? 0 : 1;
