const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-process fixed-window limiter for the login endpoint. Deliberately simple:
 * it resets on restart and would not hold across multiple instances, which is
 * adequate for a single-process deployment and is recorded as a limitation in
 * docs/engineering/security.md.
 */
const windows = new Map<string, Window>();

function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) {
      windows.delete(key);
    }
  }
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  prune(now);

  const window = windows.get(key);
  if (window === undefined || window.resetAt <= now) {
    return false;
  }

  return window.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const window = windows.get(key);

  if (window === undefined || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  window.count += 1;
}

export function clearAttempts(key: string): void {
  windows.delete(key);
}
