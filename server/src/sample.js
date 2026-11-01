import { readFileSync } from 'node:fs';

// A short sample lesson for the tests. The app itself never builds from it.
export const sampleText = readFileSync(new URL('../fixtures/sample-document.txt', import.meta.url), 'utf8');
export const sampleTeacherPrompt = 'Teach this to 7th graders, in English. Be Socratic. Keep it under 15 minutes.';
