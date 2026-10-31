import { readFileSync } from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { ProviderError } from './ai.js';
import { generateLessonPlan, PlanError } from './lessonPlan.js';

// The hardcoded sample for this stage; the upload screen replaces these later.
const sampleText = readFileSync(new URL('../fixtures/sample-document.txt', import.meta.url), 'utf8');
const sampleTeacherPrompt = 'Teach this to 7th graders, in English. Be Socratic. Keep it under 15 minutes.';

// One plan is shared by every request until a fresh one is asked for. Concurrent
// requests await the same promise, so a double click makes one model call.
export function createPlanStore({ ai }) {
  let current = null;
  return {
    get({ fresh = false } = {}) {
      if (fresh || !current) {
        const attempt = generateLessonPlan({ ai, text: sampleText, teacherPrompt: sampleTeacherPrompt })
          .then(plan => (plan.error ? { error: plan.error } : { rules: plan.rules, steps: plan.steps }));
        // Failed or refused plans are not kept, so the next request tries again.
        attempt.then(plan => { if (plan.error) current = null; }, () => { current = null; });
        current = attempt;
      }
      return current;
    },
  };
}

const body = z.object({ fresh: z.boolean().optional() }).strict();

export function createLessonsRouter({ store }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = body.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lesson request.' });
    try {
      const plan = await store.get({ fresh: parsed.data.fresh });
      if (plan.error) return res.status(422).json({ error: plan.error });
      res.json(plan);
    } catch (error) {
      if (error instanceof PlanError) return res.status(502).json({ error: 'The lesson plan did not pass the source check. Try again.' });
      if (error instanceof ProviderError) return res.status(502).json({ error: error.message });
      console.error('[lessons] unexpected failure:', error.name);
      res.status(500).json({ error: 'Could not build the lesson. Try again.' });
    }
  });
  return router;
}
