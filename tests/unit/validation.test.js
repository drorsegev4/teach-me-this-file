import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssessment, validateResponse, validateTeaching } from '../../server/src/validation.js';
import { readyLesson, answer, assessment, response, questionAssessment } from './fixtures.js';

test('valid structured assessment is accepted', () => {
  assert.deepEqual(validateAssessment(assessment(), readyLesson(), answer), assessment());
});

for (const [label, mutate] of [
  ['extra properties', value => { value.complete = true; }],
  ['unknown correctness', value => { value.correctness = 'probably'; }],
  ['missing criteria', value => { value.criteria.pop(); }],
  ['duplicate criteria', value => { value.criteria[1].criterionId = 'change'; }],
  ['unknown criterion', value => { value.criteria[0].criterionId = 'invented'; }],
  ['invented student quote', value => { value.criteria[0].evidence[0].quote = 'something never said'; }],
  ['unknown student message', value => { value.criteria[0].evidence[0].messageId = 'missing'; }],
  ['invented source quote', value => { value.criteria[0].sourceRefs[0].quote = 'invented source'; }],
  ['unknown source segment', value => { value.criteria[0].sourceRefs[0].segmentId = 's99'; }],
  ['mastery without evidence', value => { value.criteria[0].evidence = []; }],
  ['mastery without source support', value => { value.criteria[0].sourceRefs = []; }],
  ['inconsistent completeness', value => { value.completeness = 'partial'; }],
  ['correct with misconception', value => { value.misconceptions = ['Wrong physical process']; }],
  ['answer classified as unsupported question', value => { value.questionSupport = 'unsupported'; }],
]) {
  test(`rejects ${label}`, () => {
    const value = assessment();
    mutate(value);
    assert.throws(() => validateAssessment(value, readyLesson(), answer));
  });
}

test('tutor messages cannot be evidence of student understanding', () => {
  const state = readyLesson();
  const value = assessment();
  value.criteria[0].evidence = [{ messageId: state.messages[0].id, quote: 'Water' }];
  assert.throws(() => validateAssessment(value, state, answer));
});

test('question cannot award mastery or be penalized as an unsupported claim', () => {
  assert.doesNotThrow(() => validateAssessment(questionAssessment(), readyLesson(), answer));
  assert.throws(() => validateAssessment({ ...questionAssessment(), criteria: assessment().criteria }, readyLesson(), answer));
  assert.throws(() => validateAssessment({ ...questionAssessment(), unsupportedClaims: ['a question'] }, readyLesson(), answer));
});

test('unsupported claim is retained for application decision, not called a question', () => {
  const value = assessment({ unsupportedClaims: ['Additional unsupported assertion'] });
  assert.equal(validateAssessment(value, readyLesson(), answer).questionSupport, 'not_applicable');
});

test('completion forbids unnecessary follow-up and additional assistance', () => {
  assert.doesNotThrow(() => validateResponse(response(), readyLesson(), { action: 'complete' }));
  assert.throws(() => validateResponse(response({ nextQuestion: { text: 'Again?', criterionIds: ['change'] } }), readyLesson(), { action: 'complete' }));
  assert.throws(() => validateResponse(response({ assistance: 'hint' }), readyLesson(), { action: 'complete' }));
});

test('targeted help requires assistance, valid targets and a question', () => {
  const help = response({ assistance: 'hint', targetCriterionIds: ['surface'], nextQuestion: { text: 'Where can particles escape?', criterionIds: ['surface'] } });
  assert.doesNotThrow(() => validateResponse(help, readyLesson(), { action: 'help' }));
  assert.throws(() => validateResponse({ ...help, nextQuestion: null }, readyLesson(), { action: 'help' }));
  assert.throws(() => validateResponse({ ...help, targetCriterionIds: ['imaginary'] }, readyLesson(), { action: 'help' }));
});

test('pure question preserves pending assessment question', () => {
  assert.throws(() => validateResponse(response({ nextQuestion: { text: 'New question', criterionIds: ['change'] } }), readyLesson(), { action: 'answer_question' }));
});

test('repeated feedback is rejected', () => {
  const state = readyLesson();
  state.messages.push({ role: 'tutor', feedback: 'Try again.' });
  const help = response({ feedback: 'Try again.', assistance: 'hint', targetCriterionIds: ['surface'], nextQuestion: { text: 'Why?', criterionIds: ['surface'] } });
  assert.throws(() => validateResponse(help, state, { action: 'help', repeated: true }));
});

test('initial teaching must cite source and target all criteria', () => {
  const teaching = { explanation: 'An explanation', sourceRefs: [{ segmentId: 's1', quote: 'Evaporation' }], question: { text: 'Explain drying.', criterionIds: ['change'] } };
  assert.throws(() => validateTeaching(teaching, readyLesson()));
});
