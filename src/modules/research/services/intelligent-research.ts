/**
 * V3.2 — Intelligent Research helpers
 * Plan → Evidence → Compare → Synthesize → Opportunity → Action
 */

export type ResearchPlanDimension =
  | "market"
  | "user"
  | "competitor"
  | "technology"
  | "business"
  | "trend"
  | "risk";

export interface ResearchPlanItem {
  dimension: ResearchPlanDimension;
  question: string;
  subquery: string;
}

export interface EvidenceRecord {
  text: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  timestamp: string;
  /** Internal quality — not shown as algorithm scores to users */
  quality?: {
    authority: number;
    freshness: number;
    relevance: number;
  };
}

export interface ContradictionNote {
  topic: string;
  message: string;
  sides: Array<{ claim: string; sourceId: string; sourceTitle: string }>;
}

export interface ResearchActionLink {
  label: string;
  kind: "search" | "create" | "workspace";
  href: string;
}

const DIMENSION_LABELS: Record<ResearchPlanDimension, string> = {
  market: "市场",
  user: "用户",
  competitor: "竞品",
  technology: "技术",
  business: "商业模式",
  trend: "趋势",
  risk: "风险",
};

/** Auto-split a research goal into plan dimensions. */
export function buildResearchPlan(goal: string): ResearchPlanItem[] {
  const g = goal.trim() || "该主题";
  return [
    { dimension: "market", question: `${g} 的市场规模与格局？`, subquery: `${g} 市场 规模 格局` },
    { dimension: "user", question: `${g} 的用户需求与痛点？`, subquery: `${g} 用户 需求 痛点` },
    { dimension: "competitor", question: `${g} 的主要竞品与差异？`, subquery: `${g} 竞品 对比` },
    { dimension: "technology", question: `${g} 的关键技术路径？`, subquery: `${g} 技术 方案` },
    { dimension: "business", question: `${g} 的商业模式？`, subquery: `${g} 商业模式 变现` },
    { dimension: "trend", question: `${g} 的近期趋势？`, subquery: `${g} 趋势 2024 2025 2026` },
    { dimension: "risk", question: `${g} 的主要风险？`, subquery: `${g} 风险 挑战` },
  ];
}

export function planSummary(plan: ResearchPlanItem[]): string {
  return plan
    .map((p) => `${DIMENSION_LABELS[p.dimension]}：${p.question}`)
    .join("\n");
}

/** Simple internal quality heuristic — never shown as raw scores in UI. */
export function scoreSourceQuality(input: {
  url: string;
  title?: string;
  snippet?: string;
  goal: string;
  publishedAt?: string;
}): { authority: number; freshness: number; relevance: number } {
  const host = (() => {
    try {
      return new URL(input.url).hostname;
    } catch {
      return "";
    }
  })();
  const authorityHost =
    /(wikipedia\.org|gov|edu|reuters|bloomberg|nytimes|ft\.com|nature\.com|arxiv\.org|官方)/i.test(
      host + (input.title || "")
    );
  const authority = authorityHost ? 0.85 : 0.45;
  let freshness = 0.5;
  if (input.publishedAt) {
    const ageDays =
      (Date.now() - new Date(input.publishedAt).getTime()) / (86400 * 1000);
    freshness = ageDays < 30 ? 0.9 : ageDays < 180 ? 0.7 : ageDays < 365 ? 0.5 : 0.3;
  }
  const blob = `${input.title || ""} ${input.snippet || ""}`.toLowerCase();
  const tokens = input.goal
    .toLowerCase()
    .split(/[\s,，。、]+/)
    .filter((t) => t.length > 1);
  const hits = tokens.filter((t) => blob.includes(t)).length;
  const relevance = tokens.length ? Math.min(1, hits / Math.min(tokens.length, 5)) : 0.4;
  return { authority, freshness, relevance };
}

/** Detect opposing claims heuristically from evidence texts. */
export function detectContradictions(
  evidence: EvidenceRecord[]
): ContradictionNote[] {
  const notes: ContradictionNote[] = [];
  const positive = evidence.filter((e) =>
    /(增长|看好|优势|领先|机会|提升)/.test(e.text)
  );
  const negative = evidence.filter((e) =>
    /(下降|风险|劣势|落后|挑战|下滑|问题)/.test(e.text)
  );
  if (positive.length && negative.length) {
    notes.push({
      topic: "前景判断",
      message: "不同来源存在分歧。",
      sides: [
        {
          claim: positive[0].text.slice(0, 160),
          sourceId: positive[0].sourceId,
          sourceTitle: positive[0].sourceTitle,
        },
        {
          claim: negative[0].text.slice(0, 160),
          sourceId: negative[0].sourceId,
          sourceTitle: negative[0].sourceTitle,
        },
      ],
    });
  }
  return notes;
}

export function buildResearchActions(opts: {
  goal: string;
  workspaceId: string;
  researchId?: string;
  opportunities?: string[];
}): ResearchActionLink[] {
  const opp = opts.opportunities?.[0];
  const createGoal = opp
    ? `基于研究机会「${opp}」生成产品/内容方案`
    : `基于研究「${opts.goal}」生成可执行方案`;
  const createParams = new URLSearchParams({
    mode: "workspace",
    workspaceId: opts.workspaceId,
    goal: createGoal,
  });
  if (opts.researchId) createParams.set("researchId", opts.researchId);
  return [
    {
      label: "继续搜索相关资料",
      kind: "search",
      href: `/search?q=${encodeURIComponent(opts.goal)}&workspaceId=${opts.workspaceId}`,
    },
    {
      label: "基于机会生成内容",
      kind: "create",
      href: `/create?${createParams.toString()}`,
    },
    {
      label: "回到工作区",
      kind: "workspace",
      href: `/workspace/${opts.workspaceId}`,
    },
  ];
}
