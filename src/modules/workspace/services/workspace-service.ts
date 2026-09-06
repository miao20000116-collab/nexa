import { prisma, isDatabaseAvailable } from "@/lib/db";
import type {
  Workspace,
  WorkspaceSource,
  SourceSnapshot,
  DeepResearchJob,
} from "@/modules/workspace/types";
import { generateWorkspaceName } from "@/modules/workspace/services/workspace-name";
import { getSession } from "@/modules/account/auth/service";
import {
  fileStoreCreateWorkspace,
  fileStoreGetWorkspace,
  fileStoreUpdateWorkspace,
  fileStoreDeleteWorkspace,
  fileStoreAddSource,
  fileStoreRemoveSource,
  fileStoreListWorkspaces,
  fileStoreCreateResearchJob,
  fileStoreGetResearchJob,
  fileStoreListResearchJobs,
  fileStoreUpdateResearchJob,
} from "@/lib/workspace/file-store";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { runDeepResearchPipeline } from "@/modules/ai/research/deep-research";
import { createSearXNGProvider } from "@/modules/search/providers/searxng-provider";
import { Prisma } from "@prisma/client";

function mapDbWorkspace(
  ws: {
    id: string;
    userId: string | null;
    name: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    sources: Array<{
      id: string;
      workspaceId: string;
      searchResultId: string | null;
      title: string | null;
      url: string;
      platform: string;
      sourceType: string;
      snippet: string | null;
      author: string | null;
      publishedAt: Date | null;
      thumbnail: string | null;
      addedAt: Date;
    }>;
  }
): Workspace {
  return {
    id: ws.id,
    userId: ws.userId,
    name: ws.name,
    description: ws.description,
    status: ws.status as Workspace["status"],
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
    sources: ws.sources.map(mapDbSource),
    items: [],
    versions: [],
  };
}

function mapDbSource(s: {
  id: string;
  workspaceId: string;
  searchResultId: string | null;
  title: string | null;
  url: string;
  platform: string;
  sourceType: string;
  snippet: string | null;
  author: string | null;
  publishedAt: Date | null;
  thumbnail: string | null;
  addedAt: Date;
}): WorkspaceSource {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    searchResultId: s.searchResultId,
    title: s.title,
    url: s.url,
    platform: s.platform,
    sourceType: s.sourceType,
    snippet: s.snippet,
    author: s.author,
    publishedAt: s.publishedAt?.toISOString() ?? null,
    thumbnail: s.thumbnail,
    addedAt: s.addedAt.toISOString(),
  };
}

export async function createWorkspace(
  name?: string,
  query?: string
): Promise<Workspace> {
  const session = await getSession();
  const userId = session.user?.id ?? null;
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const ws = await prisma.workspace.create({
      data: {
        userId,
        name: name || generateWorkspaceName(query),
        status: "active",
      },
      include: { sources: true },
    });
    return mapDbWorkspace(ws);
  }
  return fileStoreCreateWorkspace(name, query, userId);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const dbAvailable = await isDatabaseAvailable();
  let ws: Workspace | null = null;
  if (dbAvailable) {
    const row = await prisma.workspace.findUnique({
      where: { id },
      include: { sources: { orderBy: { addedAt: "desc" } } },
    });
    ws = row ? mapDbWorkspace(row) : null;
  }
  if (!ws) {
    ws = await fileStoreGetWorkspace(id);
  } else {
    // Merge V3 context fields from file store (items/versions live on disk).
    const fileWs = await fileStoreGetWorkspace(id);
    if (fileWs) {
      ws = {
        ...ws,
        items: fileWs.items ?? [],
        versions: fileWs.versions ?? [],
      };
    }
  }
  if (ws?.sources?.length) {
    const { mergeIngestIntoSources } = await import(
      "@/modules/workspace/services/source-ingest"
    );
    ws = {
      ...ws,
      sources: await mergeIngestIntoSources(ws.id, ws.sources),
    };
  }
  return ws;
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, "name" | "description" | "status">>
): Promise<Workspace | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const ws = await prisma.workspace.update({
      where: { id },
      data: patch,
      include: { sources: { orderBy: { addedAt: "desc" } } },
    });
    return mapDbWorkspace(ws);
  }
  return fileStoreUpdateWorkspace(id, patch);
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    try {
      await prisma.workspace.delete({ where: { id } });
    } catch {
      /* may already be gone in DB — still clear file store */
    }
  }
  await fileStoreDeleteWorkspace(id);
  return true;
}

/** V3.0 — persist items / versions (file-store primary; DB keeps metadata fields). */
export async function updateWorkspaceRecord(
  id: string,
  patch: Partial<Pick<Workspace, "name" | "description" | "status" | "items" | "versions">>
): Promise<Workspace | null> {
  // Always write through file store for V3 context fields (items/versions).
  // When DB is available, also sync name/description/status.
  if (patch.name !== undefined || patch.description !== undefined || patch.status !== undefined) {
    await updateWorkspace(id, {
      name: patch.name,
      description: patch.description,
      status: patch.status,
    });
  }
  return fileStoreUpdateWorkspace(id, patch);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const session = await getSession();
  const userId = session.user?.id ?? null;
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const list = await prisma.workspace.findMany({
      where: userId ? { userId } : { userId: null },
      include: { sources: true },
      orderBy: { updatedAt: "desc" },
    });
    const mapped = list.map(mapDbWorkspace);
    // Merge V3 items/versions from file store (same as getWorkspace).
    return Promise.all(
      mapped.map(async (ws) => {
        const fileWs = await fileStoreGetWorkspace(ws.id);
        if (!fileWs) return ws;
        return {
          ...ws,
          items: fileWs.items ?? [],
          versions: fileWs.versions ?? [],
        };
      })
    );
  }
  return fileStoreListWorkspaces(userId);
}

export async function addSourceToWorkspace(
  workspaceId: string,
  snapshot: SourceSnapshot
): Promise<{ workspace: Workspace; added: boolean } | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const existing = await prisma.workspaceSource.findFirst({
      where: { workspaceId, url: snapshot.url },
    });
    if (existing) {
      const ws = await getWorkspace(workspaceId);
      return ws ? { workspace: ws, added: false } : null;
    }

    await prisma.workspaceSource.create({
      data: {
        workspaceId,
        searchResultId: snapshot.searchResultId ?? null,
        title: snapshot.title,
        url: snapshot.url,
        platform: snapshot.platform,
        sourceType: snapshot.sourceType,
        snippet: snapshot.snippet,
        author: snapshot.author,
        publishedAt: snapshot.publishedAt
          ? new Date(snapshot.publishedAt)
          : null,
        thumbnail: snapshot.thumbnail,
      },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });

    const ws = await getWorkspace(workspaceId);
    if (ws) {
      // Background: extract page → compress (does not block add).
      const addedSource = ws.sources.find((s) => s.url === snapshot.url);
      if (addedSource) {
        void import("@/modules/workspace/services/source-ingest").then(
          ({ ensureSourcesIngested }) =>
            ensureSourcesIngested(workspaceId, [addedSource], { limit: 1 })
        );
      }
      return { workspace: ws, added: true };
    }
    return null;
  }

  const result = await fileStoreAddSource(workspaceId, snapshot);
  if (result?.added) {
    void import("@/modules/workspace/services/source-ingest").then(
      ({ ensureSourcesIngested }) =>
        ensureSourcesIngested(workspaceId, [result.source], { limit: 1 })
    );
  }
  return result
    ? { workspace: result.workspace, added: result.added }
    : null;
}

export async function removeSourceFromWorkspace(
  workspaceId: string,
  sourceId: string
): Promise<Workspace | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    await prisma.workspaceSource.delete({ where: { id: sourceId } });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });
    return getWorkspace(workspaceId);
  }
  return fileStoreRemoveSource(workspaceId, sourceId);
}

export async function createResearchJob(
  data: Omit<DeepResearchJob, "id" | "createdAt" | "status" | "errorCode">
): Promise<DeepResearchJob> {
  const aiReady = AIGateway.isAvailable("generateText");

  const dbAvailable = await isDatabaseAvailable();
  let job: DeepResearchJob;

  if (dbAvailable) {
    try {
      const row = await prisma.deepResearchJob.create({
        data: {
          workspaceId: data.workspaceId,
          goal: data.goal,
          scope: data.scope,
          timeRange: data.timeRange,
          reportType: data.reportType,
          status: aiReady ? "queued" : "blocked_ai_unavailable",
          errorCode: aiReady ? null : "AI_CAPABILITY_NOT_CONFIGURED",
          startedAt: aiReady ? new Date() : null,
        },
      });
      job = mapDbResearchJob(row);
    } catch {
      job = await fileStoreCreateResearchJob(data);
      if (aiReady) {
        job = await fileStoreUpdateResearchJob(job.id, {
          status: "queued",
          errorCode: null,
          startedAt: new Date().toISOString(),
        });
      }
    }
  } else {
    job = await fileStoreCreateResearchJob(data);
    if (aiReady) {
      job = await fileStoreUpdateResearchJob(job.id, {
        status: "queued",
        errorCode: null,
        startedAt: new Date().toISOString(),
      });
    }
  }

  if (aiReady && job.status === "queued") {
    void executeResearchJob(job.id);
  }

  return job;
}

export async function getResearchJob(id: string): Promise<DeepResearchJob | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const job = await prisma.deepResearchJob.findUnique({ where: { id } });
    if (!job) return null;
    return mapDbResearchJob(job);
  }
  return fileStoreGetResearchJob(id);
}

export async function listResearchJobs(
  workspaceId: string
): Promise<DeepResearchJob[]> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const jobs = await prisma.deepResearchJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return jobs.map(mapDbResearchJob);
  }
  return fileStoreListResearchJobs(workspaceId);
}

function mapDbResearchJob(job: {
  id: string;
  workspaceId: string;
  goal: string;
  scope: string;
  timeRange: string;
  reportType: string;
  status: string;
  errorCode: string | null;
  report?: unknown;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): DeepResearchJob {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    goal: job.goal,
    scope: job.scope as DeepResearchJob["scope"],
    timeRange: job.timeRange,
    reportType: job.reportType as DeepResearchJob["reportType"],
    status: job.status as DeepResearchJob["status"],
    errorCode: job.errorCode,
    report: (job.report as Record<string, unknown> | null) ?? null,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

async function updateResearchJobRecord(
  id: string,
  patch: {
    status?: DeepResearchJob["status"];
    errorCode?: string | null;
    report?: Record<string, unknown> | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }
): Promise<DeepResearchJob | null> {
  if (await isDatabaseAvailable()) {
    try {
      // Cast: Prisma client may lag schema when `report Json?` was added (Windows generate lock).
      const data: Record<string, unknown> = {
        status: patch.status,
        errorCode: patch.errorCode,
        startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
        completedAt: patch.completedAt
          ? new Date(patch.completedAt)
          : patch.completedAt === null
            ? null
            : undefined,
      };
      if (patch.report !== undefined) {
        data.report = patch.report as Prisma.InputJsonValue;
      }
      const row = await prisma.deepResearchJob.update({
        where: { id },
        data: data as Prisma.DeepResearchJobUpdateInput,
      });
      return mapDbResearchJob(row as Parameters<typeof mapDbResearchJob>[0]);
    } catch {
      /* fallback */
    }
  }
  try {
    return await fileStoreUpdateResearchJob(id, patch);
  } catch {
    return null;
  }
}

async function executeResearchJob(jobId: string) {
  const job = await getResearchJob(jobId);
  if (!job) return;

  await updateResearchJobRecord(jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
  });

  const workspace = await getWorkspace(job.workspaceId);
  const session = await getSession();
  const userId = session.user?.id ?? workspace?.userId ?? null;

  const seedSources = (workspace?.sources ?? []).map((s) => ({
    title: s.title ?? undefined,
    url: s.url,
    snippet: s.snippet ?? undefined,
  }));

  const searx = createSearXNGProvider();

  const result = await runDeepResearchPipeline({
    goal: job.goal,
    reportType: job.reportType,
    userId,
    jobId,
    workspaceId: job.workspaceId,
    seedSources,
    search: async (query) => {
      if (!searx.isConfigured()) {
        return seedSources.slice(0, 8).map((s) => ({
          title: s.title,
          url: s.url,
          snippet: s.snippet,
        }));
      }
      try {
        const hits = await searx.search({ query, categories: ["general"] });
        return hits.map((h) => ({
          title: h.title,
          url: h.url,
          snippet: h.snippet,
          content: h.content,
        }));
      } catch {
        return [];
      }
    },
  });

  if (result.status === "blocked_ai_unavailable") {
    await updateResearchJobRecord(jobId, {
      status: "blocked_ai_unavailable",
      errorCode: "AI_CAPABILITY_NOT_CONFIGURED",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  if (result.status === "failed") {
    await updateResearchJobRecord(jobId, {
      status: "failed",
      errorCode: result.error ?? "RESEARCH_FAILED",
      completedAt: new Date().toISOString(),
    });
    return;
  }

  await updateResearchJobRecord(jobId, {
    status: "completed",
    errorCode: null,
    report: result.report ?? null,
    completedAt: new Date().toISOString(),
  });

  // V3.0 — attach research report into Workspace Context + version history
  try {
    const { addContextItem, saveContextVersion } = await import(
      "@/modules/workspace/services/context-service"
    );
    const title =
      (result.report?.title as string | undefined) ||
      `研究报告：${job.goal.slice(0, 40)}`;
    const summary =
      (result.report?.executiveSummary as string | undefined) ||
      (Array.isArray(result.report?.keyFindings)
        ? (result.report.keyFindings as string[]).slice(0, 3).join("；")
        : job.goal);
    await addContextItem(job.workspaceId, {
      kind: "research_report",
      title,
      summary,
      refId: jobId,
      payload: {
        goal: job.goal,
        reportType: job.reportType,
        opportunities: result.report?.opportunities ?? [],
        actions: result.report?.actions ?? [],
      },
    });
    await saveContextVersion(job.workspaceId, {
      label: title,
      kind: "research",
      refId: jobId,
      snapshot: (result.report as Record<string, unknown>) ?? { goal: job.goal },
    });
  } catch (err) {
    console.error("[V3.0] failed to attach research context", err);
  }
}