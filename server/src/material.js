// Turns an extracted document into parts that one model call can read, and describes them.
// The free Groq key allows about 8,000 tokens per minute, so a lesson is built from one part: a stretch of the
// document up to a fixed token budget. A long file becomes several parts the teacher can choose from, one lesson
// each. Nothing is cut silently: every part is listed, in order, with its pages.

// Estimated tokens for the material. Override with MATERIAL_TOKEN_BUDGET on a host whose key allows more.
export const DEFAULT_TOKEN_BUDGET = 4000;

// Characters per token, measured on Groq's tokenizer (Hebrew about 2.9, English about 5.5) and rounded
// toward more tokens, so the estimate errs on the safe side.
const TOKENS_PER_CHAR = { latin: 0.25, hebrewArabic: 0.385, cjk: 1, other: 0.45 };
// A repeated line shorter than this is kept: headings and labels legitimately repeat.
const MIN_REPEAT_LENGTH = 60;

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

// Cuts text to at most `tokens`, at a sentence end where possible and otherwise at a word. Each piece is counted once
// and charged one extra for the space that joins it, so the result is never over the limit.
function cutToFit(text, tokens) {
  const take = pieces => {
    const kept = [];
    let used = 0;
    for (const piece of pieces) {
      used += estimateTokens(piece) + 1;
      if (used > tokens) break;
      kept.push(piece);
    }
    return kept.join(' ');
  };
  return take(text.split(/(?<=[.!?…؟。])\s+/u)) || take(text.split(' '));
}

const wordsIn = text => text.trim().split(/\s+/).length;
// A short line with no sentence ending is probably a heading.
const looksLikeHeading = text => wordsIn(text) <= 8 && !/[.!?:;,،。…]$/u.test(text);
const LABEL_LENGTH = 60;

export class PartError extends Error {
  constructor(partCount) {
    super(`This file has ${partCount} part${partCount === 1 ? '' : 's'}. Choose one of them.`);
    this.partCount = partCount;
  }
}

// The document as lines, with exact repeats removed. A line too big for one part is cut into pieces.
function readUnits(segments, budget) {
  const units = [];
  const seen = new Set();
  let removedRepeats = 0;
  const add = (page, text) => units.push({ page, text, tokens: estimateTokens(text) + 1 });
  for (const page of groupPages(segments)) {
    for (const line of cleanText(page.text).split('\n')) {
      if (!line) continue;
      const key = repeatKey(line);
      if (line.length >= MIN_REPEAT_LENGTH && seen.has(key)) {
        removedRepeats += 1;
        continue;
      }
      seen.add(key);
      let rest = line;
      while (estimateTokens(rest) + 1 > budget) {
        const piece = cutToFit(rest, budget - 1);
        if (!piece) break;
        add(page.page, piece);
        rest = rest.slice(piece.length).trim();
      }
      if (rest) add(page.page, rest);
    }
  }
  return { units, removedRepeats };
}

// Packs the lines into parts of at most `budget` tokens. A part ends before a heading when that leaves it at least
// half full, so a heading is never the last line of one part with its text in the next.
function packParts(units, budget) {
  const parts = [];
  let current = [];
  let tokens = 0;
  const close = () => {
    if (current.length) parts.push(current);
    current = [];
    tokens = 0;
  };
  for (const unit of units) {
    if (tokens + unit.tokens > budget) {
      const headingAt = current.findLastIndex(item => looksLikeHeading(item.text));
      const before = current.slice(0, headingAt).reduce((sum, item) => sum + item.tokens, 0);
      if (headingAt > 0 && before >= budget / 2) {
        const carried = current.slice(headingAt);
        current = current.slice(0, headingAt);
        close();
        current = carried;
        tokens = carried.reduce((sum, item) => sum + item.tokens, 0);
      } else {
        close();
      }
    }
    current.push(unit);
    tokens += unit.tokens;
  }
  close();
  return parts;
}

function describePart(units, index) {
  const heading = units.find(unit => looksLikeHeading(unit.text));
  const first = (heading ?? units[0]).text;
  const label = first.length > LABEL_LENGTH ? `${first.slice(0, LABEL_LENGTH).trim()}…` : first;
  const pages = units.map(unit => unit.page).filter(page => page !== null);
  return {
    index,
    label,
    pages: pages.length ? { from: pages[0], to: pages.at(-1) } : null,
    estimatedTokens: units.reduce((sum, unit) => sum + unit.tokens, 0),
  };
}

// document: { segments: [{ page, text }], totalPages, readAll } as read from the file. totalPages is null for Word
// files; readAll is false when the reader stopped early on a very long PDF.
// Returns the text of the chosen part and a notice listing all the parts.
export function prepareMaterial({ segments, totalPages = null, readAll = true }, { budget = DEFAULT_TOKEN_BUDGET, part = 0 } = {}) {
  const { units, removedRepeats } = readUnits(segments, budget);
  const parts = packParts(units, budget);
  if (part !== 0 && part >= parts.length) throw new PartError(parts.length);
  const chosen = parts[part] ?? [];
  const described = parts.map(describePart);
  const notice = {
    partIndex: part,
    partCount: parts.length,
    parts: described,
    estimatedTokens: described[part]?.estimatedTokens ?? 0,
    pagesUsed: described[part]?.pages ?? null,
    totalPages,
    moreUnread: !readAll,
    removedRepeats,
  };
  return { text: chosen.map(unit => unit.text).join('\n'), notice };
}
