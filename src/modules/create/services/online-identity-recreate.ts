/**
 * Online identity recreate — product path (NO platform media download).
 *
 * link → social-ingest metadata/structure
 *      + user face asset
 *      → Jimeng / generateVideo (I2V) or generateImage
 *      → local render preview
 *
 * Works for any supported social link the ingest parser accepts.
 */

import { promises as fs } from "fs";
import path from "path";
import { assetStoragePath } from "@/lib/assets/file-store";
import { getOwnedAsset } from "@/modules/assets/asset-service";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import {
  PLATFORM_MEDIA_POLICY_NOTICE,
} from "@/modules/create/lib/platform-media-policy";
import {
  pickRecreateDisplayTitle,
  RECREATE_COPYRIGHT_NOTICE,
} from "@/modules/create/lib/recreate-copyright";
import {
  ingestSocialLink,
  type SocialIngestResult,
} from "@/modules/create/services/social-recreate";
import { persistRenderToWorkspace } from "@/modules/create/services/persist-render-to-workspace";

async function attachToWorkspace(opts: {
  workspaceId?: string | null;
  jobId: string;
  title: string;
  mediaUrl: string;
  kind: "video" | "image";
  ingest: SocialIngestResult;
  promptUsed: string;
}): Promise<{
  workspaceId: string;
  workspaceName: string;
  workspaceItemId: string;
  workspaceHref: string;
  messageSuffix: string;
} | null> {
  try {
    const saved = await persistRenderToWorkspace({
      workspaceId: opts.workspaceId,
      jobId: opts.jobId,
      title: opts.title,
      mediaUrl: opts.mediaUrl,
      kind: opts.kind,
      platform: opts.ingest.platform,
      sourceUrl: opts.ingest.url,
      promptUsed: opts.promptUsed,
    });
    return {
      workspaceId: saved.workspaceId,
      workspaceName: saved.workspaceName,
      workspaceItemId: saved.item.id,
      workspaceHref: `/workspace/${saved.workspaceId}`,
      messageSuffix: `已存入工作区「${saved.workspaceName}」，可随时打开查看。`,
    };
  } catch (err) {
    console.error("[online-identity-recreate] workspace persist failed", err);
    return null;
  }
}

export type OnlineIdentityRecreateInput = {
  urlOrText: string;
  /** Owned image asset id (user face / character) */
  faceAssetId: string;
  /** video | image */
  outputKind?: "video" | "image";
  durationSec?: number;
  aspectRatio?: string;
  /** Save output into this workspace; otherwise auto 「创作成片」 */
  workspaceId?: string | null;
};

export type OnlineIdentityRecreateResult = {
  ok: true;
  mode: "online_identity_no_platform_download";
  policyNotice: string;
  copyrightNotice: string;
  ingest: SocialIngestResult;
  displayTitle: string;
  jobId: string;
  previewUrl: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  promptUsed: string;
  message: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceItemId?: string | null;
  workspaceHref?: string | null;
};

function buildMotionPrompt(ingest: SocialIngestResult): string {
  const title = pickRecreateDisplayTitle({
    title: ingest.title,
    topics: ingest.topics,
    awemeId: ingest.awemeId,
    structureHints: ingest.structureHints,
  });
  const topics = ingest.topics.slice(0, 4).map((t) => `#${t}`).join(" ");
  const structure = ingest.structureHints.slice(0, 4).join("；");
  const parts = [
    "竖屏短视频，电影感，人物为主角，动作自然流畅。",
    `参考主题（只学结构与氛围，不复制原片）：${title}`,
    topics ? `话题方向：${topics}` : "",
    structure ? `结构线索：${structure}` : "",
    ingest.briefSnippet
      ? `参考摘要：${ingest.briefSnippet.slice(0, 280)}`
      : "",
    "保持上传形象的面部身份一致，服装与场景按主题重新创作，高清。",
  ].filter(Boolean);
  return parts.join("\n");
}

async function loadFaceBase64(faceAssetId: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  const asset = await getOwnedAsset(faceAssetId);
  if (!asset?.storageKey) {
    throw new Error("找不到形象素材，请先上传照片");
  }
  if (asset.assetType === "video" || asset.assetType === "audio") {
    throw new Error("形象素材必须是图片");
  }
  const filePath = assetStoragePath(asset.storageKey);
  const buf = await fs.readFile(filePath);
  if (buf.length < 100) throw new Error("形象图片无效");
  return {
    base64: buf.toString("base64"),
    mimeType: asset.mimeType || "image/png",
  };
}

async function saveRenderMp4(
  jobId: string,
  bytes: Buffer
): Promise<string> {
  const dir = path.join(process.cwd(), ".nexa-data", "renders", jobId);
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, "export.mp4");
  await fs.writeFile(out, bytes);
  return `/api/video/render/file/${jobId}`;
}

export async function runOnlineIdentityRecreate(
  input: OnlineIdentityRecreateInput
): Promise<OnlineIdentityRecreateResult> {
  bootstrapAIProviders();

  const ingest = await ingestSocialLink({
    urlOrText: input.urlOrText,
    mediaAssetCount: 1,
  });

  if (!ingest.platform) {
    throw new Error("无法识别链接平台");
  }

  const face = await loadFaceBase64(input.faceAssetId);
  const prompt = buildMotionPrompt(ingest);
  const displayTitle = pickRecreateDisplayTitle({
    title: ingest.title,
    topics: ingest.topics,
    awemeId: ingest.awemeId,
    structureHints: ingest.structureHints,
  });
  const contentKey =
    ingest.awemeId ||
    Buffer.from(ingest.url).toString("base64url").slice(0, 16);
  const jobId = `idrec_${contentKey}_${Date.now().toString(36)}`;
  const kind = input.outputKind || "video";

  if (kind === "image") {
    if (!AIGateway.isAvailable("generateImage")) {
      throw new Error("图片生成未开启");
    }
    const img = await AIGateway.generateImage({
      prompt: [
        "同款结构二创封面 / 单帧：保留上传人物面部身份。",
        prompt,
      ].join("\n"),
      mode: "generate",
      size: "1024x1024",
      referenceImageBytes: Buffer.from(face.base64, "base64"),
      referenceMimeType: face.mimeType,
    });
    const imageUrl = img.url || null;
    const ws =
      imageUrl
        ? await attachToWorkspace({
            workspaceId: input.workspaceId,
            jobId,
            title: displayTitle,
            mediaUrl: imageUrl,
            kind: "image",
            ingest,
            promptUsed: prompt,
          })
        : null;
    return {
      ok: true,
      mode: "online_identity_no_platform_download",
      policyNotice: PLATFORM_MEDIA_POLICY_NOTICE,
      copyrightNotice: RECREATE_COPYRIGHT_NOTICE,
      ingest,
      displayTitle,
      jobId,
      previewUrl: imageUrl,
      imageUrl,
      promptUsed: prompt,
      message: [
        "已按链接结构 + 你的形象生成图片（未下载平台原片）。",
        ws?.messageSuffix,
      ]
        .filter(Boolean)
        .join(" "),
      workspaceId: ws?.workspaceId ?? null,
      workspaceName: ws?.workspaceName ?? null,
      workspaceItemId: ws?.workspaceItemId ?? null,
      workspaceHref: ws?.workspaceHref ?? null,
    };
  }

  if (!AIGateway.isAvailable("generateVideo")) {
    throw new Error(
      "视频生成未开启：请配置即梦 JIMENG_* 并设置 NEXA_VIDEO_ENABLED=1"
    );
  }

  const generated = await AIGateway.generateVideo({
    prompt,
    durationSec: Math.min(Math.max(input.durationSec ?? 5, 3), 10),
    imageBase64: face.base64,
    aspectRatio: input.aspectRatio || "9:16",
  });

  let previewUrl: string | null = null;
  let videoUrl = generated.url || null;

  if (generated.url?.startsWith("http")) {
    const res = await fetch(generated.url);
    if (!res.ok) throw new Error(`下载成片失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    previewUrl = await saveRenderMp4(jobId, buf);
    videoUrl = previewUrl;
  } else if (generated.storageKey) {
    const p = path.join(
      process.cwd(),
      ".nexa-data",
      "generated",
      generated.storageKey
    );
    const buf = await fs.readFile(p);
    previewUrl = await saveRenderMp4(jobId, buf);
    videoUrl = previewUrl;
  }

  if (!previewUrl && !videoUrl) {
    throw new Error("视频生成未返回可用地址");
  }

  const mediaUrl = previewUrl || videoUrl!;
  const ws = await attachToWorkspace({
    workspaceId: input.workspaceId,
    jobId,
    title: displayTitle,
    mediaUrl,
    kind: "video",
    ingest,
    promptUsed: prompt,
  });

  return {
    ok: true,
    mode: "online_identity_no_platform_download",
    policyNotice: PLATFORM_MEDIA_POLICY_NOTICE,
    copyrightNotice: RECREATE_COPYRIGHT_NOTICE,
    ingest,
    displayTitle,
    jobId,
    previewUrl,
    videoUrl,
    promptUsed: prompt,
    message: [
      "已按链接结构 + 你的形象在线生成成片（未下载、未缓存平台原片）。多条链接各自独立生成即可。",
      ws?.messageSuffix,
    ]
      .filter(Boolean)
      .join(" "),
    workspaceId: ws?.workspaceId ?? null,
    workspaceName: ws?.workspaceName ?? null,
    workspaceItemId: ws?.workspaceItemId ?? null,
    workspaceHref: ws?.workspaceHref ?? null,
  };
}
