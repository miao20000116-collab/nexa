export type WorkspaceStatus = "active" | "archived";

export type DeepResearchStatus =
  | "draft"
  | "ready"
  | "blocked_ai_unavailable"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ResearchScope = "workspace" | "web" | "news" | "social" | "video";
export type ResearchTimeRange =
  | "all"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom";
export type ResearchReportType =
  | "quick"
  | "full"
  | "compare"
  | "trend";

export type SourceIngestStatus =
  | "pending"
  | "ready"
  | "failed"
  | "skipped_binary"
  | "skipped_thin";

/**
 * A source can support factual claims, visual direction, or both. This is
 * stored on its Context item so it works with the existing DB schema too.
 */
export type ContextSourceRole =
  | "fact"
  | "visual_reference"
  | "image_reference";

export interface SourceSnapshot {
  searchResultId?: string;
  title?: string;
  url: string;
  platform: string;
  sourceType: string;
  snippet?: string;
  author?: string;
  publishedAt?: string;
  thumbnail?: string;
  /** Compressed page digest for AI (prefer over snippet). */
  contentSummary?: string;
  keyExcerpts?: string[];
  mediaSummary?: string;
  ingestStatus?: SourceIngestStatus;
  ingestedAt?: string;
  contextRole?: ContextSourceRole;
}

export interface WorkspaceSource {
  id: string;
  workspaceId: string;
  searchResultId?: string | null;
  title?: string | null;
  url: string;
  platform: string;
  sourceType: string;
  snippet?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  thumbnail?: string | null;
  addedAt: string;
  contentSummary?: string | null;
  keyExcerpts?: string[] | null;
  mediaSummary?: string | null;
  ingestStatus?: SourceIngestStatus | null;
  ingestedAt?: string | null;
  /** Truncated extract for optional re-RAG; not dumped wholesale into prompts. */
  extractedText?: string | null;
  contextRole?: ContextSourceRole | null;
}

/** V3.0 — first-class context item kinds (not just URL bookmarks). */
export type ContextItemKind =
  | "search_result"
  | "research_report"
  | "image"
  | "video"
  | "pdf"
  | "docx"
  | "txt"
  | "user_upload"
  | "creation_draft"
  | "commerce_diagnosis";

export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  title: string;
  summary?: string | null;
  /** Linked entity: assetId / researchJobId / creationId / sourceId */
  refId?: string | null;
  url?: string | null;
  /** When false, AI must not use this item. */
  includedInContext: boolean;
  sortOrder: number;
  payload?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContextVersion {
  id: string;
  label: string;
  kind: "research" | "creation" | "context_snapshot";
  refId?: string | null;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

/**
 * Unified AI-readable Workspace Context (V3.0).
 * Derived from Workspace; AI capabilities must read selected items only.
 */
export interface WorkspaceContext {
  workspaceId: string;
  userId: string | null;
  items: ContextItem[];
  sources: WorkspaceSource[];
  assets: ContextItem[];
  research: ContextItem[];
  commerce: ContextItem[];
  drafts: ContextItem[];
  createdAt: string;
  updatedAt: string;
  /** Human-readable: "本次生成参考了 N 个来源和 M 个素材。" */
  explainability?: {
    sourceCount: number;
    assetCount: number;
    researchCount: number;
    commerceCount: number;
    draftCount: number;
    summary: string;
  };
}

export interface Workspace {
  id: string;
  userId?: string | null;
  name: string;
  description?: string | null;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  sources: WorkspaceSource[];
  /** V3.0 multi-type context items (includes mirrored search sources). */
  items?: ContextItem[];
  /** Lightweight version history for Research / Creation. */
  versions?: ContextVersion[];
}

export interface DeepResearchJob {
  id: string;
  workspaceId: string;
  goal: string;
  scope: ResearchScope;
  timeRange: string;
  reportType: ResearchReportType;
  status: DeepResearchStatus;
  errorCode?: string | null;
  report?: Record<string, unknown> | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

/** V3.2 Research Plan dimensions */
export type ResearchPlanDimension =
  | "market"
  | "user"
  | "competitor"
  | "tech"
  | "business"
  | "trend"
  | "risk";

export interface ResearchPlanItem {
  dimension: ResearchPlanDimension;
  label: string;
  question: string;
  status?: "pending" | "done" | "skipped";
}

export interface ResearchPlan {
  goal: string;
  dimensions: ResearchPlanItem[];
  createdAt: string;
}

export interface ResearchEvidenceItem {
  text: string;
  sourceIds: string[];
  /** ISO timestamp when evidence was collected / cited */
  timestamp?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

/** User-facing contradiction (no scoring algorithm exposed). */
export interface ResearchContradiction {
  topic: string;
  summary: string;
  sides: Array<{
    claim: string;
    sourceIds: string[];
    evidence?: string;
  }>;
}

export type ResearchActionKind = "search" | "create" | "workspace";

export interface ResearchActionLink {
  label: string;
  kind: ResearchActionKind;
  href: string;
  opportunity?: string;
}

/**
 * Internal-only source quality — never show algorithm details to users.
 * Persisted for ranking / filtering; stripped from public UI copy.
 */
export interface ResearchSourceQuality {
  sourceId: string;
  authority: number;
  freshness: number;
  relevance: number;
}

export interface ResearchReport {
  title: string;
  executiveSummary?: string;
  keyFindings: string[];
  evidence: ResearchEvidenceItem[];
  disagreements: string[];
  /** V3.2 structured contradictions with respective evidence */
  contradictions?: ResearchContradiction[];
  trends: string[];
  risks: string[];
  opportunities: string[];
  sources: { id: string; title: string; url: string }[];
  /** V3.2 Research Plan */
  plan?: ResearchPlan;
  /** V3.2 Research → Action */
  actions?: ResearchActionLink[];
  generatedAt?: string;
  /** @internal never render in UI */
  _sourceQuality?: ResearchSourceQuality[];
}

export type AICapabilityStatus =
  | "available"
  | "not_configured"
  | "unavailable";

export interface AICapabilityInfo {
  research: AICapabilityStatus;
  summarization: AICapabilityStatus;
  comparison: AICapabilityStatus;
  creation: AICapabilityStatus;
  code: "AI_CAPABILITY_AVAILABLE" | "AI_CAPABILITY_NOT_CONFIGURED";
}
