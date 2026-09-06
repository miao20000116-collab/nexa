import { NextRequest, NextResponse } from "next/server";
import { isDatabaseAvailable } from "@/lib/db";
import {
  getAppUrl,
  getPersistenceMode,
  isProduction,
  isServerlessRuntime,
} from "@/lib/runtime";
import {
  getObjectStorageConfig,
  isObjectStorageConfigured,
} from "@/lib/storage/object-storage";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "degraded" | "skipped" | "error";

async function checkSearxng(): Promise<{ status: CheckStatus; latencyMs?: number }> {
  const base = process.env.SEARXNG_BASE_URL?.trim();
  if (!base) return { status: "skipped" };
  const started = Date.now();
  try {
    const url = new URL("/healthz", base.endsWith("/") ? base : `${base}/`);
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    // Some SearXNG builds have no /healthz — treat 2xx/404 on root as reachable
    if (res.ok) return { status: "ok", latencyMs: Date.now() - started };
    const root = await fetch(base, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    return {
      status: root.ok || root.status < 500 ? "ok" : "error",
      latencyMs: Date.now() - started,
    };
  } catch {
    return { status: "error", latencyMs: Date.now() - started };
  }
}

async function checkRedis(): Promise<{ status: CheckStatus }> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return { status: "skipped" };
  // Lightweight TCP-less probe: optional. Full Redis client arrives with worker stack.
  // Avoid false "ok" — report configured-but-unverified as degraded.
  return { status: "degraded" };
}

/**
 * Production health endpoint.
 * Never exposes secrets, connection strings, or provider keys.
 */
export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const started = Date.now();

  const checks: Record<
    string,
    { status: CheckStatus; latencyMs?: number; detail?: string }
  > = {
    app: { status: "ok" },
  };

  if (deep || isProduction() || isServerlessRuntime()) {
    const dbStarted = Date.now();
    const dbOk = await isDatabaseAvailable();
    checks.database = {
      status: dbOk ? "ok" : process.env.DATABASE_URL ? "error" : "skipped",
      latencyMs: Date.now() - dbStarted,
      detail: dbOk
        ? undefined
        : process.env.DATABASE_URL
          ? "unreachable"
          : "DATABASE_URL not set",
    };

    checks.objectStorage = {
      status: isObjectStorageConfigured()
        ? "ok"
        : isServerlessRuntime() || isProduction()
          ? "degraded"
          : "skipped",
      detail: isObjectStorageConfigured()
        ? `bucket:${getObjectStorageConfig()?.bucket ? "configured" : "missing"}`
        : "S3/COS not configured",
    };

    checks.redis = await checkRedis();
    checks.searxng = await checkSearxng();
  }

  const statuses = Object.values(checks).map((c) => c.status);
  const hasError = statuses.includes("error");
  const hasDegraded = statuses.includes("degraded");
  const ok = !hasError;

  return NextResponse.json(
    {
      ok,
      status: hasError ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
      service: "nexa",
      time: new Date().toISOString(),
      uptimeHintMs: Date.now() - started,
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? "undefined",
        serverless: isServerlessRuntime(),
        persistence: getPersistenceMode(),
        appUrlConfigured: Boolean(getAppUrl()),
      },
      checks,
    },
    { status: ok ? 200 : 503 }
  );
}
