/**
 * V4.0 — Personal AI Operating Layer
 * Auto-select Context / Memory / Assets / Research for the current task.
 */

import { listActiveMemories } from "@/modules/memory/services/memory-service";
import { getWorkspaceContext } from "@/modules/workspace/services/context-service";
import { promises as fs } from "fs";
import path from "path";

const PREFS_DIR = path.join(process.cwd(), ".nexa-data", "personal-ai");

export interface PersonalAiPrefs {
  userId: string;
  memoryEnabled: boolean;
  updatedAt: string;
}

export interface ResolvedOperatingContext {
  userId: string;
  memoryEnabled: boolean;
  memories: Array<{ id: string; label: string; value: string; type: string }>;
  workspaceContext: Awaited<ReturnType<typeof getWorkspaceContext>> | null;
  summary: string;
}

async function prefsPath(userId: string) {
  await fs.mkdir(PREFS_DIR, { recursive: true });
  return path.join(
    PREFS_DIR,
    `${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`
  );
}

export async function getPersonalPrefs(userId: string): Promise<PersonalAiPrefs> {
  try {
    const raw = await fs.readFile(await prefsPath(userId), "utf-8");
    return JSON.parse(raw) as PersonalAiPrefs;
  } catch {
    return {
      userId,
      memoryEnabled: true,
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function setMemoryEnabled(
  userId: string,
  enabled: boolean
): Promise<PersonalAiPrefs> {
  const prefs: PersonalAiPrefs = {
    userId,
    memoryEnabled: enabled,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(await prefsPath(userId), JSON.stringify(prefs, null, 2));
  return prefs;
}

export async function resolveOperatingContext(input: {
  userId: string;
  workspaceId?: string;
  task?: string;
}): Promise<ResolvedOperatingContext> {
  const prefs = await getPersonalPrefs(input.userId);
  const memories = prefs.memoryEnabled
    ? (await listActiveMemories(input.userId)).map((m) => ({
        id: m.id,
        label: m.label,
        value: m.value,
        type: m.type,
      }))
    : [];
  const workspaceContext = input.workspaceId
    ? await getWorkspaceContext(input.workspaceId)
    : null;

  const parts: string[] = [];
  if (input.task) parts.push(`任务：${input.task}`);
  if (!prefs.memoryEnabled) {
    parts.push("Memory 已关闭，不会使用长期偏好。");
  } else if (memories.length) {
    parts.push(`已载入 ${memories.length} 条长期偏好。`);
  }
  if (workspaceContext?.explainability?.summary) {
    parts.push(workspaceContext.explainability.summary);
  }

  return {
    userId: input.userId,
    memoryEnabled: prefs.memoryEnabled,
    memories,
    workspaceContext,
    summary: parts.join(" ") || "未找到可用历史 Context。",
  };
}
