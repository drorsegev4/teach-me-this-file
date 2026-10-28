import { beginOperation, commitTeaching, createLesson } from '../../server/src/lessonState.js';

export function readyLesson() {
  const state = createLesson();
  const op = beginOperation(state, 0, 'teach');
  commitTeaching(state, op, {
    explanation: 'Water can become vapor without boiling.',
    sourceRefs: [{ segmentId: 's1', quote: 'Evaporation can happen below the boiling point' }],
    question: { text: state.initialQuestion, criterionIds: ['change', 'temperature', 'surface'] },
  });
  return state;
}

export const answer = { id: 'student-1', role: 'student', text: 'Water becomes vapor without boiling. Warm particles have more energy. A wider surface lets more escape at once.' };

export function assessment(overrides = {}) {
  return {
    intent: 'answer', correctness: 'correct', completeness: 'complete',
    criteria: ['change', 'temperature', 'surface'].map((criterionId, index) => ({
      criterionId, status: 'met', evidence: [{ messageId: answer.id, quote: answer.text.split('. ')[index].replace(/\.$/, '') }],
      sourceRefs: [{ segmentId: `s${index + 1}`, quote: ['Evaporation can happen below the boiling point', 'particles have more energy', 'More water particles are at the surface'][index] }],
      rationale: 'Demonstrates the criterion.',
    })),
    misconceptions: [], unsupportedClaims: [], questionSupport: 'not_applicable', demonstration: 'understanding',
    ...overrides,
  };
}

export function response(overrides = {}) {
  return { feedback: 'Your explanation connects both conditions to evaporation.', sourceRefs: [], assistance: 'none', targetCriterionIds: [], nextQuestion: null, ...overrides };
}

export function questionAssessment() {
  return assessment({ intent: 'question', correctness: 'not_assessable', completeness: 'none', criteria: [], questionSupport: 'unsupported', demonstration: 'unclear' });
}
