import { consumeCredits, creditsForAction, estimateCredits } from "@/modules/account/credits/service";
import { isCapabilityFree } from "@/modules/account/credits/policy";
import type { AICapability } from "./types";

/** Credits cost table is server-side JSON — never bind UI to a model. */
export function creditsForCapability(capability: AICapability | string): number | null {
  return creditsForAction(capability);
}

export type ChargeCreditsResult =
  | { status: "charged"; amount: number }
  | { status: "skipped"; reason: "no_account" | "free" }
  | { status: "failed"; error: string; code: "insufficient_credits" | "pricing_unavailable" | "charge_error" };

/**
 * Charge after a successful provider call.
 * - free capabilities → skipped
 * - missing price table → failed (never silent free)
 * - consume error → failed (caller must not treat AI as unpaid success)
 */
export async function chargeCreditsForUsage(opts: {
  accountId?: string | null;
  /** @deprecated use accountId */
  userId?: string | null;
  capability: AICapability | string;
  referenceId?: string;
  jobId?: string;
}): Promise<ChargeCreditsResult> {
  const accountId = opts.accountId ?? opts.userId;
  if (!accountId) return { status: "skipped", reason: "no_account" };

  const capability = String(opts.capability);
  if (isCapabilityFree(capability)) {
    return { status: "skipped", reason: "free" };
  }

  const estimate = estimateCredits(capability);
  if (!estimate.available) {
    return {
      status: "failed",
      error:
        estimate.message ||
        "Credits 计价未配置，拒绝在未计价状态下扣费/放行。",
      code: "pricing_unavailable",
    };
  }

  const amount = estimate.estimatedCredits ?? 0;
  if (amount === 0) {
    return { status: "skipped", reason: "free" };
  }

  const result = await consumeCredits({
    userId: accountId,
    amount,
    description: `AI 能力：${capability}`,
    referenceType: "ai_capability",
    referenceId: opts.referenceId || capability,
    jobId: opts.jobId,
    capability,
  });

  if ("error" in result) {
    return {
      status: "failed",
      error: result.error || "Credits 扣费失败",
      code: "insufficient_credits",
    };
  }

  return { status: "charged", amount };
}

/** @deprecated use chargeCreditsForUsage */
export async function maybeChargeCredits(opts: {
  userId?: string | null;
  capability: AICapability;
  referenceId?: string;
}) {
  await chargeCreditsForUsage(opts);
}
