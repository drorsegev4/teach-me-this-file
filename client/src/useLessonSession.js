import { useEffect, useRef, useState } from 'react';
import { getChat, streamTurn } from './api.js';

// Owns the lesson session in the browser: the server's chat state, the streaming reply,
// the student's draft, and the reviewer's key (memory only, never storage).
export function useLessonSession() {
  const [chat, setChat] = useState(null);
  const [partial, setPartial] = useState('');
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openSource, setOpenSource] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [fileName, setFileName] = useState('');
  const controller = useRef(null);

  useEffect(() => {
    getChat().then(setChat).catch(failure => setError(failure.message));
  }, []);

  async function run(body, { onStart } = {}) {
    controller.current = new AbortController();
    setStreaming(true);
    setError('');
    setNotice('');
    setPartial('');
    onStart?.();
    try {
      const state = await streamTurn(body, {
        onChunk: text => setPartial(current => current + text),
        signal: controller.current.signal,
        apiKey: apiKey.trim(),
      });
      setChat(state);
      setPartial('');
      setPending(null);
    } catch (failure) {
      if (failure.name === 'AbortError') {
        // Stop: nothing was committed, so the student's message goes back into the box.
        setNotice('Stopped. Your message was not sent.');
      } else {
        setError(failure.message);
      }
      if (body.type === 'message') setDraft(body.text);
      setPartial('');
      setPending(null);
    } finally {
      setStreaming(false);
      controller.current = null;
    }
  }

  // Called by the setup screen once the file is built; the chat then starts on that lesson.
  function startBuiltLesson(built) {
    setFileName(built.fileName ?? '');
    setChat(null);
    run({ type: 'start', fresh: false });
  }

  function newLesson() {
    setChat(null);
    setError('');
    setNotice('');
  }

  function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    run({ type: 'message', text }, { onStart: () => setPending(text) });
  }

  // The student chose to leave the current step after several tries. The server marks it and opens the next one.
  function moveOn() {
    if (streaming) return;
    run({ type: 'move_on' });
  }

  return {
    chat, partial, pending, draft, setDraft, streaming, error, setError, notice,
    openSource, setOpenSource, apiKey, setApiKey, fileName,
    startBuiltLesson, newLesson, send, moveOn, stop: () => controller.current?.abort(),
  };
}
