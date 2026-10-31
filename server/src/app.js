import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAI, createMockAI } from './ai.js';
import { createChatRouter, createChatService } from './chat.js';
import { createDevRouter, devToolsEnabled } from './devTools.js';
import { createLessonsRouter, createPlanStore } from './lessons.js';

const clientDist = fileURLToPath(new URL('../../dist/', import.meta.url));

// AI_MODE=mock serves a saved plan and scripted replies instead of calling the provider (for UI work offline).
function defaultAI() {
  if (process.env.AI_MODE === 'mock') {
    return createMockAI(JSON.parse(readFileSync(new URL('../fixtures/mock-lesson-plan.json', import.meta.url), 'utf8')));
  }
  return createAI({ apiKey: process.env.GROQ_API_KEY });
}

export function createApp({ ai = defaultAI(), devTools = devToolsEnabled() } = {}) {
  const app = express();
  const store = createPlanStore({ ai });
  const chat = createChatService({ ai, store });
  app.disable('x-powered-by');
  // Dev tools go first: they take larger bodies (material text) and are absent unless enabled.
  if (devTools) app.use('/api/dev', express.json({ limit: '1mb' }), createDevRouter({ ai }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/lessons', createLessonsRouter({ store }));
  app.use('/api/chat', createChatRouter({ chat }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  // Production: serve the built client from the same origin. In development Vite serves it instead.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  return app;
}
