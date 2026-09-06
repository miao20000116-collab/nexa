import type {
  ResearchReportType,
  ResearchScope,
  ResearchTimeRange,
} from "@/modules/workspace/types";

export const RESEARCH_SCOPE_OPTIONS: {
  value: ResearchScope;
  label: string;
}[] = [
  { value: "workspace", label: "当前工作区" },
  { value: "web", label: "全网" },
  { value: "news", label: "新闻" },
  { value: "social", label: "社媒" },
  { value: "video", label: "视频" },
];

export const RESEARCH_TIME_OPTIONS: {
  value: ResearchTimeRange;
  label: string;
}[] = [
  { value: "all", label: "不限" },
  { value: "day", label: "24小时" },
  { value: "week", label: "7天" },
  { value: "month", label: "30天" },
  { value: "quarter", label: "90天" },
  { value: "year", label: "1年" },
  { value: "custom", label: "自定义" },
];

export const RESEARCH_REPORT_OPTIONS: {
  value: ResearchReportType;
  label: string;
}[] = [
  { value: "quick", label: "快速总结" },
  { value: "full", label: "完整研究报告" },
  { value: "compare", label: "对比分析" },
  { value: "trend", label: "趋势分析" },
];

export const RESEARCH_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  ready: "就绪",
  blocked_ai_unavailable: "AI 服务暂未接入",
  queued: "排队",
  running: "处理中",
  generating: "生成中",
  completed: "已完成",
  failed: "失败",
};
