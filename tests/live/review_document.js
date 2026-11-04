// Synthetic ten-page coverage check. Calls Gemini; saves an ignored local report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createAI, MODEL } from '../../server/src/ai.js';
import { prepareDocument } from '../../server/src/material.js';
import { generateLessonPlan } from '../../server/src/lessonPlan.js';
import { normalizeQuote } from '../../server/src/sourceQuotes.js';

if (!process.env.GEMINI_API_KEY) throw new Error('Set GEMINI_API_KEY in .env.');
const segments = Array.from({ length: 10 }, (_, i) => {
  const page = i + 1;
  const subject = page <= 8 ? 'Plants use sunlight to make sugars, and roots take up water.' : 'Memory retrieval brings stored information back into awareness; cues can help recall.';
  const practice = Array.from({ length: 22 }, (_, n) => `Study note ${page}-${n + 1}: ${subject}`).join('\n');
  return { page, text: `${page <= 8 ? 'Plants and their environment' : 'Memory and retrieval'}\n${practice}` };
});
const teacherPrompt = 'Teach the memory and retrieval ideas to 7th graders in English. Use at most three steps. The early plant topics are not the lesson focus.';
const prepared = prepareDocument({ segments, totalPages: 10, readAll: true });
let mapped = 0;
const provider = createAI({ apiKey: process.env.GEMINI_API_KEY });
const ai = { ...provider, mapMaterial: async input => { const result = await provider.mapMaterial(input); mapped += 1; console.log(`Mapped section ${mapped}`); return result; } };
const started = Date.now();
const result = await generateLessonPlan({ ai, text: prepared.text, chunks: prepared.chunks, teacherPrompt });
const lateText = normalizeQuote(segments.filter(segment => segment.page >= 9).map(segment => segment.text).join('\n'));
const hasLateEvidence = result.steps?.some(step => lateText.includes(normalizeQuote(step.source)));
const pass = prepared.chunks.length > 1 && mapped >= prepared.chunks.length && hasLateEvidence && Boolean(result.introduction?.documentOverview) && result.steps.length <= 3;
const report = { date: new Date().toISOString(), note: 'Synthetic text-only ten-page fixture, not the original uploaded file.', model: MODEL,
  seconds: (Date.now() - started) / 1000, chunks: prepared.chunks.map(chunk => ({ pages: chunk.pages })), mapped, hasLateEvidence, pass, plan: result };
const directory = new URL('./results/', import.meta.url);
mkdirSync(directory, { recursive: true });
const file = new URL(`document-review-${Date.now()}.json`, directory);
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass, mapped, sections: prepared.chunks.length, hasLateEvidence, introduction: result.introduction, steps: result.steps }, null, 2));
console.log(`Saved ${file.pathname}`);
process.exitCode = pass ? 0 : 1;
