import { useEffect, useRef, useState } from 'react';
import { goalProblem, MAX_PROMPT, PLACEHOLDER } from './goalRules.js';
import KeySettings from './KeySettings.jsx';

const WARN_AT = 450;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['pdf', 'docx'];
const EXAMPLE = 'Teach this to 7th graders, in French. Be Socratic. Keep it under 15 minutes.';
// One template: a whole goal with [placeholders] the teacher fills in. The brackets are highlighted and block Build until replaced.
const TEMPLATE = 'Teach [topic] to [grade] students, in [language]. Be Socratic. Check understanding after each step. Keep it under [minutes] minutes.';

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Returns a message for a file the server would refuse, or null when the file can be sent.
function fileProblem(file) {
  const extension = file.name.split('.').at(-1).toLowerCase();
  if (!ACCEPTED.includes(extension)) return 'Choose a .docx or .pdf file.';
  if (file.size > MAX_FILE_BYTES) return 'That file is larger than 10 MB. Choose a smaller file.';
  if (file.size === 0) return 'That file is empty. Choose another file.';
  return null;
}

// Stage one: the empty goal box. Submitting hands the file and goal to the app, which opens the split workspace.
export default function SetupScreen({ apiKey, onKeyChange, onSubmit, appError, onDismissAppError }) {
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const goal = useRef(null);
  const backdrop = useRef(null);
  // After a template is inserted, the first [placeholder] is selected so the teacher can type over it.
  const selectPlaceholder = useRef(false);

  // The goal box grows with the text, up to a limit, so long goals stay visible.
  useEffect(() => {
    const field = goal.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 320)}px`;
    if (selectPlaceholder.current) {
      selectPlaceholder.current = false;
      const match = PLACEHOLDER.exec(prompt);
      if (match) {
        field.focus();
        field.setSelectionRange(match.index, match.index + match[0].length);
      }
    }
  }, [prompt]);

  // The goal is drawn twice: the real textarea has transparent text, and this copy behind it paints the [brackets] light green.
  const highlighted = prompt.split(/(\[[^\]]*\])/).map((part, index) => (index % 2
    ? <mark key={index} className="rounded bg-emerald-100 text-emerald-900">{part}</mark>
    : part));

  const reason = !file ? 'Add a .docx or .pdf file to continue.' : goalProblem(prompt);
  const canBuild = !reason;
  const wouldExceed = prompt.trim() ? prompt.trimEnd().length + TEMPLATE.length + 1 > MAX_PROMPT : false;

  // An empty box takes the template. A box with text gets the template on a new line, so nothing is lost.
  function insertTemplate(text) {
    setPrompt(current => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
    selectPlaceholder.current = true;
  }

  function pick(candidate) {
    if (!candidate) return;
    const problem = fileProblem(candidate);
    setError(problem ?? '');
    setFile(problem ? null : candidate);
  }

  function build(event) {
    event.preventDefault();
    if (!canBuild) return;
    setError('');
    onDismissAppError?.();
    onSubmit({ file, prompt: prompt.trim() });
  }

  const counterClass = prompt.length >= WARN_AT ? 'font-semibold text-red-600' : 'text-stone-500';

  return <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <form onSubmit={build} noValidate className="w-full max-w-3xl">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">What should the student learn from this file?</h1>
        <p id="goal-hint" className="mt-2 text-sm text-stone-500">Say who it is for, how the tutor should teach, and how long. The tutor follows this closely.</p>
      </div>

      {/* One large composer, as in Claude and Base44: the goal, the attached file, + and send live together.
          Dropping a file anywhere on it works too. */}
      <div onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
        className={`mt-8 rounded-3xl border bg-white shadow-lg transition focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10 ${dragging ? 'border-teal-600 bg-teal-50/40' : 'border-stone-300'}`}>
        <div className="relative">
          <div ref={backdrop} aria-hidden="true" dir="auto"
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-5 pt-5 text-base leading-7 text-stone-900 sm:text-lg">{highlighted}{'\n'}</div>
          <textarea id="goal" ref={goal} dir="auto" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={MAX_PROMPT} rows={4}
            onScroll={event => { if (backdrop.current) backdrop.current.scrollTop = event.target.scrollTop; }}
            placeholder={EXAMPLE} aria-describedby="goal-help goal-hint"
            className="relative block max-h-80 min-h-[9rem] w-full resize-none rounded-t-3xl bg-transparent px-5 pt-5 text-base leading-7 text-transparent caret-stone-900 outline-none placeholder:text-stone-400 sm:min-h-[11rem] sm:text-lg" />
        </div>

        {file && <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-stone-100 px-4 py-2 text-sm">
          <p dir="auto" className="min-w-0 truncate"><span className="font-medium">{file.name}</span> <span className="text-stone-500">· {formatSize(file.size)}</span></p>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFile(null)}
            className="shrink-0 rounded-md px-2 text-lg leading-none text-stone-600 hover:bg-stone-200">×</button>
        </div>}

        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Attach a .docx or .pdf file" title="Attach a file" disabled={Boolean(file)}
              onClick={() => input.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 text-xl leading-none text-stone-700 hover:border-teal-600 hover:text-teal-800 disabled:opacity-40">+</button>
            <span className="hidden text-xs text-stone-500 sm:inline">{file ? 'File attached' : '.docx or .pdf, up to 10 MB'}</span>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-xs ${counterClass}`} aria-live="polite">{prompt.length} / {MAX_PROMPT}</p>
            <button type="submit" disabled={!canBuild} aria-label="Build lesson" title="Build lesson"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:bg-stone-300">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept=".docx,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={event => { pick(event.target.files[0]); event.target.value = ''; }} />

      <p id="goal-help" className="mt-3 text-center text-sm text-stone-600" role="status">{reason}</p>

      <div className="mt-4 text-center">
        <button type="button" disabled={wouldExceed} title={TEMPLATE} onClick={() => insertTemplate(TEMPLATE)}
          className="rounded-full border border-teal-300 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 hover:border-teal-600 disabled:opacity-50">
          Use the template
        </button>
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {appError && !error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        {appError} <button type="button" className="underline" onClick={onDismissAppError}>Dismiss</button>
      </p>}

      <div className="mx-auto mt-8 max-w-xl"><KeySettings apiKey={apiKey} onKeyChange={onKeyChange} /></div>
    </form>
  </main>;
}
