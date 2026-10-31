import LessonCanvas from './LessonCanvas.jsx';
import LessonChat from './LessonChat.jsx';
import SetupScreen from './SetupScreen.jsx';
import Workspace from './Workspace.jsx';
import { useLessonSession } from './useLessonSession.js';

export default function App() {
  const session = useLessonSession();
  const { chat, streaming, error, setError, apiKey, setApiKey, startBuiltLesson } = session;

  // Before a lesson exists, the setup card is the whole page. Once it is built, the lesson opens
  // in the workspace: chat beside the lesson canvas.
  if (!chat && !streaming) {
    return <SetupScreen apiKey={apiKey} onKeyChange={setApiKey} onBuilt={startBuiltLesson} appError={error} onDismissAppError={() => setError('')} />;
  }

  return <Workspace chatPane={<LessonChat session={session} />} canvasPane={<LessonCanvas session={session} />} />;
}
