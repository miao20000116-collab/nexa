export type CreationStartMode =
  | "idea"
  | "search"
  | "workspace"
  | "assets"
  | "link"
  | "commerce";

export type ContentType =
  | "social_post"
  | "short_video"
  | "image"
  | "copy";

export type CreationPlatform =
  | "xiaohongshu"
  | "x"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "douyin";

export type CreationStatus =
  | "draft"
  | "planning"
  | "generating"
  | "editing"
  | "ready"
  | "completed"
  | "blocked_ai_unavailable"
  | "failed";

export type CreationAssetRole =
  | "reference"
  | "cover"
  | "media"
  | "source";

export interface CreationSourceRef {
  id: string;
  kind:
    | "workspace_source"
    | "search_result"
    | "link"
    | "asset"
    | "commerce"
    | "research_report";
  title?: string;
  url?: string;
  snippet?: string;
  workspaceId?: string;
  assetId?: string;
  /** Deep research job id when kind=research_report */
  researchId?: string;
}

/** Unified creation result — all platforms map to these Chinese fields. */
export interface UnifiedContent {
  title: string;
  hook: string;
  body: string;
  structure: string;
  cta: string;
  hashtags: string[];
  coverSuggestion: string;
  /** @internal advanced prompt override — not shown as content field */
  _promptOverride?: string;
  [key: string]: string | string[] | undefined;
}

export type StructuredContent = UnifiedContent | Record<string, string | string[]>;

export interface CreationTimelineStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "blocked";
}

export interface CreationProjectAsset {
  id: string;
  projectId: string;
  assetId: string;
  role: CreationAssetRole | string;
  sortOrder: number;
  usage?: string | null;
  selected: boolean;
  createdAt: string;
  asset?: {
    id: string;
    type?: string | null;
    title?: string | null;
    url?: string | null;
    mimeType?: string | null;
  } | null;
}

export interface CreationProject {
  id: string;
  userId?: string | null;
  workspaceId?: string | null;
  /** Linked deep research job when created from a report — mirrored in sources */
  researchId?: string | null;
  title: string;
  goal?: string | null;
  contentType?: ContentType | string | null;
  platform?: CreationPlatform | string | null;
  status: CreationStatus | string;
  brief?: string | null;
  timeline?: CreationTimelineStep[] | null;
  content?: StructuredContent | null;
  sources?: CreationSourceRef[] | null;
  startMode?: CreationStartMode | string | null;
  /** Advanced: editable system prompt override */
  promptOverride?: string | null;
  createdAt: string;
  updatedAt: string;
  assets: CreationProjectAsset[];
}

export interface CreateProjectInput {
  goal: string;
  contentType: ContentType;
  platform: CreationPlatform;
  startMode: CreationStartMode;
  title?: string;
  brief?: string;
  workspaceId?: string;
  researchId?: string;
  linkUrl?: string;
  sources?: CreationSourceRef[];
  assetIds?: string[];
  promptOverride?: string;
  commerceContext?: string;
  /** Structured parse → storyboard handoff (social recreate). */
  referenceStoryboard?: import("@/modules/create/services/reference-storyboard-package").ReferenceStoryboardPackage;
  /** Pre-fill unified content fields (e.g. workspace extract → 口播/分镜). */
  seedContent?: Partial<UnifiedContent> & Record<string, unknown>;
}

export type FieldEditAction =
  | "optimize_title"
  | "more_natural"
  | "more_professional"
  | "shorten"
  | "increase_density"
  | "regenerate_cover";
