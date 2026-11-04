import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, MaterialError, prepareDocument } from '../../server/src/material.js';

const seg = (page, text) => ({ page, text });
const line = n => 'Sentence number ' + n + ' describes an idea in the document.';
const lines = (n, offset = 0) => Array.from({ length: n }, (_, i) => line(i + offset)).join('\n');

test('a short document retains all cleaned readable text', () => {
  const prepared = prepareDocument({ segments: [seg(null, 'First paragraph.\nSecond paragraph.')] });
  assert.equal(prepared.text, 'First paragraph.\nSecond paragraph.');
  assert.equal(prepared.chunks.length, 1);
  assert.equal(prepared.notice.wholeDocument, true);
  assert.equal(Object.hasOwn(prepared.notice, 'parts'), false);
});

test('internal chunks include every line and the final page in order', () => {
  const { text, chunks } = prepareDocument({ segments: [seg(1, lines(20)), seg(2, lines(20, 20)), seg(3, lines(20, 40))], totalPages: 3 }, { budget: 400 });
  assert.ok(chunks.length > 1);
  assert.equal(text, lines(60));
  assert.equal(chunks.map(chunk => chunk.text).join('\n'), text);
  assert.equal(chunks[0].pages.from, 1);
  assert.equal(chunks.at(-1).pages.to, 3);
  assert.ok(chunks.every(chunk => estimateTokens(chunk.text) <= 400));
});

test('a heading remains with its following text', () => {
  const text = 'Heading One\n' + lines(10) + '\nHeading Two\n' + lines(10, 10) + '\nHeading Three\n' + lines(10, 20);
  const { chunks } = prepareDocument({ segments: [seg(null, text)] }, { budget: 220 });
  for (const chunk of chunks) assert.equal(/Heading \w+$/.test(chunk.text), false);
});

test('PDF spacing is collapsed and fragments of the same page are joined', () => {
  const prepared = prepareDocument({ segments: [seg(1, 'A   sen'), seg(1, 'tence.\n\n   A second line.'), seg(2, 'Last page.')] });
  assert.equal(prepared.text, 'A sentence.\nA second line.\nLast page.');
});

test('deduplication is recorded internally without dropping short repeated headings', () => {
  const repeated = 'This is a sufficiently long repeated paragraph about a specific idea in the document.';
  const { text, notice } = prepareDocument({ segments: [seg(null, repeated + '\nIntro\n' + repeated + '\nIntro')] });
  assert.equal(notice.removedRepeats, 1);
  assert.equal(text.split('Intro').length - 1, 2);
});

test('a long paragraph is split without losing its final sentence', () => {
  const text = Array.from({ length: 60 }, (_, i) => line(i)).join(' ');
  const prepared = prepareDocument({ segments: [seg(null, text)] }, { budget: 300 });
  assert.ok(prepared.chunks.length > 1);
  assert.equal(prepared.chunks.map(chunk => chunk.text).join(' '), text);
  assert.ok(prepared.chunks.every(chunk => estimateTokens(chunk.text) <= 300));
});

test('word-only text is not dropped, and Word chunks have no invented pages', () => {
  const text = 'word '.repeat(500).trim();
  const prepared = prepareDocument({ segments: [seg(null, text)] }, { budget: 200 });
  assert.ok(prepared.chunks.length > 1);
  assert.equal(prepared.chunks.map(chunk => chunk.text).join(' '), text);
  assert.ok(prepared.chunks.every(chunk => chunk.pages === null));
});

test('incomplete extraction is refused rather than passed off as a whole document', () => {
  for (const pagesRead of [1, 61]) {
    assert.throws(() => prepareDocument({ segments: [seg(1, 'Only the beginning.')], readAll: false, pagesRead }),
      error => error instanceof MaterialError && error.message ===
        `This file is longer than the limit (read ${pagesRead} ${pagesRead === 1 ? 'page' : 'pages'}). Upload the chapter or section you want to teach.`);
  }
});

test('processing bounds fail clearly instead of truncating the document', () => {
  assert.throws(() => prepareDocument({ segments: [seg(null, 'x'.repeat(270000))] }), MaterialError);
  assert.throws(() => prepareDocument({ segments: [seg(null, lines(200))] }, { budget: 100 }), /too many sections/);
  assert.throws(() => prepareDocument({ segments: [seg(null, 'x'.repeat(5000))] }, { budget: 100 }), /could not be divided/);
  assert.throws(() => prepareDocument({ segments: [] }, { budget: NaN }), MaterialError);
});

test('whitespace-only input yields empty material, not a prefix or a crash', () => {
  const result = prepareDocument({ segments: [seg(1, '  \n  ')] });
  assert.equal(result.text, '');
  assert.deepEqual(result.chunks, []);
});
