/**
 * V3.1 — User Memory types
 * Long-lived preferences only — not chat logs.
 */

export type MemoryType =
  | "Preference"
  | "Project"
  | "Brand"
  | "ContentStyle"
  | "WorkflowPreference";

export type MemoryStatus =
  | "candidate"
  | "confirmed"
  | "saved"
  | "active"
  | "updated"
  | "deleted";

export interface UserMemory {
  id: string;
  userId: string;
  type: MemoryType;
  key: string;
  label: string;
  value: string;
  /** Structured extras (platform, language, etc.) */
  meta?: Record<string, unknown> | null;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
}

export interface MemoryCreateInput {
  type: MemoryType;
  key: string;
  label: string;
  value: string;
  meta?: Record<string, unknown> | null;
  /** If true, skip candidate and go to active after user confirmation path. */
  requireConfirm?: boolean;
}
