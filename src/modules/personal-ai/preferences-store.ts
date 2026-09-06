/**
 * User AI preferences — .nexa-data/preferences/{userId}.json
 */

import { promises as fs } from "fs";
import path from "path";
import type { UserAiPreferences } from "./types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "preferences");

function safeUser(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function prefsPath(userId: string) {
  return path.join(DATA_DIR, `${safeUser(userId)}.json`);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function loadPreferences(userId: string): Promise<UserAiPreferences> {
  await ensureDir();
  try {
    const raw = await fs.readFile(prefsPath(userId), "utf-8");
    const parsed = JSON.parse(raw) as UserAiPreferences;
    if (parsed.userId !== userId) {
      return {
        userId,
        memoryEnabled: true,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      userId,
      memoryEnabled: parsed.memoryEnabled !== false,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      userId,
      memoryEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function savePreferences(
  userId: string,
  patch: Partial<Pick<UserAiPreferences, "memoryEnabled">>
): Promise<UserAiPreferences> {
  const current = await loadPreferences(userId);
  const next: UserAiPreferences = {
    userId,
    memoryEnabled:
      patch.memoryEnabled !== undefined
        ? Boolean(patch.memoryEnabled)
        : current.memoryEnabled,
    updatedAt: new Date().toISOString(),
  };
  await ensureDir();
  await fs.writeFile(prefsPath(userId), JSON.stringify(next, null, 2));
  return next;
}
