// The lesson as a canvas: what was built from the file, the steps, and the source for each step.
export default function LessonCanvas({ session }) {
  const { chat, fileName } = session;
  const steps = chat?.steps ?? [];
  const rules = chat?.rules;
  const rulesLine = rules && [rules.audience, rules.language, rules.method, rules.timeLimit].filter(Boolean).join(' · ');

  // The source for a step is the quote the tutor used for it, shown once the step has been reached.
  function sourceFor(stepId) {
    return chat?.messages.find(message => message.role === 'tutor' && message.stepId === stepId && message.quote)?.quote ?? null;
  }

  return <div className="min-h-0 flex-1 overflow-y-auto bg-stone-100 p-4 sm:p-6">
    <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Lesson canvas</p>
      <h2 className="mt-1 truncate text-lg font-semibold" title={fileName}>{fileName || 'Your lesson'}</h2>
      {rulesLine && <p className="mt-1 text-sm text-stone-600">{rulesLine}</p>}

      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => {
          const done = chat.completedStepIds.includes(step.id);
          const current = step.id === chat.currentStepId;
          const source = sourceFor(step.id);
          const status = done ? 'Done' : current ? 'Now' : 'Next';
          const pill = done ? 'bg-teal-600 text-white' : current ? 'bg-teal-100 text-teal-900' : 'bg-stone-100 text-stone-500';
          return <li key={step.id} className="flex gap-3">
            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${pill}`}>{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{step.title}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{status}</span>
              </p>
              {source && <blockquote className="mt-2 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">“{source}”</blockquote>}
            </div>
          </li>;
        })}
      </ol>
    </article>
  </div>;
}
