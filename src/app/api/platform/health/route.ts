import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  logObservability,
  newRequestId,
  withProviderFailover,
  withTimeout,
} from "@/modules/platform/reliability";

/** V4.8 Platform reliability probe (internal-safe responses only) */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const key =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "anon";
  const rl = checkRateLimit({
    key: `platform:${key}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    await logObservability({
      requestId,
      status: "rate_limited",
      at: new Date().toISOString(),
    });
    return NextResponse.json(
      { ok: false, code: "rate_limited", requestId },
      { status: 429 }
    );
  }

  const started = Date.now();
  try {
    const result = await withTimeout(
      withProviderFailover<{ healthy: boolean; mode: "primary" | "fallback" }>({
        primary: async () => ({ healthy: true, mode: "primary" }),
        fallback: async () => ({ healthy: true, mode: "fallback" }),
      }),
      3000,
      "health"
    );
    await logObservability({
      requestId,
      status: result.mode === "fallback" ? "fallback" : "ok",
      latencyMs: Date.now() - started,
      at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      requestId,
      healthy: result.healthy,
      // Do not expose internal provider names / stack traces
    });
  } catch {
    await logObservability({
      requestId,
      status: "error",
      latencyMs: Date.now() - started,
      at: new Date().toISOString(),
    });
    return NextResponse.json(
      { ok: false, requestId, message: "服务暂时不可用" },
      { status: 503 }
    );
  }
}
