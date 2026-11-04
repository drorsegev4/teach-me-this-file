import { z } from 'zod';
import { normalizeQuote } from './sourceQuotes.js';
import { estimateTokens } from './material.js';

export const sectionMapSchema = z.object({
  heading: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(400),
  quotes: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
}).strict();

const MAX_MAP_TOKENS = 24000;
export class DocumentMapError extends Error {}

// Map each internal chunk once per teacher build, before publication, never once per student.
// Serial calls avoid a burst of requests on free keys. No chunk is silently omitted.
export async function mapDocument({ ai, chunks, teacherPrompt }) {
  const sections = [];
  for (const chunk of chunks) {
    let problem;
    let mapped;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let raw;
      try {
        raw = await ai.mapMaterial({ text: chunk.text, teacherPrompt, problem });
      } catch (error) {
        if (error.name !== 'ZodError' && !(error instanceof SyntaxError)) {
          error.chunk = sections.length + 1;
          throw error;
        }
        problem = 'Return a complete JSON object matching the section-map schema.';
        continue;
      }
      const parsed = sectionMapSchema.safeParse(raw);
      if (parsed.success && parsed.data.quotes.every(quote =>
        quote.split(/\s+/).length <= 25 && normalizeQuote(quote).length > 0 && normalizeQuote(chunk.text).includes(normalizeQuote(quote)))) {
        mapped = parsed.data;
        break;
      }
      problem = 'Use the required map format and exact, nonempty quotes of at most 25 words copied from this section.';
    }
    if (!mapped) throw Object.assign(new DocumentMapError('A document section could not be mapped reliably. Please try again.'), { chunk: sections.length + 1 });
    sections.push({ section: sections.length + 1, pages: chunk.pages, ...mapped });
    if (estimateTokens(JSON.stringify(sections)) > MAX_MAP_TOKENS) {
      throw Object.assign(new DocumentMapError('This document contains too much material to prepare reliably in one lesson. Use a shorter file.'), { chunk: sections.length });
    }
  }
  return { scope: 'All readable text in the uploaded document was mapped. Select a focused lesson from these topics.', sections };
}
