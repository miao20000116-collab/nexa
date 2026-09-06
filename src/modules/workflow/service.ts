/**
 * V4.1 — Intelligent Workflow Engine
 * Plan → Execute → Review → Complete (no Agent marketplace)
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "workflows");

export type WorkflowStepKind =
  | "commerce_diagnose"
  | "research"
  | "search"
  | "creation"
  | "qa"
  | "publish";

export type StepStatus =
  | "pending"
  | "approved"
  | "running"
  | "done"
  | "skipped"
  | "failed"
  | "paused"
  | "awaiting_confirm";

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  label: string;
  status: StepStatus;
  requiresConfirm?: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface Workflow {
  id: string;
  userId: string;
  goal: string;
  status: "planned" | "executing" | "review" | "completed" | "paused" | "failed";
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function wfPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export function planWorkflow(goal: string): WorkflowStep[] {
  const g = goal.toLowerCase();
  const steps: WorkflowStep[] = [];
  if (/销量|下降|amazon|商品|转化|cvr|广告/.test(g)) {
    steps.push({
      id: uid("step"),
      kind: "commerce_diagnose",
      label: "Commerce 诊断",
      status: "pending",
    });
  }
  steps.push({
    id: uid("step"),
    kind: "research",
    label: "深入研究",
    status: "pending",
  });
  steps.push({
    id: uid("step"),
    kind: "search",
    label: "补充搜索",
    status: "pending",
  });
  steps.push({
    id: uid("step"),
    kind: "creation",
    label: "生成营销内容",
    status: "pending",
  });
  steps.push({
    id: uid("step"),
    kind: "qa",
    label: "内容质检",
    status: "pending",
  });
  if (/发布|publish/.test(g)) {
    steps.push({
      id: uid("step"),
      kind: "publish",
      label: "发布（需确认）",
      status: "pending",
      requiresConfirm: true,
    });
  }
  return steps;
}

export async function createWorkflow(input: {
  userId: string;
  goal: string;
}): Promise<Workflow> {
  await ensureDir();
  const now = new Date().toISOString();
  const wf: Workflow = {
    id: uid("wf"),
    userId: input.userId,
    goal: input.goal,
    status: "planned",
    steps: planWorkflow(input.goal),
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(wfPath(wf.id), JSON.stringify(wf, null, 2));
  return wf;
}

export async function getWorkflow(
  id: string,
  userId: string
): Promise<Workflow | null> {
  try {
    const raw = await fs.readFile(wfPath(id), "utf-8");
    const wf = JSON.parse(raw) as Workflow;
    return wf.userId === userId ? wf : null;
  } catch {
    return null;
  }
}

async function save(wf: Workflow) {
  wf.updatedAt = new Date().toISOString();
  await fs.writeFile(wfPath(wf.id), JSON.stringify(wf, null, 2));
}

export async function controlWorkflow(input: {
  userId: string;
  workflowId: string;
  action: "approve" | "pause" | "skip" | "retry" | "execute_next";
  stepId?: string;
  confirm?: boolean;
}): Promise<Workflow> {
  const wf = await getWorkflow(input.workflowId, input.userId);
  if (!wf) throw new Error("工作流不存在");

  if (input.action === "pause") {
    wf.status = "paused";
    await save(wf);
    return wf;
  }

  const step =
    (input.stepId
      ? wf.steps.find((s) => s.id === input.stepId)
      : wf.steps.find(
          (s) =>
            s.status === "pending" ||
            s.status === "approved" ||
            s.status === "failed" ||
            s.status === "awaiting_confirm"
        )) || null;

  if (!step) {
    wf.status = "completed";
    await save(wf);
    return wf;
  }

  if (input.action === "skip") {
    step.status = "skipped";
    await save(wf);
    return wf;
  }

  if (input.action === "approve") {
    step.status = "approved";
    wf.status = "executing";
    await save(wf);
    return wf;
  }

  // execute_next / retry
  if (step.requiresConfirm && !input.confirm) {
    step.status = "awaiting_confirm";
    step.error = null;
    step.result = { message: "高风险动作（发布/高 Credits）需要用户确认" };
    wf.status = "review";
    await save(wf);
    return wf;
  }

  step.status = "running";
  wf.status = "executing";
  await save(wf);

  try {
    if (step.kind === "commerce_diagnose") {
      const { demoMetricsForPeriod, detectAnomalies } = await import(
        "@/modules/commerce/intelligence/trends"
      );
      const cmp = demoMetricsForPeriod("7d");
      step.result = { isDemo: true, anomalies: detectAnomalies(cmp), cmp };
      step.status = "done";
    } else if (step.kind === "research") {
      const { createWorkspace, createResearchJob } = await import(
        "@/modules/workspace/services/workspace-service"
      );
      const ws = await createWorkspace(undefined, wf.goal);
      const job = await createResearchJob({
        workspaceId: ws.id,
        goal: wf.goal,
        scope: "web",
        timeRange: "month",
        reportType: "full",
      });
      step.result = { workspaceId: ws.id, researchJobId: job.id, status: job.status };
      step.status =
        job.status === "failed" || job.status === "blocked_ai_unavailable"
          ? "failed"
          : "done";
      if (step.status === "failed") step.error = job.errorCode || job.status;
    } else if (step.kind === "search") {
      step.result = {
        href: `/search?q=${encodeURIComponent(wf.goal)}`,
        message: "已规划搜索步骤，请打开搜索查看真实结果",
      };
      step.status = "done";
    } else if (step.kind === "creation") {
      const { createProject } = await import(
        "@/modules/create/services/creation-service"
      );
      const project = await createProject({
        goal: wf.goal,
        contentType: "social_post",
        platform: "xiaohongshu",
        startMode: "idea",
      });
      step.result = { projectId: project.id };
      step.status = "done";
    } else if (step.kind === "qa") {
      step.result = {
        message: "请在创作页对内容执行 QA（真实 Provider）",
        href: step.result?.projectId
          ? `/create/${step.result.projectId}`
          : "/create",
      };
      step.status = "done";
    } else if (step.kind === "publish") {
      step.result = {
        message: "发布需走真实 OAuth/Publish API；未配置则诚实阻断",
        href: "/publish",
      };
      step.status = "done";
    }
  } catch (err) {
    step.status = "failed";
    step.error = err instanceof Error ? err.message : "step_failed";
  }

  const allDone = wf.steps.every(
    (s) =>
      s.status === "done" || s.status === "skipped" || s.status === "failed"
  );
  if (allDone) {
    wf.status = wf.steps.some((s) => s.status === "failed")
      ? "failed"
      : "completed";
  }
  await save(wf);
  return wf;
}
