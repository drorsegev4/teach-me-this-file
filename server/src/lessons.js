import { readFileSync } from 'node:fs';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { ChatError } from './chat.js';
import { ProviderError } from './ai.js';
import { extractDocument, MAX_FILE_BYTES } from './documents.js';
import { generateLessonPlan, PlanError } from './lessonPlan.js';

// The hardcoded sample for this stage; the upload screen replaces these later.
export const sampleText = readFileSync(new URL('../fixtures/sample-document.txt', import.meta.url), 'utf8');
export const sampleTeacherPrompt = 'Teach this to 7th graders, in English. Be Socratic. Keep it under 15 minutes.';
export const MIN_PROMPT_CHARS = 20;
export const MAX_PROMPT_CHARS = 500;

// One plan is shared by every request until a new one is built. Concurrent requests await
// the same promise, so a double click makes one model call.
export function createPlanStore({ ai: defaultAI } = {}) {
  let current = null;

  function generate(model, { text, teacherPrompt }) {
    const attempt = generateLessonPlan({ ai: model, text, teacherPrompt })
      .then(plan => (plan.error ? { error: plan.error } : { rules: plan.rules, steps: plan.steps }));
    // Failed or refused plans are not kept, so the next request tries again.
    attempt.then(plan => { if (plan.error && current === attempt) current = null; }, () => { if (current === attempt) current = null; });
    current = attempt;
    return attempt;
  }

  return {
    get({ fresh = false, ai = defaultAI } = {}) {
      if (fresh || !current) return generate(ai, { text: sampleText, teacherPrompt: sampleTeacherPrompt });
      return current;
    },
    build({ ai = defaultAI, text, teacherPrompt }) {
      return generate(ai, { text, teacherPrompt });
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
  console.error('[lessons] unexpected failure:', error.name);
  return res.status(500).json({ error: 'Could not build the lesson. Try again.' });
}

export function createLessonsRouter({ store, chat, aiFor }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lesson request.' });
    try {
      const plan = await store.get({ fresh: parsed.data.fresh, ai: aiFor(req) });
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
    try {
      chat.reset();
      const plan = await store.build({ ai: aiFor(req), text: document.segments.map(segment => segment.text).join(''), teacherPrompt: prompt.data });
      if (plan.error) return res.status(422).json({ error: plan.error });
      res.json({ ...plan, fileName: document.name, warnings: document.warnings });
    } catch (error) {
      sendFailure(res, error);
    }
  });
  return router;
}
