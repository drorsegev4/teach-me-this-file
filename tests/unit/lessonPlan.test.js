import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLessonPlan, generateLessonPlan, PlanError } from '../../server/src/lessonPlan.js';
import { createMockAI } from '../../server/src/ai.js';

const document = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');
const quote = 'warmer water evaporates faster because its particles have more energy';

const rules = { language: 'English', audience: '7th grade', timeLimit: '15 minutes', method: 'Socratic' };
const validPlan = {
  rules,
  steps: [
    { title: 'Why does a puddle disappear?', source: 'Evaporation is the change of liquid water into water vapor' },
    { title: 'What makes evaporation faster?', source: quote },
    { title: 'Explain it in your own words', source: 'spreading the same amount of water over a larger exposed surface' },
  ],
  error: null,
};

test('accepts a plan whose sources are exact quotes and returns the rules', () => {
  const plan = checkLessonPlan(validPlan, document);
  assert.equal(plan.steps.length, 3);
  assert.deepEqual(plan.rules, rules);
});

test('accepts a quote whose punctuation differs from the document', () => {
  const plan = structuredClone(validPlan);
  plan.steps[0].source = 'Evaporation is the change of liquid water into water vapor';
  const punctuated = document.replace('water vapor, a gas, at', 'water vapor; a gas. At');
  assert.doesNotThrow(() => checkLessonPlan(plan, punctuated));
});

test('accepts curly quotes and extra whitespace', () => {
  const plan = structuredClone(validPlan);
  plan.steps[0].source = '"Evaporation"  is the change of liquid water';
  const curly = document.replace('Evaporation is the change', '“Evaporation” is the change');
  assert.doesNotThrow(() => checkLessonPlan(plan, curly));
});

test('rejects a source that is not in the document', () => {
  const invented = structuredClone(validPlan);
  invented.steps[1].source = 'Evaporation only happens when water is boiling';
  assert.throws(() => checkLessonPlan(invented, document), /not an exact quote/);
});

test('rejects a reordered quote', () => {
  const reordered = structuredClone(validPlan);
  reordered.steps[0].source = 'water vapor into liquid water change Evaporation is the of';
  assert.throws(() => checkLessonPlan(reordered, document), /not an exact quote/);
});

test('rejects two steps that use the same quote', () => {
  const duplicate = structuredClone(validPlan);
  duplicate.steps[2].source = duplicate.steps[0].source;
  assert.throws(() => checkLessonPlan(duplicate, document), /same source/);
});

test('rejects fewer than three or more than seven steps', () => {
  const short = { ...validPlan, steps: validPlan.steps.slice(0, 2) };
  assert.throws(() => checkLessonPlan(short, document), /at least 3 steps/);
  const step = validPlan.steps[0];
  const long = { ...validPlan, steps: Array.from({ length: 8 }, () => step) };
  assert.throws(() => checkLessonPlan(long, document));
});

test('rejects a source longer than 25 words', () => {
  const long = structuredClone(validPlan);
  long.steps[0].source = document.split(/\s+/).slice(0, 26).join(' ');
  assert.throws(() => checkLessonPlan(long, document), /more than 25 words/);
});

test('rejects a title longer than 8 words', () => {
  const long = structuredClone(validPlan);
  long.steps[0].title = 'one two three four five six seven eight nine';
  assert.throws(() => checkLessonPlan(long, document), /more than 8 words/);
});

test('rejects steps with unexpected fields', () => {
  const extra = structuredClone(validPlan);
  extra.steps[0].dependsOnPrevious = false;
  assert.throws(() => checkLessonPlan(extra, document));
});

test('rejects a plan without rules', () => {
  const noRules = { steps: validPlan.steps, error: null };
  assert.throws(() => checkLessonPlan(noRules, document));
  const oldShape = { assumptions: 'Grade 7', steps: validPlan.steps, error: null };
  assert.throws(() => checkLessonPlan(oldShape, document));
});

test('passes through a refusal with its reason and no steps', () => {
  const refusal = { rules, steps: [], error: 'The file has no teachable text.' };
  assert.deepEqual(checkLessonPlan(refusal, document), { error: 'The file has no teachable text.' });
});

test('retries once with the failure reason and returns the fixed plan', async () => {
  const bad = structuredClone(validPlan);
  bad.steps[1].source = 'an invented sentence';
  const ai = createMockAI([bad, validPlan]);
  const result = await generateLessonPlan({ ai, text: document, teacherPrompt: 'Teach evaporation' });
  assert.equal(result.steps.length, 3);
  assert.equal(result.attempts.length, 2);
  assert.match(result.attempts[0].problem, /not an exact quote/);
  assert.equal(ai.inputs[1].problem, result.attempts[0].problem);
});

test('gives up after two failed attempts and keeps both outputs', async () => {
  const bad = structuredClone(validPlan);
  bad.steps[1].source = 'an invented sentence';
  const ai = createMockAI(bad);
  await assert.rejects(generateLessonPlan({ ai, text: document, teacherPrompt: 'Teach evaporation' }), error => {
    assert.ok(error instanceof PlanError);
    assert.equal(error.attempts.length, 2);
    return true;
  });
});
