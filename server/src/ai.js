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
  status: z.enum(['understood', 'keep_going', 'off_file']),
}).strict();

export class ProviderError extends Error {}

// The real adapter and the mock share one interface, so the rest of the app never knows which it has.
export function createAI({ apiKey, fetchImpl = fetch } = {}) {
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
      return { status: studentText.trim().split(/\s+/).length >= 3 ? 'understood' : 'keep_going' };
    },
    async replyStream({ status, step, nextStep, onChunk, signal }) {
      const text = mockReply(status, step, nextStep);
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

function mockReply(status, step, nextStep) {
  if (status === 'open') return `Let's begin. ${step.title} Think about what the passage says.`;
  if (status === 'keep_going') return `Not quite yet. Look at the passage again: which part helps answer "${step.title}"?`;
  return nextStep ? `Yes, that is the idea. Next: ${nextStep.title}` : 'Yes, that is the idea. You finished the lesson.';
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });
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
    throw new ProviderError(`Groq request failed (${response.status}).`);
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
  const payload = { rules, status, step: step.title, source: step.source, nextStep: nextStep?.title ?? null, studentText, history, attempt };
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
  if (!response.ok) throw new ProviderError(`Groq request failed (${response.status}).`);

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
