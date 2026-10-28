import { randomUUID } from 'node:crypto';
import { sampleLesson } from './sampleLesson.js';

export function createLesson() {
  return {
    ...structuredClone(sampleLesson),
    sessionId: randomUUID(), revision: 0, activeObjectiveId: sampleLesson.objectives[0].id,
    phase: 'ready', currentQuestion: null, messages: [], attempts: [],
    assistance: { level: 'none', events: [] },
    progress: { criteria: sampleLesson.objectives[0].criteria.map(item => ({ criterionId: item.id, status: 'unmet', evidence: [] })), complete: false, completionAttemptId: null },
    pendingOperation: null, error: null,
  };
}

export function beginOperation(state, expectedRevision, type) {
  if (state.pendingOperation || expectedRevision !== state.revision) throw new Error('Session changed or is busy. Refresh and try again.');
  if ((type === 'teach' && state.phase !== 'ready') || (type === 'answer' && state.phase !== 'awaiting_answer')) throw new Error('This operation is not valid in the current lesson phase.');
  const operation = { id: randomUUID(), revision: state.revision, type };
  state.pendingOperation = operation;
  state.error = null;
  return operation;
}

function checkOperation(state, operation) {
  if (state.pendingOperation?.id !== operation.id || state.revision !== operation.revision) throw new Error('Stale or duplicate result.');
}

export function failOperation(state, operation, message) {
  checkOperation(state, operation);
  state.pendingOperation = null;
  state.error = message;
}

export function commitTeaching(state, operation, teaching) {
  checkOperation(state, operation);
  const question = { id: randomUUID(), ...teaching.question };
  state.currentQuestion = question;
  state.messages.push({ id: randomUUID(), role: 'tutor', text: `${teaching.explanation}\n\n${question.text}`, sourceRefs: teaching.sourceRefs });
  state.phase = 'awaiting_answer';
  state.pendingOperation = null;
  state.revision++;
}

const normalize = text => text.trim().toLowerCase().replace(/\s+/g, ' ');

export function decideProgress(state, assessment, studentMessage) {
  if (assessment.intent === 'question') return { action: 'answer_question', repeated: false, criteria: state.progress.criteria };
  const repeated = state.attempts.some(attempt => normalize(attempt.answer.text) === normalize(studentMessage.text));
  const currentEvidence = assessment.criteria.some(item => item.evidence.some(evidence => evidence.messageId === studentMessage.id));
  const revealed = state.assistance.events.some(event => event.level === 'answer_revealed');
  const freshQuestion = !revealed || state.assistance.events.filter(event => event.level === 'answer_revealed').every(event => event.questionId !== state.currentQuestion.id);
  const complete = !repeated && currentEvidence && assessment.correctness === 'correct'
    && assessment.criteria.every(item => item.status === 'met')
    && assessment.misconceptions.length === 0 && assessment.unsupportedClaims.length === 0
    && assessment.demonstration === 'understanding' && freshQuestion;
  return { action: complete ? 'complete' : 'help', repeated, criteria: repeated ? state.progress.criteria : assessment.criteria };
}

const assistanceRank = ['none', 'hint', 'scaffold', 'answer_revealed'];

export function commitTurn(state, operation, studentMessage, assessment, decision, response) {
  checkOperation(state, operation);
  const attemptId = randomUUID();
  if (assessment.intent !== 'question') {
    state.attempts.push({ id: attemptId, answer: studentMessage, questionId: state.currentQuestion.id, assessment, assistance: structuredClone(state.assistance), repeated: decision.repeated });
    state.progress.criteria = structuredClone(decision.criteria);
  }
  state.messages.push(studentMessage, { id: randomUUID(), role: 'tutor', feedback: response.feedback,
    text: response.feedback + (response.nextQuestion ? `\n\n${response.nextQuestion.text}` : ''), sourceRefs: response.sourceRefs });
  if (response.assistance !== 'none') {
    state.assistance.events.push({ level: response.assistance, criterionIds: response.targetCriterionIds, questionId: state.currentQuestion.id, afterAttemptId: assessment.intent === 'question' ? null : attemptId });
    if (assistanceRank.indexOf(response.assistance) > assistanceRank.indexOf(state.assistance.level)) state.assistance.level = response.assistance;
  }
  if (response.nextQuestion) state.currentQuestion = { id: randomUUID(), ...response.nextQuestion };
  if (decision.action === 'complete') {
    state.phase = 'complete';
    state.progress.complete = true;
    state.progress.completionAttemptId = attemptId;
  }
  state.pendingOperation = null;
  state.revision++;
}
