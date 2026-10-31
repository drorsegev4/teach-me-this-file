import { Router } from 'express';
import { z } from 'zod';
import { ProviderError } from './ai.js';
import { PlanError } from './lessonPlan.js';

export class ChatError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const stepId = index => `step-${index + 1}`;

// Wrong answers (keep_going) per step. Each step starts at zero.
function attemptCounts(attempts, steps) {
  return Object.fromEntries(steps.map((_, i) => [stepId(i), attempts[stepId(i)] ?? 0]));
}

// One lesson session in memory. A turn commits only after the tutor's full reply is ready, so a
// stopped or failed reply leaves progress and history unchanged.
export function createChatService({ ai, store }) {
  let session = null;
  let busy = false;

  function view() {
    if (!session) return null;
    const { plan, index, completed, messages } = session;
    return {
      rules: plan.rules,
      steps: plan.steps.map((step, i) => ({ id: stepId(i), title: step.title })),
      currentStepId: index < plan.steps.length ? stepId(index) : null,
      completedStepIds: completed,
      attemptsPerStep: attemptCounts(session.attempts, plan.steps),
      lessonComplete: index >= plan.steps.length,
      messages,
    };
  }

  function reset() {
    if (busy) throw new ChatError('The tutor is still answering. Wait, or stop the reply first.', 409);
    session = null;
  }

  async function turn({ type, text, fresh = false, ai: requestAI, onChunk = () => {}, signal }) {
    // The reviewer's key arrives per request; the service-level AI is a fallback for tests and tools.
    const model = requestAI ?? ai;
    if (busy) throw new ChatError('The tutor is still answering. Wait, or stop the reply first.', 409);
    if (type === 'message' && (!session || session.index >= session.plan.steps.length)) {
      throw new ChatError('Start a lesson first.', 409);
    }
    busy = true;
    try {
      const plan = type === 'start' ? await store.get({ fresh, ai: model }) : session.plan;
      if (plan.error) throw new ChatError(plan.error, 422);
      // Work on copies; the session changes only at the end.
      const base = type === 'start'
        ? { plan, index: 0, completed: [], messages: [], attempts: {} }
        : { ...session, completed: [...session.completed], messages: [...session.messages], attempts: { ...session.attempts } };
      const step = plan.steps[base.index];
      const nextStep = plan.steps[base.index + 1] ?? null;
      const history = base.messages.filter(message => message.stepId === stepId(base.index))
        .map(({ role, text: body }) => ({ role, text: body }));

      const student = type === 'message' ? { id: base.messages.length + 1, role: 'student', text, stepId: stepId(base.index), quote: null } : null;
      const check = type === 'message' ? await model.classify({ rules: plan.rules, step, history, studentText: text }) : { status: 'open' };

      // Only a wrong answer moves the attempt ladder; the tutor gets this step's count.
      if (check.status === 'keep_going') base.attempts[stepId(base.index)] = (base.attempts[stepId(base.index)] ?? 0) + 1;
      const attempt = base.attempts[stepId(base.index)] ?? 0;
      const advanced = check.status === 'understood';

      const replyText = await model.replyStream({
        rules: plan.rules, status: check.status, step, nextStep: advanced ? nextStep : null, studentText: text ?? null, history, attempt, onChunk, signal,
      });
      if (signal?.aborted) throw new ChatError('Stopped. Your message was not sent.', 499);

      const tutor = {
        id: base.messages.length + (student ? 2 : 1), role: 'tutor', text: replyText, stepId: stepId(base.index), quote: step.source,
        status: check.status, attempt,
      };
      if (student) base.messages.push(student);
      base.messages.push(tutor);
      if (advanced) base.completed.push(stepId(base.index));
      if (advanced) base.index += 1;
      session = { ...base, plan };
      return view();
    } finally {
      busy = false;
    }
  }

  return { view, turn, reset };
}

const turnBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), fresh: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('message'), text: z.string().trim().min(1).max(2000) }).strict(),
]);

// Replies stream as server-sent events: "chunk" while the tutor writes, then "done" with the
// full state, or "error". Closing the connection (Stop) aborts the reply and commits nothing.
export function createChatRouter({ chat, aiFor }) {
  const router = Router();

  router.get('/', (_req, res) => {
    const state = chat.view();
    if (!state) return res.status(404).json({ error: 'No lesson has started yet.' });
    res.json(state);
  });

  router.post('/turn', async (req, res) => {
    const parsed = turnBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid chat request.' });

    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const controller = new AbortController();
    let finished = false;
    res.on('close', () => { if (!finished) controller.abort(); });

    try {
      const state = await chat.turn({
        ...parsed.data,
        ai: aiFor(req),
        onChunk: text => send('chunk', { text }),
        signal: controller.signal,
      });
      finished = true;
      send('done', state);
    } catch (error) {
      finished = true;
      if (error instanceof ChatError) send('error', { message: error.message, status: error.status });
      else if (error instanceof PlanError) send('error', { message: 'The lesson plan did not pass the source check. Try again.', status: 502 });
      else if (error instanceof ProviderError) send('error', { message: error.message, status: 502 });
      else if (controller.signal.aborted) return;
      else {
        console.error('[chat] unexpected failure:', error.name);
        send('error', { message: 'The tutor could not reply. Your progress is unchanged; try again.', status: 500 });
      }
    } finally {
      res.end();
    }
  });
  return router;
}
