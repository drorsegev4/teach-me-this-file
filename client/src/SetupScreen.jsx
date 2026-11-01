import { useEffect, useRef, useState } from 'react';
import { goalProblem, MAX_PROMPT } from './goalRules.js';
import KeySettings from './KeySettings.jsx';

const WARN_AT = 450;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['pdf', 'docx'];
// A fixed example of a good goal: audience, language, method, checking and time. It works with any file, and the teacher edits it.
const EXAMPLE_GOAL = 'Teach this file to 7th grade students, in English. Be Socratic. Check understanding after each step. Keep it under 15 minutes.';
// The parts of the example that are the teacher's to decide. They are painted light green wherever they appear in the box.
const CHOICES = ['7th grade', 'English', 'Socratic', '15 minutes'];
const CHOICES_PATTERN = new RegExp(`(${CHOICES.join('|')})`);

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

  // The goal box grows with the text, up to a limit, so long goals stay visible.
  useEffect(() => {
    const field = goal.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 320)}px`;
  }, [prompt]);

  // The goal is drawn twice: the real textarea has transparent text, and this copy behind it paints the choices light green.
  const parts = prompt.split(CHOICES_PATTERN);
  const hasChoices = parts.length > 1;
  const highlighted = parts.map((part, index) => (index % 2
    ? <mark key={index} className="rounded bg-emerald-100 text-emerald-900">{part}</mark>
    : part));

  const reason = !file ? 'Add a .docx or .pdf file to continue.' : goalProblem(prompt);
  const canBuild = !reason;

  // The example fills an empty box and leaves the cursor at the end, ready to edit.
  function useExample() {
    setPrompt(EXAMPLE_GOAL);
    requestAnimationFrame(() => {
      const field = goal.current;
      field?.focus();
      field?.setSelectionRange(EXAMPLE_GOAL.length, EXAMPLE_GOAL.length);
    });
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
            placeholder={EXAMPLE_GOAL} aria-describedby="goal-help goal-hint"
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
      {hasChoices && <p className="mt-1 text-center text-xs text-stone-500">The <mark className="rounded bg-emerald-100 px-1 text-emerald-900">green</mark> parts are yours to decide. Change them to fit your class.</p>}

      {!prompt.trim() && <div className="mt-4 text-center">
        <button type="button" title={EXAMPLE_GOAL} onClick={useExample}
          className="rounded-full border border-teal-300 bg-teal-50 px-4 py-2.5 text-xs text-teal-900 hover:border-teal-600">
          Use an example goal
        </button>
      </div>}

      {error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {appError && !error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        {appError} <button type="button" className="underline" onClick={onDismissAppError}>Dismiss</button>
      </p>}

      <div className="mx-auto mt-8 max-w-xl"><KeySettings apiKey={apiKey} onKeyChange={onKeyChange} /></div>
    </form>
  </main>;
}
