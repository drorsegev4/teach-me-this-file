import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const clientDist = fileURLToPath(new URL('../../dist/', import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  // Production: serve the built client from the same origin. In development Vite serves it instead.
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('/{*splat}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
  }
  return app;
}
