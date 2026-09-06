import { Prisma } from "@prisma/client";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import type {
  CreationProject,
  CreationProjectAsset,
  CreateProjectInput,
  StructuredContent,
  CreationSourceRef,
  CreationTimelineStep,
} from "@/modules/create/types";
import {
  defaultTimeline,
  emptyContentForPlatform,
} from "@/modules/create/constants";
import {
  fileStoreCreateProject,
  fileStoreGetProject,
  fileStoreListProjects,
  fileStoreUpdateProject,
  fileStoreDeleteProject,
  fileStoreUpdateContentField,
  fileStoreSetProjectAssets,
} from "@/lib/creation/file-store";
import { UI } from "@/lib/ui-copy";
import { toUserErrorMessage } from "@/lib/user-errors";
import { getSession } from "@/modules/account/auth/service";
import { getOwnedAsset } from "@/modules/assets/asset-service";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Parse model JSON that may include fences, trailing commas, or stray # comments. */
function parseAiJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = (fenced?.[1] ?? text).trim();
  const brace = raw.match(/\{[\s\S]*\}/);
  if (!brace) return null;
  raw = brace[0];

  const attempts = [
    raw,
    raw.replace(/,\s*([}\]])/g, "$1"),
    raw.replace(/(^|[,{\[])\s*#[^\n\r"]*/g, "$1"),
    raw
      .replace(/(^|[,{\[])\s*#[^\n\r"]*/g, "$1")
      .replace(/,\s*([}\]])/g, "$1"),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function mapDbAsset(row: {
  id: string;
  projectId: string;
  assetId: string;
  role: string;
  sortOrder: number;
  usage?: string | null;
  selected?: boolean;
  createdAt: Date;
  asset?: {
    id: string;
    type: string;
    title: string | null;
    url: string | null;
    mimeType: string | null;
  } | null;
}): CreationProjectAsset {
  return {
    id: row.id,
    projectId: row.projectId,
    assetId: row.assetId,
    role: row.role,
    sortOrder: row.sortOrder,
    usage: row.usage ?? null,
    selected: row.selected ?? true,
    createdAt: row.createdAt.toISOString(),
    asset: row.asset
      ? {
          id: row.asset.id,
          type: row.asset.type,
          title: row.asset.title,
          url: row.asset.url,
          mimeType: row.asset.mimeType,
        }
      : null,
  };
}

function mapDbProject(row: {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  title: string;
  goal?: string | null;
  contentType?: string | null;
  platform: string | null;
  status: string;
  brief: string | null;
  timeline?: unknown;
  content: unknown;
  sources?: unknown;
  startMode?: string | null;
  createdAt: Date;
  updatedAt: Date;
  assets?: Array<{
    id: string;
    projectId: string;
    assetId: string;
    role: string;
    sortOrder: number;
    usage?: string | null;
    selected?: boolean;
    createdAt: Date;
    asset?: {
      id: string;
      type: string;
      title: string | null;
      url: string | null;
      mimeType: string | null;
    } | null;
  }>;
}): CreationProject {
  const content = (row.content as StructuredContent | null) ?? null;
  const contentObj = (content ?? {}) as Record<string, unknown>;
  const promptOverride =
    typeof contentObj._promptOverride === "string"
      ? contentObj._promptOverride
      : null;
  const sources = (row.sources as CreationSourceRef[] | null) ?? null;
  const researchId =
    sources?.find((s) => s.kind === "research_report" && s.researchId)
      ?.researchId ?? null;

  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    researchId,
    title: row.title,
    goal: row.goal ?? null,
    contentType: row.contentType ?? null,
    platform: row.platform,
    status: row.status,
    brief: row.brief,
    timeline: (row.timeline as CreationTimelineStep[] | null) ?? null,
    content,
    sources,
    startMode: row.startMode ?? null,
    promptOverride,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assets: (row.assets ?? []).map(mapDbAsset),
  };
}

export async function createProject(
  input: CreateProjectInput
): Promise<CreationProject> {
  const session = await getSession();
  const userId = session.user?.id ?? null;
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    const created = await fileStoreCreateProject(input, userId);
    return maybeImportWorkspaceMedia(created);
  }

  const sources: CreationSourceRef[] = [...(input.sources ?? [])];
  if (input.linkUrl) {
    const linkSource = sources.find(
      (s) => s.kind === "link" && s.url === input.linkUrl
    );
    if (!linkSource) {
      sources.push({
        id: `link_${Date.now()}`,
        kind: "link",
        url: input.linkUrl,
        title: input.title || input.linkUrl,
        snippet: input.brief?.slice(0, 500) ?? undefined,
      });
    }
  }
  if (input.workspaceId) {
    sources.push({
      id: `ws_${input.workspaceId}`,
      kind: "workspace_source",
      workspaceId: input.workspaceId,
      title: "工作区资料",
    });
  }
  if (input.commerceContext) {
    sources.push({
      id: `commerce_${Date.now()}`,
      kind: "commerce",
      title: "商品诊断",
      snippet: input.commerceContext.slice(0, 2000),
    });
  }
  if (input.researchId) {
    sources.push({
      id: `research_${input.researchId}`,
      kind: "research_report",
      researchId: input.researchId,
      title: "研究报告",
      snippet: input.brief?.slice(0, 800),
    });
  }

  const brief =
    input.brief ||
    (input.commerceContext
      ? input.commerceContext.slice(0, 4000)
      : null);

  const initialContent = {
    ...emptyContentForPlatform(input.platform, input.contentType),
    ...(input.seedContent ?? {}),
    ...(input.promptOverride
      ? { _promptOverride: input.promptOverride }
      : {}),
    ...(input.referenceStoryboard
      ? {
          __referenceStoryboard: input.referenceStoryboard,
        }
      : {}),
  };

  try {
    const project = await prisma.creationProject.create({
      data: {
        userId,
        title: input.title || input.goal.slice(0, 40) || "未命名创作",
        goal: input.goal,
        contentType: input.contentType,
        platform: input.platform,
        status: "draft",
        brief,
        workspaceId: input.workspaceId ?? null,
        startMode: input.startMode,
        timeline: toJson(defaultTimeline()),
        content: toJson(initialContent),
        sources: toJson(sources),
        assets: input.assetIds?.length
          ? {
              create: input.assetIds.map((assetId, i) => ({
                assetId,
                role: "media",
                sortOrder: i,
                selected: true,
              })),
            }
          : undefined,
      },
      include: {
        assets: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    return maybeImportWorkspaceMedia(mapDbProject(project));
  } catch (err) {
    console.error("[createProject] prisma failed, fallback file store", err);
    const created = await fileStoreCreateProject(
      { ...input, brief: brief ?? input.brief },
      userId
    );
    return maybeImportWorkspaceMedia(created);
  }
}

async function maybeImportWorkspaceMedia(
  project: CreationProject
): Promise<CreationProject> {
  if (!project.workspaceId && !project.sources?.some((s) => s.workspaceId)) {
    return project;
  }
  if (project.assets.length > 0) return project;
  try {
    const { linkWorkspaceMediaToProject } = await import(
      "@/modules/create/services/link-workspace-media"
    );
    const result = await linkWorkspaceMediaToProject(project.id);
    return result?.project ?? project;
  } catch (err) {
    console.error("[createProject] workspace media import failed", err);
    return project;
  }
}

export async function getProject(id: string): Promise<CreationProject | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) return fileStoreGetProject(id);

  try {
    const project = await prisma.creationProject.findUnique({
      where: { id },
      include: {
        assets: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    return project ? mapDbProject(project) : fileStoreGetProject(id);
  } catch {
    return fileStoreGetProject(id);
  }
}

export async function listProjects(): Promise<CreationProject[]> {
  const session = await getSession();
  const userId = session.user?.id ?? null;
  const { ensureShowcaseSeeded } = await import(
    "@/lib/showcase/ensure-seeded"
  );
  const { SHARED_CREATION_IDS } = await import(
    "@/lib/showcase/shared-catalog"
  );
  await ensureShowcaseSeeded();

  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) return fileStoreListProjects(userId);

  try {
    const list = await prisma.creationProject.findMany({
      where: {
        OR: [
          userId ? { userId } : { userId: null },
          { id: { in: [...SHARED_CREATION_IDS] } },
        ],
      },
      include: {
        assets: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    // Dedupe if a row matched both own + shared clauses
    const seen = new Set<string>();
    return list
      .map(mapDbProject)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  } catch {
    return fileStoreListProjects(userId);
  }
}

export async function updateProject(
  id: string,
  patch: Partial<
    Pick<
      CreationProject,
      | "title"
      | "goal"
      | "brief"
      | "status"
      | "content"
      | "timeline"
      | "sources"
      | "platform"
      | "contentType"
    >
  >
): Promise<CreationProject | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) return fileStoreUpdateProject(id, patch);

  try {
    const project = await prisma.creationProject.update({
      where: { id },
      data: {
        title: patch.title,
        goal: patch.goal,
        brief: patch.brief,
        status: patch.status,
        content:
          patch.content !== undefined ? toJson(patch.content) : undefined,
        timeline:
          patch.timeline !== undefined ? toJson(patch.timeline) : undefined,
        sources:
          patch.sources !== undefined ? toJson(patch.sources) : undefined,
        platform: patch.platform ?? undefined,
        contentType: patch.contentType ?? undefined,
      },
      include: {
        assets: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    return mapDbProject(project);
  } catch {
    return fileStoreUpdateProject(id, patch);
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  const dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    try {
      await prisma.creationProject.delete({ where: { id } });
    } catch {
      /* fall through to file store */
    }
  }
  await fileStoreDeleteProject(id);
  return true;
}

export async function updateContentField(
  id: string,
  field: string,
  value: string | string[]
): Promise<CreationProject | null> {
  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) return fileStoreUpdateContentField(id, field, value);

  try {
    const existing = await prisma.creationProject.findUnique({ where: { id } });
    if (!existing) return fileStoreUpdateContentField(id, field, value);
    const content = {
      ...((existing.content as Record<string, unknown>) ?? {}),
      [field]: value,
    };
    return updateProject(id, { content: content as StructuredContent });
  } catch {
    return fileStoreUpdateContentField(id, field, value);
  }
}

export async function setProjectAssets(
  id: string,
  assetIds: string[]
): Promise<CreationProject | null> {
  const allowed: string[] = [];
  for (const assetId of assetIds) {
    const owned = await getOwnedAsset(assetId);
    if (owned) allowed.push(assetId);
  }

  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    const now = new Date().toISOString();
    return fileStoreSetProjectAssets(
      id,
      allowed.map((assetId, i) => ({
        id: `ca_${Date.now()}_${i}`,
        projectId: id,
        assetId,
        role: "media",
        sortOrder: i,
        usage: null,
        selected: true,
        createdAt: now,
      }))
    );
  }

  try {
    await prisma.creationAsset.deleteMany({ where: { projectId: id } });
    if (allowed.length) {
      await prisma.creationAsset.createMany({
        data: allowed.map((assetId, i) => ({
          projectId: id,
          assetId,
          role: "media",
          sortOrder: i,
          selected: true,
        })),
      });
    }
    return getProject(id);
  } catch {
    const now = new Date().toISOString();
    return fileStoreSetProjectAssets(
      id,
      allowed.map((assetId, i) => ({
        id: `ca_${Date.now()}_${i}`,
        projectId: id,
        assetId,
        role: "media",
        sortOrder: i,
        usage: null,
        selected: true,
        createdAt: now,
      }))
    );
  }
}

/** AI generation / field rewrite via AIGateway. */
export async function requestAiGeneration(
  projectId: string,
  opts?: { confirm?: boolean; jobId?: string }
): Promise<
  | { ok: true; project: CreationProject }
  | {
      ok: false;
      code:
        | "blocked_ai_unavailable"
        | "not_found"
        | "ai_error"
        | "confirm_required"
        | "login_required"
        | "insufficient_credits"
        | "pricing_unavailable"
        | "invalid_capability";
      message: string;
      estimate?: import("@/modules/account/types").CreditEstimate;
      jobId?: string;
    }
> {
  const project = await getProject(projectId);
  if (!project) {
    return { ok: false, code: "not_found", message: "项目不存在" };
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
    capability: "generateText",
    confirm: opts?.confirm,
    jobId: opts?.jobId,
  });

  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      message: gate.message,
      estimate: gate.estimate,
      jobId: gate.jobId,
    };
  }

  try {
    const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
    if (!AIGateway.isAvailable("generateText")) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }

    await updateProject(projectId, { status: "generating" });

    const {
      assembleCreationContext,
      buildDefaultSystemPrompt,
    } = await import("@/modules/create/services/context-assembler");

    const ctx = await assembleCreationContext(project);
    const system =
      project.promptOverride?.trim() ||
      buildDefaultSystemPrompt(project.platform, project.contentType);

    const session = await getSession();
    const userId = session.user?.id ?? project.userId ?? null;

    const out = await AIGateway.generateText(
      {
        system,
        prompt: `请基于以下上下文生成结构化创作草稿。
只输出一个合法 JSON 对象，不要 markdown 代码块，不要注释（不要用 # 或 //），不要在字符串外写额外文字。

${ctx.text}

已有草稿：${JSON.stringify(
          Object.fromEntries(
            Object.entries((project.content ?? {}) as object).filter(
              ([k]) => !k.startsWith("_")
            )
          )
        )}`,
        temperature: 0.5,
        maxTokens: 2500,
      },
      {
        userId,
        accountId: account.accountId,
        referenceId: projectId,
        jobId: gate.jobId,
      }
    );

    const draft = parseAiJsonObject(out.text);
    if (!draft) {
      await updateProject(projectId, { status: "failed" });
      return { ok: false, code: "ai_error", message: "AI 未返回结构化内容" };
    }
    const prev = (project.content ?? {}) as Record<string, unknown>;
    const mergedContent = {
      title: String(draft.title ?? prev.title ?? ""),
      hook: String(draft.hook ?? prev.hook ?? ""),
      body: String(draft.body ?? draft.script ?? prev.body ?? ""),
      structure: String(
        draft.structure ?? draft.scenes ?? prev.structure ?? ""
      ),
      cta: String(draft.cta ?? prev.cta ?? ""),
      hashtags: Array.isArray(draft.hashtags)
        ? draft.hashtags.map(String)
        : Array.isArray(prev.hashtags)
          ? prev.hashtags
          : [],
      coverSuggestion: String(
        draft.coverSuggestion ??
          draft.coverText ??
          prev.coverSuggestion ??
          ""
      ),
      ...(typeof prev._promptOverride === "string"
        ? { _promptOverride: prev._promptOverride }
        : {}),
    } as StructuredContent;

    if (ctx.sources.length) {
      await updateProject(projectId, { sources: ctx.sources });
    }

    const updated = await updateProject(projectId, {
      content: mergedContent,
      status: "ready",
      title:
        typeof draft.title === "string" && draft.title.trim()
          ? draft.title.trim().slice(0, 60)
          : project.title,
    });
    if (!updated) {
      return { ok: false, code: "not_found", message: "项目不存在" };
    }
    return { ok: true, project: updated };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    await updateProject(projectId, { status: "failed" }).catch(() => null);
    if (err instanceof CapabilityNotConfiguredError) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }
    return {
      ok: false,
      code: "ai_error",
      message: toUserErrorMessage(err, "生成失败，请稍后再试"),
    };
  }
}

export async function requestFieldRewrite(
  projectId: string,
  field: string,
  rewriteAction: string,
  opts?: { confirm?: boolean; jobId?: string }
): Promise<
  | { ok: true; project: CreationProject }
  | {
      ok: false;
      code:
        | "blocked_ai_unavailable"
        | "not_found"
        | "ai_error"
        | "confirm_required"
        | "login_required"
        | "insufficient_credits"
        | "pricing_unavailable"
        | "invalid_capability";
      message: string;
      estimate?: import("@/modules/account/types").CreditEstimate;
      jobId?: string;
    }
> {
  const project = await getProject(projectId);
  if (!project) {
    return { ok: false, code: "not_found", message: "项目不存在" };
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
    capability: "rewrite",
    confirm: opts?.confirm,
    jobId: opts?.jobId,
  });

  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      message: gate.message,
      estimate: gate.estimate,
      jobId: gate.jobId,
    };
  }

  try {
    const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
    if (
      !AIGateway.isAvailable("rewrite") &&
      !AIGateway.isAvailable("generateText")
    ) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }

    const { resolveFieldForAction } = await import(
      "@/modules/create/constants"
    );
    const targetField = resolveFieldForAction(rewriteAction, field);

    const content = (project.content ?? {}) as Record<string, unknown>;
    const current = content[targetField];
    const text = Array.isArray(current)
      ? current.join(", ")
      : String(current ?? "");

    const actionHints: Record<string, string> = {
      optimize_title: "只优化标题，更吸引点击，保持事实准确。只输出标题文本。",
      more_natural: "让语气更自然口语化，只改写该字段。",
      more_professional: "让语气更专业，只改写该字段。",
      shorten: "缩短该字段，保留关键信息。",
      increase_density: "增加信息密度，仍保持可读。",
      regenerate_cover: "重新给出封面建议文案。只输出封面建议。",
    };

    const session = await getSession();
    const userId = session.user?.id ?? project.userId ?? null;

    const instruction = `${actionHints[rewriteAction] || "按要求改写"}
字段：${targetField}；平台：${project.platform}；目标：${project.goal || ""}
禁止重写其他字段。用简体中文。`;

    let rewritten: string;
    if (AIGateway.isAvailable("rewrite")) {
      rewritten = await AIGateway.rewrite(text || String(project.goal || ""), instruction, {
        userId,
        accountId: account.accountId,
        jobId: gate.jobId,
      });
    } else {
      const out = await AIGateway.generateText(
        {
          system: "你是文案改写助手。只输出改写后的字段内容，不要解释。",
          prompt: `${instruction}\n\n原文：\n${text || project.goal}`,
          temperature: 0.4,
          maxTokens: 800,
        },
        { userId, accountId: account.accountId, referenceId: projectId, jobId: gate.jobId }
      );
      rewritten = out.text.trim();
    }

    let value: string | string[] = rewritten;
    if (Array.isArray(current) || targetField === "hashtags") {
      value = rewritten
        .split(/[\s,，#]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const updated = await updateContentField(projectId, targetField, value);
    if (!updated) {
      return { ok: false, code: "not_found", message: "项目不存在" };
    }
    const withStatus = await updateProject(projectId, { status: "editing" });
    return { ok: true, project: withStatus ?? updated };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (err instanceof CapabilityNotConfiguredError) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }
    return {
      ok: false,
      code: "ai_error",
      message: toUserErrorMessage(err, "改写失败，请稍后再试"),
    };
  }
}
