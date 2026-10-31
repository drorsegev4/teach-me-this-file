import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLessonPlan } from '../../server/src/lessonPlan.js';
import { createMockAI } from '../../server/src/ai.js';

const document = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');
const quote = 'warmer water evaporates faster because its particles have more energy';

const validPlan = {
  assumptions: 'Grade 7, English, about 15 minutes',
  steps: [
    { title: 'Why does a puddle disappear?', source: 'Evaporation is the change of liquid water into water vapor' },
    { title: 'What makes evaporation faster?', source: quote },
    { title: 'Explain it in your own words', source: 'spreading the same amount of water over a larger exposed surface' },
  ],
  error: null,
};

test('accepts a plan whose sources are exact quotes from the document', () => {
  const plan = checkLessonPlan(validPlan, document);
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.assumptions, validPlan.assumptions);
});

test('accepts quotes that differ only in curly quotes and whitespace', () => {
  const copied = structuredClone(validPlan);
  copied.steps[0].source = '"Evaporation" is the change of liquid  water into water vapor';
  const curlyDocument = document.replace('Evaporation is the change', '“Evaporation” is the change');
  assert.doesNotThrow(() => checkLessonPlan(copied, curlyDocument));
});

test('rejects a plan with a source that is not in the document', () => {
  const invented = structuredClone(validPlan);
  invented.steps[1].source = 'Evaporation only happens when water is boiling';
  assert.throws(() => checkLessonPlan(invented, document), /not in the document/);
});

test('rejects plans with fewer than three or more than seven steps', () => {
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

test('passes through a refusal with its reason and no steps', () => {
  const refusal = { assumptions: '', steps: [], error: 'The file has no teachable text.' };
  assert.deepEqual(checkLessonPlan(refusal, document), { error: 'The file has no teachable text.' });
});

test('mock AI returns the fixture and the plan passes the same check as real output', async () => {
  const ai = createMockAI(validPlan);
  const raw = await ai.planLesson({ text: document, teacherPrompt: 'Teach evaporation to 7th graders' });
  assert.equal(checkLessonPlan(raw, document).steps.length, 3);
});
