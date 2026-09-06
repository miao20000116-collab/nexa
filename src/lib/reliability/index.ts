/**
 * V4.8 — Platform reliability helpers
 * Rate limit, retry/timeout, requestId logging. Internal only — never expose logs to end users.
 */

import { randomUUID } from "crypto";

export type ObservabilityFields = {
  requestId: string;
  userId?: string | null;
  jobId?: string | null;
  capability?: string | null;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number;
  status: "success" | "error" | "timeout" | "rate_limited" | "fallback";
  cost?: number | null;
  errorCode?: string | null;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function newRequestId(prefix = "req"): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Simple in-memory sliding window rate limiter (per key).
 * Returns ok=false when over limit — caller must not fake success.
 */
export function checkRateLimit(opts: {
  key: string;
  limit: number;
  windowMs?: number;
}): { ok: true; remaining: number } | { ok: false; retryAfterMs: number } {
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const cur = buckets.get(opts.key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: opts.limit - 1 };
  }
  if (cur.count >= opts.limit) {
    return { ok: false, retryAfterMs: Math.max(0, cur.resetAt - now) };
  }
  cur.count += 1;
  return { ok: true, remaining: opts.limit - cur.count };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label}_timeout`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: { maxAttempts?: number; delayMs?: number; shouldRetry?: (err: unknown) => boolean }
): Promise<T> {
  const max = opts?.maxAttempts ?? 2;
  const delayMs = opts?.delayMs ?? 400;
  const shouldRetry =
    opts?.shouldRetry ??
    ((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /timeout|ECONNRESET|429|5\d\d|unavailable/i.test(msg);
    });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= max || !shouldRetry(err)) throw err;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw lastErr;
}

/**
 * Retry primary, then fallback. Never invents a successful result.
 */
export async function withFailover<T>(opts: {
  primary: () => Promise<T>;
  fallback: () => Promise<T>;
  timeoutMs?: number;
  retries?: number;
}): Promise<{ result: T; usedFallback: boolean }> {
  try {
    const result = await withRetry(
      () =>
        opts.timeoutMs
          ? withTimeout(opts.primary(), opts.timeoutMs, "primary")
          : opts.primary(),
      { maxAttempts: opts.retries ?? 2 }
    );
    return { result, usedFallback: false };
  } catch {
    const result = await (opts.timeoutMs
      ? withTimeout(opts.fallback(), opts.timeoutMs, "fallback")
      : opts.fallback());
    return { result, usedFallback: true };
  }
}

/** Internal observability log — never return raw records to client UIs. */
export function logObservability(fields: ObservabilityFields): void {
  if (process.env.NEXA_OBS_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.info("[nexa-obs]", JSON.stringify(fields));
  }
}

/** Safe client-facing subset — strips internal error detail. */
export function publicObsSummary(fields: ObservabilityFields): {
  requestId: string;
  status: ObservabilityFields["status"];
  latencyMs?: number;
} {
  return {
    requestId: fields.requestId,
    status: fields.status,
    latencyMs: fields.latencyMs,
  };
}
