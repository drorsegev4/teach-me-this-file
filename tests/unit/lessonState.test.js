import test from 'node:test';
import assert from 'node:assert/strict';
import { beginOperation, commitTurn, createLesson, decideProgress, failOperation } from '../../server/src/lessonState.js';
import { readyLesson, answer, assessment, response, questionAssessment } from './fixtures.js';

test('new lesson has explicit objective, criteria, assistance and empty progress', () => {
  const state = createLesson();
  assert.equal(state.phase, 'ready');
  assert.equal(state.objectives[0].criteria.length, 3);
  assert.equal(state.assistance.level, 'none');
  assert.ok(state.progress.criteria.every(item => item.status === 'unmet'));
  assert.deepEqual(state.messages, []);
});

test('strong independent answer completes without another question', () => {
  const state = readyLesson();
  const op = beginOperation(state, 1, 'answer');
  const result = assessment();
  const decision = decideProgress(state, result, answer);
  assert.equal(decision.action, 'complete');
  commitTurn(state, op, answer, result, decision, response());
  assert.equal(state.phase, 'complete');
  assert.equal(state.progress.completionAttemptId, state.attempts[0].id);
  assert.equal(state.attempts[0].assistance.level, 'none');
  assert.equal(state.revision, 2);
  assert.throws(() => beginOperation(state, 2, 'answer'));
});

test('correctness and completeness are independent; partial answers stay incomplete', () => {
  const state = readyLesson();
  const result = assessment({ completeness: 'partial' });
  result.criteria[2].status = 'unmet';
  result.criteria[2].evidence = [];
  assert.equal(decideProgress(state, result, answer).action, 'help');
});

for (const [label, change] of [
  ['incorrect answer', { correctness: 'incorrect' }],
  ['unresolved misconception', { misconceptions: ['Water disappears.'] }],
  ['unsupported claim', { unsupportedClaims: ['Evaporation produces oxygen.'] }],
  ['echo of supplied answer', { demonstration: 'echo' }],
]) {
  test(`${label} cannot complete`, () => {
    assert.equal(decideProgress(readyLesson(), assessment(change), answer).action, 'help');
  });
}

test('unsupported question preserves progress and pending question, records no attempt', () => {
  const state = readyLesson();
  state.progress.criteria[0].status = 'partial';
  const before = structuredClone(state.progress);
  const question = state.currentQuestion;
  const result = questionAssessment();
  const op = beginOperation(state, 1, 'answer');
  const decision = decideProgress(state, result, answer);
  commitTurn(state, op, answer, result, decision, response({ feedback: 'Our document does not cover that.' }));
  assert.deepEqual(state.progress, before);
  assert.deepEqual(state.currentQuestion, question);
  assert.equal(state.attempts.length, 0);
});

test('identical normalized answer cannot earn new progress or completion', () => {
  const state = readyLesson();
  state.attempts.push({ answer });
  const decision = decideProgress(state, assessment(), { ...answer, text: `  ${answer.text.toUpperCase()}  ` });
  assert.equal(decision.repeated, true);
  assert.equal(decision.action, 'help');
  assert.deepEqual(decision.criteria, state.progress.criteria);
});

test('prior evidence alone cannot complete on a new empty-evidence answer', () => {
  const state = readyLesson();
  assert.equal(decideProgress(state, assessment(), { ...answer, id: 'new-answer' }).action, 'help');
});

test('hinted understanding can complete while retaining degree of assistance', () => {
  const state = readyLesson();
  state.assistance = { level: 'hint', events: [{ level: 'hint', criterionIds: ['surface'], questionId: state.currentQuestion.id }] };
  const result = assessment();
  const decision = decideProgress(state, result, answer);
  const op = beginOperation(state, 1, 'answer');
  commitTurn(state, op, answer, result, decision, response());
  assert.equal(state.progress.complete, true);
  assert.equal(state.attempts[0].assistance.level, 'hint');
});

test('answer revelation requires a fresh question and demonstrated understanding', () => {
  const state = readyLesson();
  state.assistance.events.push({ level: 'answer_revealed', questionId: state.currentQuestion.id });
  assert.equal(decideProgress(state, assessment(), answer).action, 'help');
  state.currentQuestion.id = 'fresh-application';
  assert.equal(decideProgress(state, assessment(), answer).action, 'complete');
  assert.equal(decideProgress(state, assessment({ demonstration: 'echo' }), answer).action, 'help');
});

test('invalid phase, stale revision, busy and duplicate operations are rejected', () => {
  const state = readyLesson();
  assert.throws(() => beginOperation(state, 1, 'teach'));
  assert.throws(() => beginOperation(state, 0, 'answer'));
  const op = beginOperation(state, 1, 'answer');
  assert.throws(() => beginOperation(state, 1, 'answer'));
  const result = assessment();
  commitTurn(state, op, answer, result, decideProgress(state, result, answer), response());
  assert.throws(() => commitTurn(state, op, answer, result, { action: 'complete' }, response()));
});

test('failed operation preserves evidence, messages and revision, and permits retry', () => {
  const state = readyLesson();
  const before = structuredClone(state);
  const op = beginOperation(state, 1, 'answer');
  failOperation(state, op, 'Please retry.');
  assert.deepEqual(state.progress, before.progress);
  assert.deepEqual(state.messages, before.messages);
  assert.equal(state.revision, before.revision);
  assert.equal(state.error, 'Please retry.');
  assert.doesNotThrow(() => beginOperation(state, 1, 'answer'));
});
