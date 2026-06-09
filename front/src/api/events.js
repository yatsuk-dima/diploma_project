const listeners = new Set();

export function onApiError(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitApiError(message) {
  listeners.forEach((fn) => fn(message));
}
