import { promises as fs } from "fs";
import path from "path";
import type {
  ImageGenerationJob,
  ImageGenerationJobView,
} from "@/modules/image/types";

const DIR = path.join(process.cwd(), ".nexa-data", "image-jobs");

async function ensure() {
  await fs.mkdir(DIR, { recursive: true });
}

function jobPath(id: string) {
  return path.join(DIR, `${id}.json`);
}

export function toJobView(job: ImageGenerationJob): ImageGenerationJobView {
  return {
    id: job.id,
    purpose: job.purpose,
    prompt: job.prompt,
    referenceAssetIds: job.referenceAssetIds,
    resultAssetId: job.resultAssetId,
    resultUrl: job.resultUrl,
    status: job.status,
    latencyMs: job.latencyMs,
    creditsEstimated: job.creditsEstimated,
    creditsCharged: job.creditsCharged,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function saveImageJob(
  job: ImageGenerationJob
): Promise<ImageGenerationJob> {
  await ensure();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

export async function getImageJob(
  id: string
): Promise<ImageGenerationJob | null> {
  try {
    const raw = await fs.readFile(jobPath(id), "utf-8");
    return JSON.parse(raw) as ImageGenerationJob;
  } catch {
    return null;
  }
}

export async function listImageJobs(
  userId?: string | null,
  limit = 40
): Promise<ImageGenerationJob[]> {
  await ensure();
  const files = await fs.readdir(DIR);
  const jobs: ImageGenerationJob[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DIR, file), "utf-8");
      jobs.push(JSON.parse(raw) as ImageGenerationJob);
    } catch {
      /* skip */
    }
  }
  return jobs
    .filter((j) => (userId ? j.userId === userId : !j.userId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, limit);
}
