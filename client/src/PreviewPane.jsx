import LessonChat from './LessonChat.jsx';

// The student's side, shown to the teacher: the lesson exactly as the student sees it.
export default function PreviewPane({ session }) {
  const { chat, building, buildError, streaming, restartPreview } = session;
  const empty = !chat && !streaming;

  return <div className="flex min-h-0 flex-1 flex-col bg-stone-100">
    <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Student preview</p>
      {chat && <button className="text-xs text-teal-800 underline disabled:opacity-50" disabled={streaming} onClick={restartPreview}>Restart preview</button>}
    </header>
    {building && <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span aria-hidden="true" className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-teal-700 border-t-transparent" />
      <p className="text-lg font-medium">Generating your lesson…</p>
      <p className="text-sm text-stone-600">This can take up to a minute. The student view appears here when it is ready.</p>
    </div>}
    {!building && empty && <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-stone-600">
      <p>{buildError ? 'The lesson was not built. Fix the goal on the left, then try again.' : 'Your lesson will appear here.'}</p>
    </div>}
    {!building && !empty && <LessonChat session={session} />}
  </div>;
}
