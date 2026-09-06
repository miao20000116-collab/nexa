import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import { getSession } from "@/modules/account/auth/service";
import {
  fileStoreDeleteAsset,
  fileStoreDeleteFile,
  fileStoreGetAsset,
  fileStoreListAssets,
  fileStoreUpsertAsset,
  fileStoreWriteBytes,
} from "@/lib/assets/file-store";
import { processAssetRecord } from "@/modules/assets/asset-processor";
import {
  detectAssetType,
  type AssetStatus,
  type OwnedAsset,
} from "@/modules/assets/types";

function mapDbAsset(row: {
  id: string;
  userId: string | null;
  type: string;
  title: string | null;
  url: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: string;
  metadata: unknown;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}): OwnedAsset {
  const storageKey = row.storageKey ?? row.id;
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as OwnedAsset["metadata"])
      : null;

  return {
    id: row.id,
    userId: row.userId,
    assetType: row.type as OwnedAsset["assetType"],
    fileName: row.title ?? storageKey,
    mimeType: row.mimeType ?? "application/octet-stream",
    sizeBytes: row.sizeBytes ?? 0,
    storageKey,
    status: row.status as AssetStatus,
    url: row.url,
    proxyUrl: meta?.proxy_storage_key
      ? `/api/assets/file/${encodeURIComponent(meta.proxy_storage_key)}`
      : null,
    metadata: meta,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveUserId(): Promise<string | null> {
  const session = await getSession();
  return session.user?.id ?? null;
}

export async function assertAssetAccess(
  asset: OwnedAsset
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!asset.userId) return { ok: true };
  const session = await getSession();
  if (!session.authenticated || session.user?.id !== asset.userId) {
    return { ok: false, status: 403, message: "无权访问该素材" };
  }
  return { ok: true };
}

export async function listOwnedAssets(): Promise<OwnedAsset[]> {
  const userId = await resolveUserId();

  if (await isDatabaseAvailable()) {
    try {
      const rows = await prisma.asset.findMany({
        where: userId ? { userId } : { userId: null },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(mapDbAsset);
    } catch (err) {
      console.error("[listOwnedAssets] prisma failed, fallback", err);
    }
  }

  return fileStoreListAssets(userId);
}

export async function getOwnedAsset(id: string): Promise<OwnedAsset | null> {
  let asset: OwnedAsset | null = null;
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.asset.findUnique({ where: { id } });
      asset = row ? mapDbAsset(row) : null;
    } catch {
      /* fallback */
    }
  }
  if (!asset) {
    asset = await fileStoreGetAsset(id);
  }
  if (!asset) return null;
  const access = await assertAssetAccess(asset);
  if (!access.ok) return null;
  return asset;
}

/** Load by id without ownership check — admin/internal only. Prefer getOwnedAsset. */
export async function getAssetByIdUnchecked(
  id: string
): Promise<OwnedAsset | null> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.asset.findUnique({ where: { id } });
      return row ? mapDbAsset(row) : null;
    } catch {
      /* fallback */
    }
  }
  return fileStoreGetAsset(id);
}

async function persistAsset(asset: OwnedAsset): Promise<OwnedAsset> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.asset.upsert({
        where: { id: asset.id },
        create: {
          id: asset.id,
          userId: asset.userId,
          type: asset.assetType,
          title: asset.fileName,
          url: asset.url,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          status: asset.status,
          metadata: (asset.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          width: asset.metadata?.width ?? null,
          height: asset.metadata?.height ?? null,
          durationMs: asset.metadata?.duration_ms ?? null,
        },
        update: {
          title: asset.fileName,
          url: asset.url,
          storageKey: asset.storageKey,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          status: asset.status,
          metadata: (asset.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          width: asset.metadata?.width ?? null,
          height: asset.metadata?.height ?? null,
          durationMs: asset.metadata?.duration_ms ?? null,
          updatedAt: new Date(),
        },
      });
      return mapDbAsset(row);
    } catch (err) {
      console.error("[persistAsset] prisma failed, fallback", err);
    }
  }
  return fileStoreUpsertAsset(asset);
}

export async function uploadOwnedAsset(
  file: File
): Promise<{ asset: OwnedAsset } | { error: string; status: number }> {
  // Guests may upload; assets are scoped to null userId until login.
  const userId = await resolveUserId();

  const assetType = detectAssetType(file.type, file.name);
  if (!assetType) {
    return { error: "不支持的文件格式", status: 400 };
  }

  const maxBytes = assetType === "video" ? 200 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { error: "文件过大", status: 400 };
  }

  const id = randomUUID();
  const ext = file.name.split(".").pop() ?? "bin";
  const storageKey = `${id}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fileStoreWriteBytes(storageKey, bytes);

  const now = new Date().toISOString();
  let asset: OwnedAsset = {
    id,
    userId,
    assetType,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    storageKey,
    status: "uploaded",
    url: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };

  asset = await persistAsset(asset);

  asset = { ...asset, status: "processing", updatedAt: new Date().toISOString() };
  asset = await persistAsset(asset);

  try {
    asset = await processAssetRecord(asset);
  } catch (err) {
    console.error("[uploadOwnedAsset] processing failed", err);
    asset = {
      ...asset,
      status: "failed",
      errorMessage: "处理失败，请重试",
      updatedAt: new Date().toISOString(),
    };
  }

  asset = await persistAsset(asset);
  return { asset };
}

export async function retryOwnedAsset(
  id: string
): Promise<{ asset: OwnedAsset } | { error: string; status: number }> {
  const asset = await getOwnedAsset(id);
  if (!asset) return { error: "素材不存在", status: 404 };

  const access = await assertAssetAccess(asset);
  if (!access.ok) return { error: access.message, status: access.status };

  if (asset.status !== "failed") {
    return { error: "仅失败素材可重试", status: 400 };
  }

  let next: OwnedAsset = {
    ...asset,
    status: "processing",
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
  next = await persistAsset(next);

  try {
    next = await processAssetRecord(next);
  } catch {
    next = {
      ...next,
      status: "failed",
      errorMessage: "处理失败，请重试",
      updatedAt: new Date().toISOString(),
    };
  }

  next = await persistAsset(next);
  return { asset: next };
}

export async function deleteOwnedAsset(
  id: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const asset = await getOwnedAsset(id);
  if (!asset) return { error: "素材不存在", status: 404 };

  const access = await assertAssetAccess(asset);
  if (!access.ok) return { error: access.message, status: access.status };

  if (await isDatabaseAvailable()) {
    try {
      await prisma.asset.delete({ where: { id } });
    } catch {
      /* fallback */
    }
  } else {
    await fileStoreDeleteAsset(id);
  }

  await fileStoreDeleteFile(asset.storageKey);
  if (asset.metadata?.proxy_storage_key) {
    await fileStoreDeleteFile(asset.metadata.proxy_storage_key);
  }

  return { ok: true };
}

/** Persist a generated image into the user's Assets Library. */
export async function createGeneratedImageAsset(input: {
  userId: string | null;
  bytes: Buffer;
  fileName: string;
  mimeType?: string;
  metadata?: OwnedAsset["metadata"];
  sourceUrl?: string | null;
}): Promise<OwnedAsset> {
  const id = randomUUID();
  const mime = input.mimeType || "image/png";
  const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
  const storageKey = `${id}.${ext}`;
  await fileStoreWriteBytes(storageKey, input.bytes);

  const now = new Date().toISOString();
  let asset: OwnedAsset = {
    id,
    userId: input.userId,
    assetType: "image",
    fileName: input.fileName,
    mimeType: mime,
    sizeBytes: input.bytes.length,
    storageKey,
    status: "ready",
    url: `/api/assets/file/${encodeURIComponent(storageKey)}`,
    metadata: {
      ...(input.metadata ?? {}),
      asset_type: "image",
      original_storage_key: storageKey,
      ai_analysis_status: "unavailable",
      usage_suggestion:
        input.metadata?.usage_suggestion ?? "AI 生成图片",
    },
    createdAt: now,
    updatedAt: now,
  };

  asset = await persistAsset(asset);
  return asset;
}

/** Register local bytes as an owned image/video (e.g. import from workspace render). */
export async function createOwnedMediaAsset(input: {
  userId?: string | null;
  bytes: Buffer;
  fileName: string;
  assetType: "image" | "video";
  mimeType?: string;
  usageSuggestion?: string;
}): Promise<OwnedAsset> {
  const id = randomUUID();
  const mime =
    input.mimeType ||
    (input.assetType === "video" ? "video/mp4" : "image/png");
  const ext =
    input.assetType === "video"
      ? "mp4"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("webp")
          ? "webp"
          : "png";
  const storageKey = `${id}.${ext}`;
  await fileStoreWriteBytes(storageKey, input.bytes);
  const now = new Date().toISOString();
  let asset: OwnedAsset = {
    id,
    userId: input.userId ?? (await resolveUserId()),
    assetType: input.assetType,
    fileName: input.fileName,
    mimeType: mime,
    sizeBytes: input.bytes.length,
    storageKey,
    status: "ready",
    url: `/api/assets/file/${encodeURIComponent(storageKey)}`,
    metadata: {
      asset_type: input.assetType,
      original_storage_key: storageKey,
      ai_analysis_status: "unavailable",
      usage_suggestion: input.usageSuggestion ?? "工作区导入素材",
    },
    createdAt: now,
    updatedAt: now,
  };
  asset = await persistAsset(asset);
  return asset;
}
