import { useState } from 'react';
import KeySettings from './KeySettings.jsx';

export default function CreatePanel({ session, onOpenStudent }) {
  const { chat, brief, plan, building, buildError, streaming, fileName, material, apiKey, setApiKey, build, newLesson, published, publishing, publishError, publish } = session;
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
  const busy = building || streaming || publishing;
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Create lesson</p>
      <button className="-my-2 px-2 py-2 text-xs text-teal-800 underline disabled:opacity-50" disabled={busy} onClick={newLesson}>New lesson</button>
    </header>

    <section aria-label="Lesson plan" className="max-h-[40vh] shrink-0 overflow-y-auto border-b border-stone-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Lesson plan</h2>
        {steps.length > 0 && !published && <button type="button" disabled={busy || publishing} onClick={publish}
          className="rounded-lg bg-teal-700 px-3 py-2.5 text-xs font-medium text-white disabled:bg-stone-300">{publishing ? 'Publishing…' : 'Publish for students'}</button>}
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
                  <summary className="cursor-pointer py-2">Source from the file</summary>
                  <blockquote dir="auto" className="mt-1 rounded-lg bg-stone-50 p-3 leading-5">“{step.source}”</blockquote>
                </details>
              </div>
            </li>;
          })}
        </ol>
      </>}
    </section>

    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" role="log" aria-label="Lesson details">
      {brief
        ? <>
          <div className="rounded-2xl bg-stone-200/70 px-4 py-3 text-sm leading-6">
            <p dir="auto">{brief.prompt}</p>
            <p dir="auto" className="mt-2 truncate text-xs text-stone-600">File: <span className="font-medium">{brief.file.name}</span></p>
          </div>
        </>
        : <p className="text-sm text-stone-600">This lesson was built before you reloaded the page. Start a new lesson to change it.</p>}
      {!building && material?.wholeDocument && <p className="text-xs text-stone-500">The lesson was selected from the whole readable document.</p>}
      {!building && material?.warnings?.filter(warning => warning.startsWith('No readable text')).map(warning =>
        <p key={warning} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{warning}</p>)}
      {!building && material && (material.removedRepeats > 0 || material.warnings?.length > 0) && <details className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600">
        <summary className="cursor-pointer">File details</summary>
        {material.removedRepeats > 0 && <p className="mt-2">Removed {material.removedRepeats} repeated paragraphs.</p>}
        {material.warnings?.map(warning => <p key={warning} className="mt-2">{warning}</p>)}
      </details>}
      {building && <p role="status" className="text-sm text-stone-600">Working on it…</p>}
      {buildError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <p>{buildError}</p>
        <button className="mt-2 underline disabled:opacity-50" disabled={busy} onClick={() => build(brief)}>Try again</button>
      </div>}
      {!building && !buildError && steps.length > 0 && <p className="text-sm text-stone-600">Review the plan, begin the lesson, or publish it for students.</p>}
      <KeySettings apiKey={apiKey} onKeyChange={setApiKey} disabled={busy} open={Boolean(buildError)}
        onApply={buildError && brief ? () => build(brief) : undefined} applyLabel="Use this key and try again" />
    </div>

  </div>;
}
