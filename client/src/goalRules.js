// What the server accepts as a lesson goal. The setup screen and the Create panel check the same limits.
export const MIN_PROMPT = 20;
export const MAX_PROMPT = 500;
// The goal plus the teacher's later change requests. Matches the server's limit.
export const MAX_TOTAL_PROMPT = 1500;

export function goalProblem(prompt) {
  const length = prompt.trim().length;
  if (length < MIN_PROMPT) return `Write at least ${MIN_PROMPT - length} more characters about what the student should learn.`;
  return '';
}

// The text sent to the server: the first goal, then each change request on its own line.
export function fullGoal({ prompt, changes }) {
  return [prompt, ...changes.map(change => `Change: ${change}`)].join('\n');
}
