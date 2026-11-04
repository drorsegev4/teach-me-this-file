import { useEffect, useState } from 'react';
import { getHostKey } from './api.js';
import KeySettings from './KeySettings.jsx';
import LessonChat from './LessonChat.jsx';
import LessonWelcome from './LessonWelcome.jsx';
import { useLessonSession } from './useLessonSession.js';

// The page a student gets from a published link: a landing card, then the lesson alone, full screen.
// It shows the public overview and topics, not the teacher prompt, source file or internal goals.
export default function StudentApp({ lessonId, apiKey, setApiKey }) {
  const session = { ...useLessonSession({ apiKey, lessonId }), setApiKey };
  const { chat, streaming, lesson, error, notice, startLesson } = session;
  const [hostKey, setHostKey] = useState(null);
  useEffect(() => { getHostKey().then(setHostKey); }, []);

  const needsKey = hostKey === false && !apiKey.trim();
  const rules = lesson.info?.rules;
  const facts = rules && [rules.audience, rules.language, rules.method, rules.timeLimit].filter(Boolean).join(' · ');

  if (chat || streaming) {
    return <main className="flex min-h-dvh flex-col bg-stone-100">
      <p className="px-4 pt-4 text-center text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
      <LessonChat session={session} />
    </main>;
  }

  if (lesson.status === 'ready') return <main className="flex min-h-dvh flex-col bg-stone-100">
    <p className="px-4 pt-4 text-center text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
    <LessonWelcome rules={rules} introduction={lesson.info.introduction} topics={lesson.info.topics}
      onBegin={startLesson} disabled={needsKey || hostKey === null}>
      {facts && <p dir="auto" className="mt-4 text-xs text-stone-500">{facts}</p>}
      {hostKey === false && <div className="mt-4"><KeySettings apiKey={apiKey} onKeyChange={setApiKey} open /></div>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-stone-600">{notice}</p>}
      {needsKey && <p className="mt-2 text-xs text-stone-500">Paste your Gemini API key above to start.</p>}
    </LessonWelcome>
  </main>;

  return <main className="flex min-h-dvh items-center justify-center bg-stone-100 px-4 py-10">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
      {lesson.status === 'loading' && <p role="status" className="mt-4 text-sm text-stone-700">Opening your lesson… The first visit can take up to a minute.</p>}
      {lesson.status === 'missing' && <>
        <h1 className="mt-3 text-xl font-semibold">This lesson is not available</h1>
        <p className="mt-2 text-sm text-stone-600">{lesson.message}</p>
      </>}
    </div>
  </main>;
}
