import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI } from '../../server/src/ai.js';

const savedPlan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));

async function withServer(run) {
  const server = createApp({ ai: createMockAI(savedPlan) }).listen(0, '127.0.0.1');
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
    const response = await fetch(`${base}/api/lessons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': 'bad key with spaces' }, body: '{}',
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.equal(text.includes('bad key'), false);
  });
});
