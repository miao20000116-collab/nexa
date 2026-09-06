import type {
  ContentType,
  CreationPlatform,
  CreationTimelineStep,
  StructuredContent,
  UnifiedContent,
} from "@/modules/create/types";

export const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "social_post", label: "图文帖" },
  { value: "short_video", label: "短视频脚本" },
  { value: "image", label: "图片内容" },
  { value: "copy", label: "帖子 / 文案" },
];

export const PLATFORM_OPTIONS: { value: CreationPlatform; label: string }[] = [
  { value: "xiaohongshu", label: "小红书" },
  { value: "tiktok", label: "TikTok" },
  { value: "douyin", label: "抖音" },
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
];

/** Content types allowed for a platform — keeps platform ↔ type coherent. */
export function contentTypeOptionsForPlatform(
  platform: CreationPlatform | string | null | undefined
): { value: ContentType; label: string }[] {
  switch (platform) {
    case "tiktok":
      return [
        { value: "short_video", label: "短视频脚本" },
        { value: "image", label: "封面 / 图片建议" },
        { value: "copy", label: "文案 / 标题" },
      ];
    case "douyin":
      return [
        { value: "short_video", label: "短视频脚本" },
        { value: "image", label: "封面 / 图片建议" },
        { value: "copy", label: "文案 / 标题" },
      ];
    case "xiaohongshu":
      return [
        { value: "social_post", label: "图文笔记" },
        { value: "short_video", label: "短视频脚本" },
        { value: "image", label: "图片内容" },
        { value: "copy", label: "文案" },
      ];
    case "instagram":
      return [
        { value: "social_post", label: "图文帖" },
        { value: "short_video", label: "Reels 脚本" },
        { value: "image", label: "图片内容" },
        { value: "copy", label: "文案" },
      ];
    case "x":
      return [
        { value: "copy", label: "帖子文案" },
        { value: "image", label: "配图内容" },
      ];
    case "linkedin":
      return [
        { value: "copy", label: "帖子文案" },
        { value: "social_post", label: "长图文" },
      ];
    default:
      return CONTENT_TYPE_OPTIONS;
  }
}

export function defaultContentTypeForPlatform(
  platform: CreationPlatform | string | null | undefined
): ContentType {
  switch (platform) {
    case "tiktok":
    case "douyin":
      return "short_video";
    case "x":
    case "linkedin":
      return "copy";
    case "instagram":
    case "xiaohongshu":
    default:
      return "social_post";
  }
}

export function isContentTypeAllowedOnPlatform(
  contentType: ContentType | string | null | undefined,
  platform: CreationPlatform | string | null | undefined
): boolean {
  if (!contentType) return false;
  return contentTypeOptionsForPlatform(platform).some(
    (o) => o.value === contentType
  );
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  planning: "规划中",
  generating: "生成中",
  editing: "编辑中",
  ready: "已就绪",
  completed: "已完成",
  blocked_ai_unavailable: "AI 服务暂未接入",
  failed: "失败",
};

export const FIELD_ACTIONS = [
  { id: "optimize_title", label: "优化标题", fieldHint: "title" },
  { id: "more_natural", label: "更自然" },
  { id: "more_professional", label: "更专业" },
  { id: "shorten", label: "缩短" },
  { id: "increase_density", label: "增加信息密度" },
  { id: "regenerate_cover", label: "重新生成封面建议", fieldHint: "coverSuggestion" },
] as const;

export function defaultTimeline(): CreationTimelineStep[] {
  return [
    { id: "goal", label: "目标", status: "done" },
    { id: "context", label: "上下文", status: "done" },
    { id: "plan", label: "内容计划", status: "pending" },
    { id: "draft", label: "草稿", status: "pending" },
    { id: "adapt", label: "平台适配", status: "pending" },
    { id: "quality", label: "质量检查", status: "pending" },
    { id: "preview", label: "预览", status: "pending" },
    { id: "publish", label: "发布", status: "pending" },
  ];
}

export function emptyUnifiedContent(): UnifiedContent {
  return {
    title: "",
    hook: "",
    body: "",
    structure: "",
    cta: "",
    hashtags: [],
    coverSuggestion: "",
  };
}

export function emptyContentForPlatform(
  _platform: CreationPlatform,
  _contentType: ContentType
): StructuredContent {
  return emptyUnifiedContent();
}

/** Unified Chinese field labels for all platforms. */
export function fieldLabelsForPlatform(
  platform?: CreationPlatform | string | null,
  contentType?: ContentType | string | null
): { key: string; label: string; multiline?: boolean; array?: boolean }[] {
  const isVideo =
    contentType === "short_video" ||
    platform === "tiktok" ||
    platform === "douyin";

  return [
    { key: "title", label: "标题" },
    { key: "hook", label: "开头钩子" },
    {
      key: "body",
      label: isVideo ? "正文 / 脚本" : "正文",
      multiline: true,
    },
    { key: "structure", label: "结构", multiline: true },
    { key: "cta", label: "行动号召" },
    { key: "hashtags", label: "话题标签", array: true },
    { key: "coverSuggestion", label: "封面建议", multiline: true },
  ];
}

export function resolveFieldForAction(
  action: string,
  activeField?: string | null
): string {
  if (action === "optimize_title") return "title";
  if (action === "regenerate_cover") return "coverSuggestion";
  return activeField || "body";
}
