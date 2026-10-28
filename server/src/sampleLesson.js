import { readFileSync } from 'node:fs';

const paragraphs = readFileSync(new URL('../fixtures/sample-document.txt', import.meta.url), 'utf8')
  .trim().split(/\r?\n\s*\r?\n/);

export const sampleLesson = {
  source: {
    id: 'evaporation',
    title: paragraphs[0],
    segments: paragraphs.slice(1).map((text, index) => ({ id: `s${index + 1}`, text })),
  },
  teacherPrompt: 'Teach a seventh-grade student in English. Explain one concept briefly, then ask for reasoning. Be encouraging and Socratic. Target the specific gap without giving away the answer. Stay grounded in the source.',
  objectives: [{
    id: 'explain-drying',
    description: 'Explain how evaporation dries water and predict how temperature and exposed surface area affect drying, with reasons.',
    sourceSegmentIds: ['s1', 's2', 's3', 's4'],
    criteria: [
      { id: 'change', description: 'Explains that liquid water becomes water vapor at the surface; boiling is not required.' },
      { id: 'temperature', description: 'Predicts faster evaporation when warmer, other conditions equal, because particles have more energy to escape.' },
      { id: 'surface', description: 'Predicts faster evaporation with larger exposed surface area, other conditions equal, because more particles can escape at once.' },
    ],
  }],
  initialQuestion: 'Two equal amounts of water sit below boiling temperature. One is in a warm, wide shallow tray; the other is in a cooler, narrow cup. Airflow and humidity are the same. Which dries faster? Explain what happens to the water and why both temperature and exposed surface area matter.',
};
