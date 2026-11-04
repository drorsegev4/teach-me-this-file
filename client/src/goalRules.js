// What the server accepts as a lesson goal. The setup screen checks the goal before the build.
export const MAX_PROMPT = 500;

export function goalProblem(prompt) {
  return prompt.trim() ? '' : 'Write what the student should learn.';
}
