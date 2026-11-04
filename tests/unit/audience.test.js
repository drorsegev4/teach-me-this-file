import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audienceGuidance } from '../../server/src/audience.js';

test('grade formats select appropriate tutor guidance', () => {
  for (const value of ['7th grade', 'grade 7', 'Grade-7', '\u05db\u05d9\u05ea\u05d4 \u05d6', '\u05db\u05ea\u05d4 7']) {
    assert.equal(audienceGuidance(value).level, 'middle school', value);
    assert.equal(audienceGuidance(value).maxWords, 70);
  }
  assert.equal(audienceGuidance('3rd grade').maxWords, 45);
  assert.equal(audienceGuidance('12th grade').maxWords, 100);
  assert.equal(audienceGuidance('university students').maxWords, 120);
  for (const value of ['', 'students', '17th grade', null]) assert.equal(audienceGuidance(value).level, 'unspecified');
});
