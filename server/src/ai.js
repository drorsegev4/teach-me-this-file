import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { lessonPlanSchema } from './lessonPlan.js';

export const MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const PROMPT_NAMES = ['lesson_plan', 'check', 'tutor'];

// Read on every call, so edits to the prompt files apply without a restart.
export function readPrompt(name) {
  return readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8');
}

export function writePrompt(name, text) {
  writeFileSync(new URL(`../prompts/${name}.md`, import.meta.url), text);
}

export const checkSchema = z.object({
  status: z.enum(['understood', 'keep_going', 'off_file', 'no_attempt']),
}).strict();

export class ProviderError extends Error {}

// The real adapter and the mock share one interface, so the rest of the app never knows which it has.
export function createAI({ apiKey, fetchImpl: rawFetch = fetch } = {}) {
  const fetchImpl = retrying(rawFetch);
  return {
    async planLesson({ text, teacherPrompt, problem }) {
      return callStructured({
        apiKey, fetchImpl, name: 'lesson_plan', instructions: readPrompt('lesson_plan'),
        input: { teacherPrompt, material: text, ...(problem ? { previousProblem: problem } : {}) },
        schema: lessonPlanSchema,
      });
    },
    async classify(input) {
      return callStructured({ apiKey, fetchImpl, name: 'step_check', instructions: readPrompt('check'), input, schema: checkSchema });
    },
    async replyStream(input) {
      return streamTutorReply({ apiKey, fetchImpl, ...input });
    },
  };
}

// Scripted responses for tests and mock mode; never calls a provider.
// Plans come back in order (the last repeats). Checks are simple: 3+ words is understood,
// a question about weather is off the material. Replies are fixed text, streamed word by word.
export function createMockAI(planResponses, { delayMs = 30 } = {}) {
  const queue = Array.isArray(planResponses) ? [...planResponses] : [planResponses];
  const inputs = [];
  return {
    inputs,
    async planLesson(input) {
      inputs.push(input);
      return structuredClone(queue.length > 1 ? queue.shift() : queue[0]);
    },
    async classify({ studentText }) {
      if (/weather/i.test(studentText)) return { status: 'off_file' };
      if (/don'?t know/i.test(studentText)) return { status: 'no_attempt' };
      return { status: studentText.trim().split(/\s+/).length >= 3 ? 'understood' : 'keep_going' };
    },
    async replyStream({ status, step, nextStep, attempt, onChunk, signal }) {
      const text = mockReply(status, step, nextStep, attempt);
      let full = '';
      for (const word of text.split(' ')) {
        await pause(delayMs, signal);
        const chunk = full ? ` ${word}` : word;
        full += chunk;
        onChunk(chunk);
      }
      return full;
    },
  };
}

function mockReply(status, step, nextStep, attempt) {
  if (status === 'open') return `Let's begin. ${step.title} Think about what the passage says.`;
  if (status === 'keep_going') return `Not quite yet (attempt ${attempt}). Look at the passage again: which part helps answer "${step.title}"?`;
  if (status === 'no_attempt') return `That is fine. Let's try a smaller question about "${step.title}".`;
  if (status === 'off_file') return `That is outside this material, so I cannot answer it here. Back to our step: ${step.title}`;
  if (status === 'moved_on') return `We can come back to "${step.title}" later. ${nextStep ? `Next: ${nextStep.title}` : 'That was the last step.'}`;
  return nextStep ? `Yes, that is the idea. Next: ${nextStep.title}` : 'Yes, that is the idea. You finished the lesson.';
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });
}

// One lesson build uses most of a minute's allowance on the free key, so a rate-limited call may need a
// real wait. Each wait and the total are bounded; past that the user gets the message instead.
const MAX_AUTO_WAIT_SECONDS = 30;
const MAX_TOTAL_WAIT_SECONDS = 45;
const MAX_RETRIES = 2;

// Seconds Groq asks us to wait before the next request, or null when it does not say.
function retryAfterSeconds(response) {
  const seconds = Number(response.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

// Groq answers 429 when a rate limit is hit. Short waits are retried, within the limits above.
function retrying(fetchImpl) {
  return async (url, init) => {
    let waited = 0;
    for (let retry = 0; ; retry += 1) {
      const response = await fetchImpl(url, init);
      const wait = response.status === 429 ? retryAfterSeconds(response) : null;
      if (wait === null || retry >= MAX_RETRIES || wait > MAX_AUTO_WAIT_SECONDS || waited + wait > MAX_TOTAL_WAIT_SECONDS) return response;
      waited += wait;
      await pause(wait * 1000, init.signal);
    }
  };
}

// Maps a Groq error status to a message the user can act on. The provider's body is never used.
const LONG_WAIT_SECONDS = 120;

// Under two minutes it is a busy moment: say how many seconds. Longer means the key's allowance is used up,
// so give the wait in minutes and the two ways out.
function rateLimitMessage(seconds) {
  if (!seconds) return 'Groq is rate-limiting this key. Wait a minute and try again.';
  if (seconds < LONG_WAIT_SECONDS) return `Groq is rate-limiting this key. Wait about ${seconds} seconds and try again.`;
  const minutes = Math.ceil(seconds / 60);
  return `This Groq key has used its allowance for now. Wait about ${minutes} minutes, or paste a key from another Groq account in Settings.`;
}

function providerFailure(response) {
  const { status } = response;
  if (status === 429) {
    return new ProviderError(rateLimitMessage(retryAfterSeconds(response)));
  }
  if (status === 401) return new ProviderError('Groq rejected the API key. Check the Groq API key in Settings, then try again.');
  if (status === 413) return new ProviderError('The material is too large for one request. Use a shorter file.');
  return new ProviderError(`Groq request failed (${status}).`);
}

function requireKey(apiKey) {
  if (!apiKey) throw new ProviderError('Set GROQ_API_KEY in your local .env file, then restart the server.');
}

async function callStructured({ apiKey, fetchImpl, name, instructions, input, schema }) {
  requireKey(apiKey);
  let response;
  try {
    response = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL, temperature: 0.2, reasoning_effort: 'low', max_completion_tokens: 6000,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: z.toJSONSchema(schema, { target: 'draft-7' }) } },
      }),
    });
  } catch {
    throw new ProviderError('Groq could not be reached or timed out. Retry.');
  }
  if (!response.ok) {
    // Never return or log the provider body; it may echo request data.
    throw providerFailure(response);
  }
  const payload = await response.json();
  const choice = payload.choices?.[0];
  if (choice?.finish_reason !== 'stop' || !choice.message?.content || choice.message.refusal) {
    throw new ProviderError('Groq did not return a complete structured response. Retry.');
  }
  return schema.parse(JSON.parse(choice.message.content));
}

// Streams the tutor's text as it arrives. An abort from the caller rejects the read and no text is kept.
async function streamTutorReply({ apiKey, fetchImpl, rules, status, step, nextStep, studentText, history, attempt, onChunk, signal }) {
  requireKey(apiKey);
  // The next step's source goes too, so the tutor can aim its opening question at that passage.
  const payload = { rules, status, step: step.title, source: step.source, nextStep: nextStep ? { title: nextStep.title, source: nextStep.source } : null, studentText, history, attempt };
  let response;
  try {
    response = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: MODEL, temperature: 0.4, reasoning_effort: 'low', max_completion_tokens: 800, stream: true,
        messages: [
          { role: 'system', content: readPrompt('tutor') },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ProviderError('Groq could not be reached or timed out. Retry.');
  }
  if (!response.ok) throw providerFailure(response);

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return finish(full);
      let delta;
      try {
        delta = JSON.parse(data).choices?.[0]?.delta?.content;
      } catch {
        throw new ProviderError('Groq sent an unreadable stream. Retry.');
      }
      if (delta) {
        full += delta;
        onChunk(delta);
      }
    }
  }
  return finish(full);

  function finish(text) {
    if (!text.trim()) throw new ProviderError('Groq returned an empty reply. Retry.');
    return text.trim();
  }
}
