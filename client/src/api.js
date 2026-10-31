const network = 'Cannot reach the server. Check that it is running, then try again.';

export async function getChat() {
  let response;
  try {
    response = await fetch('/api/chat');
  } catch {
    throw new Error(network);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load the lesson. Try again.');
  return response.json();
}

// Sends one chat turn and reads the server-sent events. Resolves with the final lesson state.
// Aborting the signal (Stop) rejects with an AbortError and the server commits nothing.
export async function streamTurn(body, { onChunk, signal }) {
  let response;
  try {
    response = await fetch('/api/chat/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
