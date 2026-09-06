/**
 * Optional async worker for long AI / media jobs.
 * Intended for 腾讯云 Docker Compose — NOT for Netlify serverless.
 *
 * Usage (production container):
 *   REDIS_URL=... DATABASE_URL=... npm run worker
 *
 * Current behavior: poll Job table for queued items and mark processing.
 * Heavy video/render pipelines should be plugged into processQueuedJob().
 */

import { prisma } from "../src/lib/db";

const POLL_MS = Number(process.env.NEXA_WORKER_POLL_MS || 3000);
const TYPES = (process.env.NEXA_WORKER_JOB_TYPES ||
  "image_generate,video_generate,video_compose,music_generate,publish")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function claimNextJob() {
  const job = await prisma.job.findFirst({
    where: {
      status: "queued",
      type: { in: TYPES },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

  return prisma.job.update({
    where: { id: job.id },
    data: {
      status: "processing",
      startedAt: new Date(),
      progress: 1,
    },
  });
}

async function processQueuedJob(job: {
  id: string;
  type: string;
  payload: unknown;
}) {
  // Placeholder: real providers are invoked from API routes today.
  // Worker marks unsupported types as failed with a clear code instead of fake success.
  console.info(`[worker] claimed ${job.id} type=${job.type}`);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "failed",
      errorCode: "WORKER_HANDLER_NOT_WIRED",
      errorMessage:
        "Worker skeleton is running; wire provider handlers before enabling NEXA_VIDEO_ENABLED in production.",
      completedAt: new Date(),
    },
  });
}

async function loop() {
  if (!process.env.DATABASE_URL) {
    console.error("[worker] DATABASE_URL is required");
    process.exit(1);
  }
  console.info(`[worker] started poll=${POLL_MS}ms types=${TYPES.join(",")}`);
  // REDIS_URL reserved for future BullMQ; presence is logged only.
  if (process.env.REDIS_URL) {
    console.info("[worker] REDIS_URL configured (queue backend pending)");
  } else {
    console.warn("[worker] REDIS_URL missing — using DB poll only");
  }

  for (;;) {
    try {
      const job = await claimNextJob();
      if (job) {
        await processQueuedJob(job);
      }
    } catch (err) {
      console.error("[worker] tick error", err instanceof Error ? err.message : "unknown");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
