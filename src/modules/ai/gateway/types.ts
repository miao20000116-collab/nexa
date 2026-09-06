/** AI Gateway types — business code must not depend on concrete model names. */

export type AICapability =
  | "generateText"
  | "reason"
  | "summarize"
  | "classify"
  | "rewrite"
  | "research"
  | "analyzeImage"
  | "analyzeVideo"
  | "generateImage"
  | "editImage"
  | "generateVideo"
  | "generateMusic"
  | "analyzeMusic"
  | "transcribe"
  | "textToSpeech"
  | "qualityCheck"
  | "embed";

export type ProviderKind =
  | "text"
  | "vision"
  | "image"
  | "video"
  | "music"
  | "speech"
  | "quality"
  | "embed";

export interface ProviderDescriptor {
  id: string;
  kind: ProviderKind;
  /** Internal only — never shown in UI */
  labelInternal: string;
  region: string;
  capabilities: AICapability[];
  priority: number;
  isConfigured: () => boolean;
}

export interface RouteContext {
  capability: AICapability;
  region?: string;
  task?: string;
  quality?: "fast" | "balanced" | "high";
  costPreference?: "low" | "balanced" | "quality";
}

export interface AIUsageRecord {
  requestId: string;
  userId?: string | null;
  capability: AICapability;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number | null;
  creditsUsed?: number | null;
  status: import("./errors").AIUsageStatus;
  latencyMs: number;
  errorCode?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
  /** @deprecated use requestId */
  id?: string;
  /** @deprecated use status === 'success' */
  success?: boolean;
}

export interface ContentQAResult {
  passed: boolean;
  verdict: "通过" | "需要修改" | "PASS" | "NEEDS_REVISION";
  reasons: string[];
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
  suggestions: string[];
  issues?: Array<
    | string
    | {
        id?: string;
        category?: string;
        where?: string;
        why?: string;
        how?: string;
        severity?: "error" | "warning";
      }
  >;
}
