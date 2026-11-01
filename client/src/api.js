const network = 'Cannot reach the server. Check that it is running, then try again.';

// The reviewer's key goes in a header on each AI call. The server uses it for that call only.
// The session id picks which lesson state on the server a request belongs to.
function headers({ apiKey, sessionId }) {
  return { ...(apiKey ? { 'X-Groq-Api-Key': apiKey } : {}), ...(sessionId ? { 'X-Session-Id': sessionId } : {}) };
}

async function getJson(path, options, failure) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error(network);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || failure);
  return data;
}

// Uploads one PDF or DOCX with the teacher's prompt, and which part of a long file to use. Resolves with the checked plan.
export function buildLesson({ file, prompt, part = 0, apiKey, sessionId }) {
  const form = new FormData();
  form.append('file', file);
  form.append('prompt', prompt);
  form.append('part', String(part));
  return getJson('/api/lessons/build', { method: 'POST', headers: headers({ apiKey, sessionId }), body: form }, 'Could not build the lesson. Try again.');
}

// Saves the teacher's current lesson under a link id. Resolves with { id }.
export function publishLesson({ sessionId }) {
  return getJson('/api/lessons/publish', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers({ sessionId }) }, body: '{}' }, 'Could not publish. Try again.');
}

// What a student sees before starting a published lesson: its rules and step count.
export function getLesson(id) {
  return getJson(`/api/lessons/${encodeURIComponent(id)}`, undefined, 'This lesson link is not available. Ask your teacher for a new link.');
}

// Whether the host has its own Groq key, so a student does not need to paste one.
export async function getHostKey() {
  try {
    return Boolean((await (await fetch('/api/health')).json()).hostKey);
  } catch {
    return false;
  }
}

export async function getChat(sessionId) {
  let response;
  try {
    response = await fetch('/api/chat', { headers: headers({ sessionId }) });
  } catch {
    throw new Error(network);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load the lesson. Try again.');
  return response.json();
}

// Sends one chat turn and reads the server-sent events. Resolves with the final lesson state.
// Aborting the signal (Stop) rejects with an AbortError and the server commits nothing.
export async function streamTurn(body, { onChunk, signal, apiKey, sessionId }) {
  let response;
  try {
    response = await fetch('/api/chat/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers({ apiKey, sessionId }) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (failure) {
    if (failure.name === 'AbortError') throw failure;
    throw new Error(network);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'The tutor could not reply. Try again.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null');
      if (event === 'chunk') onChunk(data.text);
      else if (event === 'done') final = data;
      else if (event === 'error') throw new Error(data.message);
    }
  }
  if (!final) throw new Error('The tutor stopped unexpectedly. Try again.');
  return final;
}
