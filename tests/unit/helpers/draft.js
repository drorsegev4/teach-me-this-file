import assert from 'node:assert/strict';
import { sampleText } from '../../../server/src/sample.js';
import { makeDocx } from './docx.js';

// The teacher builds a draft the way the app does: by uploading a file with a goal.
// `session` is the X-Session-Id; without it the request uses the shared default session.
export async function buildDraft(base, session) {
  const form = new FormData();
  form.append('prompt', 'Teach this to 7th graders in English. Be Socratic.');
  form.append('file', new Blob([await makeDocx(sampleText.split(/\n+/).filter(Boolean))]), 'lesson.docx');
  const response = await fetch(`${base}/api/lessons/build`, { method: 'POST', headers: session ? { 'X-Session-Id': session } : {}, body: form });
  assert.equal(response.status, 200);
}
