/**
 * V3.2 — Intelligent Research types
 */

export type ResearchDimensionKey =
  | "market"
  | "user"
  | "competitor"
  | "tech"
  | "business"
  | "trend"
  | "risk";

export const RESEARCH_DIMENSION_LABELS: Record<ResearchDimensionKey, string> = {
  market: "市场",
  user: "用户",
  competitor: "竞品",
  tech: "技术",
  business: "商业模式",
  trend: "趋势",
  risk: "风险",
};

export interface ResearchPlanDimension {
  key: ResearchDimensionKey;
  label: string;
  queries: string[];
}

export interface ResearchPlan {
  id: string;
  goal: string;
  workspaceId?: string | null;
  jobId?: string | null;
  dimensions: ResearchPlanDimension[];
  createdAt: string;
}

/** User-facing evidence — always has source + timestamp */
export interface IntelligentEvidence {
  id: string;
  text: string;
  sourceIds: string[];
  sourceUrl?: string | null;
  timestamp: string;
}

/** Internal only — never expose scoring algorithm to users */
export interface SourceQualityInternal {
  sourceId: string;
  url: string;
  authority: number;
  freshness: number;
  relevance: number;
}

export interface ResearchContradiction {
  id: string;
  topic: string;
  /** Fixed Chinese copy for users */
  message: "不同来源存在分歧";
  sides: Array<{
    claim: string;
    evidenceIds: string[];
    sourceIds: string[];
  }>;
}

export interface ResearchActionLink {
  label: string;
  kind: "search" | "create" | "workspace";
  href: string;
  opportunity?: string;
}

export interface IntelligentResearchReport {
  title: string;
  goal: string;
  plan: ResearchPlan;
  executiveSummary?: string;
  keyFindings: string[];
  evidence: IntelligentEvidence[];
  contradictions: ResearchContradiction[];
  /** Legacy string form also kept for panel */
  disagreements: string[];
  trends: string[];
  risks: string[];
  opportunities: string[];
  actions: ResearchActionLink[];
  sources: Array<{ id: string; title: string; url: string }>;
  /** Internal — stripped before client if needed */
  _sourceQuality?: SourceQualityInternal[];
  generatedAt: string;
}
