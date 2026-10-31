import { useState } from 'react';
import { requestLesson } from './api.js';

export default function App() {
  const [lesson, setLesson] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openStep, setOpenStep] = useState(null);

  async function start(fresh) {
    setBusy(true);
    setError('');
    try {
      setLesson(await requestLesson({ fresh }));
      setOpenStep(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const total = lesson?.steps.length ?? 0;
  const { rules } = lesson ?? {};
  const rulesLine = rules && [rules.audience, rules.language, rules.method, rules.timeLimit].filter(Boolean).join(' · ');

  return <main className="mx-auto min-h-dvh max-w-md px-5 py-8">
    <header className="mb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
      <h1 className="mt-1 text-2xl font-semibold">Lesson plan preview</h1>
    </header>

    {!lesson && <button className="w-full rounded-xl bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => start(false)}>
      {busy ? 'Building your lesson…' : 'Start lesson'}
    </button>}

    {busy && lesson && <p role="status" className="mb-4 text-sm text-teal-700">Building a new plan…</p>}
    {busy && !lesson && <p role="status" className="mt-4 text-sm text-teal-700">This can take a few seconds.</p>}

    {error && <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
      <p>{error}</p>
      <button className="mt-2 underline disabled:opacity-50" disabled={busy} onClick={() => start(false)}>Try again</button>
    </div>}

    {lesson && <>
      <section aria-label="Lesson rules" className="mb-5 rounded-xl bg-teal-950 p-4 text-sm text-teal-100">{rulesLine}</section>
      <ol className="space-y-3">
        {lesson.steps.map((step, index) => {
          const isOpen = openStep === index;
          return <li key={index}>
            <button className="w-full rounded-xl border border-stone-200 bg-white p-4 text-left" aria-expanded={isOpen} onClick={() => setOpenStep(isOpen ? null : index)}>
              <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">Step {index + 1} of {total}</span>
              <span className="mt-1 block font-medium">{step.title}</span>
            </button>
            {isOpen && <blockquote className="mt-2 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">From the material</span>
              “{step.source}”
            </blockquote>}
          </li>;
        })}
      </ol>
      <button className="mt-6 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-medium disabled:opacity-50" disabled={busy} onClick={() => start(true)}>
        {busy ? 'Building…' : 'New plan'}
      </button>
    </>}
  </main>;
}
