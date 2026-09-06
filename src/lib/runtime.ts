/**
 * Runtime / persistence mode helpers.
 * Development keeps .nexa-data fallback; production/serverless must use DB + object storage.
 */

export type PersistenceMode = "local_fs" | "database";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Netlify / Vercel / generic serverless — local disk is ephemeral. */
export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL ||
      process.env.NEXA_RUNTIME === "serverless"
  );
}

/**
 * Local .nexa-data is allowed only in development (or explicit override).
 * Production / serverless must not rely on it for durable state.
 */
export function allowLocalDataDir(): boolean {
  if (process.env.NEXA_ALLOW_LOCAL_DATA === "1") return true;
  if (process.env.NEXA_ALLOW_LOCAL_DATA === "0") return false;
  if (isServerlessRuntime()) return false;
  if (isProduction() && process.env.NEXA_REQUIRE_DATABASE !== "0") return false;
  return true;
}

export function requireDatabase(): boolean {
  if (process.env.NEXA_REQUIRE_DATABASE === "1") return true;
  if (process.env.NEXA_REQUIRE_DATABASE === "0") return false;
  return isProduction() || isServerlessRuntime();
}

export function getPersistenceMode(): PersistenceMode {
  if (!allowLocalDataDir()) return "database";
  return process.env.DATABASE_URL ? "database" : "local_fs";
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.URL?.replace(/\/$/, "") ||
    process.env.DEPLOY_PRIME_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
