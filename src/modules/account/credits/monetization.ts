/**
 * V4.7 — Credits & Monetization 2.0 helpers
 * Packs / estimate / refund / ledger honesty
 */

import {
  appendLedgerEntry,
  estimateCredits,
  getCreditsSummary,
} from "@/modules/account/credits/service";
import { promises as fs } from "fs";
import path from "path";

const PACKS_DIR = path.join(process.cwd(), ".nexa-data", "account", "packs");

export type PlanTier = "free" | "credits_pack" | "subscription";

export interface CreditsPack {
  id: string;
  label: string;
  credits: number;
  priceLabel: string;
  kind: PlanTier;
}

export const CREDIT_PACKS: CreditsPack[] = [
  {
    id: "free",
    label: "免费",
    credits: 0,
    priceLabel: "免费额度由账号档位决定",
    kind: "free",
  },
  {
    id: "pack_200",
    label: "积分包 200",
    credits: 200,
    priceLabel: "Demo 充值包（作品集演示）",
    kind: "credits_pack",
  },
  {
    id: "sub_pro",
    label: "Pro 订阅",
    credits: 1000,
    priceLabel: "订阅档位（演示发放，非真实支付）",
    kind: "subscription",
  },
];

export function estimateTaskCredits(capability: string) {
  return estimateCredits(capability);
}

/** Demo pack grant — clearly labeled, ledger tracked. Not a real payment. */
export async function grantDemoPack(input: {
  userId: string;
  packId: string;
}): Promise<{
  ok: boolean;
  message: string;
  balance?: number;
  ledgerId?: string;
}> {
  const pack = CREDIT_PACKS.find((p) => p.id === input.packId);
  if (!pack || pack.kind === "free") {
    return { ok: false, message: "无效的 Credits Pack" };
  }

  await fs.mkdir(PACKS_DIR, { recursive: true });
  const entry = await appendLedgerEntry({
    userId: input.userId,
    type: "bonus",
    amount: pack.credits,
    description: `演示发放：${pack.label}（非真实支付）`,
    referenceType: "credits_pack",
    referenceId: pack.id,
    jobStatus: "success",
  });

  await fs.writeFile(
    path.join(PACKS_DIR, `${input.userId}_${Date.now()}.json`),
    JSON.stringify(
      {
        userId: input.userId,
        packId: pack.id,
        credits: pack.credits,
        isDemoPurchase: true,
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  const summary = await getCreditsSummary(input.userId);
  return {
    ok: true,
    message: `已演示发放 ${pack.credits} Credits，并写入 Ledger`,
    balance: summary.balance,
    ledgerId: entry.id,
  };
}

export async function refundCredits(input: {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string;
}): Promise<{ ok: boolean; message: string; balance?: number }> {
  if (input.amount <= 0) {
    return { ok: false, message: "退款金额无效" };
  }
  await appendLedgerEntry({
    userId: input.userId,
    type: "refund",
    amount: input.amount,
    description: input.reason || "任务失败退款",
    referenceType: "refund",
    referenceId: input.referenceId ?? null,
    jobId: input.referenceId ?? null,
    jobStatus: "failed",
  });
  const summary = await getCreditsSummary(input.userId);
  return {
    ok: true,
    message: `已退回 ${input.amount} Credits`,
    balance: summary.balance,
  };
}
