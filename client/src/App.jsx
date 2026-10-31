import { useEffect, useRef, useState } from 'react';
import { getChat, streamTurn } from './api.js';
import SetupScreen from './SetupScreen.jsx';

export default function App() {
  const [chat, setChat] = useState(null);
  const [partial, setPartial] = useState('');
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openSource, setOpenSource] = useState(null);
  const [apiKey, setApiKey] = useState('');
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
        if (body.type === 'message') setDraft(body.text);
      } else {
        setError(failure.message);
        if (body.type === 'message') setDraft(body.text);
      }
      setPartial('');
      setPending(null);
    } finally {
      setStreaming(false);
      controller.current = null;
    }
  }

  // Called by the setup screen once the file is built; the chat then starts on that lesson.
  function startBuiltLesson() {
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

  const steps = chat?.steps ?? [];
  const total = steps.length;
  const currentIndex = steps.findIndex(step => step.id === chat?.currentStepId);
  const stepLabel = !chat ? '' : chat.lessonComplete ? `Lesson complete · ${total} of ${total}` : `Step ${currentIndex + 1} of ${total}`;
  const rulesLine = chat && [chat.rules.audience, chat.rules.language, chat.rules.method, chat.rules.timeLimit].filter(Boolean).join(' · ');

  if (!chat && !streaming) {
    return <SetupScreen apiKey={apiKey} onKeyChange={setApiKey} onBuilt={startBuiltLesson} appError={error} onDismissAppError={() => setError('')} />;
  }

  return <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
    <header className="mb-4">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Lesson</h1>
        {chat && <p className="text-sm font-medium text-teal-800" aria-live="polite">{stepLabel}</p>}
      </div>
      {rulesLine && <p className="mt-1 text-xs text-stone-500">{rulesLine}</p>}
    </header>

    {chat && <ol className="mb-4 flex gap-1" aria-label="Lesson progress">
      {steps.map((step, index) => {
        const done = chat.completedStepIds.includes(step.id);
        const current = step.id === chat.currentStepId;
        return <li key={step.id} title={step.title} className={`h-2 flex-1 rounded-full ${done ? 'bg-teal-600' : current ? 'bg-teal-300' : 'bg-stone-200'}`}>
          <span className="sr-only">{done ? 'Done: ' : current ? 'Current: ' : ''}{step.title} ({index + 1} of {total})</span>
        </li>;
      })}
    </ol>}

    {error && <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p>{error}</p>
      <button className="mt-2 underline disabled:opacity-50" disabled={streaming} onClick={() => setError('')}>Dismiss</button>
    </div>}
    {notice && <p role="status" className="mb-4 text-sm text-stone-600">{notice}</p>}

    {(chat || streaming) && <section aria-label="Conversation" className="flex-1 space-y-3" role="log" aria-live="polite">
      {chat?.messages.map(message => message.role === 'student'
        ? <p key={message.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-teal-700 px-4 py-2 text-sm text-white">{message.text}</p>
        : <div key={message.id} className="max-w-[90%]">
          <p className="rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm leading-6 shadow-sm">{message.text}</p>
          {message.quote && <button className="mt-1 text-xs text-teal-700 underline" aria-expanded={openSource === message.id} onClick={() => setOpenSource(openSource === message.id ? null : message.id)}>
            {openSource === message.id ? 'Hide source' : 'Show source'}
          </button>}
          {openSource === message.id && <blockquote className="mt-1 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600">“{message.quote}”</blockquote>}
        </div>)}
      {pending && <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-teal-700/80 px-4 py-2 text-sm text-white">{pending}</p>}
      {streaming && <div className="max-w-[90%]">
        <p className="rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm leading-6 shadow-sm">{partial || <span className="text-stone-500">Tutor is thinking…</span>}</p>
        <button className="mt-2 rounded-lg border border-stone-300 px-3 py-1 text-xs" onClick={() => controller.current?.abort()}>Stop</button>
      </div>}
    </section>}

    {chat?.lessonComplete && !streaming && <div className="mt-6 rounded-xl bg-teal-950 p-4 text-sm text-teal-100">
      <p>You finished every step.</p>
      <button className="mt-3 w-full rounded-xl border border-teal-400 px-4 py-2 text-white" onClick={newLesson}>New lesson</button>
    </div>}

    {chat && !chat.lessonComplete && <form onSubmit={send} className="sticky bottom-0 mt-6 bg-[#faf9f6] pt-3">
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <textarea id="answer" value={draft} onChange={event => setDraft(event.target.value)} disabled={streaming} maxLength={2000} rows={2}
        placeholder="Type your answer or question" className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm disabled:opacity-60" />
      <div className="mt-2 flex justify-end">
        <button className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={streaming || !draft.trim()}>Send</button>
      </div>
    </form>}
  </main>;
}
