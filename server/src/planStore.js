import { randomBytes } from 'node:crypto';
import { generateLessonPlan } from './lessonPlan.js';
import { DEFAULT_KEY, remember } from './session.js';

const MAX_DRAFTS = 200;
const MAX_PUBLISHED = 100;

// Each session has its own draft plan; a draft is shared by that session's requests until a new one is built.
// Draft lookup and publication await the complete preparation promise, including document mapping.
// Publishing copies the draft plan under a link id, so later rebuilds do not change what students see.
export function createPlanStore({ ai: defaultAI } = {}) {
  const drafts = new Map();
  const published = new Map();

  function generate(key, model, { text, chunks, teacherPrompt }) {
    const attempt = generateLessonPlan({ ai: model, text, chunks, teacherPrompt })
      .then(plan => (plan.error ? { error: plan.error } : { rules: plan.rules, steps: plan.steps,
        ...(plan.introduction ? { introduction: plan.introduction } : {}) }));
    const entry = { attempt, publishedId: null };
    remember(drafts, key, entry, MAX_DRAFTS);
    // Failed or refused plans are not kept, so the next request tries again.
    const forget = () => { if (drafts.get(key) === entry) drafts.delete(key); };
    attempt.then(plan => { if (plan.error) forget(); }, forget);
    return attempt;
  }

  return {
    // The session's current draft plan, or null when nothing has been built.
    getDraft(key = DEFAULT_KEY) {
      return drafts.get(key)?.attempt ?? null;
    },
    build({ key = DEFAULT_KEY, ai = defaultAI, text, chunks, teacherPrompt }) {
      return generate(key, ai, { text, chunks, teacherPrompt });
    },
    // Returns the link id for the session's current draft, or null when there is no usable draft.
    async publish({ key = DEFAULT_KEY } = {}) {
      const entry = drafts.get(key);
      const plan = entry && await entry.attempt;
      if (!plan || plan.error) return null;
      if (!entry.publishedId) {
        entry.publishedId = randomBytes(6).toString('base64url');
        remember(published, entry.publishedId, plan, MAX_PUBLISHED);
      }
      return entry.publishedId;
    },
    getPublished(id) {
      return published.get(id) ?? null;
    },
  };
}
