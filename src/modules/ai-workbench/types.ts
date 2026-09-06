/** AI Workbench — page-scoped capabilities + local history (session/browser). */

export type AiCapabilityDef = {
  id: string;
  label: string;
  description?: string;
  /** Optional deep-link / same-page trigger */
  href?: string;
};

export type AiPageCapabilities = {
  pageKey: string;
  pageLabel: string;
  capabilities: AiCapabilityDef[];
  tips?: string[];
  agentIntro?: string;
  agentExamples?: string[];
  agentInputPlaceholder?: string;
};

export type AiCapabilityRecord = {
  id: string;
  pageKey: string;
  capabilityId: string;
  capabilityLabel: string;
  title: string;
  summary?: string;
  payload?: unknown;
  createdAt: string;
  pathname?: string;
};

export type AiJobPhase =
  | "running"
  | "confirm_required"
  | "done"
  | "error"
  | "cancelled";

export type AiJobEventDetail = {
  jobId?: string;
  capabilityId: string;
  capabilityLabel: string;
  title: string;
  phase: AiJobPhase;
  message?: string;
  pageKey?: string;
};

export const NEXA_AI_CAPABILITY_EVENT = "nexa-ai-capability";
export const NEXA_AI_HISTORY_EVENT = "nexa-ai-history";
/** Live job status for floating workbench (generating / done). */
export const NEXA_AI_JOB_EVENT = "nexa-ai-job";
/** Open workbench chat with an optional preset question. */
export const NEXA_AI_OPEN_CHAT_EVENT = "nexa-ai-open-chat";

export const AI_WORKBENCH_STORAGE_KEY = "nexa_ai_workbench_history_v1";
