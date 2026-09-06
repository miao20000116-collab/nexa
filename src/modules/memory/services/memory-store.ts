/**
 * V3.1 — User Memory file store (.nexa-data/memory/)
 * Strict userId isolation. No cross-user reads.
 */

import { promises as fs } from "fs";
import path from "path";
import type { UserMemory } from "@/modules/memory/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "memory");

function uid() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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

async function saveAll(userId: string, memories: UserMemory[]) {
  await ensureDir();
  // Keep deleted soft-records for audit (last 100 deleted)
  let existing: UserMemory[] = [];
  try {
    const raw = await fs.readFile(userPath(userId), "utf-8");
    existing = JSON.parse(raw) as UserMemory[];
  } catch {
    /* empty */
  }
  const deleted = existing
    .filter((m) => m.status === "deleted" && m.userId === userId)
    .slice(-100);
  const activeIds = new Set(memories.map((m) => m.id));
  const keepDeleted = deleted.filter((d) => !activeIds.has(d.id));
  const all = [...memories, ...keepDeleted];
  await fs.writeFile(userPath(userId), JSON.stringify(all, null, 2));
}

export async function createMemory(
  userId: string,
  input: {
    type: UserMemory["type"];
    key: string;
    label: string;
    value: string;
    meta?: Record<string, unknown> | null;
    status?: UserMemory["status"];
  }
): Promise<UserMemory> {
  const list = await loadUserMemories(userId);
  const now = new Date().toISOString();
  const memory: UserMemory = {
    id: uid(),
    userId,
    type: input.type,
    key: input.key,
    label: input.label,
    value: input.value,
    meta: input.meta ?? null,
    status: input.status ?? "candidate",
    createdAt: now,
    updatedAt: now,
    confirmedAt: input.status === "active" || input.status === "saved" ? now : null,
  };
  list.push(memory);
  await saveAll(userId, list);
  return memory;
}

export async function updateMemory(
  userId: string,
  memoryId: string,
  patch: Partial<Pick<UserMemory, "label" | "value" | "meta" | "status" | "type" | "key">>
): Promise<UserMemory | null> {
  const list = await loadUserMemories(userId);
  const idx = list.findIndex((m) => m.id === memoryId && m.userId === userId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const next: UserMemory = {
    ...list[idx],
    ...patch,
    id: list[idx].id,
    userId,
    updatedAt: now,
    status: patch.status === "active" || patch.status === "saved" || patch.status === "confirmed"
      ? patch.status === "confirmed"
        ? "active"
        : patch.status
      : patch.status ?? (list[idx].status === "active" ? "updated" : list[idx].status),
    confirmedAt:
      patch.status === "active" ||
      patch.status === "saved" ||
      patch.status === "confirmed"
        ? now
        : list[idx].confirmedAt,
  };
  list[idx] = next;
  await saveAll(userId, list);
  return next;
}

export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  const list = await loadUserMemories(userId);
  const idx = list.findIndex((m) => m.id === memoryId && m.userId === userId);
  if (idx < 0) return false;
  list[idx] = {
    ...list[idx],
    status: "deleted",
    updatedAt: new Date().toISOString(),
  };
  await saveAll(userId, list);
  return true;
}

export async function getMemory(
  userId: string,
  memoryId: string
): Promise<UserMemory | null> {
  const list = await loadUserMemories(userId);
  return list.find((m) => m.id === memoryId) ?? null;
}
