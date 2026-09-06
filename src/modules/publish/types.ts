export type PublishPlatform =
  | "x"
  | "tiktok"
  | "instagram"
  | "youtube"
  | "xiaohongshu"
  | "linkedin"
  | "douyin";

export type PublishStatus =
  | "draft"
  | "ready"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type ConnectionStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "expired"
  | "error";

export interface PlatformCapability {
  platform: PublishPlatform;
  label: string;
  canPublishText: boolean;
  canPublishImage: boolean;
  canPublishVideo: boolean;
  supportsSchedule: boolean;
  supportsDraft: boolean;
  /** Whether Nexa backend has OAuth app credentials configured */
  oauthConfigured: boolean;
  /** Whether official publish API is available to Nexa */
  publishApiAvailable: boolean;
}

export interface PlatformConnection {
  id: string;
  userId?: string | null;
  provider: PublishPlatform | string;
  status: ConnectionStatus | string;
  displayName?: string | null;
  externalId?: string | null;
  scopes?: string | null;
  connectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishRecordView {
  id: string;
  projectId?: string | null;
  platform: string;
  /** Platform account / external user id */
  accountId?: string | null;
  accountLabel?: string | null;
  connectionId?: string | null;
  status: PublishStatus | string;
  publishedAt?: string | null;
  /** Published content id on platform */
  contentId?: string | null;
  externalPostId?: string | null;
  externalUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  projectTitle?: string | null;
}

export interface AdaptationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface AdaptationResult {
  ok: boolean;
  issues: AdaptationIssue[];
  summary: string;
}

export interface PublishPreview {
  projectId: string;
  platform: PublishPlatform;
  connectionId?: string | null;
  accountLabel?: string | null;
  contentSnapshot: Record<string, unknown>;
  adaptation: AdaptationResult;
  qa: {
    passed: boolean;
    verdict: "PASS" | "NEEDS_REVISION" | "通过" | "需要修改";
    issues: string[];
    /** Structured issues: where / why / how */
    details?: Array<{
      id: string;
      category: string;
      where: string;
      why: string;
      how: string;
      severity: "error" | "warning";
    }>;
    suggestions: string[];
    blockedAi: boolean;
    checks?: Array<{
      id: string;
      label: string;
      ok: boolean;
      detail: string;
    }>;
  };
  canPublish: boolean;
  blockReason?: string | null;
}

export const PUBLISH_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  ready: "待发布",
  publishing: "发布中",
  published: "已发布",
  failed: "失败",
  cancelled: "已取消",
};

export const PLATFORM_LABELS: Record<string, string> = {
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  xiaohongshu: "小红书",
  linkedin: "LinkedIn",
  douyin: "抖音",
};
