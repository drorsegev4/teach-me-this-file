// Each browser tab gets a random session id per scope ('teacher', or 'student-<lesson id>'), kept in
// sessionStorage so a reload continues the same session. The id is not a secret and is not the API key.
export function storedSessionId(scope) {
  const name = `tmtf-session-${scope}`;
  try {
    const found = sessionStorage.getItem(name);
    if (found) return found;
  } catch { /* storage can be blocked; a fresh id per load still works */ }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(name, id);
  } catch { /* see above */ }
  return id;
}
