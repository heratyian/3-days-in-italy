type Window = { count: number; expires: number };
const windows = new Map<string, Window>();

/** Best-effort per-process limit. Replicas and cold starts have independent counters.
 * Deploy one Node process for a shared limit, or use the host's rate limiter at scale.
 */
export function allowRequest(key: string, limit: number, duration = 60_000): boolean {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (window.expires <= now) windows.delete(key);
  }
  const window = windows.get(key) ?? { count: 0, expires: now + duration };
  if (window.count >= limit) return false;
  window.count += 1;
  windows.set(key, window);
  return true;
}

export function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("Usage limits must be positive integers.");
  return number;
}
