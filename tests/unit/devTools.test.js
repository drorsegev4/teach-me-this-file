import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createApp } from '../../server/src/app.js';
import { createDevRouter } from '../../server/src/devTools.js';
import { createMockAI } from '../../server/src/ai.js';

const plan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));
const material = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');

function devServer(ai, directory) {
  const app = express();
  app.use('/api/dev', express.json({ limit: '1mb' }), createDevRouter({ ai, directory }));
  return app;
}

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/dev`);
  } finally {
    server.close();
  }
}

const call = async (base, method, path, body) => {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
};

test('dev routes are absent when dev tools are off', async () => {
  const app = createApp({ ai: createMockAI(plan), devTools: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dev/status`);
    assert.equal(response.status, 404);
  } finally {
    server.close();
  }
});

test('builds a plan, runs the simulator, saves a test case, and replays it', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scenarios-'));
  await withServer(devServer(createMockAI(plan), directory), async base => {
    const built = await call(base, 'POST', '/plan', { material, teacherPrompt: 'Teach evaporation' });
    assert.equal(built.status, 200);
    assert.equal(built.data.steps.length, plan.steps.length);

    await call(base, 'POST', '/chat', { type: 'start' });
    const answered = await call(base, 'POST', '/chat', { type: 'message', text: 'Water turns into vapor at the surface' });
    assert.deepEqual(answered.data.completedStepIds, ['step-1']);
    assert.equal(answered.data.attemptsPerStep['step-1'], 1);

    const saved = await call(base, 'POST', '/scenarios', { name: 'Right answer advances', expected: 'Moves to step 2' });
    assert.equal(saved.status, 201);
    assert.equal(saved.data.verdict, 'pending');
    assert.equal(readdirSync(directory).length, 1);

    const verdict = await call(base, 'PATCH', `/scenarios/${saved.data.id}`, { verdict: 'pass', note: 'Looks right' });
    assert.equal(verdict.data.verdict, 'pass');
    assert.equal(verdict.data.note, 'Looks right');

    const replay = await call(base, 'POST', `/scenarios/${saved.data.id}/replay`);
    assert.equal(replay.data.error, null);
    assert.equal(replay.data.oldTranscript.length, replay.data.newTranscript.length);
    assert.equal(replay.data.newTranscript.at(-1).role, 'tutor');
  });
});

test('never returns the provider key', async () => {
  process.env.GROQ_API_KEY = 'secret-test-key';
  try {
    await withServer(devServer(createMockAI(plan), mkdtempSync(join(tmpdir(), 'scenarios-'))), async base => {
      const response = await fetch(`${base}/prompts`);
      assert.doesNotMatch(await response.text(), /secret-test-key/);
    });
  } finally {
    delete process.env.GROQ_API_KEY;
  }
});

test('refuses to save a test case before the simulator has run', async () => {
  await withServer(devServer(createMockAI(plan), mkdtempSync(join(tmpdir(), 'scenarios-'))), async base => {
    const response = await call(base, 'POST', '/scenarios', { name: 'Too early', expected: 'Nothing yet' });
    assert.equal(response.status, 409);
  });
});
