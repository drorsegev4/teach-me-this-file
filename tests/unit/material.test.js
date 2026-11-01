import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, PartError, prepareMaterial } from '../../server/src/material.js';

const seg = (page, text) => ({ id: 's', page, text });
const sentence = n => `Sentence number ${n} says something about the topic of the lesson.`;
const lines = (count, start = 0) => Array.from({ length: count }, (_, i) => sentence(start + i)).join('\n');
const longPage = (page, count, start = 0) => seg(page, lines(count, start));
const allParts = (document, options) => {
  const first = prepareMaterial(document, { ...options, part: 0 });
  return Array.from({ length: first.notice.partCount }, (_, part) => prepareMaterial(document, { ...options, part }));
};

test('Hebrew costs more tokens per character than English', () => {
  const english = 'Learning is a process through which an organism acquires new behavior. '.repeat(20);
  const hebrew = 'למידה היא תהליך דרכו האורגניזם רוכש מידע והתנהגות חדשה לאורך זמן. '.repeat(20);
  assert.ok(estimateTokens(hebrew) / hebrew.length > estimateTokens(english) / english.length * 1.3);
});

test('a short document is one part with nothing left out', () => {
  const { text, notice } = prepareMaterial({ segments: [seg(null, 'First paragraph about learning.\nSecond paragraph about memory.')] });
  assert.equal(text, 'First paragraph about learning.\nSecond paragraph about memory.');
  assert.equal(notice.partCount, 1);
  assert.equal(notice.partIndex, 0);
  assert.equal(notice.moreUnread, false);
  assert.equal(notice.removedRepeats, 0);
});

test('a long document becomes parts that each fit the budget and together keep every line in order', () => {
  const document = { segments: [longPage(1, 40), longPage(2, 40, 40), longPage(3, 40, 80)], totalPages: 3 };
  const parts = allParts(document, { budget: 400 });
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(estimateTokens(part.text) <= 400);
  const rejoined = parts.map(part => part.text).join('\n').split('\n');
  assert.deepEqual(rejoined, lines(120).split('\n'));
  assert.equal(parts[0].notice.pagesUsed.from, 1);
  assert.equal(parts.at(-1).notice.pagesUsed.to, 3);
  assert.equal(parts[1].notice.partIndex, 1);
  // Every part sees the same list of parts.
  assert.deepEqual(parts[0].notice.parts, parts[1].notice.parts);
});

test('a part ends before a heading when that leaves it at least half full', () => {
  const body = (n, start) => lines(n, start);
  const text = `Heading One\n${body(12, 0)}\nHeading Two\n${body(12, 100)}\nHeading Three\n${body(12, 200)}`;
  const parts = allParts({ segments: [seg(null, text)] }, { budget: 300 });
  assert.ok(parts.length >= 3);
  for (const part of parts) assert.ok(!/Heading \w+$/.test(part.text), 'no part ends on a heading');
  assert.deepEqual(parts.map(part => part.notice.parts[part.notice.partIndex].label).slice(0, 3), ['Heading One', 'Heading Two', 'Heading Three']);
});

test('the same budget gives Hebrew more and smaller parts than English', () => {
  const english = seg(null, Array.from({ length: 200 }, (_, i) => `Learning is a process of acquiring new behavior from experience, case ${i}.`).join('\n'));
  const hebrew = seg(null, Array.from({ length: 200 }, (_, i) => `למידה היא תהליך של רכישת התנהגות חדשה מתוך ניסיון ותגובה לסביבה, מקרה ${i}.`).join('\n'));
  const e = prepareMaterial({ segments: [english] }, { budget: 500 });
  const h = prepareMaterial({ segments: [hebrew] }, { budget: 500 });
  assert.ok(h.notice.partCount > e.notice.partCount);
  assert.ok(estimateTokens(h.text) <= 500 && estimateTokens(e.text) <= 500);
});

test('spacing added by PDF extraction is collapsed', () => {
  const { text } = prepareMaterial({ segments: [seg(1, 'Lesson   4  -   Learning \n\n\nLearning   -   a  process ')] });
  assert.equal(text, 'Lesson 4 - Learning\nLearning - a process');
});

test('repeated long lines are removed once and counted; short repeats are kept', () => {
  const repeated = 'Classical conditioning means we learn to associate two stimuli that occur in sequence.';
  const { text, notice } = prepareMaterial({ segments: [seg(null, `${repeated}\nIntro\n${repeated}\nIntro\nSomething else.\n${repeated.toUpperCase()}`)] });
  assert.equal(text.split(repeated).length - 1, 1);
  assert.equal(notice.removedRepeats, 2);
  assert.equal(text.split('Intro').length - 1, 2);
});

test('one huge paragraph is split at sentence ends across parts, never dropped', () => {
  const huge = Array.from({ length: 300 }, (_, i) => sentence(i)).join(' ');
  const parts = allParts({ segments: [seg(null, huge)] }, { budget: 300 });
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(estimateTokens(part.text) <= 300);
    assert.ok(part.text.endsWith('lesson.'));
  }
  assert.equal(parts.map(part => part.text).join(' ').split('Sentence number').length - 1, 300);
});

test('one huge unbroken string is split at words, never to nothing', () => {
  const document = { segments: [seg(null, 'word '.repeat(5000).trim())] };
  const first = prepareMaterial(document, { budget: 200 });
  const last = prepareMaterial(document, { budget: 200, part: first.notice.partCount - 1 });
  assert.ok(first.notice.partCount > 1);
  for (const part of [first, last]) {
    assert.ok(part.text.length > 100);
    assert.ok(estimateTokens(part.text) <= 200);
  }
});

test('a PDF that was only partly read says so, even when what was read fits one part', () => {
  const { notice } = prepareMaterial({ segments: [seg(1, 'Page one text.'), seg(2, 'Page two text.')], totalPages: 400, readAll: false });
  assert.equal(notice.moreUnread, true);
  assert.equal(notice.totalPages, 400);
});

test('chunks of the same page are joined without a break, and pages start on a new line', () => {
  const { text } = prepareMaterial({ segments: [seg(1, 'The first half of a sen'), seg(1, 'tence ends here.'), seg(2, 'Page two begins.')] });
  assert.equal(text, 'The first half of a sentence ends here.\nPage two begins.');
});

test('a Word file has no pages in the notice', () => {
  const { notice } = prepareMaterial({ segments: [longPage(null, 100)] }, { budget: 200 });
  assert.equal(notice.pagesUsed, null);
  assert.equal(notice.totalPages, null);
  assert.ok(notice.partCount > 1);
  assert.equal(notice.parts[0].pages, null);
});

test('empty and whitespace-only input gives no parts, not a crash', () => {
  assert.equal(prepareMaterial({ segments: [] }).text, '');
  assert.equal(prepareMaterial({ segments: [] }).notice.partCount, 0);
  assert.equal(prepareMaterial({ segments: [seg(1, '   \n\n  ')] }).text, '');
});

test('asking for a part that does not exist names how many there are', () => {
  const document = { segments: [longPage(null, 100)] };
  const { partCount } = prepareMaterial(document, { budget: 200 }).notice;
  assert.throws(() => prepareMaterial(document, { budget: 200, part: partCount }), error => error instanceof PartError && error.partCount === partCount && /Choose one of them/.test(error.message));
  assert.equal(prepareMaterial(document, { budget: 200, part: partCount - 1 }).notice.partIndex, partCount - 1);
});
