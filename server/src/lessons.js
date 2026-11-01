import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { ChatError } from './chat.js';
import { ProviderError } from './ai.js';
import { extractDocument, MAX_FILE_BYTES } from './documents.js';
import { generateLessonPlan, PlanError } from './lessonPlan.js';
import { DEFAULT_KEY, remember, sessionKey } from './session.js';

// The hardcoded sample for this stage; the upload screen replaces these later.
export const sampleText = readFileSync(new URL('../fixtures/sample-document.txt', import.meta.url), 'utf8');
export const sampleTeacherPrompt = 'Teach this to 7th graders, in English. Be Socratic. Keep it under 15 minutes.';
export const MIN_PROMPT_CHARS = 20;
// The first goal is limited to 500 characters in the UI; follow-up changes are appended, so the server allows more.
export const MAX_PROMPT_CHARS = 1500;
// A conservative guess below the size that failed with Groq 413. Not yet tuned against Groq's exact limit.
export const MAX_MATERIAL_CHARS = 12000;

const MAX_DRAFTS = 200;
const MAX_PUBLISHED = 100;

// Each session has its own draft plan; a draft is shared by that session's requests until a new one is built.
// Concurrent requests await the same promise, so a double click makes one model call.
// Publishing copies the draft plan under a link id, so later rebuilds do not change what students see.
export function createPlanStore({ ai: defaultAI } = {}) {
  const drafts = new Map();
  const published = new Map();

  function generate(key, model, { text, teacherPrompt }) {
    const attempt = generateLessonPlan({ ai: model, text, teacherPrompt })
      .then(plan => (plan.error ? { error: plan.error } : { rules: plan.rules, steps: plan.steps }));
    const entry = { attempt, publishedId: null };
    remember(drafts, key, entry, MAX_DRAFTS);
    // Failed or refused plans are not kept, so the next request tries again.
    const forget = () => { if (drafts.get(key) === entry) drafts.delete(key); };
    attempt.then(plan => { if (plan.error) forget(); }, forget);
    return attempt;
  }

  return {
    get({ key = DEFAULT_KEY, fresh = false, ai = defaultAI } = {}) {
      const entry = drafts.get(key);
      if (fresh || !entry) return generate(key, ai, { text: sampleText, teacherPrompt: sampleTeacherPrompt });
      return entry.attempt;
    },
    build({ key = DEFAULT_KEY, ai = defaultAI, text, teacherPrompt }) {
      return generate(key, ai, { text, teacherPrompt });
    },
    // Returns the link id for the session's current draft, or null when there is no usable draft.
    async publish({ key = DEFAULT_KEY } = {}) {
      const entry = drafts.get(key);
      const plan = entry && await entry.attempt;
      if (!plan || plan.error) return null;
      if (!entry.publishedId) {
        entry.publishedId = randomBytes(6).toString('base64url');
        remember(published, entry.publishedId, plan, MAX_PUBLISHED);
      }
      return entry.publishedId;
    },
    getPublished(id) {
      return published.get(id) ?? null;
    },
  };
}

const body = z.object({ fresh: z.boolean().optional() }).strict();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 } });
const buildPrompt = z.string().trim().min(MIN_PROMPT_CHARS).max(MAX_PROMPT_CHARS);

function sendFailure(res, error) {
  if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
  if (error instanceof PlanError) return res.status(502).json({ error: 'The lesson plan did not pass the source check. Try again.' });
  if (error instanceof ProviderError) return res.status(502).json({ error: error.message });
  console.error('[lessons] unexpected failure:', error.name, error.message);
  return res.status(500).json({ error: 'Could not build the lesson. Try again.' });
}

export function createLessonsRouter({ store, chat, aiFor }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lesson request.' });
    try {
      const plan = await store.get({ key: sessionKey(req), fresh: parsed.data.fresh, ai: aiFor(req) });
      if (plan.error) return res.status(422).json({ error: plan.error });
      res.json(plan);
    } catch (error) {
      sendFailure(res, error);
    }
  });

  // Teacher upload: one PDF or DOCX plus the teacher's prompt becomes the lesson the chat teaches.
  router.post('/build', (req, res, next) => upload.single('file')(req, res, error => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'Choose a file up to 10 MB.' : 'Attach one PDF or DOCX file.' });
  }), async (req, res) => {
    const prompt = buildPrompt.safeParse(req.body?.prompt);
    if (!prompt.success) return res.status(400).json({ error: `Write a lesson goal of ${MIN_PROMPT_CHARS} to ${MAX_PROMPT_CHARS} characters.` });
    let document;
    try {
      document = await extractDocument(req.file);
    } catch (error) {
      // The reader writes user-facing messages for bad files (wrong type, scanned, too long).
      return res.status(400).json({ error: error.message });
    }
    const text = document.segments.map(segment => segment.text).join('');
    // The whole material goes to the model in one request, and Groq rejects requests this large (413).
    if (text.length > MAX_MATERIAL_CHARS) {
      return res.status(413).json({ error: `This file has ${text.length.toLocaleString('en-US')} characters. Use a file with at most ${MAX_MATERIAL_CHARS.toLocaleString('en-US')} characters (roughly 4 pages) for now. Nothing was cut.` });
    }
    try {
      chat.reset(sessionKey(req));
      const plan = await store.build({ key: sessionKey(req), ai: aiFor(req), text, teacherPrompt: prompt.data });
      if (plan.error) return res.status(422).json({ error: plan.error });
      res.json({ ...plan, fileName: document.name, warnings: document.warnings });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  // The teacher publishes the lesson they built: the draft plan is saved under a link id.
  router.post('/publish', async (req, res) => {
    try {
      const id = await store.publish({ key: sessionKey(req) });
      if (!id) return res.status(409).json({ error: 'Build a lesson first.' });
      res.json({ id });
    } catch (error) {
      sendFailure(res, error);
    }
  });

  // What a student sees before starting: the lesson rules and how many steps, never the goal, file or sources.
  router.get('/:id', (req, res) => {
    const plan = store.getPublished(req.params.id);
    if (!plan) return res.status(404).json({ error: 'This lesson link is not available. Ask your teacher for a new link.' });
    res.json({ id: req.params.id, rules: plan.rules, stepCount: plan.steps.length });
  });
  return router;
}
