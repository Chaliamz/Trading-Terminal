/**
 * Exponential backoff with "equal jitter": half the window is fixed, half is random.
 * attempt 0 → [0.5s, 1s], attempt 1 → [1s, 2s] … capped at maxMs.
 */
export function backoffDelay(attempt: number, baseMs = 1000, maxMs = 30_000, rand: () => number = Math.random): number {
  const a = Math.max(0, Math.floor(attempt));
  const window = Math.min(maxMs, baseMs * 2 ** Math.min(a, 20));
  return Math.round(window / 2 + (window / 2) * rand());
}
