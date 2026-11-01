// Dev-only prompt playground API. Mounted only when NODE_ENV=development or DEV_TOOLS=1.
// Never returns the Groq key; it reads and writes the real prompt files and scenario files.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { z } from 'zod';
import { ChatError, createChatService } from './chat.js';
import { PROMPT_NAMES, ProviderError, readPrompt, writePrompt } from './ai.js';
import { generateLessonPlan, PlanError } from './lessonPlan.js';
import { sampleText, sampleTeacherPrompt } from './sample.js';

export const devToolsEnabled = () => process.env.NODE_ENV === 'development' || process.env.DEV_TOOLS === '1';

const scenariosDirectory = fileURLToPath(new URL('../../tests/scenarios/', import.meta.url));
const idPattern = /^[a-z0-9-]+$/;

const slugify = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scenario';
const pick = ({ role, text, stepId, status, attempt }) => ({ role, text, stepId, status, attempt });

function sendError(res, error) {
  if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
  if (error instanceof PlanError) return res.status(502).json({ error: error.message, attempts: error.attempts.map(attempt => ({ problem: attempt.problem, raw: attempt.raw })) });
  if (error instanceof ProviderError) return res.status(502).json({ error: error.message });
  console.error('[dev] unexpected failure:', error.name);
  return res.status(500).json({ error: 'Unexpected error. See the server log.' });
}

export function createDevRouter({ ai, directory = scenariosDirectory }) {
  const router = express.Router();
  // The plan and chat the simulator uses. Rebuilt whenever a plan is built.
  let current = null;

  const scenarioPath = id => join(directory, `${id}.json`);
  function readScenario(id) {
    if (!idPattern.test(id) || !existsSync(scenarioPath(id))) return null;
    return JSON.parse(readFileSync(scenarioPath(id), 'utf8'));
  }

  router.get('/status', (_req, res) => res.json({ enabled: true }));

  router.get('/defaults', (_req, res) => res.json({ material: sampleText, teacherPrompt: sampleTeacherPrompt }));

  router.get('/prompts', (_req, res) => {
    res.json(Object.fromEntries(PROMPT_NAMES.map(name => [name, readPrompt(name)])));
  });

  router.put('/prompts/:name', (req, res) => {
    if (!PROMPT_NAMES.includes(req.params.name)) return res.status(404).json({ error: 'Unknown prompt.' });
    const parsed = z.object({ text: z.string().min(1).max(20000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Prompt must be 1 to 20,000 characters.' });
    writePrompt(req.params.name, parsed.data.text);
    res.json({ saved: req.params.name });
  });

  router.post('/plan', async (req, res) => {
    const parsed = z.object({
      material: z.string().trim().min(1).max(60000),
      teacherPrompt: z.string().trim().min(1).max(4000),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Material and teacher prompt are required.' });
    const { material, teacherPrompt } = parsed.data;
    try {
      const plan = await generateLessonPlan({ ai, text: material, teacherPrompt });
      if (plan.error) return res.status(422).json({ error: plan.error });
      const checked = { rules: plan.rules, steps: plan.steps };
      current = {
        material, teacherPrompt, plan: checked,
        chat: createChatService({ ai, store: { getDraft: async () => checked } }),
      };
      res.json({ ...checked, attempts: plan.attempts.map(attempt => ({ problem: attempt.problem, raw: attempt.raw })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/chat', (_req, res) => res.json(current?.chat.view() ?? null));

  router.post('/chat', async (req, res) => {
    if (!current) return res.status(409).json({ error: 'Build a plan first.' });
    const parsed = z.discriminatedUnion('type', [
      z.object({ type: z.literal('start') }).strict(),
      z.object({ type: z.literal('message'), text: z.string().trim().min(1).max(2000) }).strict(),
    ]).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid chat request.' });
    try {
      res.json(await current.chat.turn(parsed.data));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/chat/reset', (_req, res) => {
    if (!current) return res.json(null);
    try {
      current.chat.reset();
      res.json(null);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get('/scenarios', (_req, res) => {
    if (!existsSync(directory)) return res.json([]);
    const scenarios = readdirSync(directory).filter(file => file.endsWith('.json')).map(file => {
      const { id, name, expected, verdict, note, createdAt } = JSON.parse(readFileSync(join(directory, file), 'utf8'));
      return { id, name, expected, verdict, note, createdAt };
    });
    res.json(scenarios);
  });

  router.post('/scenarios', (req, res) => {
    const parsed = z.object({
      name: z.string().trim().min(1).max(120),
      expected: z.string().trim().min(1).max(2000),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'A name and an expected behavior are required.' });
    const state = current?.chat.view();
    if (!state) return res.status(409).json({ error: 'Build a plan and run the simulator first.' });
    const studentMessages = state.messages.filter(message => message.role === 'student').map(message => message.text);
    if (!studentMessages.length) return res.status(409).json({ error: 'Send at least one student message first.' });

    const scenario = {
      id: `${slugify(parsed.data.name)}-${Date.now().toString(36)}`,
      name: parsed.data.name,
      createdAt: new Date().toISOString(),
      material: current.material,
      teacherPrompt: current.teacherPrompt,
      plan: current.plan,
      studentMessages,
      transcript: state.messages.map(pick),
      expected: parsed.data.expected,
      verdict: 'pending',
      note: '',
    };
    mkdirSync(directory, { recursive: true });
    writeFileSync(scenarioPath(scenario.id), JSON.stringify(scenario, null, 2) + '\n');
    res.status(201).json(scenario);
  });

  router.get('/scenarios/:id', (req, res) => {
    const scenario = readScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found.' });
    res.json(scenario);
  });

  router.patch('/scenarios/:id', (req, res) => {
    const scenario = readScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found.' });
    const parsed = z.object({
      verdict: z.enum(['pending', 'pass', 'fail']),
      note: z.string().max(2000),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Verdict must be pass, fail or pending.' });
    Object.assign(scenario, parsed.data);
    writeFileSync(scenarioPath(scenario.id), JSON.stringify(scenario, null, 2) + '\n');
    res.json(scenario);
  });

  // Runs the saved student messages through the current prompts, on the saved plan.
  router.post('/scenarios/:id/replay', async (req, res) => {
    const scenario = readScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found.' });
    const chat = createChatService({ ai, store: { getDraft: async () => scenario.plan } });
    let error = null;
    try {
      await chat.turn({ type: 'start' });
      for (const text of scenario.studentMessages) await chat.turn({ type: 'message', text });
    } catch (failure) {
      error = failure.message;
    }
    res.json({
      oldTranscript: scenario.transcript,
      newTranscript: (chat.view()?.messages ?? []).map(pick),
      error,
    });
  });

  return router;
}
