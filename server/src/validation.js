import { assessmentSchema, teachingSchema, responseSchema } from './contracts.js';

function requireValid(condition, message) {
  if (!condition) throw new Error(`Invalid AI output: ${message}`);
}

export function objective(state) {
  return state.objectives.find(item => item.id === state.activeObjectiveId);
}

function validateIds(ids, state) {
  const allowed = objective(state).criteria.map(item => item.id);
  requireValid(new Set(ids).size === ids.length && ids.every(id => allowed.includes(id)), 'criterion references');
}

function validateSources(refs, state) {
  for (const ref of refs) {
    requireValid(state.source.segments.some(segment => segment.id === ref.segmentId && segment.text.includes(ref.quote)), 'source quotation');
  }
}

export function validateTeaching(raw, state) {
  const result = teachingSchema.parse(raw);
  validateSources(result.sourceRefs, state);
  validateIds(result.question.criterionIds, state);
  requireValid(result.question.criterionIds.length === objective(state).criteria.length, 'initial question must cover the objective');
  return result;
}

export function validateAssessment(raw, state, studentMessage) {
  const result = assessmentSchema.parse(raw);
  const criterionIds = result.criteria.map(item => item.criterionId);
  validateIds(criterionIds, state);
  if (result.intent === 'question') {
    requireValid(result.criteria.length === 0 && result.correctness === 'not_assessable' && result.completeness === 'none', 'questions cannot award mastery');
    requireValid(result.unsupportedClaims.length === 0 && result.misconceptions.length === 0, 'do not assess a pure question as a claim');
  } else {
    requireValid(criterionIds.length === objective(state).criteria.length, 'all criteria must be assessed');
    const students = [...state.messages, studentMessage].filter(message => message.role === 'student');
    for (const item of result.criteria) {
      validateSources(item.sourceRefs, state);
      requireValid(item.status === 'unmet' || (item.evidence.length > 0 && item.sourceRefs.length > 0), 'evidence required');
      for (const evidence of item.evidence) {
        requireValid(students.some(message => message.id === evidence.messageId && message.text.includes(evidence.quote)), 'student quotation');
      }
    }
    const statuses = result.criteria.map(item => item.status);
    const completeness = statuses.every(status => status === 'met') ? 'complete'
      : statuses.some(status => status !== 'unmet') ? 'partial' : 'none';
    requireValid(result.completeness === completeness, 'inconsistent completeness');
    requireValid(!(result.correctness === 'correct' && result.misconceptions.length), 'correct answer with misconceptions');
    requireValid(!(result.correctness === 'not_assessable' && result.completeness !== 'none'), 'unassessable evidence');
  }
  requireValid((result.intent === 'answer') === (result.questionSupport === 'not_applicable'), 'question support classification');
  return result;
}

export function validateResponse(raw, state, decision) {
  const result = responseSchema.parse(raw);
  validateSources(result.sourceRefs, state);
  validateIds(result.targetCriterionIds, state);
  if (result.nextQuestion) validateIds(result.nextQuestion.criterionIds, state);
  if (decision.action === 'complete') {
    requireValid(result.nextQuestion === null && result.assistance === 'none', 'completion must not add a question or help');
  } else if (decision.action === 'answer_question') {
    requireValid(result.nextQuestion === null, 'preserve the pending question');
  } else {
    requireValid(result.nextQuestion !== null && result.assistance !== 'none' && result.targetCriterionIds.length > 0, 'help must be targeted and request evidence');
    if (decision.repeated) {
      const previous = state.messages.filter(message => message.role === 'tutor').at(-1);
      requireValid(!previous || result.feedback !== previous.feedback, 'repeated feedback must change');
    }
  }
  return result;
}
