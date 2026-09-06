/**
 * Persist encrypted OAuth tokens — separate from connection JSON (never sent to client).
 */

import { promises as fs } from "fs";
import path from "path";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  decryptTokenBundle,
  encryptTokenBundle,
  type OAuthTokenBundle,
} from "@/lib/publish/token-vault";

const TOKEN_DIR = path.join(process.cwd(), ".nexa-data", "connection-tokens");

async function tokenFile(connectionId: string) {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  return path.join(TOKEN_DIR, `${connectionId}.enc`);
}

export async function saveConnectionTokens(
  connectionId: string,
  tokens: OAuthTokenBundle
): Promise<void> {
  const blob = encryptTokenBundle(tokens);
  await fs.writeFile(await tokenFile(connectionId), blob, "utf8");

  if (await isDatabaseAvailable()) {
    try {
      await prisma.connection.update({
        where: { id: connectionId },
        data: {
          metadata: {
            hasEncryptedToken: true,
            tokenExpiresAt: tokens.expiresAt ?? null,
          },
        },
      });
    } catch {
      /* file is source of truth */
    }
  }
}

export async function loadConnectionTokens(
  connectionId: string
): Promise<OAuthTokenBundle | null> {
  try {
    const blob = await fs.readFile(await tokenFile(connectionId), "utf8");
    return decryptTokenBundle(blob);
  } catch {
    return null;
  }
}

export async function clearConnectionTokens(connectionId: string): Promise<void> {
  try {
    await fs.unlink(await tokenFile(connectionId));
  } catch {
    /* ignore */
  }
  if (await isDatabaseAvailable()) {
    try {
      await prisma.connection.update({
        where: { id: connectionId },
        data: { metadata: { hasEncryptedToken: false } },
      });
    } catch {
      /* ignore */
    }
  }
}
