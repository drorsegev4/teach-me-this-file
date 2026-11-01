import CreatePanel from './CreatePanel.jsx';
import PreviewPane from './PreviewPane.jsx';
import SetupScreen from './SetupScreen.jsx';
import Workspace from './Workspace.jsx';
import { useLessonSession } from './useLessonSession.js';

export default function App() {
  const session = useLessonSession();
  const { chat, brief, building, streaming, buildError, error, setError, apiKey, setApiKey, build } = session;

  // Before a lesson exists, the goal box is the whole page. Once the teacher submits, the page splits:
  // the Create panel on the left, and on the right the student preview, which shows "generating" until the lesson is ready.
  if (!chat && !brief && !building && !streaming) {
    return <SetupScreen apiKey={apiKey} onKeyChange={setApiKey} onSubmit={build} appError={error} onDismissAppError={() => setError('')} />;
  }

  return <Workspace focus={building || buildError ? 'create' : 'preview'} createPane={<CreatePanel session={session} />} previewPane={<PreviewPane session={session} />} />;
}
