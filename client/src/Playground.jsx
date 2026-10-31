import { useEffect, useState } from 'react';

// Dev-only. Talks to /api/dev, which exists only when DEV_TOOLS=1 or NODE_ENV=development.
async function dev(method, path, body) {
  const response = await fetch(`/api/dev${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

const box = 'w-full rounded-lg border border-stone-300 bg-white p-2 font-mono text-xs';
const button = 'rounded-lg border border-stone-300 bg-white px-3 py-1 text-sm disabled:opacity-50';
const primary = 'rounded-lg bg-teal-700 px-3 py-1 text-sm text-white disabled:opacity-50';

export default function Playground() {
  const [enabled, setEnabled] = useState(null);
  const [error, setError] = useState('');
  const [prompts, setPrompts] = useState({});
  const [material, setMaterial] = useState('');
  const [teacherPrompt, setTeacherPrompt] = useState('');
  const [plan, setPlan] = useState(null);
  const [chat, setChat] = useState(null);
  const [studentText, setStudentText] = useState('');
  const [busy, setBusy] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState('');
  const [expected, setExpected] = useState('');
  const [replay, setReplay] = useState(null);
  const [notes, setNotes] = useState({});

  async function run(task) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run(async () => {
      try {
        await dev('GET', '/status');
      } catch {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      const [defaults, loaded, list, state] = await Promise.all([
        dev('GET', '/defaults'), dev('GET', '/prompts'), dev('GET', '/scenarios'), dev('GET', '/chat'),
      ]);
      setMaterial(defaults.material);
      setTeacherPrompt(defaults.teacherPrompt);
      setPrompts(loaded);
      setScenarios(list);
      setChat(state);
    });
  }, []);

  if (enabled === false) return <main className="p-6"><p>The playground is off. Set DEV_TOOLS=1 in .env and restart the server.</p></main>;
  if (!enabled) return <main className="p-6"><p>Loading…</p></main>;

  const steps = chat?.steps ?? [];
  const stepNumber = id => steps.findIndex(step => step.id === id) + 1;

  const savePrompt = name => run(async () => {
    await dev('PUT', `/prompts/${name}`, { text: prompts[name] });
  });

  const buildPlan = () => run(async () => {
    const result = await dev('POST', '/plan', { material, teacherPrompt });
    setPlan(result);
    setChat(await dev('POST', '/chat/reset'));
  });

  const turn = body => run(async () => setChat(await dev('POST', '/chat', body)));

  const sendAnswer = event => {
    event.preventDefault();
    const text = studentText.trim();
    if (!text) return;
    setStudentText('');
    turn({ type: 'message', text });
  };

  const reset = () => run(async () => setChat(await dev('POST', '/chat/reset')));

  const saveScenario = () => run(async () => {
    const saved = await dev('POST', '/scenarios', { name: scenarioName, expected });
    setScenarios(list => [...list, { id: saved.id, name: saved.name, expected: saved.expected, verdict: saved.verdict, note: '', createdAt: saved.createdAt }]);
    setScenarioName('');
    setExpected('');
  });

  const setVerdict = (scenario, verdict) => run(async () => {
    const updated = await dev('PATCH', `/scenarios/${scenario.id}`, { verdict, note: notes[scenario.id] ?? scenario.note ?? '' });
    setScenarios(list => list.map(item => (item.id === scenario.id ? { ...item, ...updated } : item)));
  });

  const runReplay = scenario => run(async () => setReplay({ id: scenario.id, ...(await dev('POST', `/scenarios/${scenario.id}/replay`)) }));

  return <main className="min-h-dvh bg-stone-100 p-4 text-sm">
    <header className="mb-4">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Dev only · prompt playground</p>
      {error && <p role="alert" className="mt-2 rounded bg-amber-100 p-2 text-amber-900">{error}</p>}
    </header>

    <div className="grid gap-4 lg:grid-cols-3">
      <section className="space-y-3 rounded-xl bg-white p-4" aria-label="Prompts">
        <h2 className="font-semibold">Prompts</h2>
        <p className="text-xs text-stone-500">Save writes the real file. Changes apply to the next call.</p>
        {Object.keys(prompts).map(name => <div key={name} className="space-y-1">
          <label className="block font-medium" htmlFor={`prompt-${name}`}>{name}.md</label>
          <textarea id={`prompt-${name}`} className={`${box} h-48`} value={prompts[name]} onChange={event => setPrompts({ ...prompts, [name]: event.target.value })} />
          <button className={button} disabled={busy} onClick={() => savePrompt(name)}>Save {name}.md</button>
        </div>)}
      </section>

      <section className="space-y-4 rounded-xl bg-white p-4" aria-label="Setup and plan">
        <h2 className="font-semibold">Setup and plan</h2>
        <label className="block">
          <span className="font-medium">Material</span>
          <textarea className={`${box} h-40`} value={material} onChange={event => setMaterial(event.target.value)} />
        </label>
        <label className="block">
          <span className="font-medium">Teacher prompt</span>
          <input className={box} value={teacherPrompt} onChange={event => setTeacherPrompt(event.target.value)} />
        </label>
        <button className={primary} disabled={busy} onClick={buildPlan}>Build plan</button>
        {plan && <div className="space-y-2">
          <p className="text-xs text-stone-600">{Object.entries(plan.rules).map(([key, value]) => `${key}: ${value ?? '—'}`).join(' · ')}</p>
          <ol className="list-decimal space-y-1 pl-5">{plan.steps.map((step, index) => <li key={index}><strong>{step.title}</strong><br /><span className="text-xs text-stone-500">“{step.source}”</span></li>)}</ol>
          <details><summary className="cursor-pointer text-xs">Attempts ({plan.attempts.length})</summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs">{plan.attempts.map(attempt => `${attempt.problem ?? 'passed'}`).join('\n')}</pre>
          </details>
        </div>}
      </section>

      <section className="space-y-3 rounded-xl bg-white p-4" aria-label="Student simulator">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Student simulator</h2>
          <button className={button} disabled={busy || !plan} onClick={reset}>Reset</button>
        </div>
        {!plan && <p className="text-stone-500">Build a plan first.</p>}
        {chat && <div className="rounded-lg bg-stone-50 p-2 text-xs">
          <p>currentStep: {chat.currentStepId ?? 'none'} · completedSteps: {chat.completedStepIds.join(', ') || 'none'}</p>
          <p>attemptsPerStep: {Object.entries(chat.attemptsPerStep).map(([id, count]) => `${id}=${count}`).join(' ')}</p>
        </div>}
        {plan && !chat?.messages.length && <button className={primary} disabled={busy} onClick={() => turn({ type: 'start' })}>Start simulator</button>}
        {chat?.messages.length > 0 && <ol className="space-y-2" aria-label="Transcript">
          {chat.messages.map(message => message.role === 'student'
            ? <li key={message.id} className="ml-6 rounded bg-teal-100 p-2">Student: {message.text}</li>
            : <li key={message.id} className="mr-6 rounded bg-white p-2 shadow-sm">
              <p>Tutor: {message.text}</p>
              <p className="mt-1 text-xs text-stone-500">status {message.status} · attempt {message.attempt} · step {stepNumber(message.stepId)} of {steps.length}</p>
            </li>)}
        </ol>}
        {chat && !chat.lessonComplete && plan && <form onSubmit={sendAnswer} className="space-y-2">
          <textarea className={`${box} h-20`} value={studentText} onChange={event => setStudentText(event.target.value)} placeholder="Student message" />
          <button className={primary} disabled={busy || !studentText.trim()}>Send as student</button>
        </form>}
        {chat?.lessonComplete && <p className="font-medium">Lesson complete.</p>}

        <div className="space-y-2 border-t border-stone-200 pt-3">
          <h3 className="font-medium">Save as test case</h3>
          <input className={box} placeholder="Name" value={scenarioName} onChange={event => setScenarioName(event.target.value)} />
          <textarea className={`${box} h-16`} placeholder="Expected behavior" value={expected} onChange={event => setExpected(event.target.value)} />
          <button className={button} disabled={busy || !chat?.messages.length || !scenarioName.trim() || !expected.trim()} onClick={saveScenario}>Save as test case</button>
        </div>
      </section>
    </div>

    <section className="mt-4 space-y-3 rounded-xl bg-white p-4" aria-label="Test cases">
      <h2 className="font-semibold">Test cases</h2>
      {scenarios.length === 0 && <p className="text-stone-500">None saved yet. Files go to tests/scenarios/.</p>}
      {scenarios.map(scenario => <article key={scenario.id} className="space-y-2 rounded-lg border border-stone-200 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{scenario.name}</strong>
          <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">{scenario.verdict}</span>
          <button className={button} disabled={busy} onClick={() => runReplay(scenario)}>Replay</button>
          {['pass', 'fail', 'pending'].map(verdict => <button key={verdict} className={button} disabled={busy} onClick={() => setVerdict(scenario, verdict)}>{verdict}</button>)}
        </div>
        <p className="text-xs text-stone-600">Expected: {scenario.expected}</p>
        <textarea className={`${box} h-14`} placeholder="Note" value={notes[scenario.id] ?? scenario.note ?? ''} onChange={event => setNotes({ ...notes, [scenario.id]: event.target.value })} />
        {replay?.id === scenario.id && <div className="grid gap-3 md:grid-cols-2">
          <TranscriptColumn title="Saved (old prompts)" messages={replay.oldTranscript} />
          <TranscriptColumn title="Replay (current prompts)" messages={replay.newTranscript} />
          {replay.error && <p className="text-amber-900 md:col-span-2">Replay stopped: {replay.error}</p>}
        </div>}
      </article>)}
    </section>
  </main>;
}

function TranscriptColumn({ title, messages }) {
  return <div className="space-y-1 rounded-lg bg-stone-50 p-2">
    <h3 className="font-medium">{title}</h3>
    {messages.map((message, index) => <p key={index} className={message.role === 'student' ? 'text-teal-800' : ''}>
      <span className="font-medium">{message.role}:</span> {message.text}
      {message.role === 'tutor' && <span className="block text-xs text-stone-500">status {message.status} · attempt {message.attempt}</span>}
    </p>)}
  </div>;
}
