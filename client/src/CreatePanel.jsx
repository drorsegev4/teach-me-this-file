import { useState } from 'react';
import { fullGoal, MAX_TOTAL_PROMPT } from './goalRules.js';
import KeySettings from './KeySettings.jsx';

// Tells the teacher which part of the file the lesson was built from.
function materialNotes(material) {
  const notes = [];
  if (material.truncated) {
    const pages = material.pagesUsed;
    const where = pages && material.totalPages
      ? `pages ${pages.from}${pages.to === pages.from ? '' : `–${pages.to}`} of ${material.totalPages}${material.endsMidPage ? ' (the last page is cut)' : ''}`
      : material.usedPercent !== null ? `the first ${material.usedPercent}% of the file` : 'the start of the file';
    notes.push(`The file is longer than one lesson can read. This lesson uses ${where}. The rest is not part of it. To teach a later part, upload that part as its own file.`);
  }
  if (material.removedRepeats > 0) notes.push(`Skipped ${material.removedRepeats} repeated paragraph${material.removedRepeats === 1 ? '' : 's'}.`);
  return notes;
}

// The teacher's side. Top: the lesson plan, with the source quote behind each step.
// Below: the conversation with the builder (the goal, then each change asked for), and a box at the bottom for the next change.
export default function CreatePanel({ session, onOpenStudent }) {
  const { chat, brief, plan, building, buildError, streaming, fileName, material, apiKey, setApiKey, build, requestChange, newLesson, published, publishing, publishError, publish } = session;
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const link = published ? `${window.location.origin}/l/${published.id}` : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard can be blocked; the link is shown to copy by hand */ }
  }

  const steps = chat?.steps ?? plan?.steps ?? [];
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Lesson plan</h2>
        {steps.length > 0 && !published && <button type="button" disabled={busy || publishing} onClick={publish}
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white disabled:bg-stone-300">{publishing ? 'Publishing…' : 'Publish for students'}</button>}
      </div>
      {published && <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs">
        <p className="font-medium text-teal-900">Published. Share this link with students:</p>
        <p dir="ltr" className="mt-1 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-stone-700">{link}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={copy} className="rounded-lg border border-teal-700 px-3 py-1.5 text-teal-900">{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" onClick={() => onOpenStudent(published.id)} className="rounded-lg bg-teal-700 px-3 py-1.5 text-white">Open as student</button>
        </div>
        <p className="mt-2 text-stone-600">Students see the lesson only, not your goal or plan. Changing the lesson later needs a new Publish and a new link.</p>
      </div>}
      {publishError && <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">{publishError}</p>}
      {building && <p role="status" className="mt-2 flex items-center gap-3 text-sm text-stone-700">
        <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
        Generating your lesson…
      </p>}
      {!building && steps.length === 0 && <p className="mt-2 text-sm text-stone-600">The steps will appear here once the lesson is built.</p>}
      {steps.length > 0 && <>
        <p dir="auto" className="mt-1 truncate text-xs text-stone-600" title={fileName}>{fileName}</p>
        <ol className="mt-3 space-y-3">
          {steps.map((step, index) => {
            const done = Boolean(chat?.completedStepIds.includes(step.id));
            const current = Boolean(chat) && step.id === chat.currentStepId;
            const movedOn = Boolean(chat?.movedOnStepIds.includes(step.id));
            const status = done ? 'Done' : movedOn ? 'Moved on' : current ? 'Now' : 'Next';
            const pill = done ? 'bg-teal-600 text-white' : movedOn ? 'bg-stone-200 text-stone-700' : current ? 'bg-teal-100 text-teal-900' : 'bg-stone-100 text-stone-500';
            return <li key={step.id ?? index} className="flex gap-3">
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
      {!building && material && materialNotes(material).map(note => <p key={note} role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{note}</p>)}
      {building && <p role="status" className="text-sm text-stone-600">Working on it…</p>}
      {buildError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p>{buildError}</p>
        <button className="mt-2 underline disabled:opacity-50" disabled={busy} onClick={() => build(brief)}>Try again</button>
      </div>}
      {!building && !buildError && steps.length > 0 && <p className="text-sm text-stone-600">Your lesson is ready: {steps.length} steps. Try it in the student preview, or ask for a change below.</p>}
      <KeySettings apiKey={apiKey} onKeyChange={setApiKey} disabled={busy} open={Boolean(buildError)}
        onApply={buildError && brief ? () => build(brief) : undefined} applyLabel="Use this key and try again" />
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
