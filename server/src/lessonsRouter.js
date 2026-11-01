import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { ChatError } from './chatService.js';
import { ProviderError } from './ai.js';
import { extractDocument, MAX_FILE_BYTES } from './documents.js';
import { PlanError } from './lessonPlan.js';
import { DEFAULT_TOKEN_BUDGET, PartError, prepareMaterial } from './material.js';
import { sessionKey } from './session.js';

// The first goal is limited to 500 characters in the UI; follow-up changes are appended, so the server allows more.
export const MAX_PROMPT_CHARS = 1500;
// Token budget for the material of one build. The default fits the free Groq key (about 8,000 tokens per minute).
const materialBudget = Number(process.env.MATERIAL_TOKEN_BUDGET) || DEFAULT_TOKEN_BUDGET;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 } });
const buildPrompt = z.string().trim().min(1).max(MAX_PROMPT_CHARS);
// Which part of a long file to build the lesson from; the first when the field is missing.
const buildPart = z.coerce.number().int().min(0).max(999).default(0);

function sendFailure(res, error) {
  if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
  if (error instanceof PlanError) return res.status(502).json({ error: 'The lesson plan did not pass the source check. Try again.' });
  if (error instanceof ProviderError) return res.status(502).json({ error: error.message });
  console.error('[lessons] unexpected failure:', error.name, error.message);
  return res.status(500).json({ error: 'Could not build the lesson. Try again.' });
}

export function createLessonsRouter({ store, chat, aiFor }) {
  const router = Router();

  // Teacher upload: one PDF or DOCX plus the teacher's prompt becomes the lesson the chat teaches.
  router.post('/build', (req, res, next) => upload.single('file')(req, res, error => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'Choose a file up to 10 MB.' : 'Attach one PDF or DOCX file.' });
  }), async (req, res) => {
    const prompt = buildPrompt.safeParse(req.body?.prompt);
    if (!prompt.success) return res.status(400).json({ error: `Write a lesson goal of up to ${MAX_PROMPT_CHARS} characters.` });
    const part = buildPart.safeParse(req.body?.part);
    if (!part.success) return res.status(400).json({ error: 'Choose a valid part of the file.' });
    let document;
    try {
      document = await extractDocument(req.file);
    } catch (error) {
      // The reader writes user-facing messages for bad files (wrong type, scanned, too long).
      return res.status(400).json({ error: error.message });
    }
    // A long file is split into parts that each fit one request; the lesson is built from the chosen part.
    let prepared;
    try {
      prepared = prepareMaterial(document, { budget: materialBudget, part: part.data });
    } catch (error) {
      if (error instanceof PartError) return res.status(400).json({ error: error.message });
      throw error;
    }
    const { text, notice } = prepared;
    try {
      chat.reset(sessionKey(req));
      const plan = await store.build({ key: sessionKey(req), ai: aiFor(req), text, teacherPrompt: prompt.data });
      if (plan.error) return res.status(422).json({ error: plan.error });
      res.json({ ...plan, fileName: document.name, warnings: document.warnings, material: notice });
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
