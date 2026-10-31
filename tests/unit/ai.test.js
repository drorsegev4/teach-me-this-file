import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAI, ProviderError } from '../../server/src/ai.js';

const plan = {
  rules: { language: 'English', audience: '7th grade', timeLimit: null, method: 'direct explanation' },
  steps: [{ title: 'Hook', source: 'Evaporation is the change' }],
  error: null,
};

function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

const completion = content => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });

test('sends the key in the header and the schema to Groq', async () => {
  const { fetchImpl, calls } = fakeFetch(200, completion(plan));
  const ai = createAI({ apiKey: 'test-key', fetchImpl });
  const result = await ai.planLesson({ text: 'doc', teacherPrompt: 'prompt' });
  assert.deepEqual(result, plan);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
});

test('refuses to call the provider without a key', async () => {
  const ai = createAI({ apiKey: '', fetchImpl: () => assert.fail('should not call') });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), ProviderError);
});

test('returns a safe error and never the provider body on HTTP failure', async () => {
  const { fetchImpl } = fakeFetch(401, { error: { message: 'secret echo of request' } });
  const ai = createAI({ apiKey: 'bad', fetchImpl });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), error => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.message, 'Groq request failed (401).');
    return true;
  });
});

test('rejects a truncated response', async () => {
  const { fetchImpl } = fakeFetch(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] });
  const ai = createAI({ apiKey: 'k', fetchImpl });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), ProviderError);
});
