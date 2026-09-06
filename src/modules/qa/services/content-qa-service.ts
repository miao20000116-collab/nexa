/**
 * Content QA service — Creation → QA → Preview → Publish gate.
 * Local deterministic checks always run; AI enriches when available.
 * Never exposes chain-of-thought to clients.
 */

import { getProject, updateProject } from "@/modules/create/services/creation-service";
import type { CreationProject, StructuredContent } from "@/modules/create/types";
import { getPlatformCapability } from "@/modules/publish/capabilities";
import type { PublishPlatform } from "@/modules/publish/types";
import {
  QA_CATEGORY_LABELS,
  type ContentQAReport,
  type QACategory,
  type QAIssue,
} from "@/modules/qa/types";
import {
  buildSummary,
  checksFromIssues,
  issuesFromAiPayload,
  normalizeVerdict,
  stripCotObject,
  verdictLabel,
} from "@/modules/qa/normalize-qa";

const QA_KEY = "__qaReport";
const ALL_CATEGORIES: QACategory[] = [
  "fact",
  "source",
  "asset",
  "copyright",
  "platform",
  "safety",
  "commerce",
];

const SAFETY_PATTERNS =
  /自杀|自残|爆炸物制作|枪支购买教程|儿童色情|色情交易|毒品制作|仇恨屠杀/i;

const COPYRIGHT_PATTERNS =
  /下载正版电影|破解版|盗版资源|未授权使用|scrap(e|ing)\s*(youtube|tiktok)|抓取热门音乐|搬运整片/i;

const ABSOLUTE_CLAIM =
  /100%|绝对|一定能|保证赚|稳赚|零风险|第一名|全网最低|永久有效|包治|根治/i;

const UNSOURCED_FACT =
  /研究表明|数据显示|专家指出|官方公布|据统计|增长率达|市场份额/i;

function asPlatform(raw?: string | null): PublishPlatform {
  const p = (raw || "xiaohongshu") as PublishPlatform;
  return p;
}

function contentFields(project: CreationProject) {
  const content = (project.content ?? {}) as Record<string, unknown>;
  const title = String(content.title ?? project.title ?? "");
  const hook = String(content.hook ?? "");
  const body = String(content.body ?? content.script ?? content.caption ?? "");
  const cta = String(content.cta ?? "");
  const structure = String(content.structure ?? "");
  const hashtags = Array.isArray(content.hashtags)
    ? content.hashtags.map(String)
    : [];
  const blob = [title, hook, body, cta, structure, hashtags.join(" ")].join(
    "\n"
  );
  return { content, title, hook, body, cta, structure, hashtags, blob };
}

function runLocalChecks(
  project: CreationProject,
  platform: PublishPlatform
): QAIssue[] {
  const issues: QAIssue[] = [];
  const { title, body, blob, content } = contentFields(project);
  const sources = project.sources ?? [];
  const assets = project.assets ?? [];
  const cap = getPlatformCapability(platform);

  // Fact
  if (!title.trim() && !body.trim() && !(project.goal || "").trim()) {
    issues.push({
      id: "fact_empty",
      category: "fact",
      where: "标题 / 正文",
      why: "几乎没有可发布的正文内容，无法核验事实陈述。",
      how: "先完成创作草稿（标题、正文或脚本），再运行质检。",
      severity: "error",
    });
  } else if (UNSOURCED_FACT.test(blob) && sources.length === 0) {
    issues.push({
      id: "fact_unsourced",
      category: "fact",
      where: "正文中的数据 / 研究表述",
      why: "出现「研究 / 数据 / 官方」等事实性表述，但项目未关联来源。",
      how: "补充工作区来源或搜索结果，或删改无法核验的绝对数据表述。",
      severity: "error",
    });
  }

  // Source
  if (sources.length === 0 && /根据|引用|来自|出处/.test(blob)) {
    issues.push({
      id: "source_missing",
      category: "source",
      where: "来源列表",
      why: "文案提到引用/出处，但创作项目没有挂载来源。",
      how: "从工作区或搜索结果加入来源，并在文案中对应可核验链接。",
      severity: "error",
    });
  } else if (sources.length === 0) {
    issues.push({
      id: "source_none",
      category: "source",
      where: "来源",
      why: "当前无关联来源，对外发布时可信度与可追溯性较弱。",
      how: "建议至少关联 1 条可核验来源（非强制错误时可作警告）。",
      severity: "warning",
    });
  }

  // Asset
  const needsMedia =
    project.contentType === "short_video" ||
    project.contentType === "image" ||
    platform === "tiktok" ||
    platform === "douyin" ||
    platform === "instagram";
  if (needsMedia && assets.length === 0) {
    issues.push({
      id: "asset_missing",
      category: "asset",
      where: "项目素材",
      why: "该内容类型 / 平台通常需要图片或视频素材，但尚未关联素材。",
      how: "在素材库上传或从「我的素材」关联至少 1 个可用素材。",
      severity: "error",
    });
  }
  const failedAssets = assets.filter((a) => a.asset?.mimeType === undefined && !a.assetId);
  if (failedAssets.length) {
    issues.push({
      id: "asset_invalid",
      category: "asset",
      where: "素材绑定",
      why: "存在无效素材引用。",
      how: "移除失效素材并重新选择可用素材。",
      severity: "warning",
    });
  }

  // Copyright
  if (COPYRIGHT_PATTERNS.test(blob)) {
    issues.push({
      id: "copyright_risk",
      category: "copyright",
      where: "正文表述",
      why: "文案涉及疑似未授权资源或抓取版权内容的表述。",
      how: "删除相关表述；音乐/视频仅使用用户上传或明确授权来源。",
      severity: "error",
    });
  }
  const video = content.__videoProject as
    | { timeline?: { musicTrack?: { sourceKind?: string; license?: { note?: string } } } }
    | undefined;
  const musicKind = video?.timeline?.musicTrack?.sourceKind;
  if (musicKind === "ai_generated") {
    issues.push({
      id: "copyright_music_ai",
      category: "copyright",
      where: "视频 Music Track",
      why: "使用了 AI 生成音乐，商用授权需另行确认。",
      how: "优先替换为用户上传且确认可商用的音乐，或保留并在发布说明中标注授权状态。",
      severity: "warning",
    });
  }

  // Platform
  if (platform === "x") {
    const len = (title + "\n" + body).trim().length;
    if (len > 280) {
      issues.push({
        id: "platform_x_length",
        category: "platform",
        where: "标题 + 正文长度",
        why: `当前约 ${len} 字，超过 X 单帖常见长度限制（约 280）。`,
        how: "缩短文案，或拆成线程；保留核心卖点与 CTA。",
        severity: "error",
      });
    }
  }
  if (platform === "xiaohongshu" && body.trim().length > 0 && body.trim().length < 20) {
    issues.push({
      id: "platform_xhs_short",
      category: "platform",
      where: "正文",
      why: "小红书图文正文过短，完整度与互动预期不足。",
      how: "补充场景、体验与 CTA，建议正文不少于约 50 字。",
      severity: "warning",
    });
  }
  if (
    (platform === "tiktok" || platform === "douyin") &&
    project.contentType !== "short_video" &&
    !content.__videoProject
  ) {
    issues.push({
      id: "platform_video_required",
      category: "platform",
      where: "内容类型",
      why: "目标平台以短视频为主，但项目未包含视频工作台产物。",
      how: "将内容类型改为短视频并完成分镜/渲染，或更换发布平台。",
      severity: "error",
    });
  }
  if (!cap.publishApiAvailable) {
    issues.push({
      id: "platform_api",
      category: "platform",
      where: "发布能力",
      why: "当前平台官方发布能力尚未对 Nexa 开放。",
      how: "可先完成质检与预览，并复制成稿自行发布；无需连接平台。",
      severity: "warning",
    });
  }

  // Safety
  if (SAFETY_PATTERNS.test(blob)) {
    issues.push({
      id: "safety_risk",
      category: "safety",
      where: "正文敏感表述",
      why: "检测到可能违反安全政策的内容模式。",
      how: "删除相关表述；如为误报，请改写为合规表达后重检。",
      severity: "error",
    });
  }

  // Commerce
  if (ABSOLUTE_CLAIM.test(blob)) {
    issues.push({
      id: "commerce_absolute",
      category: "commerce",
      where: "营销 / 承诺表述",
      why: "存在绝对化承诺或夸大效果的商业话术，存在合规风险。",
      how: "改为可验证、有限度的表述（如「适合…场景」「用户反馈…」），并补充依据。",
      severity: "error",
    });
  }
  if (/价格|优惠|折扣|佣金|ROI|GMV|转化率/.test(blob) && sources.length === 0) {
    issues.push({
      id: "commerce_metrics",
      category: "commerce",
      where: "商业数据表述",
      why: "提到价格/效果/转化等商业信息，但缺少可追溯来源或诊断上下文。",
      how: "关联跨境诊断/工作区数据，或删除无法证明的数字。",
      severity: "warning",
    });
  }

  return issues;
}

function mergeIssues(local: QAIssue[], ai: QAIssue[]): QAIssue[] {
  const seen = new Set(local.map((i) => `${i.category}:${i.where}:${i.why}`));
  const merged = [...local];
  for (const issue of ai) {
    const key = `${issue.category}:${issue.where}:${issue.why}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }
  return merged;
}

export async function runContentQA(input: {
  projectId: string;
  platform?: string | null;
  userId?: string | null;
  accountId?: string | null;
  jobId?: string;
}): Promise<ContentQAReport> {
  const project = await getProject(input.projectId);
  const createdAt = new Date().toISOString();

  if (!project) {
    const issues: QAIssue[] = [
      {
        id: "project_missing",
        category: "fact",
        where: "创作项目",
        why: "项目不存在。",
        how: "返回创作列表重新打开项目。",
        severity: "error",
      },
    ];
    const verdict = "NEEDS_REVISION" as const;
    return {
      projectId: input.projectId,
      platform: input.platform,
      verdict,
      verdictLabel: verdictLabel(verdict),
      checks: checksFromIssues(ALL_CATEGORIES, issues),
      issues,
      suggestions: ["请打开有效的创作项目后再质检。"],
      aiAssisted: false,
      blockedAi: false,
      summary: buildSummary({ verdict, issues }),
      createdAt,
    };
  }

  const platform = asPlatform(input.platform || project.platform);
  const localIssues = runLocalChecks(project, platform);

  let aiIssues: QAIssue[] = [];
  let aiAssisted = false;
  let blockedAi = false;
  let aiSuggestions: string[] = [];

  try {
    const { AIGateway } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (!AIGateway.isAvailable("qualityCheck")) {
      blockedAi = true;
    } else {
      const { blob } = contentFields(project);
      const result = await AIGateway.qualityCheck(
        {
          content: JSON.stringify({
            goal: project.goal,
            platform,
            contentType: project.contentType,
            text: blob.slice(0, 8000),
            sources: (project.sources ?? []).slice(0, 8).map((s) => ({
              title: s.title,
              url: s.url,
            })),
            assetCount: project.assets.length,
          }),
          platform,
        },
        { userId: input.userId ?? project.userId, accountId: input.accountId, jobId: input.jobId, billingCapability: "qualityCheck" }
      );
      aiAssisted = true;
      const payload = stripCotObject(result as unknown as Record<string, unknown>);
      aiIssues = issuesFromAiPayload(payload);
      if (Array.isArray(payload.suggestions)) {
        aiSuggestions = payload.suggestions.map(String).slice(0, 8);
      }
      // Prefer structured checks from model if present (no CoT fields)
      if (Array.isArray(payload.checks)) {
        for (const c of payload.checks) {
          if (!c || typeof c !== "object") continue;
          const row = stripCotObject(c as Record<string, unknown>);
          if (row.ok === false) {
            const id = String(row.id ?? "fact");
            const cat = (
              id in QA_CATEGORY_LABELS ? id : "fact"
            ) as QACategory;
            aiIssues.push({
              id: `check_${id}`,
              category: cat,
              where: String(row.label ?? QA_CATEGORY_LABELS[cat]),
              why: String(row.detail ?? "未通过该项检查"),
              how: "请按该项说明修改内容后重新质检。",
              severity: "error",
            });
          }
        }
      }
    }
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (err instanceof CapabilityNotConfiguredError) {
      blockedAi = true;
    } else {
      aiSuggestions.push("AI 辅助质检暂时失败，已保留本地规则结果。");
    }
  }

  const issues = mergeIssues(localIssues, aiIssues);
  const hasError = issues.some((i) => i.severity === "error");
  const verdict = normalizeVerdict(!hasError, hasError ? "NEEDS_REVISION" : "PASS");

  const suggestions = [
    ...aiSuggestions,
    ...issues
      .filter((i) => i.severity === "error")
      .map((i) => `${i.where}：${i.how}`),
  ].filter(Boolean);
  const uniqueSuggestions = [...new Set(suggestions)].slice(0, 12);

  const report: ContentQAReport = {
    projectId: project.id,
    platform,
    verdict,
    verdictLabel: verdictLabel(verdict),
    checks: checksFromIssues(ALL_CATEGORIES, issues),
    issues,
    suggestions: uniqueSuggestions,
    aiAssisted,
    blockedAi,
    summary: buildSummary({ verdict, issues }),
    createdAt,
  };

  // Persist on project for Creation → QA → Preview → Publish
  const content = {
    ...((project.content ?? {}) as object),
    [QA_KEY]: report,
  } as unknown as StructuredContent;
  await updateProject(project.id, { content });

  return report;
}

export async function getLatestQAReport(
  projectId: string
): Promise<ContentQAReport | null> {
  const project = await getProject(projectId);
  if (!project) return null;
  const content = (project.content ?? {}) as Record<string, unknown>;
  const raw = content[QA_KEY];
  if (!raw || typeof raw !== "object") return null;
  return raw as ContentQAReport;
}

export function isQaPassing(report: ContentQAReport | null | undefined): boolean {
  return report?.verdict === "PASS";
}
