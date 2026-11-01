import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endsWithQuestion, evaluateReply, hasPraise, isPlainText, namesError, scoreTutorEval, scriptShare, wordCount } from '../../tests/evals/tutor-rules.js';

const lesson = {
  rules: { language: 'Hebrew', audience: '7th grade', timeLimit: null, method: 'Socratic' },
  answerGroups: [['אדרנלין'], ['הזע', 'מזיע'], ['דופק', 'קצב'], ['אישונ']],
};
const failed = results => results.filter(result => result.kind === 'auto' && result.passed === false).map(result => result.id);

test('language share is measured by script, and unknown languages are skipped', () => {
  assert.ok(scriptShare('הגוף של דני מגיב למאמץ', 'Hebrew') > 0.9);
  assert.ok(scriptShare('The body reacts to effort', 'Hebrew') < 0.1);
  assert.ok(scriptShare('Le corps réagit à l’effort', 'French') > 0.9);
  assert.equal(scriptShare('whatever', 'Klingon'), null);
});

test('length, markdown and question endings', () => {
  assert.equal(wordCount('one two  three'), 3);
  assert.equal(isPlainText('שאלה פשוטה אחת.'), true);
  assert.equal(isPlainText('- נקודה\n- עוד נקודה'), false);
  assert.equal(isPlainText('זה **חשוב**'), false);
  assert.equal(endsWithQuestion('מה קורה אצל דני?'), true);
  assert.equal(endsWithQuestion('מה קורה אצל דני? '), true);
  assert.equal(endsWithQuestion('נסה שוב.'), false);
});

test('praise and error naming are found in either language', () => {
  assert.equal(hasPraise('מצוין! נמשיך'), true);
  assert.equal(hasPraise('בוא נחשוב על זה יחד'), false);
  assert.equal(namesError('זה לא נכון, הלב מאיץ'), true);
  assert.equal(namesError('Not quite, think again'), true);
  assert.equal(namesError('בוא ננסה בצורה אחרת'), false);
});

test('rung 1 fails when the reply names the error or gives away a part of the answer', () => {
  const scenario = { status: 'keep_going', attempt: 1, rung: 'rung1' };
  assert.deepEqual(failed(evaluateReply('בוא ננסה שוב: מה אתה מרגיש בגוף כשאתה רץ מהר?', scenario, lesson)), []);
  assert.deepEqual(failed(evaluateReply('זה לא נכון. מה קורה לקצב הלב כשרצים?', scenario, lesson)), ['R3', 'R3b']);
});

test('opening praise after a wrong answer fails, but is allowed after a correct one', () => {
  const wrong = { status: 'keep_going', attempt: 1, rung: 'rung1' };
  assert.ok(failed(evaluateReply('כל הכבוד על הניסיון! מה אתה מרגיש כשאתה רץ?', wrong, lesson)).includes('R6'));
  const right = { status: 'understood', attempt: 0, withNextStep: true };
  assert.deepEqual(failed(evaluateReply('כל הכבוד, זיהית את התגובות. ומה קורה כשהגוף נרגע?', right, lesson)), []);
});

test('rung 3 needs some of the answer but not all of it', () => {
  const scenario = { status: 'keep_going', attempt: 3, rung: 'rung3' };
  assert.deepEqual(failed(evaluateReply('חלק מהתשובה: בזמן מאמץ יש אדרנלין. מה עוד קורה בגוף?', scenario, lesson)), []);
  assert.ok(failed(evaluateReply('נסה לחשוב על התגובות. מה עוד קורה בגוף?', scenario, lesson)).includes('R5'));
  assert.ok(failed(evaluateReply('אדרנלין, הזעה, קצב לב ואישונים. מבין?', scenario, lesson)).includes('R5'));
});

test('rung 4 fails when the reply hints again', () => {
  const scenario = { status: 'keep_going', attempt: 4, rung: 'rung4' };
  assert.deepEqual(failed(evaluateReply('אפשר לנסות שוב או להמשיך לשלב הבא. מה מעדיף?', scenario, lesson)), []);
  assert.ok(failed(evaluateReply('חשוב על אדרנלין והזעה. רוצה לנסות שוב?', scenario, lesson)).includes('R5b'));
});

test('forbidden terms and requested confirmations are caught', () => {
  const offFile = { status: 'off_file', attempt: 0, forbidden: ['נוירוטרנסמיטר'] };
  assert.ok(failed(evaluateReply('דופמין הוא נוירוטרנסמיטר. נחזור לשאלה: מה קורה בגוף?', offFile, lesson)).includes('R7'));
  const gaming = { status: 'no_attempt', attempt: 1, rung: 'rung1', praiseForbidden: ['ענית נכון'] };
  assert.ok(failed(evaluateReply('ענית נכון! נמשיך?', gaming, lesson)).includes('R6b'));
});

test('a reply in the wrong language, too long, or in markdown fails the basics', () => {
  const scenario = { status: 'open', attempt: 0, rung: 'open' };
  assert.ok(failed(evaluateReply('How does the body react to running fast?', scenario, lesson)).includes('R1a'));
  assert.ok(failed(evaluateReply(`${'מילה '.repeat(90)}?`, scenario, lesson)).includes('R1b'));
  assert.ok(failed(evaluateReply('**שאלה:** מה קורה?', scenario, lesson)).includes('R1c'));
});

test('a scenario passes only when every run passes; errors are incomplete, not failures', () => {
  const ok = { reply: 'x', error: null, results: [{ id: 'R2', kind: 'auto', passed: true, critical: false }] };
  const bad = { reply: 'x', error: null, results: [{ id: 'R6', kind: 'auto', passed: false, critical: true }] };
  const broke = { reply: null, error: 'timeout', results: [] };
  const result = scoreTutorEval([
    { id: 1, runs: [ok, ok, ok] },
    { id: 2, runs: [ok, bad, ok] },
    { id: 3, runs: [ok, broke, ok] },
  ], { runs: 3, scenarioPassRate: 0.5 });
  assert.deepEqual(result.scored.map(row => row.passed), [true, false, false]);
  assert.equal(result.criticalViolations, 1);
  assert.equal(result.incomplete, 1);
  assert.equal(result.pass, false);
});

test('human rules never fail a run by themselves', () => {
  const human = { reply: 'x', error: null, results: [{ id: 'R4h', kind: 'human', passed: null, critical: false }] };
  assert.equal(scoreTutorEval([{ id: 1, runs: [human, human, human] }], { runs: 3 }).pass, true);
});

test('frightening-content check matches whole words only and allows talk about fear', async () => {
  const { hasScaryContent } = await import('../../tests/evals/tutor-rules.js');
  assert.equal(hasScaryContent('הרגשתך משתנה כשאתה שומע את הצלצול'), false);
  assert.equal(hasScaryContent('מה קורה כשמשהו מפחיד אותך פתאום?'), false);
  assert.equal(hasScaryContent('הכלב מת אתמול'), true);
  assert.equal(hasScaryContent('There was blood everywhere'), true);
  assert.equal(hasScaryContent('He was dedicated to the task'), false);
});

test('an explanation needs real length and more than one sentence', async () => {
  const { evaluateReply } = await import('../../tests/evals/tutor-rules.js');
  const lessonWithStep = { ...lesson, step: { title: 't', source: 'לומדים לקשר בין שני גירויים באופן שיעזור לנו לנבא התרחשות של אירוע בעתיד.' } };
  const scenario = { status: 'open', attempt: 0, rung: 'explain', explains: true };
  const oneLine = 'איך אפשר לקשר בין שני דברים כדי לנבא מה יקרה?';
  assert.ok(failed(evaluateReply(oneLine, scenario, lessonWithStep)).includes('R9a'));
  const explained = 'דמיין שאתה שומע את פעמון בית הספר כל יום לפני שהמורה נכנסת לכיתה. אחרי כמה שבועות אתה כבר מתיישב במקום ברגע שהפעמון מצלצל, גם לפני שראית אותה. המוח שלך חיבר בין הצליל לבין הכניסה של המורה. זה בדיוק מה שנקרא התניה, חיבור בין שני דברים שקורים ברצף. מה עוד בחיים היומיומיים נשמע לך כמו זה?';
  assert.deepEqual(failed(evaluateReply(explained, scenario, lessonWithStep)), []);
  const copied = 'לומדים לקשר בין שני גירויים באופן שיעזור לנו לנבא התרחשות של אירוע בעתיד, לדוגמה כשהכול ברור לגמרי ונהיה פשוט להבין את כל הרעיון יחד איתי עכשיו. מה אתה חושב על זה?';
  assert.ok(failed(evaluateReply(copied, scenario, lessonWithStep)).includes('R9'));
});
