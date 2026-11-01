import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, prepareMaterial } from '../../server/src/material.js';

const seg = (page, text) => ({ id: 's', page, text });
const sentence = n => `Sentence number ${n} says something about the topic of the lesson.`;
const longPage = (page, count, start = 0) => seg(page, Array.from({ length: count }, (_, i) => sentence(start + i)).join('\n'));

test('Hebrew costs more tokens per character than English', () => {
  const english = 'Learning is a process through which an organism acquires new behavior. '.repeat(20);
  const hebrew = 'למידה היא תהליך דרכו האורגניזם רוכש מידע והתנהגות חדשה לאורך זמן. '.repeat(20);
  assert.ok(estimateTokens(hebrew) / hebrew.length > estimateTokens(english) / english.length * 1.3);
});

test('a short document passes through whole, with nothing left out', () => {
  const { text, notice } = prepareMaterial({ segments: [seg(null, 'First paragraph about learning.\nSecond paragraph about memory.')] });
  assert.equal(text, 'First paragraph about learning.\nSecond paragraph about memory.');
  assert.equal(notice.truncated, false);
  assert.equal(notice.usedPercent, 100);
  assert.equal(notice.removedRepeats, 0);
});

test('a long document is cut at a line boundary to fit the budget and the notice says so', () => {
  const segments = [longPage(1, 40), longPage(2, 40, 40), longPage(3, 40, 80)];
  const { text, notice } = prepareMaterial({ segments, totalPages: 3 }, { budget: 400 });
  assert.ok(estimateTokens(text) <= 400);
  assert.ok(text.endsWith('lesson.'));
  assert.equal(notice.truncated, true);
  assert.equal(notice.totalPages, 3);
  assert.equal(notice.pagesUsed.from, 1);
  assert.ok(notice.usedPercent > 0 && notice.usedPercent < 100);
  // What is kept is a prefix of the document: nothing from the middle is skipped.
  assert.ok(text.startsWith(sentence(0)));
  assert.ok(!text.includes(sentence(79)));
});

test('the same budget keeps fewer Hebrew characters than English ones', () => {
  const english = seg(null, Array.from({ length: 200 }, (_, i) => `Learning is a process of acquiring new behavior from experience, case ${i}.`).join('\n'));
  const hebrew = seg(null, Array.from({ length: 200 }, (_, i) => `למידה היא תהליך של רכישת התנהגות חדשה מתוך ניסיון ותגובה לסביבה, מקרה ${i}.`).join('\n'));
  const e = prepareMaterial({ segments: [english] }, { budget: 500 });
  const h = prepareMaterial({ segments: [hebrew] }, { budget: 500 });
  assert.ok(h.text.length < e.text.length);
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

test('one huge paragraph is cut at a sentence end instead of dropped', () => {
  const huge = Array.from({ length: 300 }, (_, i) => sentence(i)).join(' ');
  const { text, notice } = prepareMaterial({ segments: [seg(null, huge)] }, { budget: 300 });
  assert.ok(text.length > 0);
  assert.ok(estimateTokens(text) <= 300);
  assert.ok(text.endsWith('lesson.'));
  assert.equal(notice.truncated, true);
  assert.equal(notice.endsMidPage, true);
});

test('one huge unbroken string is cut at a word, never to nothing', () => {
  const { text } = prepareMaterial({ segments: [seg(null, 'word '.repeat(5000).trim())] }, { budget: 200 });
  assert.ok(text.length > 100);
  assert.ok(estimateTokens(text) <= 200);
});

test('a PDF that was only partly read says the rest was not read, even when what was read fits', () => {
  const { notice } = prepareMaterial({ segments: [seg(1, 'Page one text.'), seg(2, 'Page two text.')], totalPages: 400, readAll: false });
  assert.equal(notice.truncated, true);
  assert.equal(notice.totalPages, 400);
  assert.equal(notice.usedPercent, null);
});

test('chunks of the same page are joined without a break, and pages start on a new line', () => {
  const { text } = prepareMaterial({ segments: [seg(1, 'The first half of a sen'), seg(1, 'tence ends here.'), seg(2, 'Page two begins.')] });
  assert.equal(text, 'The first half of a sentence ends here.\nPage two begins.');
});

test('a Word file has no pages in the notice', () => {
  const { notice } = prepareMaterial({ segments: [longPage(null, 100)] }, { budget: 200 });
  assert.equal(notice.pagesUsed, null);
  assert.equal(notice.totalPages, null);
  assert.equal(notice.truncated, true);
});

test('empty and whitespace-only input gives empty material, not a crash', () => {
  assert.equal(prepareMaterial({ segments: [] }).text, '');
  assert.equal(prepareMaterial({ segments: [seg(1, '   \n\n  ')] }).text, '');
});
