import { useState } from 'react';
import { fullGoal, MAX_TOTAL_PROMPT } from './goalRules.js';
import KeySettings from './KeySettings.jsx';

// The teacher's side. Top: the lesson plan, with the source quote behind each step.
// Below: the conversation with the builder (the goal, then each change asked for), and a box at the bottom for the next change.
export default function CreatePanel({ session }) {
  const { chat, brief, building, buildError, streaming, fileName, apiKey, setApiKey, build, requestChange, newLesson } = session;
  const [draft, setDraft] = useState('');

  const steps = chat?.steps ?? [];
  const busy = building || streaming;
  const text = draft.trim();
  const tooLong = Boolean(brief) && text && fullGoal({ ...brief, changes: [...brief.changes, text] }).length > MAX_TOTAL_PROMPT;
  const canSend = Boolean(brief) && !busy && Boolean(text) && !tooLong;

  function send(event) {
    event.preventDefault();
    if (!canSend) return;
    requestChange(text);
    setDraft('');
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Create lesson</p>
      <button className="text-xs text-teal-800 underline disabled:opacity-50" disabled={busy} onClick={newLesson}>New lesson</button>
    </header>

    <section aria-label="Lesson plan" className="max-h-[40vh] shrink-0 overflow-y-auto border-b border-stone-200 bg-white px-4 py-4">
      <h2 className="text-sm font-semibold">Lesson plan</h2>
      {building && <p role="status" className="mt-2 flex items-center gap-3 text-sm text-stone-700">
        <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
        Generating your lesson…
      </p>}
      {!building && steps.length === 0 && <p className="mt-2 text-sm text-stone-600">The steps will appear here once the lesson is built.</p>}
      {steps.length > 0 && <>
        <p dir="auto" className="mt-1 truncate text-xs text-stone-600" title={fileName}>{fileName}</p>
        <ol className="mt-3 space-y-3">
          {steps.map((step, index) => {
            const done = chat.completedStepIds.includes(step.id);
            const current = step.id === chat.currentStepId;
            const movedOn = chat.movedOnStepIds.includes(step.id);
            const status = done ? 'Done' : movedOn ? 'Moved on' : current ? 'Now' : 'Next';
            const pill = done ? 'bg-teal-600 text-white' : movedOn ? 'bg-stone-200 text-stone-700' : current ? 'bg-teal-100 text-teal-900' : 'bg-stone-100 text-stone-500';
            return <li key={step.id} className="flex gap-3">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${pill}`}>{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span dir="auto">{step.title}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{status}</span>
                </p>
                <details className="mt-1 text-xs text-stone-600">
                  <summary className="cursor-pointer">Source from the file</summary>
                  <blockquote dir="auto" className="mt-1 rounded-lg bg-stone-50 p-3 leading-5">“{step.source}”</blockquote>
                </details>
              </div>
            </li>;
          })}
        </ol>
      </>}
    </section>

    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label="Your requests">
      {brief
        ? <>
          <div className="rounded-2xl bg-stone-200/70 px-4 py-3 text-sm leading-6">
            <p dir="auto">{brief.prompt}</p>
            <p dir="auto" className="mt-2 truncate text-xs text-stone-600">File: <span className="font-medium">{brief.file.name}</span></p>
          </div>
          {brief.changes.map((change, index) => <p key={index} dir="auto" className="rounded-2xl bg-stone-200/70 px-4 py-3 text-sm leading-6">{change}</p>)}
        </>
        : <p className="text-sm text-stone-600">This lesson was built before you reloaded the page. Start a new lesson to change it.</p>}
      {building && <p role="status" className="text-sm text-stone-600">Working on it…</p>}
      {buildError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p>{buildError}</p>
        <button className="mt-2 underline disabled:opacity-50" disabled={busy} onClick={() => build(brief)}>Try again</button>
      </div>}
      {!building && !buildError && steps.length > 0 && <p className="text-sm text-stone-600">Your lesson is ready: {steps.length} steps. Try it in the student preview, or ask for a change below.</p>}
      <KeySettings apiKey={apiKey} onKeyChange={setApiKey} disabled={busy} />
    </div>

    <form onSubmit={send} className="border-t border-stone-200 bg-[#faf9f6] p-3">
      <label htmlFor="change" className="sr-only">Ask for a change to the lesson</label>
      <div className="rounded-2xl border border-stone-300 bg-white p-2 focus-within:border-teal-600">
        <textarea id="change" dir="auto" value={draft} rows={2} disabled={!brief || busy}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) send(event); }}
          placeholder={brief ? 'Ask for changes, e.g. make it shorter or add a step about…' : 'Start a new lesson to ask for changes'}
          className="block w-full resize-none bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-60" />
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="text-xs text-red-600" role="status">{tooLong && 'Too long. Shorten this change.'}</p>
          <button type="submit" disabled={!canSend} aria-label="Send change" title="Send change"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white disabled:bg-stone-300">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </div>
    </form>
  </div>;
}
