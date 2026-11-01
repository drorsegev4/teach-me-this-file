import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../../server/src/app.js';
import { createMockAI } from '../../server/src/ai.js';

const savedPlan = JSON.parse(readFileSync(new URL('../../server/fixtures/mock-lesson-plan.json', import.meta.url), 'utf8'));

async function withServer(run) {
  const server = createApp({ ai: createMockAI(savedPlan) }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

function upload(base, { prompt, file, headers = {} }) {
  const form = new FormData();
  if (prompt !== undefined) form.append('prompt', prompt);
  if (file) form.append('file', new Blob([file.bytes], { type: file.type }), file.name);
  return fetch(`${base}/api/lessons/build`, { method: 'POST', headers, body: form });
}

const goodPrompt = 'Teach this to 7th graders, in French. Be Socratic.';

test('build rejects a prompt under 20 characters', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: 'Too short', file: { name: 'a.txt', type: 'text/plain', bytes: 'hello' } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /20 to 1500 characters/);
  });
});

test('build rejects a file that is not a PDF or DOCX', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: { name: 'notes.txt', type: 'text/plain', bytes: 'hello world' } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Attach one PDF or DOCX file.');
  });
});

test('build rejects a request without a file', async () => {
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt });
    assert.equal(response.status, 400);
  });
});

test('rejects a malformed API key header without echoing it', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/lessons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Groq-Api-Key': 'bad key with spaces' }, body: '{}',
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.equal(text.includes('bad key'), false);
  });
});

// A Word file whose first paragraphs are the lesson sample and the rest is filler, far over the token budget.
async function longDocx(paragraphs) {
  const { default: JSZip } = await import('jszip');
  const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('a document far over the budget builds from its start and the response says what was left out', async () => {
  const sample = readFileSync(new URL('../../server/fixtures/sample-document.txt', import.meta.url), 'utf8');
  const filler = Array.from({ length: 3000 }, (_, i) => `Filler paragraph ${i} about something unrelated to the lesson, repeated to make the file long.`);
  const bytes = await longDocx([...sample.split(/\n+/).filter(Boolean), ...filler]);
  await withServer(async base => {
    const response = await upload(base, { prompt: goodPrompt, file: { name: 'long.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes } });
    assert.equal(response.status, 200);
    const built = await response.json();
    assert.equal(built.steps.length > 0, true);
    assert.equal(built.material.truncated, true);
    assert.ok(built.material.usedPercent > 0 && built.material.usedPercent < 50);
    assert.ok(built.material.estimatedTokens <= 4000);
  });
});
