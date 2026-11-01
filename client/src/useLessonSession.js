import { useEffect, useRef, useState } from 'react';
import { buildLesson, getChat, streamTurn } from './api.js';
import { fullGoal } from './goalRules.js';

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
  // What the teacher submitted ({ file, prompt }), kept so the lesson can be rebuilt from an edited goal.
  const [brief, setBrief] = useState(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [stoppedReply, setStoppedReply] = useState('');
  const controller = useRef(null);
  const partialText = useRef('');

  useEffect(() => {
    getChat().then(setChat).catch(failure => setError(failure.message));
  }, []);

  async function run(body, { onStart } = {}) {
    controller.current = new AbortController();
    setStreaming(true);
    setError('');
    setNotice('');
    setPartial('');
    setStoppedReply('');
    partialText.current = '';
    onStart?.();
    try {
      const state = await streamTurn(body, {
        onChunk: text => {
          partialText.current += text;
          setPartial(partialText.current);
        },
        signal: controller.current.signal,
        apiKey: apiKey.trim(),
      });
      setChat(state);
      setPartial('');
      setPending(null);
    } catch (failure) {
      if (failure.name === 'AbortError') {
        // Stop: nothing was committed, so the student's message goes back into the box.
        // The words that had arrived stay on screen, marked as not saved.
        setNotice('Stopped. Your message was not sent.');
        setStoppedReply(partialText.current);
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

  // Builds the lesson from the teacher's file and goal, then opens it as a fresh student preview.
  async function build({ changes = [], ...rest }) {
    if (building || streaming) return;
    const next = { ...rest, changes };
    setBrief(next);
    setBuilding(true);
    setBuildError('');
    setError('');
    setNotice('');
    setStoppedReply('');
    setOpenSource(null);
    setChat(null);
    try {
      const built = await buildLesson({ file: next.file, prompt: fullGoal(next), apiKey: apiKey.trim() });
      setFileName(built.fileName ?? '');
      setBuilding(false);
      run({ type: 'start', fresh: false });
    } catch (failure) {
      setBuildError(failure.message);
      setBuilding(false);
    }
  }

  // The teacher asks for a change to the lesson. The file and goal stay; the change is added and the lesson is rebuilt.
  function requestChange(text) {
    if (brief) build({ ...brief, changes: [...brief.changes, text] });
  }

  // Starts the student preview over on the same lesson plan.
  function restartPreview() {
    if (streaming || building) return;
    setChat(null);
    setStoppedReply('');
    setOpenSource(null);
    run({ type: 'start', fresh: false });
  }

  function newLesson() {
    setChat(null);
    setBrief(null);
    setBuildError('');
    setError('');
    setNotice('');
    setStoppedReply('');
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
    chat, partial, stoppedReply, pending, draft, setDraft, streaming, error, setError, notice,
    openSource, setOpenSource, apiKey, setApiKey, fileName,
    brief, building, buildError, build, requestChange, restartPreview, newLesson, send, moveOn, stop: () => controller.current?.abort(),
  };
}
