/**
 * Server-only commerce secrets (V4.5-G).
 * OAuth tokens / API keys / secrets must never use NEXT_PUBLIC_*.
 */

import "server-only";

export type CommerceSecretKind =
  | "oauth_access_token"
  | "oauth_refresh_token"
  | "api_key"
  | "api_secret";

/**
 * Resolve live connector secrets from server env only.
 * Returns null when not configured — callers must show Not Connected.
 */
export function getCommerceSecret(
  storeId: string,
  kind: CommerceSecretKind
): string | null {
  // Intentionally no NEXT_PUBLIC_* — server-side only.
  const key = `NEXA_COMMERCE_SECRET_${storeId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_${kind.toUpperCase()}`;
  const v = process.env[key]?.trim();
  return v || null;
}

export function hasLiveCommerceCredentials(storeId: string): boolean {
  return Boolean(
    getCommerceSecret(storeId, "oauth_access_token") ||
      getCommerceSecret(storeId, "api_key")
  );
}

/** Env names that would be unsafe if exposed — documented for audits */
export const FORBIDDEN_PUBLIC_COMMERCE_ENV_PREFIX = "NEXT_PUBLIC_";
