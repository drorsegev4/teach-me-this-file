// A visitor's session id arrives in a header. Each id has its own draft lesson and its own chat, so
// visitors never share state. Without a header, requests use one shared default session, which keeps
// local tools and tests simple.
export const SESSION_HEADER = 'X-Session-Id';
export const DEFAULT_KEY = 'default';
const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidSessionId(id) {
  return VALID_ID.test(id);
}

export function sessionKey(req) {
  return req.get(SESSION_HEADER) ?? DEFAULT_KEY;
}

// Sessions live in memory. The map keeps the most recently used entries and drops the oldest past `max`,
// so a busy host forgets idle visitors instead of running out of memory.
export function remember(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
}
