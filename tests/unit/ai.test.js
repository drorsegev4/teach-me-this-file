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

test('sends the key in the header and the schema to Gemini', async () => {
  const { fetchImpl, calls } = fakeFetch(200, completion(plan));
  const ai = createAI({ apiKey: 'test-key', fetchImpl });
  const result = await ai.planLesson({ text: 'doc', teacherPrompt: 'prompt' });
  assert.deepEqual(result, plan);
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
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

test('a 401 from Gemini says the key was rejected and never echoes the provider body', async () => {
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

test('a 429 with a very long Retry-After says the allowance is used up, in minutes, with the way out', async () => {
  const ai = createAI({ apiKey: 'k', fetchImpl: async () => rateLimited('1576') });
  await assert.rejects(ai.planLesson({ text: 'doc', teacherPrompt: 'p' }), error => /used its allowance/.test(error.message) && /about 27 minutes/.test(error.message) && /quota and billing/.test(error.message) && !/1576/.test(error.message));
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


test('model override is used by structured calls and streaming replies', async () => {
  const bodies = [];
  const ai = createAI({ apiKey: 'test', model: 'gemini-custom', fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (!body.stream) return okPlan();
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n');
  } });
  await ai.planLesson({ text: 'doc', teacherPrompt: 'p' });
  const chunks = [];
  assert.equal(await ai.replyStream({ rules: {}, step: { title: 't', source: 's' }, onChunk: chunk => chunks.push(chunk) }), 'Hello');
  assert.deepEqual(chunks, ['Hello']);
  assert.ok(bodies.every(body => body.model === 'gemini-custom'));
});

test('Gemini permission errors are safe and actionable', async () => {
  const { fetchImpl } = fakeFetch(403, { error: { message: 'secret request' } });
  await assert.rejects(createAI({ apiKey: 'k', fetchImpl }).classify({}), error =>
    error instanceof ProviderError && /Settings/.test(error.message) && !/secret/.test(error.message));
});

test('stream requires a completion marker or a successful finish reason', async () => {
  const text = 'data: {"choices":[{"delta":{"content":"A reply."}}]}\n\n';
  for (const ending of ['', 'data: [DONE]\n\n', 'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n',
    'data: {"choices":[{"finish_reason":"length","delta":{}}]}\n\n']) {
    const ai = createAI({ apiKey: 'test', fetchImpl: async () => new Response(text + ending) });
    const reply = ai.replyStream({ rules: {}, step: { title: 't', source: 's' }, onChunk() {} });
    if (!ending || ending.includes('length')) await assert.rejects(reply, ProviderError);
    else assert.equal(await reply, 'A reply.');
  }
});

test('Stop remains an abort rather than an incomplete-stream error', async () => {
  const controller = new AbortController();
  const ai = createAI({ apiKey: 'test', fetchImpl: async () =>
    new Response('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n') });
  await assert.rejects(ai.replyStream({ rules: {}, step: { title: 't', source: 's' },
    signal: controller.signal, onChunk() { controller.abort(); } }), { name: 'AbortError' });
});


test('the tutor receives the current and next understanding goals', async () => {
  let payload;
  const ai = createAI({ apiKey: 'test', fetchImpl: async (_url, init) => {
    payload = JSON.parse(JSON.parse(init.body).messages[1].content);
    return new Response('data: {"choices":[{"delta":{"content":"A short reply."}}]}\n\ndata: [DONE]\n\n');
  } });
  await ai.replyStream({ rules: { audience: '7th grade' }, status: 'understood',
    step: { title: 'First', source: 'First source', understandingGoal: 'Explain the connection.' },
    nextStep: { title: 'Second', source: 'Second source', understandingGoal: 'Apply the idea.' }, onChunk() {} });
  assert.equal(payload.understandingGoal, 'Explain the connection.');
  assert.equal(payload.nextStep.understandingGoal, 'Apply the idea.');
  assert.equal(payload.audienceGuidance.level, 'middle school');
});


test('mapping uses its schema and final planning sends the map without the full raw document', async () => {
  const mapped = { heading: 'Late topic', summary: 'A source-based map.', quotes: ['The final page matters.'] };
  const { fetchImpl, calls } = fakeFetch(200, completion(mapped));
  const ai = createAI({ apiKey: 'test-key', fetchImpl });
  assert.deepEqual(await ai.mapMaterial({ text: 'The final page matters.', teacherPrompt: 'Teach this.' }), mapped);
  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.response_format.json_schema.name, 'document_map');
  const planFetch = fakeFetch(200, completion(plan));
  await createAI({ apiKey: 'k', fetchImpl: planFetch.fetchImpl }).planLesson({ text: 'RAW_DOCUMENT_MUST_NOT_BE_DUPLICATED', documentMap: { sections: [mapped] }, teacherPrompt: 'Teach this.' });
  const input = JSON.parse(JSON.parse(planFetch.calls[0].init.body).messages[1].content);
  assert.deepEqual(input.documentMap.sections, [mapped]);
  assert.equal(Object.hasOwn(input, 'material'), false);
});
