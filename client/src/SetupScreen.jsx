import { useEffect, useRef, useState } from 'react';
import { buildLesson } from './api.js';

const MIN_PROMPT = 20;
const MAX_PROMPT = 500;
const WARN_AT = 450;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['pdf', 'docx'];
const EXAMPLE = 'Teach this to 7th graders, in French. Be Socratic. Keep it under 15 minutes.';
// Each chip adds one part of a good goal: who it is for, the language, how to teach, and how long.
const CHIPS = [
  { label: '7th graders', phrase: 'Teach this to 7th graders.' },
  { label: 'In French', phrase: 'Teach it in French.' },
  { label: 'Socratic', phrase: 'Be Socratic: ask questions instead of explaining everything.' },
  { label: 'Check understanding', phrase: 'Check understanding after each step.' },
  { label: 'Under 15 min', phrase: 'Keep it under 15 minutes.' },
];

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

export default function SetupScreen({ apiKey, onKeyChange, onBuilt, appError, onDismissAppError }) {
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [dragging, setDragging] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const input = useRef(null);
  const goal = useRef(null);

  // The build is one request, so the server reports no real progress. These stage labels follow
  // the elapsed time instead; they describe what happens, not a measured percentage.
  useEffect(() => {
    if (!building) return undefined;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { clearInterval(timer); setElapsed(0); };
  }, [building]);
  const stage = elapsed < 4 ? 'Reading the file…' : elapsed < 12 ? 'Planning the steps…' : 'Checking every quote against the file…';

  // The goal box grows with the text, up to a limit, so long goals stay visible.
  useEffect(() => {
    const field = goal.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 320)}px`;
  }, [prompt]);

  const promptLength = prompt.trim().length;
  const reason = !file
    ? 'Add a .docx or .pdf file to continue.'
    : promptLength < MIN_PROMPT
      ? `Write at least ${MIN_PROMPT - promptLength} more characters about what the student should learn.`
      : '';
  const canBuild = !reason && !building;

  function pick(candidate) {
    if (!candidate) return;
    const problem = fileProblem(candidate);
    setError(problem ?? '');
    setFile(problem ? null : candidate);
  }

  async function build(event) {
    event.preventDefault();
    if (!canBuild) return;
    setBuilding(true);
    setError('');
    onDismissAppError?.();
    try {
      const built = await buildLesson({ file, prompt: prompt.trim(), apiKey: apiKey.trim() });
      onBuilt(built);
    } catch (failure) {
      setError(`${failure.message} Change the file or the goal, then try again.`);
      setBuilding(false);
    }
  }

  const counterClass = prompt.length >= WARN_AT ? 'font-semibold text-red-600' : 'text-stone-500';

  return <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <form onSubmit={build} noValidate aria-busy={building} className="w-full max-w-3xl">
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
        <textarea id="goal" ref={goal} dir="auto" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={MAX_PROMPT} rows={4}
          disabled={building} placeholder={EXAMPLE} aria-describedby="goal-help goal-hint"
          className="block max-h-80 min-h-[9rem] w-full resize-none rounded-t-3xl bg-transparent px-5 pt-5 text-base leading-7 outline-none placeholder:text-stone-400 sm:min-h-[11rem] sm:text-lg disabled:opacity-60" />

        {file && <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-stone-100 px-4 py-2 text-sm">
          <p dir="auto" className="min-w-0 truncate"><span className="font-medium">{file.name}</span> <span className="text-stone-500">· {formatSize(file.size)}</span></p>
          <button type="button" aria-label={`Remove ${file.name}`} disabled={building} onClick={() => setFile(null)}
            className="shrink-0 rounded-md px-2 text-lg leading-none text-stone-600 hover:bg-stone-200 disabled:opacity-50">×</button>
        </div>}

        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Attach a .docx or .pdf file" title="Attach a file" disabled={building || Boolean(file)}
              onClick={() => input.current?.click()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 text-xl leading-none text-stone-700 hover:border-teal-600 hover:text-teal-800 disabled:opacity-40">+</button>
            <span className="hidden text-xs text-stone-500 sm:inline">{file ? 'File attached' : '.docx or .pdf, up to 10 MB'}</span>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-xs ${counterClass}`} aria-live="polite">{prompt.length} / {MAX_PROMPT}</p>
            <button type="submit" disabled={!canBuild} aria-label="Build lesson" title="Build lesson"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:bg-stone-300">
              {building
                ? <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
            </button>
          </div>
        </div>
      </div>
      <input ref={input} type="file" accept=".docx,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={building}
        onChange={event => { pick(event.target.files[0]); event.target.value = ''; }} />

      <p id="goal-help" className="mt-3 text-center text-sm text-stone-600" role="status">{reason}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Add to your goal">
        {CHIPS.map(chip => {
          const added = prompt.includes(chip.phrase);
          const wouldExceed = prompt.length + chip.phrase.length + 1 > MAX_PROMPT;
          return <button key={chip.label} type="button" disabled={building || added || wouldExceed} aria-pressed={added} title={chip.phrase}
            onClick={() => setPrompt(current => `${current.trim()} ${chip.phrase}`.trim())}
            className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${added ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-stone-300 bg-white text-stone-700 hover:border-teal-500'}`}>
            {added ? '✓ ' : '+ '}{chip.label}
          </button>;
        })}
      </div>

      {error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {appError && !error && <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        {appError} <button type="button" className="underline" onClick={onDismissAppError}>Dismiss</button>
      </p>}
      {building && <p role="status" className="mt-4 text-center text-sm text-stone-600">{stage} This can take up to a minute.</p>}

      <details className="mx-auto mt-8 max-w-xl rounded-xl bg-stone-50 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Settings</summary>
        <label htmlFor="api-key" className="mt-3 block font-medium">Groq API key</label>
        <input id="api-key" type="password" value={apiKey} onChange={event => onKeyChange(event.target.value)} autoComplete="off" spellCheck={false}
          disabled={building} placeholder="Paste your key (optional)" aria-describedby="key-help"
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-sm disabled:opacity-60" />
        <p id="key-help" className="mt-2 text-xs text-stone-600">
          Used for this session only. It stays in this page&apos;s memory and is never stored. Leave it empty to use the host&apos;s key.
        </p>
      </details>
    </form>
  </main>;
}
