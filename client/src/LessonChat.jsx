import { languageDirection } from './direction.js';

// The student's side of the lesson: progress, the conversation, and the answer box.
// Layout uses logical classes (ms-, rounded-es-, rounded-ee-) so it mirrors when the lesson is right-to-left.
export default function LessonChat({ session }) {
  const { chat, partial, stoppedReply, pending, draft, setDraft, streaming, error, setError, notice, openSource, setOpenSource, restartPreview, send, moveOn, stop } = session;

  const steps = chat?.steps ?? [];
  const total = steps.length;
  const currentIndex = steps.findIndex(step => step.id === chat?.currentStepId);
  const stepLabel = !chat ? '' : chat.lessonComplete ? `Lesson complete · ${total} of ${total}` : `Step ${currentIndex + 1} of ${total}`;
  const currentStep = steps[currentIndex];
  const rulesLine = chat && [chat.rules.audience, chat.rules.language, chat.rules.method, chat.rules.timeLimit].filter(Boolean).join(' · ');
  const direction = languageDirection(chat?.rules?.language);

  return <div dir={direction} className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-4 py-6 lg:overflow-y-auto">
    <header className="mb-4">
      {chat && <p className="text-sm font-medium text-teal-800" aria-live="polite">{stepLabel}{currentStep && <span dir="auto" className="text-stone-700"> · {currentStep.title}</span>}</p>}
      {rulesLine && <p className="mt-1 text-xs text-stone-500" dir="auto">{rulesLine}</p>}
    </header>

    {chat && <ol className="mb-4 flex gap-1" aria-label="Lesson progress">
      {steps.map((step, index) => {
        const done = chat.completedStepIds.includes(step.id);
        const movedOn = chat.movedOnStepIds.includes(step.id);
        const current = step.id === chat.currentStepId;
        // A moved-on step is a neutral grey, not an error colour: it can be revisited later.
        const color = done ? 'bg-teal-600' : movedOn ? 'bg-stone-400' : current ? 'bg-teal-300' : 'bg-stone-200';
        return <li key={step.id} title={step.title} className={`h-2 flex-1 rounded-full ${color}`}>
          <span className="sr-only">{done ? 'Done: ' : movedOn ? 'Moved on: ' : current ? 'Current: ' : ''}{step.title} ({index + 1} of {total})</span>
        </li>;
      })}
    </ol>}

    {error && <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p dir="auto">{error}</p>
      <button className="mt-2 underline disabled:opacity-50" disabled={streaming} onClick={() => setError('')}>Dismiss</button>
    </div>}
    {notice && <p role="status" className="mb-4 text-sm text-stone-600">{notice}</p>}

    {(chat || streaming) && <section aria-label="Conversation" className="flex-1 space-y-3" role="log" aria-live="polite">
      {chat?.messages.map(message => message.role === 'student'
        ? <p key={message.id} dir="auto" className="ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-teal-700 px-4 py-2 text-sm text-white">{message.text}</p>
        : <div key={message.id} className="max-w-[90%]">
          <p dir="auto" className="rounded-2xl rounded-es-sm bg-white px-4 py-2 text-sm leading-6 shadow-sm">{message.text}</p>
          {message.quote && <button className="mt-1 text-xs text-teal-700 underline" aria-expanded={openSource === message.id} onClick={() => setOpenSource(openSource === message.id ? null : message.id)}>
            {openSource === message.id ? 'Hide source' : 'Show source'}
          </button>}
          {openSource === message.id && <blockquote dir="auto" className="mt-1 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600">“{message.quote}”</blockquote>}
        </div>)}
      {pending && <p dir="auto" className="ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-teal-700/80 px-4 py-2 text-sm text-white">{pending}</p>}
      {stoppedReply && !streaming && <div className="max-w-[90%]">
        <p dir="auto" className="rounded-2xl rounded-es-sm bg-white px-4 py-2 text-sm leading-6 text-stone-500 shadow-sm">{stoppedReply}…</p>
        <p className="mt-1 text-xs text-stone-500">Stopped. This part of the reply was not saved.</p>
      </div>}
      {streaming && <div className="max-w-[90%]">
        <p dir="auto" className="rounded-2xl rounded-es-sm bg-white px-4 py-2 text-sm leading-6 shadow-sm">{partial || <span className="text-stone-500">Tutor is thinking…</span>}</p>
        <button className="mt-2 rounded-lg border border-stone-300 px-3 py-1 text-xs" onClick={stop}>Stop</button>
      </div>}
    </section>}

    {chat?.lessonComplete && !streaming && <div className="mt-6 rounded-xl bg-teal-950 p-4 text-sm text-teal-100">
      <p>You finished every step.</p>
      <button className="mt-3 w-full rounded-xl border border-teal-400 px-4 py-2 text-white" onClick={restartPreview}>{session.lessonId ? 'Start again' : 'Restart preview'}</button>
    </div>}

    {chat?.needsChoice && !streaming && !chat.lessonComplete && <div role="group" aria-label="Choose how to continue" className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
      <p dir="auto">Try once more, or move on to the next step?</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="flex-1 rounded-xl border border-teal-700 px-4 py-2 text-teal-800" onClick={() => document.getElementById('answer')?.focus()}>Try again</button>
        <button type="button" className="flex-1 rounded-xl bg-stone-700 px-4 py-2 text-white" onClick={moveOn}>Move on</button>
      </div>
      <p className="mt-3 text-xs text-stone-500">Moving on is fine. This step can be revisited later.</p>
    </div>}

    {chat && !chat.lessonComplete && <form onSubmit={send} className="sticky bottom-0 mt-6 bg-[#faf9f6] pt-3">
      <label htmlFor="answer" className="sr-only">Your answer</label>
      <textarea id="answer" dir="auto" value={draft} onChange={event => setDraft(event.target.value)} disabled={streaming} maxLength={2000} rows={2}
        placeholder="Type your answer here, or ask a question about this file" className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm disabled:opacity-60" />
      <div className="mt-2 flex justify-end">
        <button className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={streaming || !draft.trim()}>Send</button>
      </div>
    </form>}
  </div>;
}
