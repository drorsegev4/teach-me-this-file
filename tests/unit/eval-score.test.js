import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreEval } from '../evals/score.js';

const row = (id, expected, actual, mustNeverFail = false) => ({ id, expected, actual, mustNeverFail });

test('a row passes only when every run matches', () => {
  const result = scoreEval([row(1, 'understood', ['understood', 'understood', 'keep_going'])]);
  assert.equal(result.scored[0].passed, false);
  assert.equal(result.passed, 0);
});

test('any understood on a mustNeverFail row fails the whole eval', () => {
  const rows = [
    row(1, 'keep_going', ['keep_going', 'keep_going', 'keep_going'], true),
    row(2, 'keep_going', ['keep_going', 'understood', 'keep_going'], true),
  ];
  const result = scoreEval(rows, { passRate: 0 });
  assert.equal(result.guardViolations, 1);
  assert.equal(result.pass, false);
});

test('overall pass needs at least the pass rate', () => {
  const ten = Array.from({ length: 10 }, (_, i) => row(i + 1, 'off_file', i < 8 ? ['off_file', 'off_file', 'off_file'] : ['keep_going', 'keep_going', 'keep_going']));
  assert.equal(scoreEval(ten).rate, 0.8);
  assert.equal(scoreEval(ten).pass, false);
  const nine = ten.map((item, i) => (i === 9 ? row(10, 'off_file', ['off_file', 'off_file', 'off_file']) : item));
  assert.equal(scoreEval(nine).rate, 0.9);
  assert.equal(scoreEval(nine).pass, true);
});

test('an error in any run counts as a failed run', () => {
  const result = scoreEval([row(1, 'understood', ['understood', 'error: timeout', 'understood'])]);
  assert.equal(result.passed, 0);
});
