import { promises as fs } from "fs";
import path from "path";
import type { WorkflowRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "workflows");

function safe(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function ensureUserDir(userId: string) {
  const dir = path.join(DATA_DIR, safe(userId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function workflowPath(userId: string, id: string) {
  return path.join(DATA_DIR, safe(userId), `${id}.json`);
}

export async function saveWorkflow(wf: WorkflowRecord): Promise<void> {
  const dir = await ensureUserDir(wf.userId);
  await fs.writeFile(
    path.join(dir, `${wf.id}.json`),
    JSON.stringify(wf, null, 2)
  );
}

export async function getWorkflow(
  userId: string,
  id: string
): Promise<WorkflowRecord | null> {
  try {
    const raw = await fs.readFile(workflowPath(userId, id), "utf-8");
    const wf = JSON.parse(raw) as WorkflowRecord;
    if (wf.userId !== userId) return null;
    return wf;
  } catch {
    return null;
  }
}

export async function listWorkflows(userId: string): Promise<WorkflowRecord[]> {
  const dir = await ensureUserDir(userId);
  const files = await fs.readdir(dir).catch(() => []);
  const list: WorkflowRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const wf = JSON.parse(
        await fs.readFile(path.join(dir, f), "utf-8")
      ) as WorkflowRecord;
      if (wf.userId === userId) list.push(wf);
    } catch {
      /* skip */
    }
  }
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
