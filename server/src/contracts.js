import { z } from 'zod';

const text = z.string().trim().min(1).max(6000);
const ids = z.array(z.string().min(1)).max(20);
const reference = z.object({ segmentId: text, quote: text }).strict();
const question = z.object({ text, criterionIds: ids.min(1) }).strict();

export const teachingSchema = z.object({
  explanation: text,
  sourceRefs: z.array(reference).min(1).max(10),
  question,
}).strict();

export const assessmentSchema = z.object({
  intent: z.enum(['answer', 'question', 'mixed']),
  correctness: z.enum(['correct', 'mixed', 'incorrect', 'not_assessable']),
  completeness: z.enum(['none', 'partial', 'complete']),
  criteria: z.array(z.object({
    criterionId: text,
    status: z.enum(['unmet', 'partial', 'met']),
    evidence: z.array(z.object({ messageId: text, quote: text }).strict()).max(10),
    sourceRefs: z.array(reference).max(10),
    rationale: text,
  }).strict()).max(20),
  misconceptions: z.array(text).max(10),
  unsupportedClaims: z.array(text).max(10),
  questionSupport: z.enum(['not_applicable', 'supported', 'unsupported']),
  demonstration: z.enum(['understanding', 'echo', 'unclear']),
}).strict();

export const responseSchema = z.object({
  feedback: text,
  sourceRefs: z.array(reference).max(10),
  assistance: z.enum(['none', 'hint', 'scaffold', 'answer_revealed']),
  targetCriterionIds: ids,
  nextQuestion: question.nullable(),
}).strict();
