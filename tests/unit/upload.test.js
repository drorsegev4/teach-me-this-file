import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI, ProviderError } from '../../server/src/ai.js';
import { sampleText } from '../../server/src/sample.js';
import { makeDocx } from './helpers/docx.js';

const savedPlan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));

async function withServer(run, ai = createMockAI(savedPlan)) {
  const server = createApp({ ai }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function upload(base, { prompt, file, part, headers = {} }) {
  const form = new FormData();
  if (prompt !== undefined) form.append('prompt', prompt);
  if (part !== undefined) form.append('part', String(part));
  if (file) form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return fetch(`${base}/api/lessons/build`, { method: 'POST', headers, body: form });
}

const goodPrompt = 'Teach this to 7th graders, in French. Be Socratic.';

test('build rejects an empty goal but accepts a very short one', async () => {
  await withServer(async base => {
    const empty = await upload(base, { prompt: '   ', file: await sampleFile() });
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /up to 1500 characters/);
    const short = await upload(base, { prompt: 'Teach this', file: await sampleFile() });
    assert.equal(short.status, 200);
  });
});

test('build rejects a file that is not a PDF or DOCX', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: { name: 'notes.txt', type: 'text/plain', bytes: 'hello world' } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Attach one PDF or DOCX file.');
  });
});

test('build rejects a request without a file', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt });
    assert.equal(response.status, 400);
  });
});

test('rejects a malformed API key header without echoing it', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/health`, { headers: { 'X-AI-Api-Key': 'bad key with spaces' } });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.equal(text.includes('bad key'), false);
  });
});

// A stand-in that records every mapped chunk and chooses evidence from the document end.
function planFromText() {
  const mapped = [];
  const planned = [];
  return {
    mapped, planned,
    async mapMaterial({ text }) {
      mapped.push(text);
      const lines = text.split('\n').filter(Boolean);
      return { heading: 'Section topic', summary: 'A section of the document.', quotes: [...new Set([lines[0], lines.at(-1)])] };
    },
    async planLesson(input) {
      planned.push(input);
      const quotes = input.documentMap ? input.documentMap.sections.flatMap(section => section.quotes) : input.text.split('\n');
      const selected = [...new Set([quotes[0], quotes.at(-1)])];
      return { rules: savedPlan.rules, steps: selected.map((source, index) => ({ title: 'Idea ' + index, source })), error: null,
        introduction: { title: 'Document lesson', documentOverview: 'An overview spanning the document.', overview: 'A focused lesson.' } };
    },
  };
}

async function longFile() {
  const filler = Array.from({ length: 220 }, (_, i) => `Filler paragraph ${i} about something unrelated to the lesson, repeated to make the file long.`);
  const bytes = await makeDocx(['The opening topic is about learning from experience.', ...filler, 'The final topic concerns memory retrieval after a long delay.']);
  return { name: 'long.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes };
}

test('whole-document preparation maps the end as well as the beginning without a part selector', async () => {
  const ai = planFromText();
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await longFile() });
    assert.equal(response.status, 200);
    const built = await response.json();
    assert.ok(built.steps.length >= 1 && built.steps.length <= 3);
    assert.equal(built.material.wholeDocument, true);
    assert.equal(Object.hasOwn(built.material, 'parts'), false);
    assert.ok(ai.mapped.length > 1);
    assert.match(ai.mapped.at(-1), /final topic concerns memory retrieval/);
    assert.equal(ai.planned[0].documentMap.sections.length, ai.mapped.length);
    assert.equal(ai.planned[0].text, undefined);
    assert.match(built.steps.at(-1).source, /final topic concerns memory retrieval/);
    assert.ok(built.introduction.documentOverview);
  }, ai);
});

test('stale part-selection requests fail explicitly rather than silently preparing a prefix', async () => {
  await withServer(async base => {
    for (const part of [1, 999, 'abc']) {
      const response = await upload(base, { prompt: goodPrompt, file: await sampleFile(), part });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Section selection is no longer needed/);
    }
  });
});

test('a failed late mapping call prevents publication of a partial lesson', async () => {
  const ai = planFromText();
  const originalMap = ai.mapMaterial;
  let calls = 0;
  ai.mapMaterial = async input => { if (++calls === 2) throw new ProviderError('Gemini is temporarily unavailable.'); return originalMap(input); };
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await longFile() });
    assert.equal(response.status, 502);
    assert.equal(ai.planned.length, 0);
    const published = await fetch(base + '/api/lessons/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(published.status, 409);
  }, ai);
});

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sampleFile = async () => ({ name: 'lesson.docx', type: docxType, bytes: await makeDocx(sampleText.split(/\n+/).filter(Boolean)) });

test('a provider failure on build is reported without leaking details', async () => {
  const ai = { planLesson: async () => { throw new ProviderError('Gemini request failed (401).'); } };
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await sampleFile() });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Gemini request failed (401).' });
  }, ai);
});

test('a refusal on a file with almost no readable text says how little was read', async () => {
  const refusal = { rules: savedPlan.rules, steps: [], error: 'The material has nothing to teach.' };
  await withServer(async base => {
    const bytes = await makeDocx(['Exercise 1', 'Given the matrices']);
    const response = await upload(base, { prompt: goodPrompt, file: { name: 'exercise.docx', type: docxType, bytes } });
    assert.equal(response.status, 422);
    const { error } = await response.json();
    assert.match(error, /^The material has nothing to teach\. Only about 5 words could be read from this file\./);
    assert.match(error, /formulas and matrices are not read/);
  }, createMockAI(refusal));
});

test('a plan the model refuses is reported with its reason', async () => {
  const refusal = { rules: savedPlan.rules, steps: [], error: 'The file has no teachable text.' };
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await sampleFile() });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /^The file has no teachable text./);
  }, createMockAI(refusal));
});
