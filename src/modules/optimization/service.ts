/**
 * V3.6 — AI Optimization
 * Create → Publish → Observe → Analyze → Optimize → Create Again
 * Never fake performance metrics.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "optimization");

export type OptimizationStatus =
  | "insufficient_data"
  | "analyzed"
  | "ready_to_optimize"
  | "failed";

export interface PerformanceInput {
  views?: number;
  clicks?: number;
  ctr?: number;
  cvr?: number;
  engagement?: number;
  orders?: number;
  gmv?: number;
  source?: "user_provided" | "publish_record" | "none";
}

export interface OptimizationInsight {
  whatWorked: string[];
  whatFailed: string[];
  possibleReasons: string[];
  nextChanges: string[];
}

export interface OptimizationRecord {
  id: string;
  userId: string;
  creationId?: string | null;
  publishId?: string | null;
  status: OptimizationStatus;
  code?: "DATA_NOT_AVAILABLE" | "INSUFFICIENT_DATA" | null;
  message: string;
  performance: PerformanceInput;
  insight?: OptimizationInsight | null;
  optimizeActions?: Array<{
    label: string;
    field: "hook" | "title" | "cta" | "full";
    href: string;
  }>;
  createdAt: string;
}

function uid() {
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function hasUsableMetrics(p: PerformanceInput): boolean {
  if (p.source === "none" || !p.source) return false;
  const nums = [p.views, p.clicks, p.ctr, p.cvr, p.engagement, p.orders, p.gmv];
  return nums.some((n) => typeof n === "number" && !Number.isNaN(n));
}

export async function analyzePerformance(input: {
  userId: string;
  creationId?: string;
  publishId?: string;
  performance?: PerformanceInput;
}): Promise<OptimizationRecord> {
  await ensureDir();
  const performance: PerformanceInput = input.performance ?? {
    source: "none",
  };

  if (!hasUsableMetrics(performance)) {
    const record: OptimizationRecord = {
      id: uid(),
      userId: input.userId,
      creationId: input.creationId ?? null,
      publishId: input.publishId ?? null,
      status: "insufficient_data",
      code: "DATA_NOT_AVAILABLE",
      message:
        "DATA NOT AVAILABLE：没有真实平台表现数据，不会生成假指标或假洞察。",
      performance: { source: "none" },
      insight: null,
      optimizeActions: [],
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(DATA_DIR, `${record.id}.json`),
      JSON.stringify(record, null, 2)
    );
    return record;
  }

  const insight: OptimizationInsight = {
    whatWorked: [],
    whatFailed: [],
    possibleReasons: [],
    nextChanges: [],
  };

  if ((performance.ctr ?? 0) >= 0.03) {
    insight.whatWorked.push("点击率表现相对健康");
  } else if (performance.ctr != null) {
    insight.whatFailed.push("点击率偏低");
    insight.possibleReasons.push("标题/Hook 吸引力不足，或封面匹配度弱");
    insight.nextChanges.push("重新生成 Hook 与标题");
  }

  if ((performance.cvr ?? 0) >= 0.02) {
    insight.whatWorked.push("转化表现可接受");
  } else if (performance.cvr != null) {
    insight.whatFailed.push("转化偏低");
    insight.possibleReasons.push("CTA 不清晰，或卖点与受众不匹配");
    insight.nextChanges.push("重新生成 CTA 与正文卖点");
  }

  if ((performance.engagement ?? 0) < 0.02 && performance.engagement != null) {
    insight.whatFailed.push("互动不足");
    insight.nextChanges.push("调整内容结构，增强提问与互动引导");
  }

  if (!insight.whatWorked.length && !insight.whatFailed.length) {
    insight.possibleReasons.push("样本量有限，仅基于已提供指标做保守判断");
    insight.nextChanges.push("继续观察后再优化，或补充更多真实指标");
  }

  const creationId = input.creationId;
  const optimizeActions = creationId
    ? [
        {
          label: "重新生成 Hook",
          field: "hook" as const,
          href: `/create/${creationId}?optimize=hook`,
        },
        {
          label: "重新生成标题",
          field: "title" as const,
          href: `/create/${creationId}?optimize=title`,
        },
        {
          label: "重新生成 CTA",
          field: "cta" as const,
          href: `/create/${creationId}?optimize=cta`,
        },
        {
          label: "重新生成完整内容",
          field: "full" as const,
          href: `/create/${creationId}?optimize=full`,
        },
      ]
    : [];

  const record: OptimizationRecord = {
    id: uid(),
    userId: input.userId,
    creationId: creationId ?? null,
    publishId: input.publishId ?? null,
    status: "ready_to_optimize",
    code: null,
    message: "已基于真实/用户提供的表现数据生成优化建议",
    performance,
    insight,
    optimizeActions,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(DATA_DIR, `${record.id}.json`),
    JSON.stringify(record, null, 2)
  );
  return record;
}

export async function getOptimization(
  id: string,
  userId: string
): Promise<OptimizationRecord | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${id}.json`), "utf-8");
    const rec = JSON.parse(raw) as OptimizationRecord;
    if (rec.userId !== userId) return null;
    return rec;
  } catch {
    return null;
  }
}
