import { createApp } from './app.js';

createApp().listen(3001, '127.0.0.1', () => {
  console.log('Teaching API listening at http://127.0.0.1:3001');
});
