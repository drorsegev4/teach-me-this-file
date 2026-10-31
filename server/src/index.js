import { createApp } from './app.js';

// PORT and HOST come from .env locally and from the host's settings in production (see render.yaml).
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';

createApp().listen(port, host, () => {
  console.log(`Teaching app listening at http://${host}:${port}`);
});
