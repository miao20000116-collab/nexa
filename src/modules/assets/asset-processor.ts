import { spawn } from "child_process";
import { isFfmpegAvailable } from "@/modules/video/timeline-engine";
import {
  fileStoreReadBytes,
  fileStoreWriteBytes,
} from "@/lib/assets/file-store";
import { readImageDimensions, orientationFromDimensions } from "./image-meta";
import type { AssetMetadata, AssetType, OwnedAsset } from "./types";

export async function processAssetRecord(asset: OwnedAsset): Promise<OwnedAsset> {
  const bytes = await fileStoreReadBytes(asset.storageKey);
  if (!bytes) {
    return {
      ...asset,
      status: "failed",
      errorMessage: "文件不存在或已被删除",
      updatedAt: new Date().toISOString(),
    };
  }

  switch (asset.assetType) {
    case "image":
      return processImage(asset, bytes);
    case "video":
      return processVideo(asset);
    case "audio":
      return processAudio(asset);
    case "document":
      return processDocument(asset);
    default:
      return {
        ...asset,
        status: "failed",
        errorMessage: "不支持的素材类型",
        updatedAt: new Date().toISOString(),
      };
  }
}

function baseMetadata(
  asset: OwnedAsset,
  assetType: AssetType
): AssetMetadata {
  return {
    asset_type: assetType,
    subject: null,
    scene: null,
    visual_tags: [],
    quality_score: null,
    orientation: null,
    has_text: null,
    language: null,
    usage_suggestion: null,
    ai_analysis_status: "pending",
    original_storage_key: asset.storageKey,
  };
}

function processImage(asset: OwnedAsset, bytes: Buffer): OwnedAsset {
  const dims = readImageDimensions(bytes, asset.mimeType);
  const metadata: AssetMetadata = {
    ...baseMetadata(asset, "image"),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    orientation: dims
      ? orientationFromDimensions(dims.width, dims.height)
      : null,
  };

  return {
    ...asset,
    status: "ready",
    url: `/api/assets/file/${encodeURIComponent(asset.storageKey)}`,
    metadata,
    updatedAt: new Date().toISOString(),
  };
}

async function processVideo(asset: OwnedAsset): Promise<OwnedAsset> {
  const metadata: AssetMetadata = {
    ...baseMetadata(asset, "video"),
    original_storage_key: asset.storageKey,
  };

  const originalUrl = `/api/assets/file/${encodeURIComponent(asset.storageKey)}`;
  let proxyStorageKey: string | null = null;
  let proxyUrl: string | null = null;

  const { assetStoragePath } = await import("@/lib/assets/file-store");
  const inputPath = assetStoragePath(asset.storageKey);

  // Probe duration so storyboard can bind owned video (not fall back to black synth)
  const probed = await probeVideoDurationMs(inputPath);
  metadata.duration_ms =
    probed && probed > 0 ? probed : 8000; // default 8s when probe fails

  const ffmpegOk = await isFfmpegAvailable();
  if (ffmpegOk) {
    proxyStorageKey = `${asset.id}_proxy.mp4`;
    const inputBytes = await fileStoreReadBytes(asset.storageKey);
    if (inputBytes) {
      const proxyBytes = await tryGenerateVideoProxy(inputBytes, asset.mimeType);
      if (proxyBytes) {
        await fileStoreWriteBytes(proxyStorageKey, proxyBytes);
        proxyUrl = `/api/assets/file/${encodeURIComponent(proxyStorageKey)}`;
        metadata.proxy_storage_key = proxyStorageKey;
      }
    }
  }

  return {
    ...asset,
    status: "ready",
    url: originalUrl,
    proxyUrl,
    metadata,
    updatedAt: new Date().toISOString(),
  };
}

function probeVideoDurationMs(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const sec = Number.parseFloat(out.trim());
      if (!Number.isFinite(sec) || sec <= 0) {
        resolve(null);
        return;
      }
      resolve(Math.round(sec * 1000));
    });
  });
}

function processAudio(asset: OwnedAsset): OwnedAsset {
  return {
    ...asset,
    status: "ready",
    url: `/api/assets/file/${encodeURIComponent(asset.storageKey)}`,
    metadata: baseMetadata(asset, "audio"),
    updatedAt: new Date().toISOString(),
  };
}

function processDocument(asset: OwnedAsset): OwnedAsset {
  return {
    ...asset,
    status: "ready",
    url: `/api/assets/file/${encodeURIComponent(asset.storageKey)}`,
    metadata: {
      ...baseMetadata(asset, "document"),
      ai_analysis_status: "unavailable",
    },
    updatedAt: new Date().toISOString(),
  };
}

function tryGenerateVideoProxy(
  input: Buffer,
  mimeType: string
): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ext = mimeType.includes("quicktime") ? "mov" : "mp4";
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vf",
      "scale='min(1280,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-an",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      ext === "mov" ? "mp4" : "mp4",
      "pipe:1",
    ];

    const child = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}
