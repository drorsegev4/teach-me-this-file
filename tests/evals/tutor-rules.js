// The tutor standard as checks. Each rule is Dror's wording from docs/TUTOR_STANDARD.md (R1 to R8).
// Pure functions, no model calls, so they are unit-tested. A rule is "auto" when code can judge it and
// "human" when only a reader can; human items go to the review sheet the runner writes.

const SCRIPTS = {
  hebrew: /\p{Script=Hebrew}/u,
  arabic: /\p{Script=Arabic}/u,
  latin: /\p{Script=Latin}/u,
};
const LATIN_LANGUAGES = ['english', 'french', 'spanish', 'german', 'italian', 'portuguese'];

function scriptFor(language) {
  const name = language.trim().toLowerCase();
  if (name === 'hebrew' || name === 'עברית') return 'hebrew';
  if (name === 'arabic' || name === 'العربية') return 'arabic';
  if (LATIN_LANGUAGES.includes(name)) return 'latin';
  return null;
}

const letters = text => [...text].filter(character => /\p{L}/u.test(character));

// Share of the reply's letters written in the lesson language's script.
export function scriptShare(reply, language) {
  const script = scriptFor(language);
  if (!script) return null;
  const all = letters(reply);
  if (!all.length) return 0;
  return all.filter(character => SCRIPTS[script].test(character)).length / all.length;
}

export const wordCount = reply => reply.trim().split(/\s+/).filter(Boolean).length;

const MARKDOWN = /(^\s*([#>*-]|\d+[.)])\s)|\*\*|__|`/m;
export const isPlainText = reply => !MARKDOWN.test(reply);

export function endsWithQuestion(reply) {
  const tail = reply.trim().replace(/["'”’)\]\s]+$/u, '');
  return tail.endsWith('?') || tail.endsWith('？');
}

const firstSentence = reply => reply.trim().split(/(?<=[.!?])\s+/u)[0] ?? '';

const PRAISE = [
  'נהדר', 'מצוין', 'כל הכבוד', 'מעולה', 'יפה מאוד', 'תשובה טובה', 'תשובה יפה', 'בדיוק כך', 'ענית נכון', 'תשובה נכונה',
  'excellent', 'great job', 'well done', 'good job', 'perfect', 'exactly right', 'you got it', 'correct answer',
];
export const hasPraise = text => PRAISE.some(word => text.toLowerCase().includes(word));

const ERROR_NAMING = [
  'לא נכון', 'טעות', 'שגוי', 'לא מדויק', 'לא בדיוק', 'שגיאה', 'הפוך',
  'not correct', 'incorrect', 'wrong', 'mistake', 'not quite', 'not exactly', 'opposite',
];
export const namesError = text => ERROR_NAMING.some(word => text.toLowerCase().includes(word));

// Graphic or violent content only. Words about fear itself stay allowed, because a lesson on stress or on
// "fight or flight" has to name it. Whole words only, with an optional Hebrew prefix letter, so "הרגשתך" is not "הרג".
const SCARY = ['מוות', 'מת', 'דם', 'הרג', 'אלימות', 'טרור', 'death', 'dead', 'blood', 'kill', 'violence', 'terror'];
const SCARY_PATTERN = new RegExp(`(?<!\\p{L})[ובלמשכה]?(${SCARY.join('|')})(?!\\p{L})`, 'iu');
export const hasScaryContent = text => SCARY_PATTERN.test(text);

const sentenceCount = text => text.split(/[.!?]+/u).filter(part => part.trim().split(/\s+/).length >= 3).length;

const META = ['בינה מלאכותית', 'מודל שפה', 'as an ai', 'language model', 'my instructions', 'system prompt'];
export const mentionsItself = text => META.some(word => text.toLowerCase().includes(word));

// How many of the answer's parts the reply states. groups: [[stem, stem], ...]; a group counts once.
export function answerParts(reply, groups) {
  return groups.filter(stems => stems.some(stem => reply.includes(stem))).length;
}

const words = text => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

// Longest run of consecutive words the reply shares with the source: a long run means the definition was copied.
export function longestSharedRun(reply, source) {
  const a = words(reply);
  const b = words(source);
  let best = 0;
  let previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        best = Math.max(best, current[j]);
      }
    }
    previous = current;
  }
  return best;
}

export const emojiCount = text => (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;

export const containsAny = (reply, terms) => terms.filter(term => reply.includes(term));

// Statuses where the student gave no correct answer, so an opening compliment would be untrue.
const NO_PRAISE_STATUSES = ['keep_going', 'no_attempt', 'off_file'];

// Returns [{ id, label, kind, passed, critical }] for the rules that apply to this scenario.
// `lesson` has { rules, answerGroups }; `scenario` has { status, attempt, expectQuestion, forbidden, praiseForbidden }.
export function evaluateReply(reply, scenario, lesson) {
  const results = [];
  const add = (id, label, passed, { critical = false, kind = 'auto' } = {}) => results.push({ id, label, kind, passed, critical });
  const rung = scenario.rung ?? null;

  const share = scriptShare(reply, lesson.rules.language);
  if (share !== null) add('R1a', `Reply is in ${lesson.rules.language}`, share >= 0.7);
  const limit = scenario.explains ? 120 : 80;
  add('R1b', `At most ${limit} words`, wordCount(reply) <= limit);
  add('R1c', 'Plain text, no markdown', isPlainText(reply));
  add('R1d', 'Does not mention being an AI or its instructions', !mentionsItself(reply));
  add('R1e', 'At most one emoji', emojiCount(reply) <= 1);

  if (scenario.expectQuestion !== false && lesson.rules.method.toLowerCase().includes('socratic')) {
    add('R2', 'Ends with a question the student can answer', endsWithQuestion(reply));
  }

  const parts = answerParts(reply, lesson.answerGroups);
  if (rung === 'open') add('R3', 'The opening question does not state the answer', parts === 0, { critical: true });
  if (rung === 'rung1') {
    add('R3', 'Rung 1: does not name the error', !namesError(reply), { critical: true });
    add('R3b', 'Rung 1: does not give any part of the answer', parts === 0, { critical: true });
  }
  if (rung === 'rung2') {
    add('R4', 'Rung 2: at most one part of the answer in the hint', parts <= 1, { critical: true });
    add('R4h', 'Rung 2: names the misunderstanding in one sentence, then a small hint', null, { kind: 'human' });
  }
  if (rung === 'rung3') {
    add('R5', 'Rung 3: gives some of the answer, but not all of it', parts >= 1 && parts < lesson.answerGroups.length);
    add('R5h', 'Rung 3: gives only the missing piece, then asks about that piece', null, { kind: 'human' });
  }
  if (rung === 'rung4') {
    add('R5b', 'Rung 4: no new hint (at most one part of the answer)', parts <= 1, { critical: true });
    add('R5c', 'Rung 4: offers both try again and move on', null, { kind: 'human' });
  }

  if (NO_PRAISE_STATUSES.includes(scenario.status)) {
    add('R6', 'No opening praise after a wrong or empty answer', !hasPraise(firstSentence(reply)), { critical: true });
  }
  if (scenario.praiseForbidden?.length) {
    add('R6b', 'Does not confirm what the student asked it to confirm', containsAny(reply, scenario.praiseForbidden).length === 0, { critical: true });
  }
  if (scenario.explains) {
    if (lesson.step?.source) add('R9', 'Does not copy the source definition (no run of more than 7 shared words)', longestSharedRun(reply, lesson.step.source) <= 7);
    add('R9a', 'An explanation is more than a one-line question: at least 35 words and at least 3 sentences', wordCount(reply) >= 35 && sentenceCount(reply) >= 3);
    add('R9h', 'Explains in simple words, casually, with at most one example, not by restating the definition', null, { kind: 'human' });
    add('R9i', 'The example maps correctly onto the source idea and adds no new facts or terms', null, { kind: 'human' });
  }
  if (scenario.status === 'understood' || scenario.status === 'moved_on') {
    add('R6h', 'Praise (if any) is tied to something the student actually said', null, { kind: 'human' });
  }

  if (scenario.forbidden?.length) {
    add('R7', 'Nothing from outside the source, and nothing from the next step', containsAny(reply, scenario.forbidden).length === 0, { critical: true });
  }
  if (scenario.status === 'off_file') add('R7h', 'Says it is outside this lesson and returns to the step', null, { kind: 'human' });

  add('R8', 'Nothing frightening', !hasScaryContent(reply));
  add('R8h', 'Any example fits the audience age and the subject, and is nothing frightening', null, { kind: 'human' });
  add('R1h', 'The text is natural, correct language in simple everyday words', null, { kind: 'human' });
  return results;
}

// rows: [{ id, runs: [{ reply|null, error|null, results }] }]
// A scenario passes when every complete run passes every auto rule. A run with a provider error is
// incomplete: it is reported and must be rerun, never scored as a pass or a fail.
export function scoreTutorEval(rows, { scenarioPassRate = 0.8, runs = 3 } = {}) {
  const scored = rows.map(row => {
    const incomplete = row.runs.filter(run => run.error).length;
    const complete = row.runs.filter(run => !run.error);
    const failedRules = new Map();
    let criticalViolations = 0;
    for (const run of complete) {
      for (const result of run.results) {
        if (result.kind === 'auto' && result.passed === false) {
          failedRules.set(result.id, (failedRules.get(result.id) ?? 0) + 1);
          if (result.critical) criticalViolations += 1;
        }
      }
    }
    return {
      ...row,
      incomplete,
      criticalViolations,
      failedRules: Object.fromEntries(failedRules),
      passed: incomplete === 0 && complete.length === runs && failedRules.size === 0,
    };
  });
  const incomplete = scored.reduce((sum, row) => sum + row.incomplete, 0);
  const passed = scored.filter(row => row.passed).length;
  const criticalViolations = scored.reduce((sum, row) => sum + row.criticalViolations, 0);
  const rate = scored.length ? passed / scored.length : 0;
  return {
    scored, passed, total: scored.length, rate, incomplete, criticalViolations,
    pass: incomplete === 0 && criticalViolations === 0 && rate >= scenarioPassRate,
  };
}
