import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapDocument, DocumentMapError } from '../../server/src/documentMap.js';
import { generateLessonPlan } from '../../server/src/lessonPlan.js';

const chunks = [
  { text: 'Early material describes sunlight and plants.', pages: { from: 1, to: 2 } },
  { text: 'Middle material describes water and roots.', pages: { from: 3, to: 4 } },
  { text: 'Late material describes memory retrieval and forgetting.', pages: { from: 5, to: 6 } },
];
const rules = { language: 'English', audience: '7th grade', method: 'Direct explanation', timeLimit: null };
const mapped = text => ({ heading: 'Topic', summary: text, quotes: [text] });

test('all chunks including the final pages reach planning, with source checks against the original', async () => {
  const calls = [];
  let planned;
  const ai = {
    mapMaterial: async ({ text }) => { calls.push(text); return mapped(text); },
    planLesson: async input => {
      planned = input;
      return { rules, steps: [{ title: 'Memory', source: chunks[2].text }], error: null };
    },
  };
  const result = await generateLessonPlan({ ai, text: chunks.map(chunk => chunk.text).join('\n'), chunks, teacherPrompt: 'Teach memory.' });
  assert.deepEqual(calls, chunks.map(chunk => chunk.text));
  assert.equal(planned.text, undefined);
  assert.equal(planned.documentMap.sections.length, 3);
  assert.deepEqual(planned.documentMap.sections.at(-1).pages, { from: 5, to: 6 });
  assert.equal(result.steps[0].source, chunks[2].text);
});

test('invalid map quotes get one repair attempt and cannot create a partial document map', async () => {
  let calls = 0;
  await assert.rejects(mapDocument({ ai: { mapMaterial: async () => {
    calls += 1;
    return mapped('An invented passage that was not in the file.');
  } }, chunks, teacherPrompt: 'Teach this.' }), DocumentMapError);
  assert.equal(calls, 2);
});

test('a corrected map is accepted and whitespace/punctuation are checked consistently', async () => {
  let calls = 0;
  const ai = { mapMaterial: async () => ++calls === 1 ? mapped('Invented text.') : mapped('Early material describes sunlight and plants!') };
  const result = await mapDocument({ ai, chunks: [chunks[0]], teacherPrompt: 'Teach this.' });
  assert.equal(calls, 2);
  assert.equal(result.sections.length, 1);
});

test('plan repair reuses the completed document map', async () => {
  let maps = 0;
  let plans = 0;
  const ai = {
    mapMaterial: async ({ text }) => { maps += 1; return mapped(text); },
    planLesson: async () => ({ rules, steps: [{ title: 'Topic', source: ++plans === 1 ? 'Invented source.' : chunks[2].text }], error: null }),
  };
  await generateLessonPlan({ ai, text: chunks.map(chunk => chunk.text).join('\n'), chunks, teacherPrompt: 'Teach memory.' });
  assert.equal(maps, 3);
  assert.equal(plans, 2);
});

test('short documents skip the mapping calls entirely', async () => {
  let input;
  const ai = {
    mapMaterial: async () => assert.fail('unnecessary mapping call'),
    planLesson: async value => { input = value; return { rules, steps: [{ title: 'Topic', source: chunks[0].text }], error: null }; },
  };
  await generateLessonPlan({ ai, text: chunks[0].text, chunks: [chunks[0]], teacherPrompt: 'Teach this.' });
  assert.equal(input.text, chunks[0].text);
  assert.equal(input.documentMap, undefined);
});


test('malformed structured output gets one bounded repair instead of publishing an incomplete map', async () => {
  let calls = 0;
  const ai = { mapMaterial: async () => { if (++calls === 1) throw new SyntaxError('invalid JSON'); return mapped(chunks[0].text); } };
  const result = await mapDocument({ ai, chunks: [chunks[0]], teacherPrompt: 'Teach this.' });
  assert.equal(calls, 2);
  assert.equal(result.sections.length, 1);
});
