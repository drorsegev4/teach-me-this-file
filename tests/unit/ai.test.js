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
    assert.match(error.message, /rejected the API key/);
    assert.ok(!error.message.includes('secret'));
    return true;
  });
});

test('rejects a truncated response', async () => {
  const { fetchImpl } = fakeFetch(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] });
  const ai = createAI({ apiKey: 'k', fetchImpl });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), ProviderError);
});

test('a 401 from Groq says the key was rejected and never echoes the provider body', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: 'Invalid API Key sk-secret' } }), { status: 401 });
  const ai = createAI({ apiKey: 'sk-secret', fetchImpl });
  await assert.rejects(ai.classify({ studentText: 'x' }), error => /rejected the API key/.test(error.message) && !error.message.includes('sk-secret'));
  await assert.rejects(ai.replyStream({ rules: {}, step: { title: 't', source: 's' }, onChunk() {} }), error => /rejected the API key/.test(error.message));
});

const rateLimited = retryAfter => new Response('{}', { status: 429, headers: retryAfter ? { 'retry-after': retryAfter } : {} });
const okPlan = () => new Response(JSON.stringify(completion(plan)), { status: 200 });

test('a 429 with a short Retry-After is retried once and then succeeds', async () => {
  const replies = [rateLimited('1'), okPlan()];
  let calls = 0;
  const ai = createAI({ apiKey: 'k', fetchImpl: async () => { calls += 1; return replies.shift(); } });
  const result = await ai.planLesson({ text: 'doc', teacherPrompt: 'p' });
  assert.equal(calls, 2);
  assert.equal(result.steps.length, 1);
});

test('a 429 with a long Retry-After is not retried and says how long to wait', async () => {
  let calls = 0;
  const ai = createAI({ apiKey: 'k', fetchImpl: async () => { calls += 1; return rateLimited('60'); } });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), error => /rate-limiting this key.*about 60 seconds/.test(error.message));
  assert.equal(calls, 1);
});

test('a 429 without Retry-After is reported once with a generic wait', async () => {
  let calls = 0;
  const ai = createAI({ apiKey: 'k', fetchImpl: async () => { calls += 1; return rateLimited(); } });
  await assert.rejects(ai.classify({ studentText: 'x' }), error => /rate-limiting this key\. Wait a minute/.test(error.message));
  assert.equal(calls, 1);
});

test('repeated 429s stop after two retries and are reported', async () => {
  let calls = 0;
  const ai = createAI({ apiKey: 'k', fetchImpl: async () => { calls += 1; return rateLimited('1'); } });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), error => /rate-limiting/.test(error.message));
  assert.equal(calls, 3);
});
