// Runs the tutor scenarios through the current tutor.md with the real model and scores the replies
// against the standard in tutor-rules.js. Also writes a review sheet for the rules only a person can judge.
// Usage: npm run eval:tutor            all scenarios, 3 runs each (about 42 calls, several minutes on a free key)
//        npm run eval:tutor -- --dataset conditioning     another lesson's scenarios (tests/evals/tutor-<name>.json)
//        npm run eval:tutor -- --only 2,4 --runs 1     a quick check of two scenarios
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createAI } from '../../server/src/ai.js';
import { evaluateReply, scoreTutorEval } from './tutor-rules.js';

const flag = name => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
};
const datasetName = flag('dataset') ?? 'autonomic';
const dataset = JSON.parse(readFileSync(new URL(`./tutor-${datasetName}.json`, import.meta.url), 'utf8'));
const material = readFileSync(new URL(`../../${dataset.material}`, import.meta.url), 'utf8');
for (const { source } of [dataset.step, dataset.nextStep]) {
  if (!material.includes(source)) throw new Error(`A step source is not an exact quote from the material: ${source.slice(0, 40)}`);
}
if (!process.env.GROQ_API_KEY) throw new Error('Set GROQ_API_KEY in .env. The eval calls the real model.');

const only = flag('only')?.split(',').map(Number);
const runs = Number(flag('runs')) || dataset.thresholds.runsPerScenario;
const paceMs = Number(process.env.PACE_MS) || 8000;
const scenarios = dataset.scenarios.filter(scenario => !only || only.includes(scenario.id));

const ai = createAI({ apiKey: process.env.GROQ_API_KEY });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lessonFor = scenario => ({ rules: scenario.rules ?? dataset.rules, answerGroups: dataset.answerGroups, step: dataset.step });

// The app already waits out short rate limits. A call that still fails is tried once more after a pause;
// if it fails again the run is recorded as an error (incomplete), never as a pass or a fail.
async function reply(scenario) {
  const input = {
    rules: scenario.rules ?? dataset.rules, status: scenario.status, step: dataset.step,
    nextStep: scenario.withNextStep ? dataset.nextStep : null,
    studentText: scenario.studentText, history: scenario.history, attempt: scenario.attempt, onChunk: () => {},
  };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { reply: await ai.replyStream(input), error: null };
    } catch (error) {
      lastError = error;
      await sleep(20000);
    }
  }
  return { reply: null, error: lastError.message };
}

const rows = [];
for (const scenario of scenarios) {
  const results = [];
  for (let run = 0; run < runs; run++) {
    await sleep(paceMs);
    const { reply: text, error } = await reply(scenario);
    results.push({ reply: text, error, results: text ? evaluateReply(text, scenario, lessonFor(scenario)) : [] });
  }
  rows.push({ id: scenario.id, name: scenario.name, status: scenario.status, attempt: scenario.attempt, studentText: scenario.studentText, runs: results });
  console.log(`scenario ${scenario.id} done (${scenario.name})`);
}

const outcome = scoreTutorEval(rows, { scenarioPassRate: dataset.thresholds.scenarioPassRate, runs });
const git = args => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
const tutorCommit = git('log -1 --format=%h -- server/prompts/tutor.md');
const tutorDirty = git('status --porcelain -- server/prompts/tutor.md') !== '';
const date = new Date().toISOString();

console.log(`\ntutor.md commit ${tutorCommit}${tutorDirty ? ' (UNCOMMITTED CHANGES: this run is not reproducible from git)' : ''}`);
for (const row of outcome.scored) {
  const failed = Object.entries(row.failedRules).map(([id, count]) => `${id}x${count}`).join(' ');
  console.log(`${String(row.id).padEnd(3)} ${row.name.padEnd(46)} ${row.passed ? 'PASS' : 'FAIL'}${failed ? `  ${failed}` : ''}${row.incomplete ? `  incomplete x${row.incomplete}` : ''}`);
}
console.log(`\nScenarios: ${outcome.passed}/${outcome.total} pass (${Math.round(outcome.rate * 100)}%, need ${dataset.thresholds.scenarioPassRate * 100}%)`);
console.log(`Critical violations: ${outcome.criticalViolations}${outcome.criticalViolations ? ' (FAILS THE EVAL)' : ''}`);
console.log(`Incomplete runs: ${outcome.incomplete}${outcome.incomplete ? ' (rerun before trusting this result)' : ''}`);
console.log(`OVERALL: ${outcome.pass ? 'PASS' : 'FAIL'}`);

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const stamp = `${date.replace(/[:.]/g, '-')}-${tutorCommit}`;
writeFileSync(new URL(`./results/tutor-${datasetName}-${stamp}.json`, import.meta.url), JSON.stringify({
  date, tutorCommit, tutorDirty, dataset: dataset.name, runs, filtered: Boolean(only),
  passed: outcome.passed, total: outcome.total, rate: outcome.rate,
  criticalViolations: outcome.criticalViolations, incomplete: outcome.incomplete, pass: outcome.pass, rows: outcome.scored,
}, null, 2) + '\n');

// The review sheet: every reply, with the automatic result and the questions only a person can answer.
const sheet = [`# Tutor review sheet`, '', `tutor.md ${tutorCommit}${tutorDirty ? ' (uncommitted changes)' : ''}, ${date}. Mark each human item: [x] good, [~] acceptable, [ ] bad.`, ''];
for (const row of outcome.scored) {
  sheet.push(`## ${row.id}. ${row.name}`, `Status ${row.status}, attempt ${row.attempt}. Student: ${row.studentText ? `"${row.studentText}"` : '(no message)'}`, '');
  row.runs.forEach((run, index) => {
    sheet.push(`**Run ${index + 1}**${run.error ? ` (error: ${run.error})` : ''}`);
    if (run.reply) sheet.push('', `> ${run.reply.replace(/\n+/g, ' ')}`, '');
    const failed = run.results.filter(result => result.kind === 'auto' && result.passed === false);
    sheet.push(failed.length ? `Auto: FAILED ${failed.map(result => `${result.id} (${result.label})`).join('; ')}` : 'Auto: all rules passed');
    for (const result of run.results.filter(item => item.kind === 'human')) sheet.push(`- [ ] ${result.id}: ${result.label}`);
    sheet.push('');
  });
}
writeFileSync(new URL(`./results/tutor-review-${datasetName}-${stamp}.md`, import.meta.url), `${sheet.join('\n')}\n`);
console.log(`Saved: tests/evals/results/tutor-${datasetName}-${stamp}.json and tutor-review-${datasetName}-${stamp}.md`);
process.exitCode = outcome.pass ? 0 : 1;
