import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI } from '../../server/src/ai.js';
import { createChatService } from '../../server/src/chatService.js';
import { createPlanStore } from '../../server/src/planStore.js';
import { sampleText } from '../../server/src/sample.js';
import { buildDraft } from './helpers/draft.js';
import { remember } from '../../server/src/session.js';

const plan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));
const understood = 'Water turns into vapor at the surface of the liquid';
const teacher = 'teacher-session-1';
const studentA = 'student-session-a';
const studentB = 'student-session-b';

function service(delayMs = 0) {
  const ai = createMockAI(plan, { delayMs });
  const store = { getDraft: async () => ({ rules: plan.rules, steps: plan.steps }) };
  return { ai, chat: createChatService({ ai, store }) };
}

async function withServer(run, { delayMs = 0, responsePlan = plan } = {}) {
  const server = createApp({ ai: createMockAI(responsePlan, { delayMs }) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { session, body } = {}) => fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Session-Id': session } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    await run(call, base);
  } finally {
    server.close();
  }
}

// Reads a chat turn's server-sent events and returns the final state.
async function turn(call, session, body) {
  const text = await (await call('/api/chat/turn', { session, body })).text();
  const done = /event: done\ndata: (.*)\n/.exec(text);
  if (!done) throw new Error(`turn failed: ${text}`);
  return JSON.parse(done[1]);
}

test('two sessions keep their own progress', async () => {
  const { chat } = service();
  await chat.turn({ key: 'a', type: 'start' });
  await chat.turn({ key: 'b', type: 'start' });
  await chat.turn({ key: 'a', type: 'message', text: understood });
  assert.equal(chat.view('a').completedStepIds.length, 1);
  assert.equal(chat.view('b').completedStepIds.length, 0);
  assert.equal(chat.view('c'), null);
});

test('a reply running in one session does not block another', async () => {
  const { chat } = service(20);
  await chat.turn({ key: 'a', type: 'start' });
  await chat.turn({ key: 'b', type: 'start' });
  const [first, second] = await Promise.all([
    chat.turn({ key: 'a', type: 'message', text: understood }),
    chat.turn({ key: 'b', type: 'message', text: understood }),
  ]);
  assert.equal(first.completedStepIds.length, 1);
  assert.equal(second.completedStepIds.length, 1);
});

test('publish needs a draft, returns the same link twice, and keeps the plan as published', async () => {
  const ai = createMockAI([plan, { ...plan, steps: plan.steps.slice(0, 2) }]);
  const store = createPlanStore({ ai });
  assert.equal(await store.publish({ key: 'nobody' }), null);
  await store.build({ key: 'teacher', text: sampleText, teacherPrompt: 'Teach this to 7th graders' });
  const id = await store.publish({ key: 'teacher' });
  assert.equal(await store.publish({ key: 'teacher' }), id);
  assert.equal(store.getPublished(id).steps.length, plan.steps.length);
  // The teacher rebuilds a shorter lesson; the published one does not change, and a new publish gets a new link.
  await store.build({ key: 'teacher', text: sampleText, teacherPrompt: 'Teach this to 7th graders' });
  assert.equal(store.getPublished(id).steps.length, plan.steps.length);
  assert.notEqual(await store.publish({ key: 'teacher' }), id);
});

test('a refused draft cannot be published', async () => {
  const store = createPlanStore({ ai: createMockAI({ rules: plan.rules, steps: [], error: 'No teachable content.' }) });
  await store.build({ key: 'teacher', text: sampleText, teacherPrompt: 'Teach this to 7th graders' });
  assert.equal(await store.publish({ key: 'teacher' }), null);
});

test('the oldest entries are dropped past the limit and the newest kept', () => {
  const map = new Map();
  for (const key of ['a', 'b', 'c']) remember(map, key, key, 2);
  assert.deepEqual([...map.keys()], ['b', 'c']);
  remember(map, 'b', 'b', 2);
  remember(map, 'd', 'd', 2);
  assert.deepEqual([...map.keys()], ['b', 'd']);
});

test('publish over HTTP: 409 without a draft, then a link a student can open and play', async () => {
  await withServer(async (call, base) => {
    assert.equal((await call('/api/lessons/publish', { session: teacher, body: {} })).status, 409);

    await buildDraft(base, teacher);
    const { id } = await (await call('/api/lessons/publish', { session: teacher, body: {} })).json();
    assert.match(id, /^[\w-]{4,32}$/);

    // The landing info has the rules and step count, and nothing from the file.
    const info = await (await call(`/api/lessons/${id}`)).json();
    assert.equal(info.stepCount, plan.steps.length);
    assert.deepEqual(info.rules, plan.rules);
    assert.equal(JSON.stringify(info).includes(plan.steps[0].source), false);

    const started = await turn(call, studentA, { type: 'start', lessonId: id });
    assert.equal(started.currentStepId, 'step-1');
    await turn(call, studentA, { type: 'message', text: understood });

    // A second student and the teacher are unaffected.
    const other = await turn(call, studentB, { type: 'start', lessonId: id });
    assert.equal(other.completedStepIds.length, 0);
    const mine = await (await call('/api/chat', { session: studentA })).json();
    assert.equal(mine.completedStepIds.length, 1);
    assert.equal((await call('/api/chat', { session: teacher })).status, 204);
  });
});

test('an unknown or malformed lesson link is refused', async () => {
  await withServer(async call => {
    assert.equal((await call('/api/lessons/doesnotexist')).status, 404);
    const response = await call('/api/chat/turn', { session: studentA, body: { type: 'start', lessonId: 'nope-nope' } });
    assert.match(await response.text(), /not available/);
    assert.equal((await call('/api/chat/turn', { session: studentA, body: { type: 'start', lessonId: '../etc' } })).status, 400);
  });
});

test('an invalid session id is refused and a missing one uses the shared session', async () => {
  await withServer(async call => {
    assert.equal((await call('/api/chat', { session: 'short' })).status, 400);
    assert.equal((await call('/api/chat')).status, 204);
  });
});

test('starting without a built lesson is refused instead of teaching a sample lesson', async () => {
  const chat = createChatService({ ai: createMockAI(plan), store: { getDraft: async () => null } });
  await assert.rejects(chat.turn({ type: 'start' }), error => error.status === 409 && /Build a lesson first/.test(error.message));
  const store = createPlanStore({ ai: createMockAI(plan) });
  assert.equal(store.getDraft('nobody'), null);
});


test('published welcome exposes the prepared overview and topics without starting chat or leaking sources', async () => {
  const introduction = { title: 'Where water goes', documentOverview: 'The document connects water changes to their surrounding conditions.', overview: 'Water can change from liquid into vapor. We will explore what changes how quickly this happens.' };
  const responsePlan = { ...plan, introduction };
  await withServer(async (call, base) => {
    await buildDraft(base, teacher);
    const { id } = await (await call('/api/lessons/publish', { session: teacher, body: {} })).json();
    const info = await (await call('/api/lessons/' + id)).json();
    assert.deepEqual(info.introduction, introduction);
    assert.deepEqual(info.topics, plan.steps.map(step => step.title));
    assert.equal(info.stepCount, plan.steps.length);
    assert.equal(Object.hasOwn(info, 'steps'), false);
    assert.equal(JSON.stringify(info).includes(plan.steps[0].source), false);
    assert.equal((await call('/api/chat', { session: studentA })).status, 204);
    const started = await turn(call, studentA, { type: 'start', lessonId: id });
    assert.equal(started.currentStepId, 'step-1');
    assert.deepEqual(started.completedStepIds, []);
    assert.equal(started.messages.length, 1);
  }, { responsePlan });
});
