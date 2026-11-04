import LessonChat from './LessonChat.jsx';
import LessonWelcome from './LessonWelcome.jsx';

// The student's side, shown to the teacher: the lesson exactly as the student sees it.
export default function PreviewPane({ session }) {
  const { chat, plan, building, buildError, streaming, error, notice, restartPreview, startLesson, publishing } = session;
  const empty = !chat && !streaming;

  return <div className="flex min-h-0 flex-1 flex-col bg-stone-100">
    <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Student preview</p>
      {chat && <button className="-my-2 px-2 py-2 text-xs text-teal-800 underline disabled:opacity-50" disabled={streaming} onClick={restartPreview}>Restart preview</button>}
    </header>
    {building && <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span aria-hidden="true" className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-teal-700 border-t-transparent" />
      <p className="text-lg font-medium">Generating your lesson…</p>
      <p className="text-sm text-stone-600">Preparing a document-wide overview and a focused lesson. Longer documents may take a little longer.</p>
    </div>}
    {!building && empty && !plan && <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-stone-600">
      {buildError && <p>The lesson was not built. Retry from the lesson details, or start a new lesson with a different goal.</p>}
      {!buildError && <p>Your lesson will appear here.</p>}
    </div>}
    {!building && empty && plan && <LessonWelcome rules={plan.rules} introduction={plan.introduction}
      topics={plan.steps.map(step => step.title)} onBegin={startLesson} disabled={publishing}>
        {error && <p role="alert" dir="auto" className="max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-3 text-stone-800">{error}</p>}
        {notice && <p role="status">{notice}</p>}
    </LessonWelcome>}
    {!building && !empty && <LessonChat session={session} />}
  </div>;
}
