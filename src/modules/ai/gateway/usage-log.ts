import { promises as fs } from "fs";
import path from "path";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import type { AIUsageRecord } from "./types";
import type { AIUsageStatus } from "./errors";

const LOG_DIR = path.join(process.cwd(), ".nexa-data", "ai-usage");

function requestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Estimated cost in USD — table from env, never shown in UI. */
function estimateCostUsd(
  model: string,
  inputTokens?: number,
  outputTokens?: number
): number | null {
  const raw = process.env.NEXA_AI_COST_PER_1K_TOKENS?.trim();
  if (!raw) return null;
  try {
    const table = JSON.parse(raw) as Record<
      string,
      { input?: number; output?: number; default?: number }
    >;
    const rate = table[model] ?? table["*"] ?? table["default"];
    if (!rate) return null;
    const inCost = ((inputTokens ?? 0) / 1000) * (rate.input ?? rate.default ?? 0);
    const outCost =
      ((outputTokens ?? 0) / 1000) * (rate.output ?? rate.default ?? 0);
    return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
  } catch {
    return null;
  }
}

export interface RecordUsageInput {
  userId?: string | null;
  capability: AIUsageRecord["capability"];
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  status: AIUsageStatus;
  errorCode?: string;
  creditsUsed?: number | null;
  referenceType?: string;
  referenceId?: string;
}

/** Backend-only usage log. Never exposed as Token UI or in client responses. */
export async function recordAIUsage(
  partial: RecordUsageInput
): Promise<AIUsageRecord> {
  const totalTokens =
    (partial.inputTokens ?? 0) + (partial.outputTokens ?? 0) || undefined;

  const record: AIUsageRecord = {
    requestId: requestId(),
    userId: partial.userId,
    capability: partial.capability,
    provider: partial.provider,
    model: partial.model,
    inputTokens: partial.inputTokens,
    outputTokens: partial.outputTokens,
    totalTokens,
    estimatedCost: estimateCostUsd(
      partial.model,
      partial.inputTokens,
      partial.outputTokens
    ),
    creditsUsed: partial.creditsUsed ?? null,
    status: partial.status,
    latencyMs: partial.latencyMs,
    errorCode: partial.errorCode,
    referenceType: partial.referenceType,
    referenceId: partial.referenceId,
    createdAt: new Date().toISOString(),
    id: undefined,
    success: partial.status === "success",
  };

  record.id = record.requestId;

  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const day = record.createdAt.slice(0, 10);
    const file = path.join(LOG_DIR, `${day}.jsonl`);
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    /* never break user flow on log failure */
  }

  if (await isDatabaseAvailable()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = prisma as any;
      if (client.aIUsageLog?.create) {
        await client.aIUsageLog.create({
          data: {
            id: record.requestId,
            userId: partial.userId ?? null,
            capability: partial.capability,
            provider: partial.provider,
            model: partial.model,
            inputTokens: partial.inputTokens ?? null,
            outputTokens: partial.outputTokens ?? null,
            totalTokens: totalTokens ?? null,
            estimatedCost: record.estimatedCost ?? null,
            creditsUsed: partial.creditsUsed ?? null,
            status: partial.status,
            latencyMs: partial.latencyMs,
            errorCode: partial.errorCode ?? null,
            referenceType: partial.referenceType ?? null,
            referenceId: partial.referenceId ?? null,
          },
        });
      }
    } catch {
      /* file log is fallback */
    }
  }

  return record;
}
