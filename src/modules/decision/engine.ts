/**
 * V4.2 — Decision Engine
 * Builds Situation / Evidence / Options from real user data only.
 */

import { fileStoreListProjects } from "@/lib/creation/file-store";
import { fileStoreListWorkspaces } from "@/lib/workspace/file-store";
import { listActiveMemories } from "@/modules/memory/services/memory-service";
import { resolveTaskContext } from "@/modules/personal-ai/resolve-service";
import { saveDecision } from "./store";
import type {
  DecisionDomain,
  DecisionEvidence,
  DecisionOption,
  DecisionResult,
} from "./types";

function uid() {
  return `dec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectDomain(goal: string): DecisionDomain {
  const g = goal.toLowerCase();
  if (/销量|转化|acos|广告|amazon|电商|利润/.test(g)) return "commerce";
  if (/内容|文案|标题|hook|小红书|创作|发布/.test(g)) return "content";
  if (/产品|功能|roadmap|定价/.test(g)) return "product";
  return "general";
}

export async function buildDecision(opts: {
  userId: string;
  goal: string;
  domain?: DecisionDomain;
}): Promise<DecisionResult> {
  const domain = opts.domain ?? detectDomain(opts.goal);
  const ctx = await resolveTaskContext({
    userId: opts.userId,
    task: opts.goal,
  });

  const evidence: DecisionEvidence[] = [];
  const dataGaps: string[] = [];

  for (const s of ctx.sources) {
    evidence.push({
      id: `ev_${s.kind}_${s.id}`,
      sourceKind:
        s.kind === "research"
          ? "research"
          : s.kind === "memory"
            ? "memory"
            : s.kind === "asset"
              ? "assets"
              : s.kind === "creation"
                ? "creation"
                : "search",
      sourceId: s.id,
      text: `${s.title}${s.snippet ? ` — ${s.snippet}` : ""}`,
      verified: true,
    });
  }

  const workspaces = await fileStoreListWorkspaces(opts.userId);
  const creations = await fileStoreListProjects(opts.userId);
  const memories = await listActiveMemories(opts.userId);

  if (domain === "commerce") {
    dataGaps.push(
      "未接入实时销售/竞品 API 时，不得编造销量、市场份额或用户数据。"
    );
  }
  if (!workspaces.length) dataGaps.push("暂无 Workspace 证据");
  if (!creations.length && domain === "content") {
    dataGaps.push("暂无历史 Creation / Performance 证据");
  }
  if (!memories.length) dataGaps.push("暂无已确认 Memory（或 Memory 已关闭）");

  if (evidence.length === 0) {
    evidence.push({
      id: "ev_gap",
      sourceKind: "search",
      sourceId: null,
      text: "当前没有可验证的用户侧证据。决策将仅给出结构性选项，不引用虚构数据。",
      verified: false,
    });
  }

  const options: DecisionOption[] = [
    {
      id: "A",
      title: domain === "commerce" ? "先诊断再优化投放" : "稳健迭代现有方案",
      pros: ["风险较低", "可复用已有上下文"],
      risks: ["见效可能较慢"],
      costNote: "中低 Credits（Research / 小幅 Creation）",
      expectedEffect: "基于真实证据小步改进，避免盲目改版",
    },
    {
      id: "B",
      title: domain === "content" ? "多版本创作 + QA" : "加深研究后决策",
      pros: ["信息更充分", "可对比多方案"],
      risks: ["Credits 消耗更高", "耗时更长"],
      costNote: "中高 Credits（Research + Creation + QA）",
      expectedEffect: "有证据支撑后再产出内容/策略",
    },
    {
      id: "C",
      title: "暂缓执行，补齐数据",
      pros: ["避免在 Insufficient Data 下误判"],
      risks: ["短期无产出"],
      costNote: "几乎无消耗",
      expectedEffect: "补齐 Commerce / Performance / Research 后再决策",
    },
  ];

  const hasVerified = evidence.some((e) => e.verified);
  const recommendation = !hasVerified
    ? "证据不足：推荐 Option C，先补齐真实数据，禁止基于虚构市场数据行动。"
    : domain === "commerce"
      ? "推荐 Option A：先用现有 Commerce/工作区证据做诊断，再决定是否加大 Research/Creation 投入。"
      : "推荐 Option B：在已有上下文上做多版本创作与质检，用真实反馈再优化。";

  const result: DecisionResult = {
    id: uid(),
    userId: opts.userId,
    domain,
    goal: opts.goal,
    situation: hasVerified
      ? `目标「${opts.goal}」。已找到 ${evidence.filter((e) => e.verified).length} 条可验证证据；Memory ${ctx.memoryEnabled ? "已启用" : "已关闭"}。`
      : `目标「${opts.goal}」。当前缺少可验证证据，无法给出数据驱动的销量/市场断言。`,
    evidence,
    options,
    recommendation,
    expectedImpact: hasVerified
      ? "在真实上下文上推进，预期降低无效创作/投放；具体量化影响取决于后续真实 Performance。"
      : "在补齐数据前，预期影响无法量化（Insufficient Data）。",
    risk: dataGaps.length
      ? `主要风险：${dataGaps.join("；")}`
      : "证据仍可能不完整，重大外部操作需用户确认。",
    nextAction: !hasVerified
      ? "收集 Workspace / Research / Commerce 真实数据后重新决策"
      : domain === "commerce"
        ? "进入 Commerce 诊断 → Research → Creation 工作流"
        : "进入 Creation → QA；如需发布须 User Confirm",
    dataGaps,
    createdAt: new Date().toISOString(),
  };

  await saveDecision(result);
  return result;
}
