import { randomUUID } from "crypto";
import {
  capabilityRequiresLogin,
  guestMayUseCapability,
  isCapabilityFree,
  GUEST_CREDITS_ALLOWANCE,
} from "./policy";
import {
  estimateCredits,
  getCreditsSummary,
  type CreditsAccountContext,
} from "./service";
import type { CreditEstimate } from "@/modules/account/types";

export type CreditsGateCode =
  | "confirm_required"
  | "login_required"
  | "insufficient_credits"
  | "invalid_capability"
  | "pricing_unavailable";

export type CreditsGateResult =
  | {
      ok: true;
      account: CreditsAccountContext;
      jobId: string;
      estimatedCredits: number | null;
      estimate: CreditEstimate;
    }
  | {
      ok: false;
      code: CreditsGateCode;
      message: string;
      estimate?: CreditEstimate;
      balance?: number;
      jobId?: string;
    };

export function newCreditJobId(prefix = "job"): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/**
 * Gate AI usage: login rules, balance, and user confirm.
 * Search itself never calls this. Free capabilities (e.g. aiOverview) skip confirm/charge.
 */
export async function gateAiUsage(opts: {
  account: CreditsAccountContext;
  capability: string;
  confirm?: boolean;
  jobId?: string;
}): Promise<CreditsGateResult> {
  const { account, capability } = opts;
  const jobId = opts.jobId ?? newCreditJobId(capability);
  const free = isCapabilityFree(capability);
  const estimate = free
    ? {
        available: true,
        estimatedCredits: 0,
        message: "AI 概览免费，不消耗 Credits",
      }
    : estimateCredits(capability);

  if (account.isGuest && capabilityRequiresLogin(capability)) {
    return {
      ok: false,
      code: "login_required",
      message: `「${capability}」需要登录后使用`,
      estimate,
      jobId,
    };
  }

  if (account.isGuest && !guestMayUseCapability(capability)) {
    return {
      ok: false,
      code: "login_required",
      message: "该 AI 能力需要登录后使用",
      estimate,
      jobId,
    };
  }

  const cost = estimate.estimatedCredits ?? 0;
  // Unpriced capabilities must NOT run as free — that was a P0 honesty hole.
  if (!free && !estimate.available) {
    return {
      ok: false,
      code: "pricing_unavailable",
      message:
        estimate.message ||
        "该 AI 能力尚未配置 Credits 计价，暂不可用。请配置 NEXA_CREDITS_COST_TABLE。",
      estimate,
      jobId,
    };
  }

  if (free || (estimate.available && cost === 0)) {
    return {
      ok: true,
      account,
      jobId,
      estimatedCredits: 0,
      estimate,
    };
  }

  if (!opts.confirm) {
    return {
      ok: false,
      code: "confirm_required",
      message: estimate.message,
      estimate,
      jobId,
    };
  }

  const summary = await getCreditsSummary(account.accountId, account.userRole, {
    isGuest: account.isGuest,
    guestAllowance: account.isGuest ? GUEST_CREDITS_ALLOWANCE : undefined,
  });

  if (cost > 0 && summary.balance < cost) {
    return {
      ok: false,
      code: "insufficient_credits",
      message: `AI Credits 不足（余额 ${summary.balance}，预计需要约 ${cost}）`,
      estimate,
      balance: summary.balance,
      jobId,
    };
  }

  return {
    ok: true,
    account,
    jobId,
    estimatedCredits: estimate.estimatedCredits ?? null,
    estimate,
  };
}
