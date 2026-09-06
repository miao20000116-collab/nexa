/**
 * V4.8 — Platform Scale & Reliability helpers
 * Rate limit, retry/timeout, request observability. Never expose internals to users.
 */

import { promises as fs } from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), ".nexa-data", "observability");

export interface ObservabilityEvent {
  requestId: string;
  userId?: string | null;
  jobId?: string | null;
  capability?: string | null;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number;
  status: "ok" | "error" | "timeout" | "rate_limited" | "fallback";
  cost?: number | null;
  at: string;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(input.key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return { allowed: true };
  }
  if (bucket.count >= input.limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { allowed: true };
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Try primary, then fallback. Results must stay honest — fallback failure is still failure.
 */
export async function withProviderFailover<T>(input: {
  primary: () => Promise<T>;
  fallback?: () => Promise<T>;
  onEvent?: (status: ObservabilityEvent["status"]) => void;
}): Promise<T> {
  try {
    const result = await withRetry(input.primary, { retries: 1 });
    input.onEvent?.("ok");
    return result;
  } catch {
    if (!input.fallback) {
      input.onEvent?.("error");
      throw new Error("provider_failed");
    }
    try {
      const result = await input.fallback();
      input.onEvent?.("fallback");
      return result;
    } catch {
      input.onEvent?.("error");
      throw new Error("provider_failover_failed");
    }
  }
}

export async function logObservability(
  event: ObservabilityEvent
): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `${event.at.slice(0, 10)}.jsonl`);
  await fs.appendFile(file, `${JSON.stringify(event)}\n`);
}
