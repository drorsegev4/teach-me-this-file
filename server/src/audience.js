// Shared by the tutor adapter and evals so grade-specific limits cannot drift.
export function audienceGuidance(audience = '') {
  const text = String(audience).toLowerCase();
  const numeric = /\b(1[0-2]|[1-9])(?:st|nd|rd|th)?[ -]*grade\b|\bgrade[ -]*(1[0-2]|[1-9])\b/.exec(text);
  const hebrew = /\u05db\u05d9?\u05ea\u05d4[ \t]+(1[0-2]|[1-9])/.exec(text);
  const hebrewLetter = /\u05db\u05d9?\u05ea\u05d4[ \t]+([\u05d0-\u05d9]{1,2})[\u05f3\u05f4'"]?(?=\s|$)/.exec(text)?.[1];
  const hebrewGrades = ['\u05d0','\u05d1','\u05d2','\u05d3','\u05d4','\u05d5','\u05d6','\u05d7','\u05d8','\u05d9','\u05d9\u05d0','\u05d9\u05d1'];
  const grade = numeric ? Number(numeric[1] || numeric[2]) : hebrew ? Number(hebrew[1]) : hebrewLetter ? hebrewGrades.indexOf(hebrewLetter) + 1 : null;
  if (grade && grade <= 6) return { level: 'elementary', maxWords: 45, style: 'Use very short sentences and one visible action at a time. Explain the term simply in the source context; use familiar objects or activities only when an example is needed. Ask what happens in the source situation; no abstract why questions.' };
  if (grade && grade <= 9) return { level: 'middle school', maxWords: 70, style: 'Use short conversational sentences, one idea grounded in the passage. Do not require an example; if the student needs one, keep it familiar and brief. Explain necessary subject terms immediately. Ask one concrete question about the passage or taught idea, answerable in a short sentence. Avoid philosophical framing, abstract biological purposes and survival stories unless the source requires them.' };
  if (grade) return { level: 'high school', maxWords: 100, style: 'Use precise subject terms with brief definitions. Use the passage context directly; add a subject-relevant example only if it helps. Ask a focused application or reasoning question using only what was taught.' };
  if (/university|college|undergraduate|graduate|adult/.test(text)) return { level: 'adult', maxWords: 120, style: 'Use appropriate technical vocabulary, explain unfamiliar terms and assumptions, and ask a focused application question. Be concise and conversational.' };
  return { level: 'unspecified', maxWords: 70, style: 'Assume no specialist background. Use plain language, the source context and a concrete comprehension question; add an example only if needed. Do not infer an exact age or grade.' };
}
