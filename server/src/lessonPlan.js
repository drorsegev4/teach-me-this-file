import { z } from 'zod';

export const MAX_STEPS = 7;
export const MIN_STEPS = 3;

// One object, not a union: structured-output modes handle a flat schema more reliably.
export const lessonPlanSchema = z.object({
  assumptions: z.string().max(300),
  steps: z.array(z.object({
    title: z.string().max(120),
    source: z.string().max(300),
  }).strict()).max(MAX_STEPS),
  error: z.string().max(300).nullable(),
}).strict();

// Models change quotes and whitespace when copying; compare on a normalized form.
const normalize = text => text
  .normalize('NFKC')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const wordCount = text => text.trim().split(/\s+/).length;

// Returns { error } for a refusal, or a checked plan. Any step whose source is not in the
// document, or that breaks a rule, rejects the whole plan: no partial lesson reaches the teacher.
export function checkLessonPlan(raw, documentText) {
  const plan = lessonPlanSchema.parse(raw);
  if (plan.error) return { error: plan.error };
  if (plan.steps.length < MIN_STEPS) throw new Error(`A lesson needs at least ${MIN_STEPS} steps.`);
  const haystack = normalize(documentText);
  for (const step of plan.steps) {
    if (wordCount(step.title) > 8) throw new Error('A step title has more than 8 words.');
    if (wordCount(step.source) > 25) throw new Error('A step source has more than 25 words.');
    if (!haystack.includes(normalize(step.source))) throw new Error(`A step source is not in the document: "${step.title}"`);
  }
  return { assumptions: plan.assumptions, steps: plan.steps };
}
