/**
 * V3.7 — Automation
 * Trigger → Context → AI Task → Review → Action
 * Not an Agent Marketplace. High-risk ops need User Confirmation.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "automation");

export type AutomationKind =
  | "weekly_research"
  | "daily_commerce_check"
  | "weekly_content_suggestions";

export type AutomationStatus =
  | "active"
  | "paused"
  | "running"
  | "failed"
  | "completed"
  | "awaiting_confirmation";

export type JobRunStatus =
  | "queued"
  | "running"
  | "review"
  | "completed"
  | "failed"
  | "paused"
  | "awaiting_confirmation";

export interface AutomationRule {
  id: string;
  userId: string;
  kind: AutomationKind;
  name: string;
  cronLike: "daily" | "weekly";
  context: {
    workspaceId?: string;
    goal?: string;
    productKey?: string;
  };
  requireConfirmFor: Array<"publish" | "payment" | "delete" | "high_credits">;
  status: AutomationStatus;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationJob {
  id: string;
  ruleId: string;
  userId: string;
  status: JobRunStatus;
  trigger: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
  needsConfirmation?: boolean;
  createdAt: string;
  updatedAt: string;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function rulePath(id: string) {
  return path.join(DATA_DIR, `rule_${id}.json`);
}
function jobPath(id: string) {
  return path.join(DATA_DIR, `job_${id}.json`);
}

export async function createAutomationRule(input: {
  userId: string;
  kind: AutomationKind;
  name: string;
  cronLike: "daily" | "weekly";
  context?: AutomationRule["context"];
}): Promise<AutomationRule> {
  await ensureDir();
  const now = new Date().toISOString();
  const next = new Date();
  if (input.cronLike === "daily") next.setDate(next.getDate() + 1);
  else next.setDate(next.getDate() + 7);
  const rule: AutomationRule = {
    id: uid("auto"),
    userId: input.userId,
    kind: input.kind,
    name: input.name,
    cronLike: input.cronLike,
    context: input.context ?? {},
    requireConfirmFor: ["publish", "payment", "delete", "high_credits"],
    status: "active",
    lastRunAt: null,
    nextRunAt: next.toISOString(),
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(rulePath(rule.id), JSON.stringify(rule, null, 2));
  return rule;
}

export async function listAutomationRules(
  userId: string
): Promise<AutomationRule[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const rules: AutomationRule[] = [];
  for (const f of files) {
    if (!f.startsWith("rule_") || !f.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
    const rule = JSON.parse(raw) as AutomationRule;
    if (rule.userId === userId) rules.push(rule);
  }
  return rules.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function pauseAutomation(
  userId: string,
  ruleId: string
): Promise<AutomationRule | null> {
  try {
    const raw = await fs.readFile(rulePath(ruleId), "utf-8");
    const rule = JSON.parse(raw) as AutomationRule;
    if (rule.userId !== userId) return null;
    rule.status = "paused";
    rule.updatedAt = new Date().toISOString();
    await fs.writeFile(rulePath(ruleId), JSON.stringify(rule, null, 2));
    return rule;
  } catch {
    return null;
  }
}

/**
 * Run now: Trigger → Job → AI Task → Result
 * High-credit research requires confirm=true.
 */
export async function runAutomationNow(input: {
  userId: string;
  ruleId: string;
  confirm?: boolean;
}): Promise<AutomationJob> {
  await ensureDir();
  const raw = await fs.readFile(rulePath(input.ruleId), "utf-8");
  const rule = JSON.parse(raw) as AutomationRule;
  if (rule.userId !== input.userId) {
    throw new Error("无权访问该自动化");
  }
  if (rule.status === "paused") {
    throw new Error("自动化已暂停");
  }

  const now = new Date().toISOString();
  const job: AutomationJob = {
    id: uid("ajob"),
    ruleId: rule.id,
    userId: input.userId,
    status: "running",
    trigger: "manual_run_now",
    result: null,
    error: null,
    needsConfirmation: false,
    createdAt: now,
    updatedAt: now,
  };

  // High credits path
  if (
    (rule.kind === "weekly_research" ||
      rule.kind === "weekly_content_suggestions") &&
    !input.confirm
  ) {
    job.status = "awaiting_confirmation";
    job.needsConfirmation = true;
    job.error = null;
    job.result = {
      message: "高 Credits 任务需要用户确认后才会执行",
      requireConfirmFor: rule.requireConfirmFor,
    };
    await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
    return job;
  }

  try {
    if (rule.kind === "weekly_research") {
      const { createWorkspace, createResearchJob } = await import(
        "@/modules/workspace/services/workspace-service"
      );
      let workspaceId = rule.context.workspaceId;
      if (!workspaceId) {
        const ws = await createWorkspace(
          undefined,
          rule.context.goal || rule.name
        );
        workspaceId = ws.id;
      }
      const research = await createResearchJob({
        workspaceId,
        goal: rule.context.goal || rule.name,
        scope: "web",
        timeRange: "month",
        reportType: "full",
      });
      job.status =
        research.status === "failed"
          ? "failed"
          : research.status === "blocked_ai_unavailable"
            ? "failed"
            : "completed";
      job.result = {
        researchJobId: research.id,
        researchStatus: research.status,
        workspaceId,
      };
      if (research.status === "failed" || research.status === "blocked_ai_unavailable") {
        job.error = research.errorCode || research.status;
      }
    } else if (rule.kind === "daily_commerce_check") {
      const { demoMetricsForPeriod, detectAnomalies } = await import(
        "@/modules/commerce/intelligence/trends"
      );
      const cmp = demoMetricsForPeriod("today");
      const anomalies = detectAnomalies(cmp);
      job.status = "completed";
      job.result = {
        isDemo: true,
        periodComparison: cmp,
        anomalies,
        message: "演示店异常检查完成",
      };
    } else {
      // weekly content suggestions — honest if AI unavailable
      const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
      if (!AIGateway.isAvailable("generateText")) {
        job.status = "failed";
        job.error = "AI_CAPABILITY_NOT_CONFIGURED";
        job.result = { message: "AI 未配置，不会假装生成内容建议" };
      } else {
        const out = await AIGateway.generateText(
          {
            system: "你是内容策划助手。给出 3 条简短内容选题建议。用中文。不要编造数据。",
            prompt: rule.context.goal || "跨境电商内容选题",
            temperature: 0.5,
            maxTokens: 600,
          },
          { userId: input.userId, referenceId: job.id }
        );
        job.status = "completed";
        job.result = { suggestions: out.text };
      }
    }
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : "automation_failed";
  }

  job.updatedAt = new Date().toISOString();
  rule.lastRunAt = job.updatedAt;
  rule.updatedAt = job.updatedAt;
  if (job.status === "failed") {
    // stay active but record failure — never pretend success
  }
  await fs.writeFile(rulePath(rule.id), JSON.stringify(rule, null, 2));
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2));
  return job;
}

export async function retryAutomationJob(input: {
  userId: string;
  jobId: string;
  confirm?: boolean;
}): Promise<AutomationJob> {
  const raw = await fs.readFile(jobPath(input.jobId), "utf-8");
  const prev = JSON.parse(raw) as AutomationJob;
  if (prev.userId !== input.userId) throw new Error("无权访问");
  return runAutomationNow({
    userId: input.userId,
    ruleId: prev.ruleId,
    confirm: input.confirm,
  });
}
