// Checks that a Groq key works and how much allowance it has, with one tiny request (about 80 tokens).
// Usage: npm run check:key            uses GROQ_API_KEY from .env
//        GROQ_API_KEY=... npm run check:key
// The key is never printed.
import { MODEL } from '../../server/src/ai.js';

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.log('No GROQ_API_KEY found. Put it in .env, then run this again.');
  process.exit(1);
}

const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: MODEL, max_completion_tokens: 8, reasoning_effort: 'low', messages: [{ role: 'user', content: 'hi' }] }),
});
const header = name => response.headers.get(name);

if (response.status === 200) {
  console.log('KEY WORKS');
  console.log(`  tokens left this minute: ${header('x-ratelimit-remaining-tokens')} of ${header('x-ratelimit-limit-tokens')}`);
  console.log(`  requests left today: ${header('x-ratelimit-remaining-requests')} of ${header('x-ratelimit-limit-requests')}`);
} else if (response.status === 429) {
  const seconds = Number(header('retry-after'));
  console.log('KEY IS VALID BUT OUT OF ALLOWANCE');
  console.log(`  wait about ${seconds ? `${Math.ceil(seconds / 60)} minutes (${seconds} seconds)` : 'a minute'}, or use a key from another Groq account.`);
} else if (response.status === 401) {
  console.log('KEY REJECTED by Groq. Check that it starts with gsk_ and was copied whole.');
} else {
  console.log(`UNEXPECTED: HTTP ${response.status}`);
}
process.exitCode = response.status === 200 ? 0 : 1;
