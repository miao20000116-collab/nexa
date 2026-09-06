import { promises as fs } from "fs";
import path from "path";
import type {
  PlatformConnection,
  PublishRecordView,
  PublishStatus,
} from "@/modules/publish/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data");
const CONNECTIONS_DIR = path.join(DATA_DIR, "connections");
const RECORDS_DIR = path.join(DATA_DIR, "publish-records");

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function connectionPath(id: string) {
  return path.join(CONNECTIONS_DIR, `${id}.json`);
}

function recordPath(id: string) {
  return path.join(RECORDS_DIR, `${id}.json`);
}

export async function fileListConnections(
  userId?: string | null
): Promise<PlatformConnection[]> {
  await ensureDir(CONNECTIONS_DIR);
  const files = await fs.readdir(CONNECTIONS_DIR).catch(() => []);
  const items: PlatformConnection[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(CONNECTIONS_DIR, file), "utf8");
      const item = JSON.parse(raw) as PlatformConnection;
      if (userId && item.userId && item.userId !== userId) continue;
      items.push(item);
    } catch {
      /* skip */
    }
  }
  return items.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function fileGetConnection(
  id: string
): Promise<PlatformConnection | null> {
  try {
    const raw = await fs.readFile(connectionPath(id), "utf8");
    return JSON.parse(raw) as PlatformConnection;
  } catch {
    return null;
  }
}

export async function fileUpsertConnection(
  input: Partial<PlatformConnection> & { provider: string }
): Promise<PlatformConnection> {
  await ensureDir(CONNECTIONS_DIR);
  const now = new Date().toISOString();
  const existing = input.id ? await fileGetConnection(input.id) : null;
  const byProvider = (await fileListConnections(input.userId)).find(
    (c) => c.provider === input.provider && (!input.id || c.id === input.id)
  );
  const base = existing ?? byProvider;
  const item: PlatformConnection = {
    id: base?.id ?? input.id ?? uid("conn"),
    userId: input.userId ?? base?.userId ?? null,
    provider: input.provider,
    status: input.status ?? base?.status ?? "disconnected",
    displayName: input.displayName ?? base?.displayName ?? null,
    externalId: input.externalId ?? base?.externalId ?? null,
    scopes: input.scopes ?? base?.scopes ?? null,
    connectedAt: input.connectedAt ?? base?.connectedAt ?? null,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
    ...((input as { metadata?: unknown }).metadata !== undefined
      ? { metadata: (input as { metadata?: unknown }).metadata }
      : (base as { metadata?: unknown })?.metadata !== undefined
        ? { metadata: (base as { metadata?: unknown }).metadata }
        : {}),
  };
  await fs.writeFile(connectionPath(item.id), JSON.stringify(item, null, 2));
  return item;
}

export async function fileDeleteConnection(id: string): Promise<boolean> {
  try {
    await fs.unlink(connectionPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function fileListPublishRecords(
  opts?: { projectId?: string; userId?: string | null }
): Promise<PublishRecordView[]> {
  await ensureDir(RECORDS_DIR);
  const files = await fs.readdir(RECORDS_DIR).catch(() => []);
  const items: PublishRecordView[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(RECORDS_DIR, file), "utf8");
      const item = JSON.parse(raw) as PublishRecordView & { userId?: string };
      if (opts?.projectId && item.projectId !== opts.projectId) continue;
      if (opts?.userId && item.userId && item.userId !== opts.userId) continue;
      items.push(item);
    } catch {
      /* skip */
    }
  }
  return items.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function fileGetPublishRecord(
  id: string
): Promise<PublishRecordView | null> {
  try {
    const raw = await fs.readFile(recordPath(id), "utf8");
    return JSON.parse(raw) as PublishRecordView;
  } catch {
    return null;
  }
}

export async function fileCreatePublishRecord(
  input: Omit<PublishRecordView, "id" | "createdAt" | "updatedAt"> & {
    userId?: string | null;
  }
): Promise<PublishRecordView> {
  await ensureDir(RECORDS_DIR);
  const now = new Date().toISOString();
  const item: PublishRecordView & { userId?: string | null } = {
    id: uid("pub"),
    projectId: input.projectId ?? null,
    platform: input.platform,
    accountId: input.accountId ?? null,
    connectionId: input.connectionId ?? null,
    status: (input.status as PublishStatus) ?? "draft",
    publishedAt: input.publishedAt ?? null,
    externalPostId: input.externalPostId ?? null,
    externalUrl: input.externalUrl ?? null,
    contentId: input.externalPostId ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    payload: input.payload ?? null,
    projectTitle: input.projectTitle ?? null,
    createdAt: now,
    updatedAt: now,
    ...(input.userId !== undefined ? { userId: input.userId } : {}),
  };
  await fs.writeFile(recordPath(item.id), JSON.stringify(item, null, 2));
  return item;
}

export async function fileUpdatePublishRecord(
  id: string,
  patch: Partial<PublishRecordView>
): Promise<PublishRecordView | null> {
  const existing = await fileGetPublishRecord(id);
  if (!existing) return null;
  const next: PublishRecordView = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(recordPath(id), JSON.stringify(next, null, 2));
  return next;
}
