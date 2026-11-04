import { useEffect, useRef, useState } from 'react';
import { buildLesson, getChat, getLesson, publishLesson, streamTurn } from './api.js';
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
  const [fileName, setFileName] = useState('');
  // What the teacher submitted ({ file, prompt }), kept for retrying a build.
  const [brief, setBrief] = useState(null);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [stoppedReply, setStoppedReply] = useState('');
  // A student's view of the published lesson: loading, ready (with its rules and step count) or missing.
  const [lesson, setLesson] = useState({ status: lessonId ? 'loading' : 'none', info: null });
  // The teacher's link for the lesson they built: { id } once published.
  const [published, setPublished] = useState(null);
  // Whole-document coverage and extraction details reported by the server.
  const [material, setMaterial] = useState(null);
  // The plan as built ({ rules, steps }), kept so the teacher sees it even before the first reply arrives or after it fails.
  const [plan, setPlan] = useState(null);
  const [previewRequested, setPreviewRequested] = useState(false);
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

  // Builds the plan and overview together, then opens the welcome before any tutor question.
  async function build({ ...rest }) {
    if (building || streaming) return;
    const next = { ...rest };
    setBrief(next);
    setBuilding(true);
    setPreviewRequested(false);
    setBuildError('');
    setPublished(null);
    setPublishError('');
    setMaterial(null);
    setPlan(null);
    setError('');
    setNotice('');
    setStoppedReply('');
    setChat(null);
    try {
      const built = await buildLesson({ file: next.file, prompt: next.prompt, apiKey: apiKey.trim(), sessionId });
      setFileName(built.fileName ?? '');
      setMaterial(built.material ?? null);
      setPlan({ rules: built.rules, steps: built.steps, introduction: built.introduction });
      setBuilding(false);
      setPreviewRequested(true);
    } catch (failure) {
      setBuildError(failure.message);
      setBuilding(false);
    }
  }

  // Begin is explicit: the welcome itself uses no tutor call or progress state.
  function startLesson() {
    if (streaming || building || publishing || controller.current) return;
    setPreviewRequested(true);
    run(lessonId ? { type: 'start', lessonId } : { type: 'start' });
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

  // Return to the welcome. The next Begin starts over on the same prepared plan.
  function restartPreview() {
    if (streaming || building || publishing) return;
    setPreviewRequested(true);
    if (!plan && chat) setPlan({ rules: chat.rules, steps: chat.steps });
    setChat(null);
    setStoppedReply('');
    setDraft('');
    setError('');
    setNotice('');
  }

  function newLesson() {
    setPreviewRequested(false);
    setChat(null);
    setBrief(null);
    setMaterial(null);
    setPlan(null);
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
    apiKey, fileName, material, plan, previewRequested, lessonId, lesson, startLesson,
    published, publishing, publishError, publish,
    brief, building, buildError, build, restartPreview, newLesson, send, moveOn, stop: () => controller.current?.abort(),
  };
}
