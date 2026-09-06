/**
 * Job system foundation — in-memory + file fallback for P0.
 * Real queue (e.g. Redis / DB-backed) can replace this later.
 */

import { promises as fs } from "fs";
import path from "path";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import { allowLocalDataDir } from "@/lib/runtime";

/**
 * Canonical statuses for long tasks (image/video/render).
 * Legacy aliases kept for existing clients: running→processing, completed→succeeded.
 */
export type JobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "running" // legacy alias of processing
  | "completed" // legacy alias of succeeded
  | "blocked_ai_unavailable";

export function normalizeJobStatus(status: string): JobStatus {
  if (status === "running") return "processing";
  if (status === "completed") return "succeeded";
  return status as JobStatus;
}

export type JobType =
  | "deep_research"
  | "summarize"
  | "asset_process"
  | "image_generate"
  | "video_generate"
  | "video_compose"
  | "music_generate"
  | "music_analyze"
  | "publish"
  | "commerce_sync";

export interface JobRecord {
  id: string;
  userId?: string | null;
  type: JobType | string;
  status: JobStatus;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  progress: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "jobs");

function uid() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function jobPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

async function fileCreate(job: JobRecord) {
  if (!allowLocalDataDir()) {
    throw new Error(
      "Job persistence requires DATABASE_URL in production/serverless. Local .nexa-data is disabled."
    );
  }
  await ensureDir();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

async function fileGet(id: string): Promise<JobRecord | null> {
  try {
    const raw = await fs.readFile(jobPath(id), "utf-8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

async function fileUpdate(
  id: string,
  patch: Partial<JobRecord>
): Promise<JobRecord | null> {
  const current = await fileGet(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await fs.writeFile(jobPath(id), JSON.stringify(next, null, 2));
  return next;
}

export async function createJob(input: {
  type: JobType | string;
  userId?: string | null;
  payload?: Record<string, unknown>;
  status?: JobStatus;
}): Promise<JobRecord> {
  const now = new Date().toISOString();
  const status = input.status ?? "queued";

  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const job = await prisma.job.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        payload: (input.payload ?? undefined) as object | undefined,
        status,
        progress: 0,
      },
    });
    return {
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: normalizeJobStatus(job.status),
      payload: (job.payload as Record<string, unknown>) ?? null,
      result: (job.result as Record<string, unknown>) ?? null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      progress: job.progress,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }

  return fileCreate({
    id: uid(),
    userId: input.userId ?? null,
    type: input.type,
    status,
    payload: input.payload ?? null,
    result: null,
    errorCode: null,
    errorMessage: null,
    progress: 0,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  });
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return null;
    return {
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: normalizeJobStatus(job.status),
      payload: (job.payload as Record<string, unknown>) ?? null,
      result: (job.result as Record<string, unknown>) ?? null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      progress: job.progress,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }
  const file = await fileGet(id);
  return file ? { ...file, status: normalizeJobStatus(file.status) } : null;
}

export async function updateJob(
  id: string,
  patch: Partial<
    Pick<
      JobRecord,
      | "status"
      | "progress"
      | "result"
      | "errorCode"
      | "errorMessage"
      | "startedAt"
      | "completedAt"
    >
  >
): Promise<JobRecord | null> {
  const dbAvailable = await isDatabaseAvailable();
  // Normalize legacy aliases when writing
  const status =
    patch.status === "running"
      ? "processing"
      : patch.status === "completed"
        ? "succeeded"
        : patch.status;

  if (dbAvailable) {
    const job = await prisma.job.update({
      where: { id },
      data: {
        status,
        progress: patch.progress,
        result: patch.result
          ? (JSON.parse(JSON.stringify(patch.result)) as object)
          : undefined,
        errorCode: patch.errorCode,
        errorMessage: patch.errorMessage,
        startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
        completedAt: patch.completedAt
          ? new Date(patch.completedAt)
          : undefined,
      },
    });
    return {
      id: job.id,
      userId: job.userId,
      type: job.type,
      status: normalizeJobStatus(job.status),
      payload: (job.payload as Record<string, unknown>) ?? null,
      result: (job.result as Record<string, unknown>) ?? null,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      progress: job.progress,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    };
  }
  return fileUpdate(id, { ...patch, status });
}

export async function markJobBlockedAi(id: string): Promise<JobRecord | null> {
  return updateJob(id, {
    status: "blocked_ai_unavailable",
    errorCode: "AI_CAPABILITY_NOT_CONFIGURED",
    errorMessage: "该能力将在 AI 服务接入后启用。",
    completedAt: new Date().toISOString(),
  });
}
