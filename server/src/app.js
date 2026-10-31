import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));
  return app;
}
