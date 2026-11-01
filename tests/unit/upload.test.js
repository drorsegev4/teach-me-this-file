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

test('build rejects a prompt under 20 characters', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: 'Too short', file: { name: 'a.txt', type: 'text/plain', bytes: 'hello' } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /20 to 1500 characters/);
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
    const response = await fetch(`${base}/api/health`, { headers: { 'X-Groq-Api-Key': 'bad key with spaces' } });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.equal(text.includes('bad key'), false);
  });
});

// A model stand-in that builds a plan from the text it is given, so each part gets a plan quoted from that part.
function planFromText() {
  const seen = [];
  return {
    seen,
    async planLesson({ text }) {
      seen.push(text);
      const quotes = text.split('\n').filter(line => line.split(/\s+/).length >= 6).slice(0, 3);
      return { rules: savedPlan.rules, steps: quotes.map((source, index) => ({ title: `Step ${index + 1}`, source })), error: null };
    },
  };
}

async function longFile() {
  const filler = Array.from({ length: 3000 }, (_, i) => `Filler paragraph ${i} about something unrelated to the lesson, repeated to make the file long.`);
  const bytes = await makeDocx(filler);
  return { name: 'long.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes };
}

test('a long document is split into parts, and the first part builds a lesson with the list of parts', async () => {
  const ai = planFromText();
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await longFile() });
    assert.equal(response.status, 200);
    const built = await response.json();
    assert.equal(built.steps.length, 3);
    assert.ok(built.material.partCount > 1);
    assert.equal(built.material.partIndex, 0);
    assert.equal(built.material.parts.length, built.material.partCount);
    assert.ok(built.material.estimatedTokens <= 4000);
  }, ai);
});

test('choosing another part builds the lesson from that part of the file', async () => {
  const ai = planFromText();
  await withServer(async base => {
    const file = await longFile();
    const first = await (await upload(base, { prompt: goodPrompt, file })).json();
    const second = await (await upload(base, { prompt: goodPrompt, file, part: 1 })).json();
    assert.equal(second.material.partIndex, 1);
    assert.equal(second.material.partCount, first.material.partCount);
    assert.notEqual(ai.seen[0], ai.seen[1]);
    assert.ok(!ai.seen[1].includes(ai.seen[0].split('\n')[0]));
    assert.notEqual(second.steps[0].source, first.steps[0].source);
  }, ai);
});

test('a part that does not exist is refused with how many parts there are', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await longFile(), part: 999 });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /This file has \d+ parts\. Choose one of them\./);
    assert.equal((await upload(base, { prompt: goodPrompt, file: await longFile(), part: 'abc' })).status, 400);
  }, planFromText());
});

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sampleFile = async () => ({ name: 'lesson.docx', type: docxType, bytes: await makeDocx(sampleText.split(/\n+/).filter(Boolean)) });

test('a provider failure on build is reported without leaking details', async () => {
  const ai = { planLesson: async () => { throw new ProviderError('Groq request failed (401).'); } };
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await sampleFile() });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Groq request failed (401).' });
  }, ai);
});

test('a plan the model refuses is reported with its reason', async () => {
  const refusal = { rules: savedPlan.rules, steps: [], error: 'The file has no teachable text.' };
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: await sampleFile() });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'The file has no teachable text.' });
  }, createMockAI(refusal));
});
