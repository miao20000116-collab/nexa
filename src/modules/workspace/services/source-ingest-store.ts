import { promises as fs } from "fs";
import path from "path";
import type { SourceIngestStatus } from "@/modules/workspace/types";

export interface IngestPayload {
  contentSummary: string;
  keyExcerpts: string[];
  mediaSummary?: string;
  ingestStatus: SourceIngestStatus;
  ingestedAt: string;
  extractedText?: string;
}

type IngestMap = Record<string, IngestPayload>;

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "source-ingest");
const ingestWrites = new Map<string, Promise<void>>();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function mapPath(workspaceId: string) {
  return path.join(DATA_DIR, `${workspaceId}.json`);
}

function enqueueIngestWrite<T>(
  workspaceId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = ingestWrites.get(workspaceId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(task);
  ingestWrites.set(
    workspaceId,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

export async function getSourceIngestMap(
  workspaceId: string
): Promise<IngestMap> {
  try {
    const raw = await fs.readFile(mapPath(workspaceId), "utf-8");
    return JSON.parse(raw) as IngestMap;
  } catch {
    return {};
  }
}

export async function patchSourceIngest(
  workspaceId: string,
  sourceId: string,
  payload: IngestPayload,
  url?: string
): Promise<void> {
  await enqueueIngestWrite(workspaceId, async () => {
    await ensureDir();
    const map = await getSourceIngestMap(workspaceId);
    map[sourceId] = payload;
    if (url) map[`url:${url}`] = payload;
    const target = mapPath(workspaceId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(map, null, 2), "utf-8");
    await fs.rename(temporary, target);
  });
}
