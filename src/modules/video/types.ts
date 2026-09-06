/** V1 P5 — Video timeline, storyboard, material strategy, music */

export type AspectRatio = "9:16" | "1:1" | "16:9";

export type MaterialStrategyMode =
  | "prefer_owned"
  | "balanced"
  | "more_ai";

export type SceneSourceType =
  | "owned_video"
  | "owned_image"
  | "image_animation"
  | "ai_video"
  | "text"
  | "music"
  | "voice";

export type VideoJobStatus =
  | "queued"
  | "planning"
  | "generating"
  | "rendering"
  | "quality_check"
  | "completed"
  | "failed"
  | "blocked_ai_unavailable"
  | "draft";

export type MusicSourceKind =
  | "user_upload"
  | "licensed_library"
  | "ai_generated";

export interface MaterialCoverage {
  targetDurationSec: number;
  /** Owned video + image animation usable coverage */
  existingCoverageSec: number;
  ownedVideoSec: number;
  imageAnimationSec: number;
  /** AI gap only — never regenerate covered seconds */
  aiRequiredCoverageSec: number;
  aiVideoNeededSec: number;
  mode: MaterialStrategyMode;
  summary: string;
}

export interface StoryboardShot {
  id: string;
  order: number;
  durationSec: number;
  /** 画面 */
  description: string;
  sourceType: SceneSourceType;
  assetId?: string | null;
  subtitle?: string;
  /** 旁白 */
  narration?: string;
  notes?: string;
}

export interface Storyboard {
  script: string;
  shots: StoryboardShot[];
  musicStrategy: string;
  subtitleStyle?: string;
  narrationNotes?: string;
  updatedAt: string;
}

export interface TimelineScene {
  id: string;
  track:
    | "video"
    | "image"
    | "text"
    | "music"
    | "voice"
    | "effect";
  start: number;
  end: number;
  assetId?: string | null;
  sourceType: SceneSourceType;
  text?: string;
  animation?: string;
  transition?: string;
  cutOnBeat?: boolean;
  prompt?: string;
}

export interface VideoTrack {
  id: string;
  scenes: TimelineScene[];
}

export interface ImageTrack {
  id: string;
  scenes: TimelineScene[];
}

export interface TextTrack {
  id: string;
  scenes: TimelineScene[];
}

export interface MusicTrack {
  id: string;
  sourceKind: MusicSourceKind;
  assetId?: string | null;
  url?: string | null;
  title?: string;
  license?: {
    commercialUse: boolean;
    attributionRequired?: boolean;
    note?: string;
  } | null;
  bpm?: number | null;
  beats?: number[];
  sections?: Array<{ name: string; start: number; end: number }>;
  scenes: TimelineScene[];
}

export interface VoiceTrack {
  id: string;
  scenes: TimelineScene[];
}

export interface EffectTrack {
  id: string;
  scenes: TimelineScene[];
}

export interface TimelineDocument {
  version: 1;
  aspectRatio: AspectRatio;
  durationSec: number;
  videoTrack: VideoTrack;
  imageTrack: ImageTrack;
  textTrack: TextTrack;
  musicTrack: MusicTrack;
  voiceTrack: VoiceTrack;
  effectTrack: EffectTrack;
  updatedAt: string;
}

export interface VideoCostEstimate {
  available: boolean;
  estimatedCredits: number | null;
  aiShots: number;
  aiSeconds: number;
  message: string;
  planFingerprint: string;
}

export interface VideoProjectState {
  materialStrategy: MaterialStrategyMode;
  coverage: MaterialCoverage | null;
  storyboard: Storyboard | null;
  timeline: TimelineDocument | null;
  jobStatus: VideoJobStatus;
  jobMessage?: string | null;
  previewUrl?: string | null;
  exportUrl?: string | null;
  playheadSec?: number;
  costEstimate?: VideoCostEstimate | null;
  lastGeneratedFingerprint?: string | null;
}

export const VIDEO_STATUS_LABELS: Record<VideoJobStatus, string> = {
  draft: "草稿",
  queued: "排队中",
  planning: "正在规划视频",
  generating: "正在生成缺失镜头",
  rendering: "正在剪辑",
  quality_check: "正在检查成片",
  completed: "已完成",
  failed: "失败",
  blocked_ai_unavailable: "AI 服务暂未接入",
};

export const MATERIAL_MODE_OPTIONS: {
  value: MaterialStrategyMode;
  label: string;
  description: string;
}[] = [
  {
    value: "more_ai",
    label: "更多 AI 生成",
    description: "默认：每镜独立生成 AI 视频，禁止一张图铺满全片。",
  },
  {
    value: "prefer_owned",
    label: "优先使用我的素材",
    description: "尽量用已有视频与图片，仅补生成缺口。",
  },
  {
    value: "balanced",
    label: "平衡",
    description: "自有素材与 AI 镜头按比例搭配。",
  },
];

export const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: "9:16", label: "9:16 竖屏" },
  { value: "1:1", label: "1:1 方形" },
  { value: "16:9", label: "16:9 横屏" },
];
