import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { ChatError } from './chatService.js';
import { ProviderError } from './ai.js';
import { extractDocument, MAX_FILE_BYTES } from './documents.js';
import { PlanError } from './lessonPlan.js';
import { DEFAULT_TOKEN_BUDGET, MaterialError, prepareDocument } from './material.js';
import { DocumentMapError } from './documentMap.js';
import { sessionKey } from './session.js';

// The setup UI limits goals to 500 characters; retain the 1500-character API allowance for tools and existing clients.
export const MAX_PROMPT_CHARS = 1500;
// Token budget for the material of one build. Kept conservative across provider quotas.
const materialBudget = Number(process.env.MATERIAL_TOKEN_BUDGET) || DEFAULT_TOKEN_BUDGET;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4 } });
const buildPrompt = z.string().trim().min(1).max(MAX_PROMPT_CHARS);

const THIN_TEXT_WORDS = 150;

// A refusal reads better with the facts about the file: how little text was readable and which pages had none.
function refusalMessage(reason, document, text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const unreadablePages = document.warnings.find(warning => warning.startsWith('No readable text on PDF pages'));
  const notes = [];
  if (words < THIN_TEXT_WORDS) notes.push(`Only about ${words} words could be read from this file.`);
  if (unreadablePages) notes.push(unreadablePages);
  if (notes.length) notes.push('Images, scans, formulas and matrices are not read; a file with ordinary text works best.');
  return [reason, ...notes].join(' ');
}

function sendFailure(res, error) {
  if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
  if (error instanceof PlanError) return res.status(502).json({ error: 'The lesson plan did not pass the source check. Try again.' });
  if (error instanceof DocumentMapError) return res.status(502).json({ error: error.message });
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
    // Old clients must not silently build a partial lesson using a stale part control.
    if (req.body?.part !== undefined && String(req.body.part) !== '0') {
      return res.status(400).json({ error: 'Section selection is no longer needed. Refresh the app and rebuild to use the whole document.' });
    }
    let document;
    try {
      document = await extractDocument(req.file);
    } catch (error) {
      // The reader writes user-facing messages for bad files (wrong type, scanned, too long).
      return res.status(400).json({ error: error.message });
    }
    // Consider every readable section; internal chunks are mapped before final lesson selection.
    let prepared;
    try {
      prepared = prepareDocument(document, { budget: materialBudget });
    } catch (error) {
      if (error instanceof MaterialError) return res.status(400).json({ error: error.message });
      throw error;
    }
    const { text, chunks, notice } = prepared;
    try {
      chat.reset(sessionKey(req));
      const plan = await store.build({ key: sessionKey(req), ai: aiFor(req), text, chunks, teacherPrompt: prompt.data });
      if (plan.error) return res.status(422).json({ error: refusalMessage(plan.error, document, text) });
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

  // Public welcome content: lesson overview and topic titles, never internal goals or source quotes.
  router.get('/:id', (req, res) => {
    const plan = store.getPublished(req.params.id);
    if (!plan) return res.status(404).json({ error: 'This lesson link is not available. Ask your teacher for a new link.' });
    res.json({ id: req.params.id, rules: plan.rules, stepCount: plan.steps.length,
      topics: plan.steps.map(step => step.title), introduction: plan.introduction ?? null });
  });
  return router;
}
