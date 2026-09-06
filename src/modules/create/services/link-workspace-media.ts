/**
 * Pull playable media from a linked Workspace into Creation project.assets
 * so video production can actually cut with those files.
 *
 * Honest rules:
 * - Only import local / owned media we can resolve on disk.
 * - External platform URLs (Douyin etc.) stay as text/reference Context — never fake as assets.
 */

import { promises as fs } from "fs";
import path from "path";
import {
  createOwnedMediaAsset,
  getOwnedAsset,
} from "@/modules/assets/asset-service";
import {
  assetStoragePath,
  fileStoreFindByStorageKey,
} from "@/lib/assets/file-store";
import {
  getProject,
  setProjectAssets,
} from "@/modules/create/services/creation-service";
import type { CreationProject } from "@/modules/create/types";
import { getWorkspace } from "@/modules/workspace/services/workspace-service";
import {
  buildWorkspaceContext,
  ensureWorkspaceItems,
} from "@/modules/workspace/services/context-service";
import type { ContextItem } from "@/modules/workspace/types";

export type WorkspaceMediaImportResult = {
  project: CreationProject;
  imported: number;
  linkedExisting: number;
  skippedExternal: number;
  skippedUnreadable: number;
  messages: string[];
};

function isExternalPlatformUrl(url: string): boolean {
  return /douyin\.com|v\.douyin|xiaohongshu|xhslink|tiktok\.com|youtube\.com|youtu\.be|bilibili\.com/i.test(
    url
  );
}

function mediaKindFromItem(item: ContextItem): "image" | "video" | null {
  if (item.kind === "image") return "image";
  if (item.kind === "video") return "video";
  if (item.kind === "user_upload") {
    const url = item.url || "";
    if (/\.(mp4|webm|mov)($|\?)/i.test(url) || /\/api\/video\//i.test(url)) {
      return "video";
    }
    if (
      /\.(png|jpe?g|webp|gif)($|\?)/i.test(url) ||
      /\/api\/assets\//i.test(url)
    ) {
      return "image";
    }
  }
  return null;
}

function thumbnailFromItem(item: ContextItem): string | null {
  const payload = item.payload as { thumbnail?: string } | null;
  const thumb =
    (typeof payload?.thumbnail === "string" && payload.thumbnail.trim()) ||
    "";
  if (thumb && /^https?:\/\//i.test(thumb)) return thumb;
  if (
    item.kind === "search_result" &&
    item.url &&
    /\.(png|jpe?g|webp|gif)($|\?)/i.test(item.url)
  ) {
    return item.url;
  }
  return null;
}

async function importRemoteImageAsAsset(
  imageUrl: string,
  title: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "NexaWorkspaceMedia/1.0" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype && !ctype.startsWith("image/") && !ctype.includes("octet")) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64 || buf.length > 8_000_000) return null;
    const mime = ctype.startsWith("image/")
      ? ctype.split(";")[0].trim()
      : "image/jpeg";
    const created = await createOwnedMediaAsset({
      bytes: buf,
      fileName: title.slice(0, 80) || "search-thumb.jpg",
      assetType: "image",
      mimeType: mime,
      usageSuggestion: "检索结果缩略图 · 分镜素材",
    });
    return created.id;
  } catch {
    return null;
  }
}

async function tryResolveOwnedAssetId(
  item: ContextItem
): Promise<{ assetId: string | null; external: boolean; unreadable: boolean }> {
  if (item.refId) {
    const owned = await getOwnedAsset(item.refId);
    if (owned && (owned.assetType === "image" || owned.assetType === "video")) {
      return { assetId: owned.id, external: false, unreadable: false };
    }
  }

  const url = (item.url || "").trim();
  if (!url) return { assetId: null, external: false, unreadable: true };

  if (isExternalPlatformUrl(url)) {
    return { assetId: null, external: true, unreadable: false };
  }

  const assetFile = url.match(/\/api\/assets\/file\/([^/?#]+)/i);
  if (assetFile) {
    const key = decodeURIComponent(assetFile[1]);
    const byKey = await fileStoreFindByStorageKey(key);
    if (byKey) return { assetId: byKey.id, external: false, unreadable: false };
    try {
      const bytes = await fs.readFile(assetStoragePath(key));
      if (bytes.length > 32) {
        const kind = mediaKindFromItem(item) || "image";
        const created = await createOwnedMediaAsset({
          bytes,
          fileName: item.title || key,
          assetType: kind,
          mimeType: kind === "video" ? "video/mp4" : "image/png",
          usageSuggestion: "从工作区导入",
        });
        return {
          assetId: created.id,
          external: false,
          unreadable: false,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const render = url.match(/\/api\/video\/render\/file\/([^/?#]+)/i);
  if (render) {
    const renderProjectId = decodeURIComponent(render[1]);
    const filePath = path.join(
      process.cwd(),
      ".nexa-data",
      "renders",
      renderProjectId,
      "export.mp4"
    );
    try {
      const bytes = await fs.readFile(filePath);
      if (bytes.length < 1000) {
        return { assetId: null, external: false, unreadable: true };
      }
      const created = await createOwnedMediaAsset({
        bytes,
        fileName: `${item.title || "workspace"}.mp4`,
        assetType: "video",
        mimeType: "video/mp4",
        usageSuggestion: "工作区成片 · 可剪辑素材",
      });
      return { assetId: created.id, external: false, unreadable: false };
    } catch {
      return { assetId: null, external: false, unreadable: true };
    }
  }

  const aiFile = url.match(/\/api\/ai\/files\/([^/?#]+)/i);
  if (aiFile) {
    const name = decodeURIComponent(aiFile[1]);
    const candidates = [
      path.join(process.cwd(), ".nexa-data", "ai-files", name),
      path.join(process.cwd(), ".nexa-data", "ai", "files", name),
      assetStoragePath(name),
    ];
    for (const p of candidates) {
      try {
        const bytes = await fs.readFile(/* turbopackIgnore: true */ p);
        if (bytes.length < 32) continue;
        const kind =
          mediaKindFromItem(item) ||
          (/\.(mp4|webm)$/i.test(name) ? "video" : "image");
        const created = await createOwnedMediaAsset({
          bytes,
          fileName: item.title || name,
          assetType: kind,
          mimeType: kind === "video" ? "video/mp4" : "image/png",
          usageSuggestion: "从工作区 AI 产物导入",
        });
        return {
          assetId: created.id,
          external: false,
          unreadable: false,
        };
      } catch {
        /* try next */
      }
    }
    return { assetId: null, external: false, unreadable: true };
  }

  if (url.startsWith("/") && !url.startsWith("//")) {
    return { assetId: null, external: false, unreadable: true };
  }

  return { assetId: null, external: true, unreadable: false };
}

/**
 * Import workspace image/video Context items into project.assets (merge).
 */
export async function linkWorkspaceMediaToProject(
  projectId: string
): Promise<WorkspaceMediaImportResult | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const workspaceId =
    project.workspaceId ||
    project.sources?.find((s) => s.workspaceId)?.workspaceId ||
    null;

  if (!workspaceId) {
    return {
      project,
      imported: 0,
      linkedExisting: 0,
      skippedExternal: 0,
      skippedUnreadable: 0,
      messages: ["当前创作未关联工作区，无法导入画面素材。"],
    };
  }

  const ws = await getWorkspace(workspaceId);
  if (!ws) {
    return {
      project,
      imported: 0,
      linkedExisting: 0,
      skippedExternal: 0,
      skippedUnreadable: 0,
      messages: ["关联的工作区不存在或已删除。"],
    };
  }

  const items = ensureWorkspaceItems(ws).filter((i) => i.includedInContext);
  const mediaItems = items.filter((i) => mediaKindFromItem(i) != null);

  const ctx = buildWorkspaceContext(ws);
  for (const s of ctx.sources) {
    const url = s.url || "";
    if (!url || isExternalPlatformUrl(url)) continue;
    if (
      /\/api\/(video|assets|ai)\//i.test(url) ||
      /\.(mp4|webm|png|jpe?g|webp)($|\?)/i.test(url)
    ) {
      const fake: ContextItem = {
        id: `src_media_${s.id}`,
        kind: /\.(mp4|webm)|\/api\/video\//i.test(url) ? "video" : "image",
        title: s.title || s.url,
        summary: s.snippet ?? null,
        refId: null,
        url,
        includedInContext: true,
        sortOrder: 999,
        payload: null,
        createdAt: s.addedAt,
        updatedAt: s.addedAt,
      };
      if (!mediaItems.some((m) => m.url === url)) mediaItems.push(fake);
    }
  }

  const existing = new Set(project.assets.map((a) => a.assetId));
  const nextIds = [...existing];
  let imported = 0;
  let linkedExisting = 0;
  let skippedExternal = 0;
  let skippedUnreadable = 0;
  const messages: string[] = [];

  for (const item of mediaItems.slice(0, 24)) {
    const resolved = await tryResolveOwnedAssetId(item);
    if (resolved.external) {
      skippedExternal += 1;
      continue;
    }
    if (!resolved.assetId) {
      skippedUnreadable += 1;
      continue;
    }
    if (existing.has(resolved.assetId)) {
      linkedExisting += 1;
      continue;
    }
    existing.add(resolved.assetId);
    nextIds.push(resolved.assetId);
    imported += 1;
  }

  // Search-result thumbnails → local image assets for storyboard binding
  let thumbsImported = 0;
  for (const item of items.slice(0, 40)) {
    if (nextIds.length >= 36) break;
    const thumb = thumbnailFromItem(item);
    if (!thumb) continue;
    if (isExternalPlatformUrl(thumb) && !/^https?:\/\/.*\.(cdn|img)/i.test(thumb)) {
      // still allow http(s) image CDNs; block only known video platforms
    }
    if (/douyin|xiaohongshu|tiktok|bilibili|youtube/i.test(thumb)) continue;
    const assetId = await importRemoteImageAsAsset(
      thumb,
      item.title || "检索缩略图"
    );
    if (!assetId) continue;
    if (existing.has(assetId)) {
      linkedExisting += 1;
      continue;
    }
    existing.add(assetId);
    nextIds.push(assetId);
    imported += 1;
    thumbsImported += 1;
  }

  // Also pull thumbnails from workspace sources
  for (const s of ctx.sources.slice(0, 24)) {
    if (nextIds.length >= 36) break;
    const thumb = (s.thumbnail || "").trim();
    if (!thumb || !/^https?:\/\//i.test(thumb)) continue;
    if (/douyin|xiaohongshu|tiktok|bilibili|youtube/i.test(thumb)) continue;
    const assetId = await importRemoteImageAsAsset(
      thumb,
      s.title || "来源缩略图"
    );
    if (!assetId || existing.has(assetId)) continue;
    existing.add(assetId);
    nextIds.push(assetId);
    imported += 1;
    thumbsImported += 1;
  }

  let updated = project;
  if (imported > 0) {
    const after = await setProjectAssets(projectId, nextIds);
    if (after) updated = after;
  }

  if (imported > 0) {
    messages.push(
      thumbsImported > 0
        ? `已从工作区导入 ${imported} 个可剪辑素材（含 ${thumbsImported} 张检索缩略图，可用于分镜）。`
        : `已从工作区导入 ${imported} 个可剪辑素材（图片 / 视频）。`
    );
  } else if (mediaItems.length === 0 && thumbsImported === 0) {
    messages.push(
      "工作区暂无可下载的图片/视频。外链视频不会自动下载；可上传自有素材，或对检索结果配有缩略图的条目再试。"
    );
  } else if (skippedExternal > 0 && imported === 0) {
    messages.push(
      `工作区有 ${skippedExternal} 个外链视频（如抖音 / 小红书），按产品规则不会下载平台原片；请上传自有素材或使用已生成的本地成片。`
    );
  } else if (skippedUnreadable > 0 && imported === 0) {
    messages.push(
      "工作区媒体无法读取到本地文件（可能成片已清理）。请重新导出或上传素材。"
    );
  } else if (linkedExisting > 0) {
    messages.push("工作区素材已在本项目中，无需重复导入。");
  }

  return {
    project: updated,
    imported,
    linkedExisting,
    skippedExternal,
    skippedUnreadable,
    messages,
  };
}
