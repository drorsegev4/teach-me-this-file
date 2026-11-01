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

function upload(base, { prompt, file, headers = {} }) {
  const form = new FormData();
  if (prompt !== undefined) form.append('prompt', prompt);
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

test('a document far over the budget builds from its start and the response says what was left out', async () => {
  const sample = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');
  const filler = Array.from({ length: 3000 }, (_, i) => `Filler paragraph ${i} about something unrelated to the lesson, repeated to make the file long.`);
  const bytes = await makeDocx([...sample.split(/\n+/).filter(Boolean), ...filler]);
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: { name: 'long.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes } });
    assert.equal(response.status, 200);
    const built = await response.json();
    assert.equal(built.steps.length > 0, true);
    assert.equal(built.material.truncated, true);
    assert.ok(built.material.usedPercent > 0 && built.material.usedPercent < 50);
    assert.ok(built.material.estimatedTokens <= 4000);
  });
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
