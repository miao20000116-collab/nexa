/**
 * V4.1 — Intelligent Workflow types
 * Uses existing capabilities via AIOrchestrator / CapabilityRouter — no separate Agents.
 */

export type WorkflowPhase = "plan" | "execute" | "review" | "complete";

export type WorkflowStepKind =
  | "commerce_diagnose"
  | "research"
  | "search"
  | "creation"
  | "qa"
  | "publish"
  | "decision"
  | "optimize";

export type WorkflowStepStatus =
  | "pending"
  | "approved"
  | "running"
  | "paused"
  | "skipped"
  | "completed"
  | "failed"
  | "needs_confirm";

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  /** High-risk: publish / high credits / external */
  requiresConfirm: boolean;
  confirmed?: boolean;
  resultSummary?: string | null;
  error?: string | null;
  editedInstruction?: string | null;
}

export interface WorkflowRecord {
  id: string;
  userId: string;
  goal: string;
  phase: WorkflowPhase;
  status: "active" | "paused" | "completed" | "cancelled";
  steps: WorkflowStep[];
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowUserAction =
  | "approve"
  | "pause"
  | "skip"
  | "edit"
  | "retry"
  | "confirm_risk"
  | "resume";
