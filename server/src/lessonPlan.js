import { z } from 'zod';
import { normalizeQuote } from './sourceQuotes.js';
import { mapDocument } from './documentMap.js';

export const MAX_STEPS = 3;
export const MIN_STEPS = 1;

// One flat object, not a union: structured-output modes handle a flat schema more reliably.
export const lessonPlanSchema = z.object({
  rules: z.object({
    language: z.string().max(40),
    audience: z.string().max(80),
    timeLimit: z.string().max(40).nullable(),
    method: z.string().max(80),
  }).strict(),
  // Optional for plans created before the lesson introduction was added.
  introduction: z.object({
    title: z.string().trim().min(1).max(120),
    overview: z.string().trim().min(1).max(600),
    documentOverview: z.string().trim().min(1).max(600).optional(),
  }).strict().optional(),
  steps: z.array(z.object({
    title: z.string().max(120),
    source: z.string().max(300),
    // Optional for existing plans; new generations are instructed to include this criterion.
    understandingGoal: z.string().trim().min(1).max(300).optional(),
  }).strict()).max(MAX_STEPS),
  error: z.string().max(300).nullable(),
}).strict();

const wordCount = text => text.trim().split(/\s+/).length;

// Returns { error } for a refusal, or a checked plan. Any failure rejects the whole plan,
// so no partial lesson reaches the student.
export function checkLessonPlan(raw, documentText) {
  const plan = lessonPlanSchema.parse(raw);
  if (plan.error) return { error: plan.error };
  if (plan.steps.length < MIN_STEPS) throw new Error(`A lesson needs at least ${MIN_STEPS} steps.`);
  const haystack = normalizeQuote(documentText);
  const seen = new Set();
  for (const step of plan.steps) {
    if (wordCount(step.title) > 8) throw new Error(`The step title "${step.title}" has more than 8 words.`);
    if (wordCount(step.source) > 25) throw new Error(`The source for "${step.title}" has more than 25 words.`);
    const quote = normalizeQuote(step.source);
    if (!quote || !haystack.includes(quote)) throw new Error(`The source for "${step.title}" is not an exact quote from the document.`);
    if (seen.has(quote)) throw new Error(`Two steps use the same source. "${step.title}" needs its own quote.`);
    seen.add(quote);
  }
  return { rules: plan.rules, steps: plan.steps, ...(plan.introduction ? { introduction: plan.introduction } : {}) };
}

export class PlanError extends Error {
  constructor(message, attempts) {
    super(message);
    this.attempts = attempts;
  }
}

// Asks the model once more, with the reason the first plan failed, before giving up.
export async function generateLessonPlan({ ai, text, teacherPrompt, chunks, maxAttempts = 2 }) {
  const documentMap = chunks?.length > 1 ? await mapDocument({ ai, chunks, teacherPrompt }) : undefined;
  const attempts = [];
  let problem;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await ai.planLesson({ text: documentMap ? undefined : text, ...(documentMap ? { documentMap } : {}), teacherPrompt, problem });
    try {
      return { ...checkLessonPlan(raw, text), attempts: [...attempts, { raw, problem: null }] };
    } catch (error) {
      problem = error.name === 'ZodError' ? 'The plan did not match the required format.' : error.message;
      attempts.push({ raw, problem });
    }
  }
  throw new PlanError(problem, attempts);
}
