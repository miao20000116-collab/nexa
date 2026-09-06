/**
 * Idempotent seed of shared showcase creations/workspaces into file store + DB.
 * Bundled under data/showcase so production deploys can load the same samples.
 */

import { promises as fs } from "fs";
import path from "path";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  SHARED_CREATION_IDS,
  SHARED_WORKSPACE_IDS,
} from "@/lib/showcase/shared-catalog";
import type { CreationProject } from "@/modules/create/types";
import type { Workspace } from "@/modules/workspace/types";

const SHOWCASE_DIR = path.join(process.cwd(), "data", "showcase");

let seedPromise: Promise<void> | null = null;

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function ensureFileStoreCopies() {
  const pairs: Array<{ from: string; to: string }> = [
    ...SHARED_CREATION_IDS.map((id) => ({
      from: path.join(SHOWCASE_DIR, "creations", `${id}.json`),
      to: path.join(process.cwd(), ".nexa-data", "creations", `${id}.json`),
    })),
    ...SHARED_WORKSPACE_IDS.map((id) => ({
      from: path.join(SHOWCASE_DIR, "workspaces", `${id}.json`),
      to: path.join(process.cwd(), ".nexa-data", "workspaces", `${id}.json`),
    })),
    ...SHARED_WORKSPACE_IDS.map((id) => ({
      from: path.join(SHOWCASE_DIR, "source-ingest", `${id}.json`),
      to: path.join(process.cwd(), ".nexa-data", "source-ingest", `${id}.json`),
    })),
  ];

  for (const { from, to } of pairs) {
    try {
      await fs.access(from);
    } catch {
      continue;
    }
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      // Always refresh from bundled showcase so deploy + local stay aligned.
      await fs.copyFile(from, to);
    } catch (err) {
      // Production images often run as non-root without writable .nexa-data.
      // DB upsert below is enough for shared visibility.
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "EACCES" || code === "EROFS") continue;
      throw err;
    }
  }
}

async function upsertDatabase() {
  if (!(await isDatabaseAvailable())) return;

  for (const id of SHARED_WORKSPACE_IDS) {
    const ws = await readJson<Workspace>(
      path.join(SHOWCASE_DIR, "workspaces", `${id}.json`)
    );
    if (!ws) continue;
    await prisma.workspace.upsert({
      where: { id: ws.id },
      create: {
        id: ws.id,
        userId: null,
        name: ws.name,
        status: ws.status || "active",
        createdAt: new Date(ws.createdAt),
        updatedAt: new Date(ws.updatedAt),
      },
      update: {
        userId: null,
        name: ws.name,
        status: ws.status || "active",
        updatedAt: new Date(ws.updatedAt),
      },
    });

    for (const src of ws.sources ?? []) {
      try {
        await prisma.workspaceSource.upsert({
          where: {
            workspaceId_url: {
              workspaceId: ws.id,
              url: src.url,
            },
          },
          create: {
            id: src.id,
            workspaceId: ws.id,
            searchResultId: src.searchResultId ?? null,
            title: src.title,
            url: src.url,
            platform: src.platform,
            sourceType: src.sourceType,
            snippet: src.snippet,
            author: src.author,
            publishedAt: src.publishedAt ? new Date(src.publishedAt) : null,
            thumbnail: src.thumbnail,
            addedAt: src.addedAt ? new Date(src.addedAt) : new Date(),
          },
          update: {
            title: src.title,
            platform: src.platform,
            sourceType: src.sourceType,
            snippet: src.snippet,
            thumbnail: src.thumbnail,
          },
        });
      } catch {
        // Unique constraint variants / missing optional relations — skip row.
      }
    }
  }

  for (const id of SHARED_CREATION_IDS) {
    const project = await readJson<CreationProject>(
      path.join(SHOWCASE_DIR, "creations", `${id}.json`)
    );
    if (!project) continue;
    await prisma.creationProject.upsert({
      where: { id: project.id },
      create: {
        id: project.id,
        userId: null,
        workspaceId: project.workspaceId ?? null,
        title: project.title || "未命名创作",
        goal: project.goal,
        contentType: project.contentType,
        platform: project.platform,
        status: project.status || "ready",
        brief: project.brief,
        timeline: project.timeline ? toJson(project.timeline) : undefined,
        content: project.content ? toJson(project.content) : undefined,
        sources: project.sources ? toJson(project.sources) : undefined,
        startMode: project.startMode,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      },
      update: {
        userId: null,
        workspaceId: project.workspaceId ?? null,
        title: project.title || "未命名创作",
        goal: project.goal,
        contentType: project.contentType,
        platform: project.platform,
        status: project.status || "ready",
        brief: project.brief,
        timeline: project.timeline ? toJson(project.timeline) : undefined,
        content: project.content ? toJson(project.content) : undefined,
        sources: project.sources ? toJson(project.sources) : undefined,
        startMode: project.startMode,
        updatedAt: new Date(project.updatedAt),
      },
    });
  }
}

async function runSeed() {
  await ensureFileStoreCopies();
  await upsertDatabase();
}

/** Call from list APIs — runs at most once per process. */
export function ensureShowcaseSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error("[showcase] seed failed", err);
    });
  }
  return seedPromise ?? Promise.resolve();
}
