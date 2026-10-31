export async function requestLesson({ fresh = false } = {}) {
  let response;
  try {
    response = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fresh }),
    });
  } catch {
    throw new Error('Cannot reach the server. Check that it is running, then try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The lesson could not be built. Try again.');
  return data;
}
