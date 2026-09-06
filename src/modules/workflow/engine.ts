/**
 * V4.1 — Intelligent Workflow Engine
 * Plan → Execute → Review → Complete
 * Routes to existing services — no Agent marketplace.
 */

import { estimateCredits } from "@/modules/account/credits/service";
import { resolveTaskContext } from "@/modules/personal-ai/resolve-service";
import { getWorkflow, listWorkflows, saveWorkflow } from "./store";
import type {
  WorkflowRecord,
  WorkflowStep,
  WorkflowStepKind,
  WorkflowUserAction,
} from "./types";

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const HIGH_CREDIT_KINDS = new Set<WorkflowStepKind>([
  "research",
  "creation",
  "publish",
]);

function stepRequiresConfirm(kind: WorkflowStepKind): boolean {
  if (kind === "publish") return true;
  if (HIGH_CREDIT_KINDS.has(kind)) {
    const est = estimateCredits(
      kind === "research"
        ? "research"
        : kind === "creation"
          ? "generateText"
          : "generateText"
    );
    return Boolean(est.available && (est.estimatedCredits ?? 0) >= 8);
  }
  return false;
}

/**
 * Auto-plan steps for complex goals. Deterministic planner — not Fake AI.
 */
export function autoPlanSteps(goal: string): WorkflowStep[] {
  const g = goal.toLowerCase();
  const kinds: Array<{ kind: WorkflowStepKind; title: string; description: string }> =
    [];

  const wantsCommerce =
    /销量|转化|acos|广告|商品|listing|amazon|电商|利润|诊断/.test(g);
  const wantsResearch = /研究|竞品|市场|分析|为什么|原因/.test(g);
  const wantsSearch = /搜索|找资料|调研/.test(g) || wantsResearch;
  const wantsCreate =
    /内容|文案|创作|营销|小红书|标题|hook|方案|生成/.test(g) || wantsCommerce;
  const wantsQa = wantsCreate;
  const wantsPublish = /发布|上线|publish/.test(g);

  if (wantsCommerce) {
    kinds.push({
      kind: "commerce_diagnose",
      title: "Commerce 诊断",
      description: "基于已有 Commerce 数据做诊断（无数据则如实说明）",
    });
  }
  if (wantsResearch) {
    kinds.push({
      kind: "research",
      title: "深度研究",
      description: "调用 Research 能力收集证据与结论",
    });
  }
  if (wantsSearch && !wantsResearch) {
    kinds.push({
      kind: "search",
      title: "搜索资料",
      description: "检索相关公开信息",
    });
  }
  if (wantsCreate) {
    kinds.push({
      kind: "creation",
      title: "内容创作",
      description: "基于上下文生成营销/内容方案",
    });
  }
  if (wantsQa) {
    kinds.push({
      kind: "qa",
      title: "内容质检",
      description: "对生成内容进行 QA",
    });
  }
  if (wantsPublish) {
    kinds.push({
      kind: "publish",
      title: "发布",
      description: "高风险外部操作，必须用户确认",
    });
  }

  if (kinds.length === 0) {
    kinds.push(
      {
        kind: "research",
        title: "研究拆解",
        description: "理解目标并收集依据",
      },
      {
        kind: "creation",
        title: "产出方案",
        description: "基于研究结果产出可执行内容",
      },
      {
        kind: "qa",
        title: "质检",
        description: "检查产出质量",
      }
    );
  }

  return kinds.map((k) => ({
    id: uid("step"),
    kind: k.kind,
    title: k.title,
    description: k.description,
    status: "pending" as const,
    requiresConfirm: stepRequiresConfirm(k.kind),
    confirmed: false,
    resultSummary: null,
    error: null,
  }));
}

export async function createWorkflow(opts: {
  userId: string;
  goal: string;
}): Promise<WorkflowRecord> {
  const steps = autoPlanSteps(opts.goal);
  const now = new Date().toISOString();
  const wf: WorkflowRecord = {
    id: uid("wf"),
    userId: opts.userId,
    goal: opts.goal,
    phase: "plan",
    status: "active",
    steps,
    currentStepIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
  await saveWorkflow(wf);
  return wf;
}

export async function getUserWorkflow(userId: string, id: string) {
  return getWorkflow(userId, id);
}

export async function listUserWorkflows(userId: string) {
  return listWorkflows(userId);
}

/**
 * Execute current step using existing capability labels — does not invent Agent results.
 * Marks needs_confirm for high-risk; records honest summaries.
 */
export async function executeCurrentStep(
  userId: string,
  workflowId: string
): Promise<WorkflowRecord> {
  const wf = await getWorkflow(userId, workflowId);
  if (!wf) throw new Error("工作流不存在");
  if (wf.status === "paused") throw new Error("工作流已暂停");
  if (wf.status === "completed") return wf;

  const idx = wf.currentStepIndex;
  const step = wf.steps[idx];
  if (!step) {
    wf.phase = "complete";
    wf.status = "completed";
    wf.updatedAt = new Date().toISOString();
    await saveWorkflow(wf);
    return wf;
  }

  if (step.requiresConfirm && !step.confirmed) {
    step.status = "needs_confirm";
    wf.phase = "review";
    wf.updatedAt = new Date().toISOString();
    await saveWorkflow(wf);
    return wf;
  }

  wf.phase = "execute";
  step.status = "running";
  wf.updatedAt = new Date().toISOString();
  await saveWorkflow(wf);

  try {
    const ctx = await resolveTaskContext({ userId, task: wf.goal });
    // Honest execution stub: wires context + capability intent without Fake AI success.
    // Real AI runs via existing Research/Creation/QA APIs when providers configured.
    const summary = buildHonestStepResult(step, ctx.contextSummary, ctx.message);
    step.resultSummary = summary.text;
    step.status = summary.ok ? "completed" : "failed";
    step.error = summary.ok ? null : summary.text;

    if (summary.ok) {
      const next = idx + 1;
      if (next >= wf.steps.length) {
        wf.phase = "complete";
        wf.status = "completed";
        wf.currentStepIndex = idx;
      } else {
        wf.currentStepIndex = next;
        wf.phase = "review";
      }
    }
  } catch (err) {
    step.status = "failed";
    step.error = err instanceof Error ? err.message : "步骤执行失败";
  }

  wf.updatedAt = new Date().toISOString();
  await saveWorkflow(wf);
  return wf;
}

function buildHonestStepResult(
  step: WorkflowStep,
  contextSummary: string,
  contextMessage: string
): { ok: boolean; text: string } {
  const hasCtx = Boolean(contextSummary?.trim());
  switch (step.kind) {
    case "commerce_diagnose":
      return {
        ok: true,
        text: hasCtx
          ? `已准备跨境诊断上下文。${contextMessage} 可在跨境商业模块继续查看。`
          : "未找到可用经营或工作区数据。可先使用演示店，或导入诊断结果。",
      };
    case "research":
      return {
        ok: true,
        text: `研究步骤已规划。请通过 /api/research 触发真实 Deep Research（依赖 Provider）。指令：${step.editedInstruction || step.description}`,
      };
    case "search":
      return {
        ok: true,
        text: "搜索步骤已就绪，可继续检索相关来源。",
      };
    case "creation":
      return {
        ok: true,
        text: `创作步骤已就绪。上下文：${contextMessage}。请通过 Creation API 生成真实内容。`,
      };
    case "qa":
      return {
        ok: true,
        text: "质检步骤已就绪。请通过 /api/qa 对真实 Creation 执行 QA。",
      };
    case "publish":
      return {
        ok: true,
        text: "发布需已连接平台且用户确认。未配置 OAuth 时不得假装已发布。",
      };
    default:
      return { ok: true, text: `步骤 ${step.kind} 已记录。` };
  }
}

export async function applyWorkflowAction(opts: {
  userId: string;
  workflowId: string;
  action: WorkflowUserAction;
  stepId?: string;
  editedInstruction?: string;
  confirmRisk?: boolean;
}): Promise<WorkflowRecord> {
  const wf = await getWorkflow(opts.userId, opts.workflowId);
  if (!wf) throw new Error("工作流不存在");

  const step =
    (opts.stepId
      ? wf.steps.find((s) => s.id === opts.stepId)
      : wf.steps[wf.currentStepIndex]) ?? null;

  switch (opts.action) {
    case "pause":
      wf.status = "paused";
      if (step) step.status = "paused";
      break;
    case "resume":
      wf.status = "active";
      if (step && step.status === "paused") step.status = "pending";
      break;
    case "approve":
      wf.status = "active";
      wf.phase = "execute";
      if (step && step.status === "pending") step.status = "approved";
      break;
    case "skip":
      if (step) {
        step.status = "skipped";
        wf.currentStepIndex = Math.min(
          wf.currentStepIndex + 1,
          wf.steps.length - 1
        );
      }
      break;
    case "edit":
      if (step && opts.editedInstruction != null) {
        step.editedInstruction = opts.editedInstruction;
        step.status = "pending";
      }
      break;
    case "retry":
      if (step) {
        step.status = "pending";
        step.error = null;
        step.resultSummary = null;
      }
      wf.status = "active";
      break;
    case "confirm_risk":
      if (!opts.confirmRisk) {
        throw new Error("高风险操作需要明确确认");
      }
      if (step) {
        step.confirmed = true;
        step.status = "approved";
      }
      break;
    default:
      throw new Error("未知操作");
  }

  wf.updatedAt = new Date().toISOString();
  await saveWorkflow(wf);
  return wf;
}
