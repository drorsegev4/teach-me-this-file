import { useEffect, useRef, useState } from 'react';
import { buildLesson, getChat, getLesson, publishLesson, streamTurn } from './api.js';
import { fullGoal } from './goalRules.js';
import { storedSessionId } from './sessionId.js';

// Owns one lesson session in the browser: the server's chat state, the streaming reply and the draft.
// The reviewer's key lives in the app and is passed in (memory only, never storage).
// With a lessonId it is a student's session on a published lesson; without, the teacher's own preview.
export function useLessonSession({ apiKey, lessonId = null }) {
  const [sessionId] = useState(() => storedSessionId(lessonId ? `student-${lessonId}` : 'teacher'));
  const [chat, setChat] = useState(null);
  const [partial, setPartial] = useState('');
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openSource, setOpenSource] = useState(null);
  const [fileName, setFileName] = useState('');
  // What the teacher submitted ({ file, prompt }), kept so the lesson can be rebuilt from an edited goal.
  const [brief, setBrief] = useState(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [stoppedReply, setStoppedReply] = useState('');
  // A student's view of the published lesson: loading, ready (with its rules and step count) or missing.
  const [lesson, setLesson] = useState({ status: lessonId ? 'loading' : 'none', info: null });
  // The teacher's link for the lesson they built: { id } once published.
  const [published, setPublished] = useState(null);
  // What part of the file the lesson was built from, as the server reported it.
  const [material, setMaterial] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const controller = useRef(null);
  const partialText = useRef('');

  useEffect(() => {
    getChat(sessionId).then(setChat).catch(failure => setError(failure.message));
    if (lessonId) {
      getLesson(lessonId)
        .then(info => setLesson({ status: 'ready', info }))
        .catch(failure => setLesson({ status: 'missing', info: null, message: failure.message }));
    }
  }, [sessionId, lessonId]);

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
        sessionId,
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
    setPublished(null);
    setPublishError('');
    setMaterial(null);
    setError('');
    setNotice('');
    setStoppedReply('');
    setOpenSource(null);
    setChat(null);
    try {
      const built = await buildLesson({ file: next.file, prompt: fullGoal(next), apiKey: apiKey.trim(), sessionId });
      setFileName(built.fileName ?? '');
      setMaterial(built.material ?? null);
      setBuilding(false);
      run({ type: 'start' });
    } catch (failure) {
      setBuildError(failure.message);
      setBuilding(false);
    }
  }

  // The teacher asks for a change to the lesson. The file and goal stay; the change is added and the lesson is rebuilt.
  function requestChange(text) {
    if (brief) build({ ...brief, changes: [...brief.changes, text] });
  }

  // The student presses Start on the landing card.
  function startLesson() {
    if (!streaming) run({ type: 'start', lessonId });
  }

  // The teacher saves the lesson they built under a link.
  async function publish() {
    if (publishing || building || streaming) return;
    setPublishing(true);
    setPublishError('');
    try {
      setPublished(await publishLesson({ sessionId }));
    } catch (failure) {
      setPublishError(failure.message);
    } finally {
      setPublishing(false);
    }
  }

  // Starts the student preview over on the same lesson plan.
  function restartPreview() {
    if (streaming || building) return;
    setChat(null);
    setStoppedReply('');
    setOpenSource(null);
    run(lessonId ? { type: 'start', lessonId } : { type: 'start' });
  }

  function newLesson() {
    setChat(null);
    setBrief(null);
    setMaterial(null);
    setPublished(null);
    setPublishError('');
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
    openSource, setOpenSource, apiKey, fileName, material, lessonId, lesson, startLesson,
    published, publishing, publishError, publish,
    brief, building, buildError, build, requestChange, restartPreview, newLesson, send, moveOn, stop: () => controller.current?.abort(),
  };
}
