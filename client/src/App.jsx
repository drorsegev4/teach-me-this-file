import { useEffect, useState } from 'react';
import CreatePanel from './CreatePanel.jsx';
import PreviewPane from './PreviewPane.jsx';
import SetupScreen from './SetupScreen.jsx';
import StudentApp from './StudentApp.jsx';
import Workspace from './Workspace.jsx';
import { useLessonSession } from './useLessonSession.js';

const STUDENT_PATH = /^\/l\/([\w-]{4,32})\/?$/;

export default function App() {
  // The key lives here, so it survives moving between the teacher's page and a student page in one tab.
  const [apiKey, setApiKey] = useState('');
  const [path, setPath] = useState(window.location.pathname);
  // The teacher's session stays mounted while a student page is open, so Back returns to it unchanged.
  const session = { ...useLessonSession({ apiKey }), setApiKey };
  const { chat, brief, building, streaming, previewRequested, error, setError, build } = session;

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(to) {
    window.history.pushState(null, '', to);
    setPath(to);
  }

  const lessonId = STUDENT_PATH.exec(path)?.[1];
  if (lessonId) return <StudentApp key={lessonId} lessonId={lessonId} apiKey={apiKey} setApiKey={setApiKey} />;

  // Before a lesson exists, the goal box is the whole page. Once the teacher submits, the page splits:
  // the Create panel on the left, and on the right the student preview, which shows "generating" until the lesson is ready.
  if (!chat && !brief && !building && !streaming) {
    return <SetupScreen apiKey={apiKey} onKeyChange={setApiKey} onSubmit={build} appError={error} onDismissAppError={() => setError('')} />;
  }

  return <Workspace focus={chat || streaming || previewRequested ? 'preview' : 'create'}
    createPane={<CreatePanel session={session} onOpenStudent={id => go(`/l/${id}`)} />} previewPane={<PreviewPane session={session} />} />;
}
