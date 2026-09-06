/**
 * Agent tool executors — wrap real Nexa services.
 * Never invent connector / model success; surface confirm_required honestly.
 */

import { detectSocialLink } from "@/lib/social-link";
import {
  createProject,
  requestAiGeneration,
} from "@/modules/create/services/creation-service";
import { ingestSocialLink } from "@/modules/create/services/social-recreate";
import {
  buildCopyrightSafeBrief,
} from "@/modules/create/lib/recreate-copyright";
import type {
  ContentType,
  CreationPlatform,
} from "@/modules/create/types";
import {
  createResearchJob,
  createWorkspace,
  getResearchJob,
} from "@/modules/workspace/services/workspace-service";
import { runCustomerIntelligence } from "@/modules/commerce/capability/customer-intelligence";
import { getProductDiagnosis } from "@/modules/commerce/amazon/service";
import { buildCommerceCreateContext } from "@/modules/commerce/lib/commerce-create-context";
import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";
import { loadDemoStore } from "@/modules/commerce/amazon/repository";

export type AgentExecStatus =
  | "ok"
  | "skipped"
  | "blocked"
  | "needs_input"
  | "confirm_required"
  | "login_required"
  | "error";

export type AgentExecResult = {
  status: AgentExecStatus;
  message: string;
  href?: string;
  data?: Record<string, unknown>;
  estimate?: {
    available: boolean;
    estimatedCredits: number | null;
    message?: string;
  };
  jobId?: string;
};

export type AgentMemory = {
  goal: string;
  confirm?: boolean;
  jobId?: string;
  linkUrl?: string;
  projectId?: string;
  workspaceId?: string;
  researchId?: string;
  commerceContext?: string;
  productId?: string;
  platform?: CreationPlatform;
  contentType?: ContentType;
  brief?: string;
  ingestTitle?: string;
  referenceStoryboard?: import("@/modules/create/services/reference-storyboard-package").ReferenceStoryboardPackage;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function extractLinkFromGoal(goal: string): string | null {
  const match = detectSocialLink(goal);
  return match?.url ?? null;
}

export async function execIngestSocial(
  memory: AgentMemory
): Promise<AgentExecResult> {
  const urlOrText = memory.linkUrl || memory.goal;
  const match = detectSocialLink(urlOrText);
  if (!match) {
    return {
      status: "needs_input",
      message:
        "需要抖音 / 小红书 / TikTok / X 链接或分享口令。请把链接贴进目标后再执行。",
      href: "/create?mode=link",
    };
  }
  try {
    const ingest = await ingestSocialLink({
      urlOrText,
      mediaAssetCount: 0,
      outputKind: "copy",
    });
    const brief = buildCopyrightSafeBrief({
      platformLabel: ingest.platformLabel,
      url: ingest.url,
      title: ingest.title,
      referenceCaption: ingest.briefSnippet,
      outputKind: "copy",
      topics: ingest.topics,
      structureHints: ingest.structureHints,
      parseStatus: ingest.parseStatus,
    });
    const { buildReferenceStoryboardPackage } = await import(
      "@/modules/create/services/reference-storyboard-package"
    );
    memory.linkUrl = ingest.url;
    memory.brief = brief;
    memory.ingestTitle = ingest.title || undefined;
    memory.referenceStoryboard = buildReferenceStoryboardPackage(ingest);
    memory.platform =
      ingest.platform === "xiaohongshu"
        ? "xiaohongshu"
        : ingest.platform === "tiktok"
          ? "tiktok"
          : "douyin";
    memory.contentType = "copy";
    return {
      status: "ok",
      message: `已解析${ingest.platformLabel}参考：${ingest.title || ingest.url}（${memory.referenceStoryboard.shotSlots.length} 个分镜槽位）`,
      data: {
        platform: ingest.platform,
        title: ingest.title,
        parseStatus: ingest.parseStatus,
        shotSlots: memory.referenceStoryboard.shotSlots.length,
      },
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "社交链接解析失败",
      href: "/create?mode=link",
    };
  }
}

export async function execCreateProject(
  memory: AgentMemory,
  opts: {
    startMode: "link" | "idea" | "commerce" | "workspace";
    title?: string;
  }
): Promise<AgentExecResult> {
  try {
    const project = await createProject({
      goal: memory.goal,
      title: opts.title || memory.ingestTitle || memory.goal.slice(0, 40),
      contentType: memory.contentType || "copy",
      platform: memory.platform || "xiaohongshu",
      startMode: opts.startMode,
      brief: memory.brief,
      linkUrl: memory.linkUrl,
      workspaceId: memory.workspaceId,
      researchId: memory.researchId,
      commerceContext: memory.commerceContext,
      referenceStoryboard: memory.referenceStoryboard,
    });
    memory.projectId = project.id;
    return {
      status: "ok",
      message: `已创建创作项目`,
      href: `/create/${project.id}`,
      data: { projectId: project.id, title: project.title },
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "创建项目失败",
    };
  }
}

export async function execProduceVideo(
  memory: AgentMemory
): Promise<AgentExecResult> {
  if (!memory.projectId && !memory.goal) {
    return { status: "blocked", message: "缺少项目或目标，无法成片" };
  }
  try {
    const { oneClickProduce } = await import(
      "@/modules/create/services/one-click-produce"
    );
    const result = await oneClickProduce({
      goal: memory.goal,
      workspaceId: memory.workspaceId,
      projectId: memory.projectId,
      confirm: Boolean(memory.confirm),
      jobId: memory.jobId,
      contentType: memory.contentType || "short_video",
      platform: memory.platform || "douyin",
    });
    if (result.projectId) memory.projectId = result.projectId;
    if (result.code === "confirm_required") {
      return {
        status: "confirm_required",
        message: result.message,
        jobId: result.jobId,
        estimate: result.estimate,
        href: result.href,
        data: { projectId: result.projectId, steps: result.steps },
      };
    }
    if (!result.ok) {
      return {
        status:
          result.code === "blocked_ai_unavailable" ||
          result.code === "ai_unavailable"
            ? "blocked"
            : "error",
        message: result.message,
        href: result.href,
        data: { projectId: result.projectId, steps: result.steps },
      };
    }
    return {
      status: "ok",
      message: result.exportUrl
        ? `成片已导出：${result.exportUrl}`
        : "一键成片完成",
      href: result.href,
      data: {
        projectId: result.projectId,
        exportUrl: result.exportUrl,
        steps: result.steps,
      },
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "成片失败",
    };
  }
}

export async function execGenerateText(
  memory: AgentMemory
): Promise<AgentExecResult> {
  if (!memory.projectId) {
    return {
      status: "blocked",
      message: "缺少 projectId，无法生成文案",
    };
  }
  const result = await requestAiGeneration(memory.projectId, {
    confirm: memory.confirm,
    jobId: memory.jobId,
  });
  if (!result.ok) {
    if (
      result.code === "confirm_required" ||
      result.code === "login_required" ||
      result.code === "insufficient_credits" ||
      result.code === "pricing_unavailable"
    ) {
      return {
        status:
          result.code === "confirm_required"
            ? "confirm_required"
            : result.code === "login_required"
              ? "login_required"
              : "blocked",
        message: result.message,
        estimate: result.estimate
          ? {
              available: result.estimate.available,
              estimatedCredits: result.estimate.estimatedCredits ?? null,
              message: result.estimate.message,
            }
          : undefined,
        jobId: result.jobId,
        href: `/create/${memory.projectId}`,
      };
    }
    return {
      status: result.code === "blocked_ai_unavailable" ? "blocked" : "error",
      message: result.message,
      href: `/create/${memory.projectId}`,
    };
  }
  return {
    status: "ok",
    message: "文案草稿已生成（结构化字段已写入项目）",
    href: `/create/${result.project.id}`,
    data: { projectId: result.project.id, status: result.project.status },
  };
}

export async function execCreateWorkspace(
  memory: AgentMemory
): Promise<AgentExecResult> {
  if (memory.workspaceId) {
    return {
      status: "ok",
      message: "已使用当前 AI 工作区作为任务上下文",
      href: `/workspace/${memory.workspaceId}`,
      data: { workspaceId: memory.workspaceId, reused: true },
    };
  }
  try {
    const name = `Agent研究 · ${memory.goal.slice(0, 24)}`;
    const ws = await createWorkspace(name);
    memory.workspaceId = ws.id;
    return {
      status: "ok",
      message: `已创建工作区「${ws.name}」`,
      href: `/workspace/${ws.id}`,
      data: { workspaceId: ws.id },
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "创建工作区失败",
    };
  }
}

export async function execStartResearch(
  memory: AgentMemory
): Promise<AgentExecResult> {
  if (!memory.workspaceId) {
    return { status: "blocked", message: "缺少 workspaceId" };
  }

  const { resolveCreditsAccount } = await import(
    "@/modules/account/credits/account"
  );
  const { gateAiUsage } = await import(
    "@/modules/account/credits/usage-guard"
  );
  const account = await resolveCreditsAccount();
  const gate = await gateAiUsage({
    account,
    capability: "research",
    confirm: Boolean(memory.confirm),
    jobId: memory.jobId,
  });
  if (!gate.ok) {
    return {
      status:
        gate.code === "confirm_required"
          ? "confirm_required"
          : gate.code === "login_required"
            ? "login_required"
            : "blocked",
      message: gate.message,
      estimate: gate.estimate
        ? {
            available: gate.estimate.available,
            estimatedCredits: gate.estimate.estimatedCredits ?? null,
            message: gate.estimate.message,
          }
        : undefined,
      jobId: gate.jobId,
      href: `/workspace/${memory.workspaceId}`,
    };
  }

  const job = await createResearchJob({
    workspaceId: memory.workspaceId,
    goal: memory.goal,
    scope: "web",
    timeRange: "month",
    reportType: "full",
  });
  memory.researchId = job.id;

  if (job.status === "blocked_ai_unavailable") {
    return {
      status: "blocked",
      message: "研究能力暂未接入，已跳过深入研究（工作区仍可用）",
      href: `/workspace/${memory.workspaceId}`,
      data: { researchId: job.id, status: job.status },
    };
  }

  // Soft wait — research is async; don't block forever
  for (let i = 0; i < 6; i++) {
    await sleep(1200);
    const fresh = await getResearchJob(job.id);
    if (!fresh) break;
    if (fresh.status === "completed") {
      memory.researchId = fresh.id;
      const report = fresh.report as
        | { summary?: string; markdown?: string }
        | null
        | undefined;
      const summary =
        report?.summary || report?.markdown?.slice(0, 400) || "";
      if (summary) {
        memory.brief = [
          memory.brief,
          "【研究报告摘要】",
          summary.slice(0, 1200),
        ]
          .filter(Boolean)
          .join("\n");
      }
      return {
        status: "ok",
        message: "研究报告已完成",
        href: `/workspace/${memory.workspaceId}`,
        data: { researchId: fresh.id, status: fresh.status },
      };
    }
    if (fresh.status === "failed") {
      return {
        status: "error",
        message: "研究任务失败，将仅用工作区上下文继续创作",
        href: `/workspace/${memory.workspaceId}`,
        data: { researchId: fresh.id, status: fresh.status },
      };
    }
  }

  return {
    status: "ok",
    message:
      "研究任务已启动（后台运行中）。已继续创建项目；完整报告可在工作区查看。",
    href: `/workspace/${memory.workspaceId}`,
    data: { researchId: job.id, status: "running" },
  };
}

export async function execCustomerInsight(
  memory: AgentMemory
): Promise<AgentExecResult> {
  const result = await runCustomerIntelligence({
    mode: "analyze",
    channel: /tiktok/i.test(memory.goal) ? "tiktok" : "amazon",
    useDemoSamples: true,
    confirm: memory.confirm,
    jobId: memory.jobId,
    productTitle: memory.goal.slice(0, 80),
  });

  if (!result.ok) {
    return {
      status:
        result.code === "confirm_required"
          ? "confirm_required"
          : result.code === "login_required"
            ? "login_required"
            : result.code === "insufficient_credits"
              ? "blocked"
              : "error",
      message: result.message,
      estimate: result.estimate,
      jobId: result.jobId,
      href: "/commerce/amazon/customer",
    };
  }

  const pains = result.painPoints?.slice(0, 5) ?? [];
  const insight = result.insight;
  const commerceContext = buildCommerceCreateContext({
    source: "amazon_diagnosis",
    platform: "Amazon",
    productTitle: insight?.situation?.slice(0, 80) || "客户洞察商品",
    conclusion: insight?.diagnosis || "差评痛点已聚类",
    evidence: pains.map(
      (p) => `痛点：${p.theme}（${p.frequencyLabel}）`
    ),
    suggestion: insight?.recommendation || "根据痛点生成 FAQ / 卖点 / 内容",
    contentGoal: memory.goal,
  });

  memory.commerceContext = commerceContext;
  memory.brief = commerceContext;
  memory.platform = "xiaohongshu";
  memory.contentType = "copy";

  return {
    status: "ok",
    message: `客户洞察完成（${result.dataLabel || "DEMO"}）：${
      pains[0]?.theme || insight?.diagnosis || "已聚类"
    }`,
    href: result.createHref || "/commerce/amazon/customer",
    data: {
      painCount: pains.length,
      createHref: result.createHref,
    },
  };
}

export async function execProductDiagnosis(
  memory: AgentMemory
): Promise<AgentExecResult> {
  try {
    const store = await loadDemoStore();
    const products = store.products ?? [];
    if (!products.length) {
      return {
        status: "blocked",
        message: "暂无演示商品数据，无法做诊断→创作",
        href: "/commerce/amazon/products",
      };
    }

    const goalLower = memory.goal.toLowerCase();
    const hit =
      products.find((p) => {
        const t = p.title.toLowerCase();
        return (
          goalLower.includes(t.slice(0, 8)) ||
          t.split(/\s+/).some((w) => w.length > 3 && goalLower.includes(w))
        );
      }) ||
      products.find((p) =>
        /blender|搅拌|fountain|宠物|水杯|bottle/i.test(memory.goal)
          ? /blender|fountain|bottle|搅拌|宠物/i.test(p.title)
          : false
      ) ||
      products[0];

    memory.productId = hit.id;
    const diagnosis = await getProductDiagnosis(hit.id, "7");
    if (!diagnosis) {
      return {
        status: "error",
        message: "商品诊断加载失败",
        href: commerceProductExpandHref("amazon", hit.id),
      };
    }

    const evidence = (diagnosis.evidence ?? [])
      .slice(0, 6)
      .map((e) => `${e.label} ${e.current}（Δ ${e.deltaPct ?? "—"}）`);

    const commerceContext = buildCommerceCreateContext({
      source: "amazon_diagnosis",
      platform: "Amazon",
      productTitle: diagnosis.title || hit.title,
      productId: hit.id,
      conclusion: diagnosis.conclusion || "商品诊断已完成",
      evidence,
      suggestion:
        diagnosis.nextActions?.[0]?.label ||
        diagnosis.intelligence?.findings?.[0]?.suggestion ||
        "根据诊断生成策略内容",
      contentGoal: memory.goal,
      diagnosis: diagnosis.intelligence?.diagnosis,
      opportunity: diagnosis.intelligence?.findings?.[0]?.problem,
    });

    memory.commerceContext = commerceContext;
    memory.brief = commerceContext;
    memory.platform = "xiaohongshu";
    memory.contentType = "copy";

    return {
      status: "ok",
      message: `已诊断「${hit.title}」并写入创作上下文`,
      href: commerceProductExpandHref("amazon", hit.id),
      data: { productId: hit.id, title: hit.title },
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "商品诊断失败",
      href: "/commerce/amazon#products",
    };
  }
}

export async function execSearxngHint(
  memory: AgentMemory
): Promise<AgentExecResult> {
  if (!process.env.SEARXNG_BASE_URL) {
    return {
      status: "skipped",
      message: "SearXNG 未配置，已跳过全网检索（研究链路将尽量用已有能力）",
    };
  }
  try {
    const { SearchOrchestrator } = await import(
      "@/modules/search/services/search-orchestrator"
    );
    const orchestrator = new SearchOrchestrator();
    const response = await orchestrator.search(memory.goal.slice(0, 120));
    const top = (response.results || []).slice(0, 5);
    if (top.length) {
      const lines = top.map(
        (r, i) =>
          `${i + 1}. ${r.title || r.url}\n   ${(r.snippet || "").slice(0, 120)}`
      );
      memory.brief = [memory.brief, "【检索证据】", ...lines]
        .filter(Boolean)
        .join("\n");
      return {
        status: "ok",
        message: `已检索 ${top.length} 条证据写入上下文`,
        data: { count: top.length },
      };
    }
    return {
      status: "ok",
      message: "检索已调用，暂无可用结果",
    };
  } catch (err) {
    return {
      status: "skipped",
      message: `检索失败已跳过：${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }
}

/** Re-export for typing in chains */
