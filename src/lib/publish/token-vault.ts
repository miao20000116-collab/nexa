/**
 * Server-side OAuth token encryption. Tokens never leave the server in plaintext.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const raw =
    process.env.NEXA_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "nexa-dev-token-key-change-in-production";
  return createHash("sha256").update(raw).digest();
}

export interface OAuthTokenBundle {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
}

/** Encrypt token bundle for DB/file metadata storage. */
export function encryptTokenBundle(bundle: OAuthTokenBundle): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const payload = Buffer.from(JSON.stringify(bundle), "utf8");
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/** Decrypt token bundle — server only. */
export function decryptTokenBundle(blob: string): OAuthTokenBundle | null {
  try {
    const [ivB64, tagB64, dataB64] = blob.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = deriveKey();
    const decipher = createDecipheriv(
      ALGO,
      key,
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(dec.toString("utf8")) as OAuthTokenBundle;
  } catch {
    return null;
  }
}
