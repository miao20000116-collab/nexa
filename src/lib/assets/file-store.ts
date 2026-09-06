import { promises as fs } from "fs";
import path from "path";
import type { OwnedAsset } from "@/modules/assets/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "assets");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readIndex(): Promise<OwnedAsset[]> {
  await ensureDir();
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw) as OwnedAsset[];
  } catch {
    return [];
  }
}

async function writeIndex(assets: OwnedAsset[]) {
  await ensureDir();
  await fs.writeFile(INDEX_FILE, JSON.stringify(assets, null, 2));
}

export function assetStoragePath(storageKey: string) {
  return path.join(DATA_DIR, "files", path.basename(storageKey));
}

export async function fileStoreListAssets(userId: string | null): Promise<OwnedAsset[]> {
  const all = await readIndex();
  // Guests share the local null-user pool; signed-in users see only their own.
  return all
    .filter((a) =>
      userId ? a.userId === userId : a.userId == null || a.userId === ""
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function fileStoreGetAsset(id: string): Promise<OwnedAsset | null> {
  const all = await readIndex();
  return all.find((a) => a.id === id) ?? null;
}

export async function fileStoreUpsertAsset(asset: OwnedAsset): Promise<OwnedAsset> {
  const all = await readIndex();
  const idx = all.findIndex((a) => a.id === asset.id);
  if (idx >= 0) all[idx] = asset;
  else all.push(asset);
  await writeIndex(all);
  return asset;
}

export async function fileStoreDeleteAsset(id: string): Promise<OwnedAsset | null> {
  const all = await readIndex();
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const [removed] = all.splice(idx, 1);
  await writeIndex(all);
  return removed;
}

export async function fileStoreWriteBytes(storageKey: string, bytes: Buffer) {
  try {
    const { writeBlob } = await import("@/lib/storage/blob-store");
    const { isObjectStorageConfigured } = await import(
      "@/lib/storage/object-storage"
    );
    if (isObjectStorageConfigured()) {
      await writeBlob({
        namespace: "assets",
        filename: path.basename(storageKey),
        body: bytes,
        contentType: "application/octet-stream",
      });
      return;
    }
  } catch {
    /* fall through to local when allowed */
  }
  const filePath = assetStoragePath(storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, bytes);
}

export async function fileStoreReadBytes(storageKey: string): Promise<Buffer | null> {
  try {
    const { readBlob } = await import("@/lib/storage/blob-store");
    const { isObjectStorageConfigured } = await import(
      "@/lib/storage/object-storage"
    );
    if (isObjectStorageConfigured()) {
      const fromS3 = await readBlob({
        namespace: "assets",
        key: path.basename(storageKey),
      });
      if (fromS3) return fromS3;
    }
  } catch {
    /* local fallback */
  }
  try {
    return await fs.readFile(assetStoragePath(storageKey));
  } catch {
    return null;
  }
}

export async function fileStoreFindByStorageKey(
  storageKey: string
): Promise<OwnedAsset | null> {
  const all = await readIndex();
  return (
    all.find(
      (a) =>
        a.storageKey === storageKey ||
        a.metadata?.proxy_storage_key === storageKey
    ) ?? null
  );
}

export async function fileStoreDeleteFile(storageKey: string) {
  try {
    await fs.unlink(assetStoragePath(storageKey));
  } catch {
    /* ignore */
  }
}
