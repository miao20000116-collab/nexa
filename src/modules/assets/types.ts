export type AssetType = "image" | "video" | "audio" | "document";

export type AssetStatus = "uploaded" | "processing" | "ready" | "failed";

export interface AssetMetadata {
  asset_type?: AssetType;
  subject?: string | null;
  scene?: string | null;
  visual_tags?: string[];
  quality_score?: number | null;
  orientation?: "landscape" | "portrait" | "square" | null;
  has_text?: boolean | null;
  language?: string | null;
  usage_suggestion?: string | null;
  ai_analysis_status?: "pending" | "ready" | "unavailable";
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  proxy_storage_key?: string | null;
  original_storage_key?: string;
}

export interface OwnedAsset {
  id: string;
  userId: string | null;
  assetType: AssetType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  status: AssetStatus;
  url: string | null;
  proxyUrl?: string | null;
  metadata: AssetMetadata | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ASSET_MIME_MAP: Record<AssetType, string[]> = {
  image: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a"],
  document: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
};

export function detectAssetType(mimeType: string, fileName: string): AssetType | null {
  const mime = mimeType.toLowerCase();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  for (const [type, mimes] of Object.entries(ASSET_MIME_MAP) as [AssetType, string[]][]) {
    if (mimes.some((m) => mime.includes(m.split("/")[1]) || mime === m)) return type;
  }

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a"].includes(ext)) return "audio";
  if (["pdf", "docx", "txt"].includes(ext)) return "document";

  return null;
}
