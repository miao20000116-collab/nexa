export type ImagePurpose =
  | "product_scene"
  | "social_cover"
  | "ecommerce_main"
  | "content_illustration";

export type ImageJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked_ai_unavailable";

export interface ImageGenerationJob {
  id: string;
  userId: string | null;
  purpose: ImagePurpose;
  prompt: string;
  /** Prompt actually sent to provider (may include purpose framing). */
  finalPrompt: string;
  referenceAssetIds: string[];
  resultAssetId?: string | null;
  resultUrl?: string | null;
  status: ImageJobStatus;
  /** Internal only — persisted, not exposed to client responses */
  modelInternal?: string | null;
  providerInternal?: string | null;
  latencyMs?: number | null;
  creditsEstimated?: number | null;
  creditsCharged?: number | null;
  errorMessage?: string | null;
  usage?: {
    requestId?: string;
    creditsUsed?: number | null;
    latencyMs?: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/** Safe client payload — no model / provider / key. */
export interface ImageGenerationJobView {
  id: string;
  purpose: ImagePurpose;
  prompt: string;
  referenceAssetIds: string[];
  resultAssetId?: string | null;
  resultUrl?: string | null;
  status: ImageJobStatus;
  latencyMs?: number | null;
  creditsEstimated?: number | null;
  creditsCharged?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateImageInput {
  prompt: string;
  purpose: ImagePurpose;
  referenceAssetIds?: string[];
  size?: string;
  confirm?: boolean;
  jobId?: string;
}
