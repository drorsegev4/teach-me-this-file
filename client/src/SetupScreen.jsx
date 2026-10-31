import { useRef, useState } from 'react';
import { buildLesson } from './api.js';

const MIN_PROMPT = 20;
const MAX_PROMPT = 500;
const WARN_AT = 450;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['pdf', 'docx'];
const EXAMPLE = 'Teach this to 7th graders, in French. Be Socratic. Keep it under 15 minutes.';

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
  const input = useRef(null);

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
      await buildLesson({ file, prompt: prompt.trim(), apiKey: apiKey.trim() });
      onBuilt();
    } catch (failure) {
      setError(`${failure.message} Change the file or the goal, then try again.`);
      setBuilding(false);
    }
  }

  const counterClass = prompt.length >= WARN_AT ? 'font-semibold text-red-600' : 'text-stone-500';

  return <main className="flex min-h-dvh items-center justify-center px-4 py-8">
    <form onSubmit={build} noValidate aria-busy={building} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Teach Me This File</p>
      <h1 className="mt-2 text-xl font-semibold">Build a lesson from a file</h1>

      <label htmlFor="goal" className="mt-6 block text-sm font-medium">What should the student learn from this file?</label>
      <textarea id="goal" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={MAX_PROMPT} rows={4}
        disabled={building} placeholder={EXAMPLE} aria-describedby="goal-help"
        className="mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm leading-6 disabled:opacity-60" />
      <div id="goal-help" className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p className="text-stone-600" role="status">{reason}</p>
        <p className={counterClass} aria-live="polite">{prompt.length} / {MAX_PROMPT}</p>
      </div>

      <input ref={input} type="file" accept=".docx,.pdf" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={building}
        onChange={event => { pick(event.target.files[0]); event.target.value = ''; }} />
      <div className="mt-6">
        {file
          ? <div className="flex items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 p-4 text-sm">
            <p className="min-w-0 truncate"><span className="font-medium">{file.name}</span> <span className="text-stone-500">· {formatSize(file.size)}</span></p>
            <button type="button" className="shrink-0 text-teal-800 underline disabled:opacity-50" disabled={building} onClick={() => setFile(null)}>Remove</button>
          </div>
          : <button type="button" disabled={building} onClick={() => input.current?.click()}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files[0]); }}
            className={`w-full rounded-xl border-2 border-dashed p-6 text-center text-sm disabled:opacity-60 ${dragging ? 'border-teal-600 bg-teal-50' : 'border-stone-300 bg-stone-50'}`}>
            <span className="font-medium text-teal-800">Drop a file here</span>
            <span className="block text-stone-600">or tap to choose a .docx or .pdf file (up to 10 MB)</span>
          </button>}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {appError && !error && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        {appError} <button type="button" className="underline" onClick={onDismissAppError}>Dismiss</button>
      </p>}

      <details className="mt-6 rounded-xl bg-stone-50 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Settings</summary>
        <label htmlFor="api-key" className="mt-3 block font-medium">Groq API key</label>
        <input id="api-key" type="password" value={apiKey} onChange={event => onKeyChange(event.target.value)} autoComplete="off" spellCheck={false}
          disabled={building} placeholder="Paste your key (optional)" aria-describedby="key-help"
          className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-sm disabled:opacity-60" />
        <p id="key-help" className="mt-2 text-xs text-stone-600">
          Used for this session only. It stays in this page&apos;s memory and is never stored. Leave it empty to use the host&apos;s key.
        </p>
      </details>

      <button type="submit" disabled={!canBuild} className="mt-6 w-full rounded-xl bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50">
        {building && <span aria-hidden="true" className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent align-[-1px]" />}
        {building ? 'Building lesson…' : 'Build lesson'}
      </button>
      {building && <p role="status" className="mt-2 text-center text-xs text-stone-600">Reading the file and checking every quote. This can take up to a minute.</p>}
    </form>
  </main>;
}
