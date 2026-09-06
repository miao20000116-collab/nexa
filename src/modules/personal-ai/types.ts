/**
 * V4.0 — Personal AI Operating Layer types
 */

export interface UserAiPreferences {
  userId: string;
  /** When false, Memory is not injected into task context */
  memoryEnabled: boolean;
  updatedAt: string;
}

export interface ResolvedContextSource {
  kind: "memory" | "workspace" | "asset" | "research" | "creation";
  id: string;
  title: string;
  snippet?: string | null;
  updatedAt?: string | null;
}

export interface ResolvedTaskContext {
  userId: string;
  task: string;
  memoryEnabled: boolean;
  memoriesUsed: number;
  workspaceIds: string[];
  assetIds: string[];
  researchIds: string[];
  creationIds: string[];
  sources: ResolvedContextSource[];
  /** Prompt-ready summary for AIOrchestrator — empty when nothing real available */
  contextSummary: string;
  message: string;
}
