/**
 * V3.1 — User Memory service
 * Lifecycle: Candidate → User Confirmation → Saved/Active → Updated → Deleted
 */

import type { MemoryCreateInput, UserMemory } from "@/modules/memory/types";
import {
  createMemory,
  deleteMemory,
  getMemory,
  loadUserMemories,
  updateMemory,
} from "@/modules/memory/services/memory-store";

const SENSITIVE_PATTERNS =
  /(身份证|护照|银行卡|密码|password|ssn|credit\s*card|手机号.*\d{8}|secret)/i;

export function isSensitiveMemoryValue(value: string): boolean {
  return SENSITIVE_PATTERNS.test(value);
}

export async function listMemories(userId: string): Promise<UserMemory[]> {
  return loadUserMemories(userId);
}

export async function listActiveMemories(userId: string): Promise<UserMemory[]> {
  const list = await loadUserMemories(userId);
  return list.filter(
    (m) => m.status === "active" || m.status === "saved" || m.status === "updated"
  );
}

export async function proposeMemory(
  userId: string,
  input: MemoryCreateInput
): Promise<{ ok: true; memory: UserMemory } | { ok: false; error: string }> {
  if (isSensitiveMemoryValue(input.value) || isSensitiveMemoryValue(input.label)) {
    return { ok: false, error: "不允许保存敏感信息" };
  }
  const status = input.requireConfirm === false ? "active" : "candidate";
  const memory = await createMemory(userId, {
    ...input,
    status,
  });
  return { ok: true, memory };
}

export async function confirmMemory(
  userId: string,
  memoryId: string
): Promise<UserMemory | null> {
  const existing = await getMemory(userId, memoryId);
  if (!existing) return null;
  return updateMemory(userId, memoryId, { status: "active" });
}

export async function editMemory(
  userId: string,
  memoryId: string,
  patch: { label?: string; value?: string; meta?: Record<string, unknown> | null }
): Promise<{ ok: true; memory: UserMemory } | { ok: false; error: string }> {
  if (
    (patch.value && isSensitiveMemoryValue(patch.value)) ||
    (patch.label && isSensitiveMemoryValue(patch.label))
  ) {
    return { ok: false, error: "不允许保存敏感信息" };
  }
  const memory = await updateMemory(userId, memoryId, {
    ...patch,
    status: "updated",
  });
  if (!memory) return { ok: false, error: "记忆不存在" };
  // Reactivate after edit
  const active = await updateMemory(userId, memoryId, { status: "active" });
  return { ok: true, memory: active ?? memory };
}

export async function removeMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  return deleteMemory(userId, memoryId);
}

/**
 * Format active memories for Creation / Research prompts.
 * Session overrides (e.g. "写英文版本") must be applied by caller in goal text.
 */
export async function getActiveMemoryForPrompt(
  userId: string,
  opts?: { platform?: string; contentType?: string; enabled?: boolean }
): Promise<string | null> {
  if (opts?.enabled === false) return null;
  const active = await listActiveMemories(userId);
  if (!active.length) return null;

  const relevant = active.filter((m) => {
    if (!opts?.platform && !opts?.contentType) return true;
    const meta = m.meta ?? {};
    const platforms = (meta.platforms as string[] | undefined) ?? [];
    if (opts.platform && platforms.length && !platforms.includes(opts.platform)) {
      // still include language/style preferences without platform lock
      if (m.type === "ContentStyle" || m.type === "Preference") return true;
      return false;
    }
    return true;
  });

  if (!relevant.length) return null;

  const lines = relevant.map(
    (m) => `- [${m.type}] ${m.label}: ${m.value}`
  );
  return `【用户长期偏好（可被本次明确要求覆盖）】\n${lines.join("\n")}`;
}
