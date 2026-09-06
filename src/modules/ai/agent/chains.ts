/**
 * Four priority Agent chains — real sequential tool calls.
 * 1 social recreate → draft
 * 2 research → create
 * 3 customer insight → create
 * 4 product diagnosis → strategy content
 */

import type { CreationIntentKind } from "@/modules/intent/creation-intent";
import {
  execCreateProject,
  execCreateWorkspace,
  execCustomerInsight,
  execGenerateText,
  execIngestSocial,
  execProduceVideo,
  execProductDiagnosis,
  execSearxngHint,
  execStartResearch,
  extractLinkFromGoal,
  type AgentExecResult,
  type AgentMemory,
} from "@/modules/ai/agent/tool-executors";

export type AgentChainId =
  | "social_recreate_draft"
  | "research_then_create"
  | "customer_insight_create"
  | "commerce_diagnosis_create"
  | "workspace_to_video";

export type ChainStepResult = {
  stepId: string;
  title: string;
  toolId: string;
} & AgentExecResult;

export type ChainRunResult = {
  chainId: AgentChainId;
  chainLabel: string;
  memory: AgentMemory;
  steps: ChainStepResult[];
  stopped: boolean;
  stopReason?: string;
  primaryHref?: string;
  confirmRequired?: boolean;
  jobId?: string;
  estimate?: AgentExecResult["estimate"];
};

const CHAIN_LABELS: Record<AgentChainId, string> = {
  social_recreate_draft: "社交链接二创 → 文案草稿",
  research_then_create: "深入研究 → 创作",
  customer_insight_create: "客户洞察 → 内容",
  commerce_diagnosis_create: "商品诊断 → 策略内容",
  workspace_to_video: "工作区 / 目标 → 一键成片",
};

export function chainIdForIntent(
  kind: CreationIntentKind
): AgentChainId | null {
  switch (kind) {
    case "social_recreate":
      return "social_recreate_draft";
    case "research_then_create":
      return "research_then_create";
    case "customer_insight":
      return "customer_insight_create";
    case "commerce_strategy":
      return "commerce_diagnosis_create";
    case "short_video":
    case "multimodal":
      return "workspace_to_video";
    default:
      return null;
  }
}

async function runSteps(
  chainId: AgentChainId,
  memory: AgentMemory,
  defs: Array<{
    stepId: string;
    title: string;
    toolId: string;
    run: () => Promise<AgentExecResult>;
  }>
): Promise<ChainRunResult> {
  const steps: ChainStepResult[] = [];
  for (const def of defs) {
    const result = await def.run();
    steps.push({
      stepId: def.stepId,
      title: def.title,
      toolId: def.toolId,
      ...result,
    });
    if (
      result.status === "confirm_required" ||
      result.status === "login_required" ||
      result.status === "needs_input" ||
      result.status === "error"
    ) {
      return {
        chainId,
        chainLabel: CHAIN_LABELS[chainId],
        memory,
        steps,
        stopped: true,
        stopReason: result.message,
        primaryHref:
          result.href ||
          (memory.projectId ? `/create/${memory.projectId}` : undefined),
        confirmRequired: result.status === "confirm_required",
        jobId: result.jobId,
        estimate: result.estimate,
      };
    }
    if (result.status === "blocked") {
      // Continue when possible (e.g. research blocked but create can proceed)
      continue;
    }
  }

  const href = memory.projectId
    ? `/create/${memory.projectId}`
    : steps.map((s) => s.href).filter(Boolean).pop();

  return {
    chainId,
    chainLabel: CHAIN_LABELS[chainId],
    memory,
    steps,
    stopped: false,
    primaryHref: href,
  };
}

export async function runAgentChain(
  chainId: AgentChainId,
  input: {
    goal: string;
    confirm?: boolean;
    jobId?: string;
    linkUrl?: string;
    workspaceId?: string;
  }
): Promise<ChainRunResult> {
  const memory: AgentMemory = {
    goal: input.goal.trim(),
    confirm: input.confirm,
    jobId: input.jobId,
    linkUrl: input.linkUrl || extractLinkFromGoal(input.goal) || undefined,
    workspaceId: input.workspaceId,
  };

  if (chainId === "workspace_to_video") {
    memory.contentType = "short_video";
    memory.platform = memory.platform || "douyin";
    return runSteps(chainId, memory, [
      {
        stepId: "v1_produce",
        title: "一键成片（文案→分镜→AI补镜→导出）",
        toolId: "create.video",
        run: () => execProduceVideo(memory),
      },
    ]);
  }

  if (chainId === "social_recreate_draft") {
    return runSteps(chainId, memory, [
      {
        stepId: "s1_ingest",
        title: "解析社交链接",
        toolId: "create.social_recreate",
        run: () => execIngestSocial(memory),
      },
      {
        stepId: "s2_project",
        title: "创建二创项目",
        toolId: "create.project",
        run: () =>
          execCreateProject(memory, {
            startMode: "link",
            title: memory.ingestTitle,
          }),
      },
      {
        stepId: "s3_generate",
        title: "生成文案草稿",
        toolId: "create.generate_text",
        run: () => execGenerateText(memory),
      },
    ]);
  }

  if (chainId === "research_then_create") {
    return runSteps(chainId, memory, [
      {
        stepId: "r1_workspace",
        title: "创建工作区",
        toolId: "workspace.create",
        run: () => execCreateWorkspace(memory),
      },
      {
        stepId: "r2_search",
        title: "检索证据",
        toolId: "search.web",
        run: () => execSearxngHint(memory),
      },
      {
        stepId: "r3_research",
        title: "深入研究",
        toolId: "workspace.research",
        run: () => execStartResearch(memory),
      },
      {
        stepId: "r4_project",
        title: "创建创作项目",
        toolId: "create.project",
        run: () => {
          memory.contentType = memory.contentType || "copy";
          memory.platform = memory.platform || "xiaohongshu";
          return execCreateProject(memory, { startMode: "workspace" });
        },
      },
      {
        stepId: "r5_generate",
        title: "生成文案草稿",
        toolId: "create.generate_text",
        run: () => execGenerateText(memory),
      },
    ]);
  }

  if (chainId === "customer_insight_create") {
    return runSteps(chainId, memory, [
      {
        stepId: "c1_insight",
        title: "客户洞察（DEMO 样本）",
        toolId: "commerce.customer",
        run: () => execCustomerInsight(memory),
      },
      {
        stepId: "c2_project",
        title: "创建内容项目",
        toolId: "create.project",
        run: () => execCreateProject(memory, { startMode: "commerce" }),
      },
      {
        stepId: "c3_generate",
        title: "生成 FAQ / 卖点文案",
        toolId: "create.generate_text",
        run: () => execGenerateText(memory),
      },
    ]);
  }

  // commerce_diagnosis_create
  return runSteps(chainId, memory, [
    {
      stepId: "d1_diagnosis",
      title: "商品诊断",
      toolId: "commerce.strategy",
      run: () => execProductDiagnosis(memory),
    },
    {
      stepId: "d2_project",
      title: "创建策略内容项目",
      toolId: "create.project",
      run: () => execCreateProject(memory, { startMode: "commerce" }),
    },
    {
      stepId: "d3_generate",
      title: "生成策略文案",
      toolId: "create.generate_text",
      run: () => execGenerateText(memory),
    },
  ]);
}

export { CHAIN_LABELS };
