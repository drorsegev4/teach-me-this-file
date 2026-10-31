import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI, ProviderError } from '../../server/src/ai.js';

const savedPlan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));

async function withServer(ai, run) {
  const server = createApp({ ai }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    server.close();
  }
}

const post = (base, body = {}) => fetch(`${base}/api/lessons`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('returns the checked plan with rules and steps', async () => {
  const ai = createMockAI(savedPlan);
  await withServer(ai, async base => {
    const response = await post(base);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.rules, savedPlan.rules);
    assert.equal(data.steps.length, savedPlan.steps.length);
  });
});

test('reuses the shared plan until a fresh one is asked for', async () => {
  const ai = createMockAI(savedPlan);
  await withServer(ai, async base => {
    await post(base);
    await post(base);
    assert.equal(ai.inputs.length, 1);
    await post(base, { fresh: true });
    assert.equal(ai.inputs.length, 2);
  });
});

test('concurrent requests share one model call', async () => {
  const ai = createMockAI(savedPlan);
  await withServer(ai, async base => {
    await Promise.all([post(base), post(base), post(base)]);
    assert.equal(ai.inputs.length, 1);
  });
});

test('reports a provider failure without leaking details', async () => {
  const ai = { planLesson: async () => { throw new ProviderError('Groq request failed (401).'); } };
  await withServer(ai, async base => {
    const response = await post(base);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Groq request failed (401).' });
  });
});

test('reports a refused plan with the reason', async () => {
  const refusal = { rules: savedPlan.rules, steps: [], error: 'The file has no teachable text.' };
  await withServer(createMockAI(refusal), async base => {
    const response = await post(base);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'The file has no teachable text.' });
  });
});

test('rejects unexpected request fields', async () => {
  await withServer(createMockAI(savedPlan), async base => {
    const response = await post(base, { prompt: 'anything' });
    assert.equal(response.status, 400);
  });
});
