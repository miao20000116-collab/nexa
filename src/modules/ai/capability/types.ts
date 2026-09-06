import type { SourceSnapshot } from "@/modules/workspace/types";

export const AI_CAPABILITY_NOT_CONFIGURED = "AI_CAPABILITY_NOT_CONFIGURED";

export interface AIResearchRequest {
  workspaceId: string;
  sources: SourceSnapshot[];
  goal?: string;
}

export interface AIResearchResponse {
  success: boolean;
  code: string;
  message?: string;
  data?: unknown;
}

export interface AIResearchService {
  summarizeSources(req: AIResearchRequest): Promise<AIResearchResponse>;
  compareSources(req: AIResearchRequest): Promise<AIResearchResponse>;
  extractKeyPoints(req: AIResearchRequest): Promise<AIResearchResponse>;
  findDisagreements(req: AIResearchRequest): Promise<AIResearchResponse>;
  planResearch(req: AIResearchRequest): Promise<AIResearchResponse>;
  generateResearchReport(req: AIResearchRequest): Promise<AIResearchResponse>;
  getStatus(): Promise<{ available: boolean; code: string }>;
}
