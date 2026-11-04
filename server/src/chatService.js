import { DEFAULT_KEY, remember } from './session.js';

export class ChatError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const stepId = index => `step-${index + 1}`;

// A turn counts toward the ladder when the student tried (keep_going) or did not answer (no_attempt).
// From the fourth such turn on, the tutor stops hinting and the student chooses: try again, or move on.
const FORCED_CHOICE_TURNS = 4;
const COUNTED_STATUSES = ['keep_going', 'no_attempt'];

const MAX_SESSIONS = 500;

const freshProgress = () => ({ turns: 0, lastStatus: null, outcome: null });

// Which tutor.md branch the reply follows, for the dev log. Mirrors the prompt's bullets; it does not affect the reply.
function tutorBranch(status, attempt) {
  if (!COUNTED_STATUSES.includes(status)) return status;
  return `${status}/attempt ${Math.min(attempt, FORCED_CHOICE_TURNS)}${attempt >= FORCED_CHOICE_TURNS ? '+' : ''}`;
}

// Dev only: one line per turn with the status, the attempt passed to the tutor, and the branch used.
// Student text is not logged.
const debugTurns = process.env.DEV_TOOLS === '1' || process.env.NODE_ENV === 'development';

// Lesson sessions in memory, one per session id. A turn commits only after the tutor's full reply is ready, so a
// stopped or failed reply leaves progress and history unchanged.
// progress[stepId] keeps what the student did on each step, for review later:
//   turns: counted turns on the step; lastStatus: the latest counted status;
//   outcome: null while open, then understood | wrong | no_answer when the step is closed.
export function createChatService({ ai, store }) {
  const sessions = new Map();
  const busyKeys = new Set();

  function view(key = DEFAULT_KEY) {
    const session = sessions.get(key);
    if (!session) return null;
    const { plan, index, messages, progress } = session;
    const ids = plan.steps.map((_, i) => stepId(i));
    const current = index < plan.steps.length ? progress[stepId(index)] : null;
    return {
      rules: plan.rules,
      steps: plan.steps.map((step, i) => ({ id: stepId(i), title: step.title, source: step.source })),
      currentStepId: index < plan.steps.length ? stepId(index) : null,
      completedStepIds: ids.filter(id => progress[id].outcome === 'understood'),
      movedOnStepIds: ids.filter(id => progress[id].outcome === 'wrong' || progress[id].outcome === 'no_answer'),
      attemptsPerStep: Object.fromEntries(ids.map(id => [id, progress[id].turns])),
      studentProgress: progress,
      needsChoice: Boolean(current && current.turns >= FORCED_CHOICE_TURNS),
      lessonComplete: index >= plan.steps.length,
      messages,
    };
  }

  function reset(key = DEFAULT_KEY) {
    if (busyKeys.has(key)) throw new ChatError('The tutor is still answering. Wait, or stop the reply first.', 409);
    sessions.delete(key);
  }

  // A student starts on a published plan; a teacher's preview starts on their own draft.
  async function startingPlan({ key, lessonId }) {
    if (!lessonId) {
      const draft = await store.getDraft(key);
      if (!draft) throw new ChatError('This lesson expired because the server restarted. Build it again.', 409);
      return draft;
    }
    const plan = store.getPublished(lessonId);
    if (!plan) throw new ChatError('This lesson link expired because the server restarted. Ask your teacher to publish it again.', 404);
    return plan;
  }

  async function turn({ key = DEFAULT_KEY, lessonId, type, text, ai: requestAI, onChunk = () => {}, signal }) {
    // The reviewer's key arrives per request; the service-level AI is a fallback for tests and tools.
    const model = requestAI ?? ai;
    if (busyKeys.has(key)) throw new ChatError('The tutor is still answering. Wait, or stop the reply first.', 409);
    const session = sessions.get(key);
    if (type !== 'start' && (!session || session.index >= session.plan.steps.length)) {
      throw new ChatError('Start a lesson first.', 409);
    }
    if (type === 'move_on' && session.progress[stepId(session.index)].turns < FORCED_CHOICE_TURNS) {
      throw new ChatError('Move on is available after a few tries on this step.', 409);
    }
    busyKeys.add(key);
    try {
      const plan = type === 'start' ? await startingPlan({ key, lessonId }) : session.plan;
      if (plan.error) throw new ChatError(plan.error, 422);
      // Work on copies; the session changes only at the end.
      const base = type === 'start'
        ? { plan, index: 0, messages: [], progress: Object.fromEntries(plan.steps.map((_, i) => [stepId(i), freshProgress()])) }
        : { ...session, messages: [...session.messages], progress: structuredClone(session.progress) };
      const step = plan.steps[base.index];
      const id = stepId(base.index);
      const record = base.progress[id];
      const nextStep = plan.steps[base.index + 1] ?? null;
      const history = base.messages.filter(message => message.stepId === id)
        .map(({ role, text: body }) => ({ role, text: body }));

      if (type === 'move_on') {
        // The student chose to leave the step. The step is marked, and the tutor moves to the next one.
        record.outcome = record.lastStatus === 'keep_going' ? 'wrong' : 'no_answer';
        const moved = { rules: plan.rules, status: 'moved_on', step, nextStep, attempt: record.turns };
        const replyText = await model.replyStream({ ...moved, studentText: null, history, onChunk, signal });
        if (signal?.aborted) throw new ChatError('Stopped. Your choice was not saved.', 499);
        if (debugTurns) console.log(`[turn] type=move_on step=${id} status=moved_on attempt=${record.turns} branch=moved_on outcome=${record.outcome}`);
        base.index += 1;
        const landing = nextStep ? stepId(base.index) : id;
        base.messages.push({
          id: base.messages.length + 1, role: 'tutor', text: replyText, stepId: landing, quote: (nextStep ?? step).source,
          status: 'moved_on', attempt: record.turns,
        });
        remember(sessions, key, { ...base, plan }, MAX_SESSIONS);
        return view(key);
      }

      const student = type === 'message' ? { id: base.messages.length + 1, role: 'student', text, stepId: id, quote: null } : null;
      const check = type === 'message' ? await model.classify({ rules: plan.rules, step, history, studentText: text }) : { status: 'open' };

      if (COUNTED_STATUSES.includes(check.status)) {
        // Typing after the choice means "try again". Re-ask from rung 3 so the choice does not repeat
        // until the student has answered at least once more.
        if (record.turns >= FORCED_CHOICE_TURNS) record.turns = FORCED_CHOICE_TURNS - 2;
        record.turns += 1;
        record.lastStatus = check.status;
      }
      const attempt = record.turns;
      const advanced = check.status === 'understood';
      if (advanced) record.outcome = 'understood';

      const replyText = await model.replyStream({
        rules: plan.rules, status: check.status, step, nextStep: advanced ? nextStep : null, studentText: text ?? null, history, attempt, onChunk, signal,
      });
      if (signal?.aborted) throw new ChatError('Stopped. Your message was not sent.', 499);
      if (debugTurns) {
        console.log(`[turn] type=${type} step=${id} status=${check.status} attempt=${attempt} branch=${tutorBranch(check.status, attempt)}`);
      }

      const tutor = {
        id: base.messages.length + (student ? 2 : 1), role: 'tutor', text: replyText,
        stepId: advanced && nextStep ? stepId(base.index + 1) : id, quote: (advanced && nextStep ? nextStep : step).source,
        status: check.status, attempt,
      };
      if (student) base.messages.push(student);
      base.messages.push(tutor);
      if (advanced) base.index += 1;
      remember(sessions, key, { ...base, plan }, MAX_SESSIONS);
      return view(key);
    } finally {
      busyKeys.delete(key);
    }
  }

  return { view, turn, reset };
}
