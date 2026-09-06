import { promises as fs } from "fs";
import path from "path";
import type {
  Workspace,
  WorkspaceSource,
  DeepResearchJob,
  SourceSnapshot,
} from "@/modules/workspace/types";
import { generateWorkspaceName } from "@/modules/workspace/services/workspace-name";
import { ownsOrSharedWorkspace } from "@/lib/showcase/shared-catalog";

const DATA_DIR = path.join(process.cwd(), ".nexa-data");
const workspaceWrites = new Map<string, Promise<void>>();

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function workspacePath(id: string) {
  return path.join(DATA_DIR, "workspaces", `${id}.json`);
}

function jobPath(id: string) {
  return path.join(DATA_DIR, "research-jobs", `${id}.json`);
}

function enqueueWorkspaceWrite<T>(
  workspaceId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = workspaceWrites.get(workspaceId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  workspaceWrites.set(
    workspaceId,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

async function writeWorkspaceFile(workspace: Workspace): Promise<void> {
  const target = workspacePath(workspace.id);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(workspace, null, 2), "utf-8");
  await fs.rename(temporary, target);
}

export async function fileStoreCreateWorkspace(
  name?: string,
  query?: string,
  userId?: string | null
): Promise<Workspace> {
  await ensureDir(path.join(DATA_DIR, "workspaces"));
  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: uid("ws"),
    userId: userId ?? null,
    name: name || generateWorkspaceName(query),
    status: "active",
    createdAt: now,
    updatedAt: now,
    sources: [],
    items: [],
    versions: [],
  };
  await writeWorkspaceFile(workspace);
  return workspace;
}

export async function fileStoreGetWorkspace(id: string): Promise<Workspace | null> {
  try {
    const raw = await fs.readFile(workspacePath(id), "utf-8");
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

export async function fileStoreUpdateWorkspace(
  id: string,
  patch: Partial<
    Pick<Workspace, "name" | "description" | "status" | "items" | "versions" | "sources">
  >
): Promise<Workspace | null> {
  return enqueueWorkspaceWrite(id, async () => {
    const ws = await fileStoreGetWorkspace(id);
    if (!ws) return null;
    const updated: Workspace = {
      ...ws,
      ...patch,
      items: patch.items !== undefined ? patch.items : ws.items ?? [],
      versions: patch.versions !== undefined ? patch.versions : ws.versions ?? [],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkspaceFile(updated);
    return updated;
  });
}

export async function fileStoreDeleteWorkspace(id: string): Promise<boolean> {
  try {
    await fs.unlink(workspacePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function fileStoreAddSource(
  workspaceId: string,
  snapshot: SourceSnapshot
): Promise<{ workspace: Workspace; source: WorkspaceSource; added: boolean } | null> {
  return enqueueWorkspaceWrite(workspaceId, async () => {
    const ws = await fileStoreGetWorkspace(workspaceId);
    if (!ws) return null;

    const existing = ws.sources.find((s) => s.url === snapshot.url);
    if (existing) {
      return { workspace: ws, source: existing, added: false };
    }

    const source: WorkspaceSource = {
      id: uid("src"),
      workspaceId,
      searchResultId: snapshot.searchResultId ?? null,
      title: snapshot.title ?? null,
      url: snapshot.url,
      platform: snapshot.platform,
      sourceType: snapshot.sourceType,
      snippet: snapshot.snippet ?? null,
      author: snapshot.author ?? null,
      publishedAt: snapshot.publishedAt ?? null,
      thumbnail: snapshot.thumbnail ?? null,
      addedAt: new Date().toISOString(),
    };

    const updated: Workspace = {
      ...ws,
      sources: [...ws.sources, source],
      updatedAt: new Date().toISOString(),
    };
    await writeWorkspaceFile(updated);
    return { workspace: updated, source, added: true };
  });
}

export async function fileStoreRemoveSource(
  workspaceId: string,
  sourceId: string
): Promise<Workspace | null> {
  return enqueueWorkspaceWrite(workspaceId, async () => {
    const ws = await fileStoreGetWorkspace(workspaceId);
    if (!ws) return null;
    const updated: Workspace = {
      ...ws,
      sources: ws.sources.filter((s) => s.id !== sourceId),
      updatedAt: new Date().toISOString(),
    };
    await writeWorkspaceFile(updated);
    return updated;
  });
}

export async function fileStoreListWorkspaces(
  userId?: string | null
): Promise<Workspace[]> {
  await ensureDir(path.join(DATA_DIR, "workspaces"));
  const files = await fs.readdir(path.join(DATA_DIR, "workspaces"));
  const workspaces: Workspace[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(
        path.join(DATA_DIR, "workspaces", file),
        "utf-8"
      );
      workspaces.push(JSON.parse(raw) as Workspace);
    } catch {
      // A malformed legacy/test record must not hide every other workspace.
      continue;
    }
  }
  const filtered = workspaces.filter((ws) =>
    ownsOrSharedWorkspace(userId, ws)
  );
  return filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function fileStoreCreateResearchJob(
  data: Omit<DeepResearchJob, "id" | "createdAt" | "status" | "errorCode">
): Promise<DeepResearchJob> {
  await ensureDir(path.join(DATA_DIR, "research-jobs"));
  const job: DeepResearchJob = {
    id: uid("job"),
    ...data,
    status: "blocked_ai_unavailable",
    errorCode: "AI_CAPABILITY_NOT_CONFIGURED",
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

export async function fileStoreListResearchJobs(
  workspaceId: string
): Promise<DeepResearchJob[]> {
  await ensureDir(path.join(DATA_DIR, "research-jobs"));
  const files = await fs.readdir(path.join(DATA_DIR, "research-jobs"));
  const jobs: DeepResearchJob[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(
      path.join(DATA_DIR, "research-jobs", file),
      "utf-8"
    );
    const job = JSON.parse(raw) as DeepResearchJob;
    if (job.workspaceId === workspaceId) jobs.push(job);
  }
  return jobs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function fileStoreGetResearchJob(id: string): Promise<DeepResearchJob | null> {
  try {
    const raw = await fs.readFile(jobPath(id), "utf-8");
    return JSON.parse(raw) as DeepResearchJob;
  } catch {
    return null;
  }
}

export async function fileStoreUpdateResearchJob(
  id: string,
  patch: Partial<DeepResearchJob>
): Promise<DeepResearchJob> {
  const existing = await fileStoreGetResearchJob(id);
  if (!existing) {
    throw new Error(`research job not found: ${id}`);
  }
  const next: DeepResearchJob = {
    ...existing,
    ...patch,
    id: existing.id,
  };
  await ensureDir(path.join(DATA_DIR, "research-jobs"));
  await fs.writeFile(jobPath(id), JSON.stringify(next, null, 2));
  return next;
}
