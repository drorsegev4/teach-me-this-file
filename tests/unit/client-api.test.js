import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getChat } from '../../client/src/api.js';

test('chat loading treats 204 as empty without trying to parse JSON', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await getChat('test-session'), null);
});

test('chat loading preserves existing state', async t => {
  const state = { messages: [], currentStepId: 'step-1' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(state));
  assert.deepEqual(await getChat('test-session'), state);
});

test('a genuinely missing chat route is reported rather than hidden as empty', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Not Found', { status: 404 }));
  await assert.rejects(getChat('test-session'), /Could not load the lesson/);
});
