// Other providers' keys fail with a bare "rejected" message, so name the likely mistake as soon as it is pasted.
function wrongProvider(key) {
  const value = key.trim();
  if (value.startsWith('gsk_')) return 'This looks like a Groq key. This app uses Gemini.';
  if (value.startsWith('sk-')) return 'This looks like an OpenAI or Anthropic key. This app uses Gemini.';
  return '';
}

// The reviewer's Gemini key. It lives in page memory only and travels with each request.
// `onApply` (optional) is the action that should run with the key, such as retrying a failed build;
// Enter in the field or the button runs it.
export default function KeySettings({ apiKey, onKeyChange, disabled, open = false, onApply, applyLabel = 'Use this key' }) {
  const warning = wrongProvider(apiKey);
  const hasKey = Boolean(apiKey.trim());
  const canApply = Boolean(onApply) && hasKey && !warning && !disabled;
  return <details open={open || undefined} className="rounded-xl bg-stone-50 p-4 text-sm">
    <summary className="cursor-pointer py-1 font-medium">Settings</summary>
    <label htmlFor="api-key" className="mt-3 block font-medium">Gemini API key</label>
    <input id="api-key" type="password" value={apiKey} onChange={event => onKeyChange(event.target.value)} autoComplete="off" spellCheck={false}
      onKeyDown={event => { if (event.key === 'Enter' && canApply) onApply(); }}
      disabled={disabled} placeholder="Paste your Gemini key (starts with AIza)" aria-describedby="key-help"
      className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-sm disabled:opacity-60" />
    {warning && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{warning} Get a Gemini key below.</p>}
    {hasKey && !warning && <p role="status" className="mt-2 text-xs text-teal-800">Key set. It is sent with the next request.</p>}
    {onApply && <button type="button" disabled={!canApply} onClick={onApply}
      className="mt-2 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white disabled:bg-stone-300">{applyLabel}</button>}
    <p id="key-help" className="mt-2 text-xs text-stone-600">
      Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline">aistudio.google.com/apikey</a>.
      Used for this session only. It stays in this page&apos;s memory and is never stored. Leave it empty to use the host&apos;s key.
    </p>
  </details>;
}
