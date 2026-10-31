import { createApp } from './app.js';

// Hosts set PORT and need 0.0.0.0; locally the server stays on 127.0.0.1:3001.
const port = Number(process.env.PORT) || 3001;
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';

createApp().listen(port, host, () => {
  console.log(`Teaching app listening at http://${host}:${port}`);
});
