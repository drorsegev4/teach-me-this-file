import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI } from '../../server/src/ai.js';
import { createChatService, ChatError } from '../../server/src/chat.js';
import { buildDraft } from './helpers/draft.js';

const plan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));
const understood = 'Water turns into vapor at the surface of the liquid';
const keepGoing = 'no idea';
const offFile = 'What is the weather like today?';

function service({ delayMs = 0 } = {}) {
  const ai = createMockAI(plan, { delayMs });
  // The teacher's draft is already built: chat tests start a lesson from it.
  const store = { getDraft: async () => ({ rules: plan.rules, steps: plan.steps }) };
  return { ai, chat: createChatService({ ai, store }) };
}

const noAttempt = "I don't know";

test('a turn with no answer climbs the ladder the same as a wrong answer', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  let state;
  for (let i = 0; i < 3; i++) state = await chat.turn({ type: 'message', text: noAttempt });
  assert.equal(state.attemptsPerStep['step-1'], 3);
  assert.equal(state.messages.at(-1).attempt, 3);
  assert.equal(state.needsChoice, false);
  state = await chat.turn({ type: 'message', text: noAttempt });
  assert.equal(state.attemptsPerStep['step-1'], 4);
  assert.equal(state.needsChoice, true);
});

test('move on is refused before the fourth try on a step', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  await chat.turn({ type: 'message', text: keepGoing });
  await assert.rejects(chat.turn({ type: 'move_on' }), error => error instanceof ChatError && error.status === 409);
});

test('move on marks the step as moved on, not completed, and advances', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  for (let i = 0; i < 4; i++) await chat.turn({ type: 'message', text: keepGoing });
  const state = await chat.turn({ type: 'move_on' });
  assert.deepEqual(state.completedStepIds, []);
  assert.deepEqual(state.movedOnStepIds, ['step-1']);
  assert.equal(state.currentStepId, 'step-2');
  assert.equal(state.studentProgress['step-1'].outcome, 'wrong');
  assert.equal(state.messages.at(-1).status, 'moved_on');
  assert.equal(state.messages.at(-1).stepId, 'step-2');
});

test('move on after no-answer turns records no_answer', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  for (let i = 0; i < 4; i++) await chat.turn({ type: 'message', text: noAttempt });
  const state = await chat.turn({ type: 'move_on' });
  assert.equal(state.studentProgress['step-1'].outcome, 'no_answer');
});

test('an understood step records the understood outcome', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  const state = await chat.turn({ type: 'message', text: understood });
  assert.equal(state.studentProgress['step-1'].outcome, 'understood');
  assert.deepEqual(state.completedStepIds, ['step-1']);
});

test('start opens the first step with its source quote', async () => {
  const { chat } = service();
  const state = await chat.turn({ type: 'start' });
  assert.equal(state.currentStepId, 'step-1');
  assert.deepEqual(state.completedStepIds, []);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].role, 'tutor');
  assert.equal(state.messages[0].quote, plan.steps[0].source);
});

test('a correct answer completes the step and moves on', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  const state = await chat.turn({ type: 'message', text: understood });
  assert.deepEqual(state.completedStepIds, ['step-1']);
  assert.equal(state.currentStepId, 'step-2');
});

test('a wrong answer keeps the step open and records no progress', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  const state = await chat.turn({ type: 'message', text: keepGoing });
  assert.deepEqual(state.completedStepIds, []);
  assert.equal(state.currentStepId, 'step-1');
  assert.equal(state.messages.at(-1).role, 'tutor');
  assert.equal(state.attemptsPerStep['step-1'], 1);
  assert.equal(state.messages.at(-1).attempt, 1);
});

test('wrong answers climb the attempt ladder and reset on the next step', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  await chat.turn({ type: 'message', text: keepGoing });
  const second = await chat.turn({ type: 'message', text: keepGoing });
  assert.equal(second.messages.at(-1).attempt, 2);
  assert.equal(second.attemptsPerStep['step-1'], 2);
  const advanced = await chat.turn({ type: 'message', text: understood });
  assert.equal(advanced.currentStepId, 'step-2');
  assert.equal(advanced.attemptsPerStep['step-2'], 0);
  assert.equal(advanced.attemptsPerStep['step-1'], 2);
});

test('no_attempt and off_file do not count as wrong answers', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  const state = await chat.turn({ type: 'message', text: offFile });
  assert.equal(state.attemptsPerStep['step-1'], 0);
});

test('an off-file question is declined and does not move the lesson', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  const state = await chat.turn({ type: 'message', text: offFile });
  assert.equal(state.currentStepId, 'step-1');
  assert.match(state.messages.at(-1).text, /outside this material/);
});

test('finishing the last step completes the lesson', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  let state;
  for (let i = 0; i < plan.steps.length; i++) state = await chat.turn({ type: 'message', text: understood });
  assert.equal(state.lessonComplete, true);
  assert.equal(state.currentStepId, null);
  assert.equal(state.completedStepIds.length, plan.steps.length);
  await assert.rejects(chat.turn({ type: 'message', text: understood }), ChatError);
});

test('a stopped reply commits nothing', async () => {
  const { chat } = service({ delayMs: 5 });
  await chat.turn({ type: 'start' });
  const before = (await chat.turn({ type: 'message', text: keepGoing })).messages.length;
  const controller = new AbortController();
  await assert.rejects(chat.turn({
    type: 'message', text: understood, signal: controller.signal,
    onChunk: () => controller.abort(),
  }));
  const state = await chat.turn({ type: 'message', text: keepGoing });
  assert.equal(state.messages.length, before + 2);
  assert.equal(state.currentStepId, 'step-1');
});

test('a second turn while one is running is refused', async () => {
  const { chat } = service({ delayMs: 20 });
  const first = chat.turn({ type: 'start' });
  await assert.rejects(chat.turn({ type: 'start' }), error => error instanceof ChatError && error.status === 409);
  await first;
});

test('a message before a lesson starts is refused', async () => {
  const { chat } = service();
  await assert.rejects(chat.turn({ type: 'message', text: understood }), error => error.status === 409);
});

test('streams chunks and ends with the full state over HTTP', async () => {
  const ai = createMockAI(plan, { delayMs: 0 });
  const server = createApp({ ai }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await buildDraft(base);
    const response = await fetch(`${base}/api/chat/turn`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'start' }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /event: chunk/);
    assert.match(text, /event: done/);
    const state = await fetch(`${base}/api/chat`).then(r => r.json());
    assert.equal(state.currentStepId, 'step-1');
  } finally {
    server.close();
  }
});

test('typing after the choice re-asks from rung 3 and shows the choice again only after another try', async () => {
  const { chat } = service();
  await chat.turn({ type: 'start' });
  for (let i = 0; i < 4; i++) await chat.turn({ type: 'message', text: keepGoing });
  let state = await chat.turn({ type: 'message', text: keepGoing });
  assert.equal(state.messages.at(-1).attempt, 3);
  assert.equal(state.needsChoice, false);
  state = await chat.turn({ type: 'message', text: keepGoing });
  assert.equal(state.messages.at(-1).attempt, 4);
  assert.equal(state.needsChoice, true);
});

test('stopping a reply over HTTP aborts it and leaves the lesson state unchanged', async () => {
  const ai = createMockAI(plan, { delayMs: 40 });
  const server = createApp({ ai }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const root = `http://127.0.0.1:${server.address().port}`;
  const base = `${root}/api/chat`;
  const post = (body, signal) => fetch(`${base}/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  try {
    await buildDraft(root);
    await (await post({ type: 'start' })).text();
    await (await post({ type: 'message', text: keepGoing })).text();
    const before = await (await fetch(base)).json();

    const controller = new AbortController();
    const response = await post({ type: 'message', text: keepGoing }, controller.signal);
    const reader = response.body.getReader();
    await reader.read();
    controller.abort();
    await assert.rejects(reader.read(), { name: 'AbortError' });
    await new Promise(resolve => setTimeout(resolve, 200));

    const after = await (await fetch(base)).json();
    assert.deepEqual(after.attemptsPerStep, before.attemptsPerStep);
    assert.equal(after.messages.length, before.messages.length);
    assert.equal(after.currentStepId, before.currentStepId);

    const next = await (await post({ type: 'message', text: understood })).text();
    assert.match(next, /event: done/);
  } finally {
    server.close();
  }
});
