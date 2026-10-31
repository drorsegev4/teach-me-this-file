import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { displayName, extractDocument } from '../../server/src/documents.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const text = result => result.segments.map(segment => segment.text).join('');

test('reads text from a DOCX', async () => {
  const result = await extractDocument({ originalname: 'sample.docx', buffer: fixture('sample.docx') });
  assert.match(text(result), /Evaporation is the change of liquid water/);
});

test('reads text from a PDF in a worker without crashing', async () => {
  const result = await extractDocument({ originalname: 'sample.pdf', buffer: fixture('sample.pdf') });
  assert.match(text(result), /Evaporation is the change of liquid water/);
});

test('refuses a file that is not a PDF or DOCX', async () => {
  await assert.rejects(async () => extractDocument({ originalname: 'notes.txt', buffer: Buffer.from('hello') }), /Attach one PDF or DOCX file/);
});

test('restores a Hebrew file name that arrived decoded as Latin-1', () => {
  const sent = Buffer.from('פרק 2- מבוא.docx', 'utf8').toString('latin1');
  assert.equal(displayName(sent), 'פרק 2- מבוא.docx');
});

test('keeps an ASCII file name unchanged', () => {
  assert.equal(displayName('chapter-2.pdf'), 'chapter-2.pdf');
});

test('refuses an empty file', async () => {
  await assert.rejects(async () => extractDocument({ originalname: 'empty.pdf', buffer: Buffer.alloc(0) }), /nonempty file/);
});
