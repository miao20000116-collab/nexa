/**
 * Creation Agent — intent → plan → real chain execution (4 priority paths).
 * Never fakes MCP / model success; confirm_required stops the loop.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  classifyCreationIntent,
  CREATION_INTENT_LABELS,
  type CreationIntentKind,
  type CreationIntentResult,
} from "@/modules/intent/creation-intent";
import { routeUserQuery } from "@/modules/intent/entry-router";
import {
  listCreationAgentTools,
  toolsForCreationIntent,
  type AgentTool,
} from "@/modules/ai/agent/tool-registry";
import {
  chainIdForIntent,
  runAgentChain,
  CHAIN_LABELS,
  type AgentChainId,
  type ChainRunResult,
} from "@/modules/ai/agent/chains";
import { extractLinkFromGoal } from "@/modules/ai/agent/tool-executors";
import { detectSocialLink } from "@/lib/social-link";
import {
  selectCommerceSkills,
  type AppliedKnowledgeSummary,
} from "@/modules/commerce/skills";

export type AgentPlanStep = {
  id: string;
  order: number;
  title: string;
  tool: AgentTool;
  action: "run" | "navigate" | "skip";
  note?: string;
};

export type CreationAgentPlan = {
  goal: string;
  entryIntent: string;
  creationIntent: CreationIntentResult;
  intentLabel: string;
  chainId: AgentChainId | null;
  chainLabel: string | null;
  summary: string;
  steps: AgentPlanStep[];
  primaryHref: string;
  readyCount: number;
  blockedCount: number;
  missingMcp: string[];
  /** Knowledge packs selected for commerce reasoning, not callable tools. */
  appliedKnowledge?: AppliedKnowledgeSummary | null;
};

export type CreationAgentRunResult = {
  plan: CreationAgentPlan;
  executed: Array<{
    stepId: string;
    status: string;
    message: string;
    href?: string;
    toolId?: string;
  }>;
  chain?: ChainRunResult;
  confirmRequired?: boolean;
  jobId?: string;
  estimate?: {
    available: boolean;
    estimatedCredits: number | null;
    message?: string;
  };
  projectId?: string;
  primaryHref?: string;
  projectHints: {
    goal: string;
    brief: string;
    platform?: string;
    contentType?: string;
    startMode?: string;
  };
};

function buildPrimaryHref(
  kind: CreationIntentKind,
  steps: AgentPlanStep[],
  chainId: AgentChainId | null
): string {
  if (chainId === "social_recreate_draft") return "/create?mode=link";
  if (chainId === "research_then_create") return "/workspace";
  if (chainId === "customer_insight_create")
    return "/commerce/amazon/customer";
  if (chainId === "commerce_diagnosis_create")
    return "/commerce/amazon/products";
  const nav = steps.find((s) => s.action === "navigate" && s.tool.href);
  if (nav?.tool.href) return nav.tool.href;
  if (kind === "image_cover") return "/create/image";
  return "/create?mode=idea";
}

function chainPlanSteps(chainId: AgentChainId, goal: string): AgentPlanStep[] {
  const catalog = listCreationAgentTools();
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const hasLink = Boolean(extractLinkFromGoal(goal) || detectSocialLink(goal));

  const defs: Array<{
    toolId: string;
    title: string;
    action: AgentPlanStep["action"];
    note?: string;
  }> =
    chainId === "workspace_to_video"
      ? [
          {
            toolId: "create.video",
            title: "一键成片（无素材时 AI 补镜）",
            action: "run",
            note: "抓取工作区 → 文案 → 分镜 → 即梦补镜 → 导出",
          },
        ]
      : chainId === "social_recreate_draft"
      ? [
          {
            toolId: "create.social_recreate",
            title: "解析社交链接",
            action: hasLink ? "run" : "navigate",
            note: hasLink
              ? "将解析元数据（不下载原片）"
              : "需要粘贴抖音 / 小红书 / TikTok / X 链接",
          },
          {
            toolId: "create.generate_text",
            title: "创建项目并生成文案草稿",
            action: hasLink ? "run" : "navigate",
          },
        ]
      : chainId === "research_then_create"
        ? [
            {
              toolId: "workspace.research",
              title: "建工作区 + 深入研究",
              action: "run",
              note: "研究需确认 Credits；未完成时也会先建项目",
            },
            {
              toolId: "search.web",
              title: "检索证据",
              action: process.env.SEARXNG_BASE_URL ? "run" : "skip",
              note: process.env.SEARXNG_BASE_URL
                ? undefined
                : "SearXNG 未配置",
            },
            {
              toolId: "create.generate_text",
              title: "带研究上下文生成文案",
              action: "run",
            },
          ]
        : chainId === "customer_insight_create"
          ? [
              {
                toolId: "commerce.customer",
                title: "客户洞察（DEMO 样本）",
                action: "run",
                note: "无粘贴评价时使用 DEMO 样本",
              },
              {
                toolId: "create.generate_text",
                title: "生成 FAQ / 卖点文案",
                action: "run",
              },
            ]
          : [
              {
                toolId: "commerce.strategy",
                title: "商品诊断（演示店）",
                action: "run",
              },
              {
                toolId: "create.generate_text",
                title: "生成策略内容",
                action: "run",
              },
            ];

  return defs.map((d, i) => {
    const tool = byId.get(d.toolId) || {
      id: d.toolId,
      kind: "service" as const,
      label: d.title,
      description: "",
      status: "ready" as const,
    };
    return {
      id: `step_${i + 1}_${d.toolId}`,
      order: i + 1,
      title: d.title,
      tool,
      action: d.action,
      note: d.note,
    };
  });
}

function selectPlanKnowledge(
  kind: CreationIntentKind,
  goal: string
): AppliedKnowledgeSummary | null {
  if (kind !== "commerce_strategy" && kind !== "customer_insight") {
    return null;
  }

  const isTikTok = /tiktok\s*shop|tiktok/i.test(goal);
  const task =
    kind === "customer_insight"
      ? "customer_review_analysis"
      : /广告|acos|roas|投放/i.test(goal)
        ? "advertising_analysis"
        : /listing|标题|五点|关键词/i.test(goal)
          ? "listing_optimization"
          : "product_research";

  return selectCommerceSkills({
    platform: isTikTok ? "TikTok Shop" : "Amazon",
    marketplace: isTikTok ? "TikTok Shop US" : "Amazon US",
    country: "US",
    task,
  });
}

export function planCreationAgent(goal: string): CreationAgentPlan {
  const trimmed = goal.trim();
  const entry = routeUserQuery(trimmed);
  const creationIntent = classifyCreationIntent(trimmed);
  const chainId = chainIdForIntent(creationIntent.kind);
  const catalog = listCreationAgentTools();
  const byId = new Map(catalog.map((t) => [t.id, t]));

  let steps: AgentPlanStep[];
  if (chainId) {
    steps = chainPlanSteps(chainId, trimmed);
  } else {
    const toolIds = toolsForCreationIntent(creationIntent.kind);
    steps = toolIds.map((id, i) => {
      const tool = byId.get(id) || {
        id,
        kind: "service" as const,
        label: id,
        description: "",
        status: "unavailable" as const,
        statusReason: "未知工具",
      };
      let action: AgentPlanStep["action"] = "run";
      let note: string | undefined;
      if (tool.status === "unavailable") {
        action = "skip";
        note = tool.statusReason || "不可用";
      } else if (tool.status === "needs_input" || tool.href) {
        action = "navigate";
        note = tool.statusReason || "需在对应页面完成输入后执行";
      }
      return {
        id: `step_${i + 1}_${tool.id}`,
        order: i + 1,
        title: tool.label,
        tool,
        action,
        note,
      };
    });
  }

  const readyCount = steps.filter((s) => s.action !== "skip").length;
  const blockedCount = steps.filter((s) => s.action === "skip").length;
  const missingMcp = steps
    .filter((s) => s.tool.kind === "mcp" && s.action === "skip")
    .map((s) => s.tool.label);
  const appliedKnowledge = selectPlanKnowledge(creationIntent.kind, trimmed);

  const summary = [
    `识别意图：${CREATION_INTENT_LABELS[creationIntent.kind]}（${Math.round(creationIntent.confidence * 100)}%）`,
    chainId
      ? `执行链路：${CHAIN_LABELS[chainId]}`
      : `入口路由：${entry.intent}（规划深链，非四条主链路）`,
    `计划 ${steps.length} 步 · 可执行 ${readyCount} · 跳过 ${blockedCount}`,
    appliedKnowledge?.summaryLine || null,
    missingMcp.length ? `MCP 跳过：${missingMcp.join("、")}` : null,
  ]
    .filter(Boolean)
    .join("。");

  return {
    goal: trimmed,
    entryIntent: entry.intent,
    creationIntent,
    intentLabel: CREATION_INTENT_LABELS[creationIntent.kind],
    chainId,
    chainLabel: chainId ? CHAIN_LABELS[chainId] : null,
    summary,
    steps,
    primaryHref: buildPrimaryHref(creationIntent.kind, steps, chainId),
    readyCount,
    blockedCount,
    missingMcp,
    appliedKnowledge,
  };
}

export async function enrichPlanSummary(
  plan: CreationAgentPlan
): Promise<string> {
  bootstrapAIProviders();
  if (!AIGateway.isAvailable("summarize") && !AIGateway.isAvailable("generateText")) {
    return plan.summary;
  }
  try {
    const stepsText = plan.steps
      .map(
        (s) =>
          `${s.order}. ${s.title} [${s.tool.kind}/${s.action}] ${s.note || s.tool.status}`
      )
      .join("\n");
    const text = await AIGateway.summarize(
      `用户目标：${plan.goal}\n意图：${plan.intentLabel}\n链路：${plan.chainLabel || "无"}\n步骤：\n${stepsText}`,
      "用中文 2–3 句说明 Agent 将真实调用哪些服务、何处需确认 Credits。若有已应用知识，说明它是经营判断依据而不是可调用工具。不要假装已生成成片。"
    );
    const s = String(text || "").trim();
    return s || plan.summary;
  } catch {
    return plan.summary;
  }
}

export async function runCreationAgent(input: {
  goal: string;
  execute?: boolean;
  enrich?: boolean;
  confirm?: boolean;
  jobId?: string;
  linkUrl?: string;
  workspaceId?: string;
}): Promise<CreationAgentRunResult> {
  let plan = planCreationAgent(input.goal);
  if (input.enrich !== false) {
    const summary = await enrichPlanSummary(plan);
    plan = { ...plan, summary };
  }

  const executed: CreationAgentRunResult["executed"] = [];
  let chain: ChainRunResult | undefined;
  let confirmRequired = false;
  let jobId: string | undefined;
  let estimate: CreationAgentRunResult["estimate"];
  let projectId: string | undefined;
  let primaryHref = plan.primaryHref;

  if (input.execute !== false && plan.chainId) {
    chain = await runAgentChain(plan.chainId, {
      goal: input.goal,
      confirm: input.confirm,
      jobId: input.jobId,
      linkUrl: input.linkUrl,
      workspaceId: input.workspaceId,
    });
    for (const s of chain.steps) {
      executed.push({
        stepId: s.stepId,
        status: s.status,
        message: s.message,
        href: s.href,
        toolId: s.toolId,
      });
    }
    confirmRequired = Boolean(chain.confirmRequired);
    jobId = chain.jobId;
    estimate = chain.estimate;
    projectId = chain.memory.projectId;
    if (chain.primaryHref) primaryHref = chain.primaryHref;
    if (projectId) primaryHref = `/create/${projectId}`;
  } else if (input.execute !== false) {
    for (const step of plan.steps) {
      if (step.action === "skip") {
        executed.push({
          stepId: step.id,
          status: "blocked",
          message: step.note || "能力 / MCP 不可用，已跳过",
        });
        continue;
      }
      executed.push({
        stepId: step.id,
        status: "ok",
        message: `请前往：${step.title}`,
        href: step.tool.href || plan.primaryHref,
      });
    }
  }

  const brief = [
    "【Nexa 创作 Agent】",
    plan.summary,
    plan.chainLabel ? `链路：${plan.chainLabel}` : null,
    "",
    "执行结果：",
    ...(executed.length
      ? executed.map(
          (s, i) => `${i + 1}. [${s.status}] ${s.message}`
        )
      : plan.steps.map(
          (s) =>
            `${s.order}. ${s.title} · ${s.action}${
              s.note ? ` · ${s.note}` : ""
            }`
        )),
    "",
    `用户目标：${plan.goal}`,
  ]
    .filter(Boolean)
    .join("\n");

  const hints = plan.creationIntent;
  return {
    plan: { ...plan, primaryHref },
    executed,
    chain,
    confirmRequired,
    jobId,
    estimate,
    projectId,
    primaryHref,
    projectHints: {
      goal: plan.goal,
      brief,
      platform:
        hints.platformHint === "generic" ? undefined : hints.platformHint,
      contentType: hints.contentTypeHint,
      startMode:
        hints.kind === "social_recreate"
          ? "link"
          : hints.kind === "commerce_strategy" ||
              hints.kind === "customer_insight"
            ? "commerce"
            : hints.kind === "research_then_create"
              ? "workspace"
              : "idea",
    },
  };
}
