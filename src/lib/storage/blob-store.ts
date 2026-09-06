/**
 * Unified blob persistence: object storage in production, .nexa-data in development.
 */

import { promises as fs } from "fs";
import path from "path";
import { allowLocalDataDir } from "@/lib/runtime";
import {
  getObject,
  isObjectStorageConfigured,
  putObject,
  storageUnavailableMessage,
} from "@/lib/storage/object-storage";

function localRoot(...parts: string[]) {
  return path.join(process.cwd(), ".nexa-data", ...parts);
}

export async function writeBlob(input: {
  /** Logical folder: generated | assets | music | renders/... */
  namespace: string;
  filename: string;
  body: Buffer;
  contentType?: string;
}): Promise<{ storageKey: string; url: string; backend: "s3" | "local" }> {
  const storageKey = `${input.namespace}/${input.filename}`.replace(
    /\\/g,
    "/"
  );

  if (isObjectStorageConfigured()) {
    const put = await putObject({
      key: storageKey,
      body: input.body,
      contentType: input.contentType,
    });
    return { storageKey, url: put.url, backend: "s3" };
  }

  if (!allowLocalDataDir()) {
    throw new Error(storageUnavailableMessage());
  }

  const filePath = localRoot(...storageKey.split("/"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, input.body);

  // Keep legacy URL shape for generated media served by /api/ai/files
  const url =
    input.namespace === "generated"
      ? `/api/ai/files/${encodeURIComponent(input.filename)}`
      : `/api/assets/file/${encodeURIComponent(storageKey)}`;

  return { storageKey: input.filename, url, backend: "local" };
}

export async function readBlob(input: {
  namespace: string;
  /** filename or full key */
  key: string;
}): Promise<Buffer | null> {
  const key = input.key.includes("/")
    ? input.key
    : `${input.namespace}/${input.key}`;

  if (isObjectStorageConfigured()) {
    const obj = await getObject(key);
    if (obj) return obj.body;
    // try bare filename under namespace
    if (!input.key.includes("/")) {
      const again = await getObject(`${input.namespace}/${input.key}`);
      if (again) return again.body;
    }
  }

  if (!allowLocalDataDir()) return null;

  const candidates = [
    localRoot(...key.split("/")),
    localRoot(input.namespace, path.basename(input.key)),
  ];
  for (const p of candidates) {
    try {
      return await fs.readFile(p);
    } catch {
      /* try next */
    }
  }
  return null;
}
