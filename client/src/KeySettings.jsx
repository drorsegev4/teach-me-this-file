// The reviewer's Groq key. It lives in page memory only and travels with each request.
export default function KeySettings({ apiKey, onKeyChange, disabled }) {
  return <details className="rounded-xl bg-stone-50 p-4 text-sm">
    <summary className="cursor-pointer font-medium">Settings</summary>
    <label htmlFor="api-key" className="mt-3 block font-medium">Groq API key</label>
    <input id="api-key" type="password" value={apiKey} onChange={event => onKeyChange(event.target.value)} autoComplete="off" spellCheck={false}
      disabled={disabled} placeholder="Paste your key (optional)" aria-describedby="key-help"
      className="mt-2 w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-sm disabled:opacity-60" />
    <p id="key-help" className="mt-2 text-xs text-stone-600">
      Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline">console.groq.com/keys</a>.
      Used for this session only. It stays in this page&apos;s memory and is never stored. Leave it empty to use the host&apos;s key.
    </p>
  </details>;
}
