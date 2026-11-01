// Turns an extracted document into the material one model call can read, and says what was left out.
// The free Groq key allows about 8,000 tokens per minute, so one lesson build gets a fixed token budget
// for the material. The lesson is built from the start of the document that fits. Nothing is cut silently:
// the result carries a notice the teacher sees.

// Estimated tokens for the material. Override with MATERIAL_TOKEN_BUDGET on a host whose key allows more.
export const DEFAULT_TOKEN_BUDGET = 4000;

// Characters per token, measured on Groq's tokenizer (Hebrew about 2.9, English about 5.5) and rounded
// toward more tokens, so the estimate errs on the safe side.
const TOKENS_PER_CHAR = { latin: 0.25, hebrewArabic: 0.385, cjk: 1, other: 0.45 };
// A repeated line shorter than this is kept: headings and labels legitimately repeat.
const MIN_REPEAT_LENGTH = 60;
// A unit that does not fit is cut at a sentence only when this much budget is left to fill.
const MIN_PARTIAL_TOKENS = 150;

function charClass(code) {
  if (code <= 0x024f || (code >= 0x1e00 && code <= 0x1eff)) return 'latin';
  if ((code >= 0x0590 && code <= 0x05ff) || (code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f) || (code >= 0xfb1d && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff)) return 'hebrewArabic';
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af)) return 'cjk';
  return 'other';
}

export function estimateTokens(text) {
  let tokens = 0;
  for (const character of text) tokens += TOKENS_PER_CHAR[charClass(character.codePointAt(0))];
  return Math.ceil(tokens);
}

// Collapses the spacing that PDF extraction adds ("Lesson   4  -  Learning"), which costs tokens and
// carries no meaning. The plan check ignores spacing too, so quotes still match.
function cleanText(text) {
  return text
    .replace(/[ \t ​]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function groupPages(segments) {
  const pages = [];
  for (const segment of segments) {
    const last = pages.at(-1);
    if (last && last.page === segment.page) last.text += segment.text;
    else pages.push({ page: segment.page, text: segment.text });
  }
  return pages;
}

const repeatKey = text => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Cuts text to at most `tokens`, at a sentence end where possible and otherwise at a word.
function cutToFit(text, tokens) {
  const sentences = text.split(/(?<=[.!?…؟。])\s+/u);
  let kept = '';
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (estimateTokens(next) > tokens) break;
    kept = next;
  }
  if (kept) return kept;
  for (const word of text.split(' ')) {
    const next = kept ? `${kept} ${word}` : word;
    if (estimateTokens(next) > tokens) break;
    kept = next;
  }
  return kept;
}

// segments: [{ page, text }] as read from the file. totalPages is null for Word files.
// readAll is false when the reader stopped early on a very long PDF.
export function prepareMaterial({ segments, totalPages = null, readAll = true }, { budget = DEFAULT_TOKEN_BUDGET } = {}) {
  const units = [];
  const seen = new Set();
  let removedRepeats = 0;
  for (const page of groupPages(segments)) {
    for (const line of cleanText(page.text).split('\n')) {
      if (!line) continue;
      const key = repeatKey(line);
      if (line.length >= MIN_REPEAT_LENGTH && seen.has(key)) {
        removedRepeats += 1;
        continue;
      }
      seen.add(key);
      units.push({ page: page.page, text: line, tokens: estimateTokens(line) + 1 });
    }
  }

  const used = [];
  let tokens = 0;
  let partial = false;
  let left = units.length;
  for (const unit of units) {
    if (tokens + unit.tokens <= budget) {
      used.push(unit);
      tokens += unit.tokens;
      left -= 1;
      continue;
    }
    const room = budget - tokens;
    if (room >= MIN_PARTIAL_TOKENS || used.length === 0) {
      const cut = cutToFit(unit.text, room - 1);
      if (cut) {
        used.push({ page: unit.page, text: cut });
        tokens += estimateTokens(cut) + 1;
        partial = true;
        left -= 1;
      }
    }
    break;
  }

  const text = used.map(unit => unit.text).join('\n');
  const pages = used.map(unit => unit.page).filter(page => page !== null);
  const usedChars = text.length;
  const totalChars = units.reduce((sum, unit) => sum + unit.text.length + 1, 0) - 1;
  const leftOut = left > 0 || partial || !readAll;
  return {
    text,
    notice: {
      truncated: leftOut,
      estimatedTokens: tokens,
      pagesUsed: pages.length ? { from: pages[0], to: pages.at(-1) } : null,
      totalPages,
      endsMidPage: partial,
      usedPercent: readAll && totalChars > 0 ? Math.min(100, Math.round((usedChars / totalChars) * 100)) : null,
      removedRepeats,
    },
  };
}
