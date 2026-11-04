// Provider configuration stays behind createAI; routes and lesson logic remain independent.
export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}
