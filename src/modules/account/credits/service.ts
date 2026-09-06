import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  fileAppendLedger,
  fileListLedger,
} from "@/lib/account/file-store";
import { TIER_CREDITS, ROLE_TIER_MAP } from "@/modules/account/permissions/tier-policy";
import { GUEST_CREDITS_ALLOWANCE, isCapabilityFree } from "./policy";
import type {
  CreditEstimate,
  CreditLedgerEntry,
  CreditsAccountContext,
  CreditsSummary,
} from "@/modules/account/types";

const UPCOMING = [
  "AI Overview",
  "深度研究",
  "内容生成",
  "图片生成",
  "视频生成",
  "内容质检",
];

/**
 * Built-in defaults so AI is never "free because unpriced".
 * Env NEXA_CREDITS_COST_TABLE overrides / extends these keys.
 */
const DEFAULT_COST_TABLE: Record<string, number> = {
  research: 15,
  selection_analysis: 12,
  listing_intelligence: 12,
  keyword_intelligence: 10,
  advertising_analysis: 12,
  customer_intelligence: 12,
  compliance_check: 10,
  financial_analysis: 10,
  inventory_intelligence: 8,
  generateText: 8,
  rewrite: 5,
  generateImage: 20,
  editImage: 15,
  generateVideo: 40,
  qualityCheck: 6,
  summarize: 4,
  reason: 10,
  embed: 2,
};

function readCostTable(): Record<string, number> {
  const merged = { ...DEFAULT_COST_TABLE };
  const raw = process.env.NEXA_CREDITS_COST_TABLE?.trim();
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && v >= 0) merged[k] = v;
    }
  } catch {
    /* keep defaults */
  }
  return merged;
}

/**
 * Credits are never bound to a specific model in the UI.
 * Model costs are computed centrally in the backend when providers exist.
 */
export function estimateCredits(action: string): CreditEstimate {
  if (isCapabilityFree(action)) {
    return {
      available: true,
      estimatedCredits: 0,
      message: "免费，不消耗 Credits",
    };
  }

  const table = readCostTable();
  const n = table[action];
  if (typeof n !== "number" || n < 0) {
    return {
      available: false,
      message:
        `能力「${action}」尚未配置 Credits 计价，暂不可用。`,
    };
  }

  return {
    available: true,
    estimatedCredits: n,
    message: `预计消耗约 ${n} Credits`,
  };
}

export function creditsForAction(action: string): number | null {
  const est = estimateCredits(action);
  return est.available ? (est.estimatedCredits ?? null) : null;
}

function mapEntry(row: {
  id: string;
  userId: string | null;
  type: string;
  amount: number;
  balance: number | null;
  description: string | null;
  referenceType?: string | null;
  referenceId: string | null;
  jobId?: string | null;
  capability?: string | null;
  jobStatus?: string | null;
  createdAt: Date | string;
}): CreditLedgerEntry {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    amount: row.amount,
    balance: row.balance,
    description: row.description,
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId,
    jobId: row.jobId ?? null,
    capability: row.capability ?? null,
    jobStatus: (row.jobStatus as CreditLedgerEntry["jobStatus"]) ?? null,
    createdAt:
      typeof row.createdAt === "string"
        ? row.createdAt
        : row.createdAt.toISOString(),
  };
}

export async function getCreditsSummary(
  accountId: string | null,
  userRole?: string | null,
  opts?: { isGuest?: boolean; guestAllowance?: number }
): Promise<CreditsSummary> {
  if (!accountId) {
    return {
      label: "AI Credits",
      balance: 0,
      isDemoGrant: false,
      note: "登录后可查看 AI Credits 与流水。访客可体验搜索与 Commerce Demo。",
      entries: [],
      upcomingConsumers: UPCOMING,
    };
  }

  let entries: CreditLedgerEntry[] = [];

  if (await isDatabaseAvailable()) {
    try {
      const rows = await prisma.creditLedger.findMany({
        where: { userId: accountId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      entries = rows.map((r) =>
        mapEntry({
          ...r,
          referenceType:
            (r as { referenceType?: string | null }).referenceType ?? null,
          jobId: (r as { jobId?: string | null }).jobId ?? null,
          capability: (r as { capability?: string | null }).capability ?? null,
          jobStatus: (r as { jobStatus?: string | null }).jobStatus ?? null,
        })
      );
    } catch {
      entries = await fileListLedger(accountId);
    }
  } else {
    entries = await fileListLedger(accountId);
  }

  if (entries.length === 0) {
    let grantAmount: number;
    let description: string;
    let referenceId: string;

    if (opts?.isGuest) {
      grantAmount = opts.guestAllowance ?? GUEST_CREDITS_ALLOWANCE;
      description = "访客体验额度（非充值）";
      referenceId = "guest_trial_grant";
    } else {
      const tier =
        userRole && ROLE_TIER_MAP[userRole]
          ? ROLE_TIER_MAP[userRole]
          : "standard";
      grantAmount = TIER_CREDITS[tier === "guest" ? "standard" : tier];
      description =
        tier === "pro"
          ? "高级版演示额度"
          : tier === "basic"
            ? "基础版演示额度"
            : "新用户体验额度（非充值）";
      referenceId = `welcome_grant_${tier}`;
    }

    const grant = await appendLedgerEntry({
      userId: accountId,
      type: "grant",
      amount: grantAmount,
      description,
      referenceType: "system",
      referenceId,
      jobStatus: "success",
    });
    entries = [grant];
  }

  const balance =
    entries[0]?.balance ??
    entries.reduce((acc, e) => acc + e.amount, 0);

  return {
    label: "AI Credits",
    balance,
    isDemoGrant: entries.some(
      (e) =>
        e.referenceId?.startsWith("welcome_grant") ||
        e.referenceId === "guest_trial_grant"
    ),
    note: "界面仅显示 Credits，不展示人民币或 Token。模型成本由后台统一计算。",
    entries,
    upcomingConsumers: UPCOMING,
  };
}

export async function appendLedgerEntry(input: {
  userId: string;
  type: string;
  amount: number;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  jobId?: string | null;
  capability?: string | null;
  jobStatus?: CreditLedgerEntry["jobStatus"];
}): Promise<CreditLedgerEntry> {
  const existing = await fileListLedger(input.userId);
  let previousBalance = 0;
  if (existing[0]?.balance != null) {
    previousBalance = existing[0].balance;
  } else if (await isDatabaseAvailable()) {
    try {
      const last = await prisma.creditLedger.findFirst({
        where: { userId: input.userId },
        orderBy: { createdAt: "desc" },
      });
      previousBalance = last?.balance ?? 0;
    } catch {
      previousBalance = existing.reduce((a, e) => a + e.amount, 0);
    }
  } else {
    previousBalance = existing.reduce((a, e) => a + e.amount, 0);
  }

  const balance = previousBalance + input.amount;

  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.creditLedger.create({
        data: {
          userId: input.userId,
          type: input.type,
          amount: input.amount,
          balance,
          description: input.description ?? null,
          referenceId: input.referenceId ?? null,
          ...( {
            referenceType: input.referenceType ?? null,
            jobId: input.jobId ?? null,
            capability: input.capability ?? null,
            jobStatus: input.jobStatus ?? null,
          } as object),
        },
      });
      return mapEntry({
        ...row,
        referenceType: input.referenceType ?? null,
        jobId: input.jobId ?? null,
        capability: input.capability ?? null,
        jobStatus: input.jobStatus ?? null,
      });
    } catch {
      /* fallback */
    }
  }

  return fileAppendLedger(input.userId, {
    type: input.type,
    amount: input.amount,
    balance,
    description: input.description ?? null,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    jobId: input.jobId ?? null,
    capability: input.capability ?? null,
    jobStatus: input.jobStatus ?? null,
  });
}

/**
 * Consume credits — all spends must be ledger-tracked.
 * Returns null if insufficient; never silently succeeds.
 * Failed AI jobs must not call this (charge only on success).
 */
export async function consumeCredits(input: {
  userId: string;
  amount: number;
  description: string;
  referenceType: string;
  referenceId: string;
  jobId?: string;
  capability?: string;
}): Promise<CreditLedgerEntry | { error: string }> {
  if (input.amount <= 0) {
    return { error: "无效消耗数量" };
  }
  const summary = await getCreditsSummary(input.userId, null, {
    isGuest: input.userId.startsWith("guest:"),
    guestAllowance: GUEST_CREDITS_ALLOWANCE,
  });
  if (summary.balance < input.amount) {
    return { error: "AI Credits 不足" };
  }
  return appendLedgerEntry({
    userId: input.userId,
    type: "consume",
    amount: -Math.abs(input.amount),
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    jobId: input.jobId,
    capability: input.capability,
    jobStatus: "success",
  });
}

export type { CreditsAccountContext };
