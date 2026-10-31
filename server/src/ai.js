import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { lessonPlanSchema } from './lessonPlan.js';

export const MODEL = 'openai/gpt-oss-120b';

// Plain text so the prompt can be tuned without touching code.
const lessonPlanInstructions = readFileSync(new URL('../prompts/lesson_plan.md', import.meta.url), 'utf8');

export class ProviderError extends Error {}

// The real adapter and the mock share one interface, so the rest of the app never knows which it has.
export function createAI({ apiKey, fetchImpl = fetch } = {}) {
  return {
    async planLesson({ text, teacherPrompt, problem }) {
      return callStructured({
        apiKey, fetchImpl, name: 'lesson_plan', instructions: lessonPlanInstructions,
        input: { teacherPrompt, material: text, ...(problem ? { previousProblem: problem } : {}) },
        schema: lessonPlanSchema,
      });
    },
  };
}

// Returns scripted responses in order (the last one repeats); for tests. Never calls a provider.
export function createMockAI(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const inputs = [];
  return {
    inputs,
    async planLesson(input) {
      inputs.push(input);
      return structuredClone(queue.length > 1 ? queue.shift() : queue[0]);
    },
  };
}

async function callStructured({ apiKey, fetchImpl, name, instructions, input, schema }) {
  if (!apiKey) throw new ProviderError('Set GROQ_API_KEY in your local .env file, then restart the server.');
  let response;
  try {
    response = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
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
