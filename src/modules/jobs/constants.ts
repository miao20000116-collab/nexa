/** Async job status labels — user-facing Chinese */

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "排队",
  running: "处理中",
  generating: "生成中",
  rendering: "渲染中",
  quality_check: "检查中",
  completed: "已完成",
  failed: "失败",
  blocked_ai_unavailable: "AI 服务暂未接入",
  cancelled: "已取消",
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  deep_research: "深入研究",
  summarize: "总结",
  asset_process: "素材处理",
  image_generate: "图片生成",
  video_generate: "视频生成",
  video_compose: "视频合成",
  music_generate: "音乐生成",
  music_analyze: "音乐分析",
  publish: "发布",
  commerce_sync: "跨境同步",
};
