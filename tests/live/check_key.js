// A small request through the same adapter used by the application. Never prints keys or provider bodies.
import { createAI } from '../../server/src/ai.js';

if (!process.env.GEMINI_API_KEY) {
  console.error('Set GEMINI_API_KEY in .env, then run this again.');
  process.exit(1);
}
try {
  await createAI({ apiKey: process.env.GEMINI_API_KEY }).classify({ studentText: 'I do not know', step: { title: 'Test', source: 'Water freezes at zero degrees Celsius.' } });
  console.log('Gemini key works; structured responses are available.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
