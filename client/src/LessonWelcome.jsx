import { languageDirection } from './direction.js';
import { welcomeCopy } from './welcomeCopy.js';

// Shared by the teacher preview and student link. No provider request until Begin.
export default function LessonWelcome({ rules, introduction, topics = [], onBegin, disabled = false, children }) {
  const copy = welcomeCopy(rules?.language);
  return <section dir={languageDirection(rules?.language)} aria-label={copy.welcome}
    className="mx-auto my-auto w-full max-w-lg px-4 py-8">
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6">
      <p className="text-sm font-medium text-teal-800">{copy.welcome}</p>
      {introduction?.title && <h1 dir="auto" className="mt-2 text-xl font-semibold text-stone-900">{introduction.title}</h1>}
      {introduction?.documentOverview && <p dir="auto" className="mt-3 text-sm leading-6 text-stone-700">{introduction.documentOverview}</p>}
      {introduction?.documentOverview && <h2 className="mt-4 text-xs font-semibold text-teal-800">{copy.scope}</h2>}
      <p dir="auto" className="mt-3 text-sm leading-6 text-stone-700">{introduction?.overview || copy.fallback}</p>
      {topics.length > 0 && <div className="mt-5">
        <h2 className="text-xs font-semibold text-stone-600">{copy.topics}</h2>
        <ol className="mt-2 space-y-2 text-sm text-stone-800">
          {topics.map((topic, index) => <li key={index} className="flex gap-2">
            <span aria-hidden="true" className="font-medium text-teal-700">{index + 1}.</span>
            <span dir="auto">{topic}</span>
          </li>)}
        </ol>
      </div>}
      <p className="mt-5 text-sm leading-6 text-stone-600">{copy.how}</p>
      {children}
      <button type="button" onClick={onBegin} disabled={disabled}
        className="mt-5 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-medium text-white disabled:bg-stone-300">{copy.begin}</button>
    </div>
  </section>;
}
