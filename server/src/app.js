import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAI, createMockAI } from './ai.js';
import { createChatRouter } from './chatRouter.js';
import { createChatService } from './chatService.js';
import { createLessonsRouter } from './lessonsRouter.js';
import { createPlanStore } from './planStore.js';
import { isValidSessionId, SESSION_HEADER } from './session.js';

const clientDist = fileURLToPath(new URL('../../dist/', import.meta.url));
export const KEY_HEADER = 'X-AI-Api-Key';

// AI_MODE=mock serves a saved plan and scripted replies instead of calling the provider (for UI work offline).
// MOCK_DELAY_MS slows the scripted reply down so Stop can be tried by hand.
function defaultAI() {
  if (process.env.AI_MODE === 'mock') {
    return createMockAI(JSON.parse(readFileSync(new URL('../fixtures/mock-lesson-plan.json', import.meta.url), 'utf8')), { delayMs: Number(process.env.MOCK_DELAY_MS) || 30 });
  }
  return createAI({ apiKey: process.env.GEMINI_API_KEY });
}

// The reviewer's key travels in a header for one request. It is used for that call only and is
// never stored or logged. Without it, the host's GEMINI_API_KEY is used.
function reviewerKey(req) {
  return req.get(KEY_HEADER)?.trim() || process.env.GEMINI_API_KEY;
}

// A local prompt playground, kept out of the repository. It is mounted only when the file exists and is enabled.
const dev = process.env.NODE_ENV === 'development' || process.env.DEV_TOOLS === '1'
  ? await import('./devTools.js').catch(() => null)
  : null;

export function createApp({ ai: injectedAI, devTools = Boolean(dev?.devToolsEnabled()) } = {}) {
  const app = express();
  const fallbackAI = injectedAI ?? defaultAI();
  const aiFor = req => injectedAI ?? (process.env.AI_MODE === 'mock' ? fallbackAI : createAI({ apiKey: reviewerKey(req) }));
  const store = createPlanStore();
  const chat = createChatService({ store });
  app.disable('x-powered-by');
  // Dev tools go first: they take larger bodies (material text) and are absent unless enabled.
  if (devTools && dev) app.use('/api/dev', express.json({ limit: '1mb' }), dev.createDevRouter({ ai: fallbackAI }));
  app.use('/api', (req, res, next) => {
    const key = req.get(KEY_HEADER);
    if (key && (key.trim().length > 200 || /\s/.test(key.trim()))) {
      return res.status(400).json({ error: 'That API key does not look valid. Check it in Settings and try again.' });
    }
    const session = req.get(SESSION_HEADER);
    if (session !== undefined && !isValidSessionId(session)) return res.status(400).json({ error: 'Invalid session. Reload the page.' });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, hostKey: Boolean(process.env.GEMINI_API_KEY) }));
  app.use('/api/lessons', createLessonsRouter({ store, chat, aiFor }));
  app.use('/api/chat', createChatRouter({ chat, aiFor }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  // Production: serve the built client from the same origin. In development Vite serves it instead.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  return app;
}
