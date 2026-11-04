// Shared normalization for exact source verification in document maps and lesson plans.
export const normalizeQuote = text => text
  .normalize('NFKC')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
