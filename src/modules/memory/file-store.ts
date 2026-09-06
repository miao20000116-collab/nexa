/**
 * V3.1 Memory file store — .nexa-data/memory/{userId}.json
 */

import { promises as fs } from "fs";
import path from "path";
import type { UserMemory } from "@/modules/memory/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "memory");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function userPath(userId: string) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

export async function loadUserMemories(userId: string): Promise<UserMemory[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(userPath(userId), "utf-8");
    const list = JSON.parse(raw) as UserMemory[];
    return list.filter((m) => m.userId === userId && m.status !== "deleted");
  } catch {
    return [];
  }
}

export async function saveUserMemories(
  userId: string,
  memories: UserMemory[]
): Promise<void> {
  await ensureDir();
  // Keep deleted for audit briefly, then soft-filter on load
  await fs.writeFile(userPath(userId), JSON.stringify(memories, null, 2));
}

export async function loadAllIncludingDeleted(
  userId: string
): Promise<UserMemory[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(userPath(userId), "utf-8");
    return JSON.parse(raw) as UserMemory[];
  } catch {
    return [];
  }
}
