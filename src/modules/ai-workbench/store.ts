"use client";

import type { AiCapabilityRecord, AiJobEventDetail } from "./types";
import {
  AI_WORKBENCH_STORAGE_KEY,
  NEXA_AI_HISTORY_EVENT,
  NEXA_AI_JOB_EVENT,
} from "./types";

function readAll(): AiCapabilityRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AI_WORKBENCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AiCapabilityRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: AiCapabilityRecord[]) {
  try {
    localStorage.setItem(
      AI_WORKBENCH_STORAGE_KEY,
      JSON.stringify(rows.slice(0, 200))
    );
    window.dispatchEvent(new Event(NEXA_AI_HISTORY_EVENT));
  } catch {
    /* quota */
  }
}

export function listAiCapabilityRecords(pageKey?: string): AiCapabilityRecord[] {
  const all = readAll();
  if (!pageKey) return all;
  return all.filter((r) => r.pageKey === pageKey);
}

export function recordAiCapabilityRun(input: {
  pageKey: string;
  capabilityId: string;
  capabilityLabel: string;
  title: string;
  summary?: string;
  payload?: unknown;
}): AiCapabilityRecord {
  const row: AiCapabilityRecord = {
    id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    pageKey: input.pageKey,
    capabilityId: input.capabilityId,
    capabilityLabel: input.capabilityLabel,
    title: input.title.slice(0, 120),
    summary: input.summary?.slice(0, 400),
    payload: input.payload,
    createdAt: new Date().toISOString(),
    pathname:
      typeof window !== "undefined" ? window.location.pathname : undefined,
  };
  const next = [row, ...readAll()];
  writeAll(next);
  return row;
}

export function clearAiCapabilityRecords(pageKey?: string) {
  if (!pageKey) {
    writeAll([]);
    return;
  }
  writeAll(readAll().filter((r) => r.pageKey !== pageKey));
}

/** Notify floating AI workbench of live job status. */
export function emitAiJob(detail: AiJobEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NEXA_AI_JOB_EVENT, { detail }));
}

export {
  NEXA_AI_CAPABILITY_EVENT,
  NEXA_AI_HISTORY_EVENT,
  NEXA_AI_JOB_EVENT,
} from "./types";
