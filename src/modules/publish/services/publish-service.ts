import { Prisma } from "@prisma/client";
import { getProject } from "@/modules/create/services/creation-service";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  fileCreatePublishRecord,
  fileListPublishRecords,
  fileUpdatePublishRecord,
  fileGetPublishRecord,
} from "@/lib/publish/file-store";
import { checkPlatformAdaptation } from "@/modules/publish/adaptation";
import { getPlatformCapability } from "@/modules/publish/capabilities";
import {
  createPublishingProvider,
  userFacingPublishError,
} from "@/modules/publish/providers";
import { getConnection } from "@/modules/publish/services/connection-service";
import { runContentQA } from "@/modules/qa/services/content-qa-service";
import type {
  PublishPlatform,
  PublishPreview,
  PublishRecordView,
  PublishStatus,
} from "@/modules/publish/types";
import { PLATFORM_LABELS } from "@/modules/publish/types";

function asPlatform(value: string): PublishPlatform {
  return value as PublishPlatform;
}

function contentSnapshot(project: Awaited<ReturnType<typeof getProject>>) {
  if (!project) return {};
  return {
    title: project.title,
    goal: project.goal,
    contentType: project.contentType,
    platform: project.platform,
    content: project.content ?? {},
  };
}

function mapRecord(row: {
  id: string;
  projectId: string | null;
  platform: string;
  accountId?: string | null;
  connectionId?: string | null;
  status: string;
  publishedAt: Date | null;
  externalPostId?: string | null;
  externalId?: string | null;
  externalUrl: string | null;
  errorCode: string | null;
  errorMessage?: string | null;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
  project?: { title: string } | null;
}): PublishRecordView {
  return {
    id: row.id,
    projectId: row.projectId,
    platform: row.platform,
    accountId: row.accountId ?? null,
    accountLabel: (row as { accountLabel?: string }).accountLabel ?? null,
    connectionId: row.connectionId ?? null,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    contentId: row.externalPostId ?? row.externalId ?? null,
    externalPostId: row.externalPostId ?? row.externalId ?? null,
    externalUrl: row.externalUrl,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage ?? null,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    projectTitle: row.project?.title ?? null,
  };
}

async function createRecord(data: {
  projectId: string;
  platform: string;
  accountId?: string | null;
  connectionId?: string | null;
  status: PublishStatus;
  payload?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  projectTitle?: string | null;
}): Promise<PublishRecordView> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.publishRecord.create({
        data: {
          projectId: data.projectId,
          platform: data.platform,
          accountId: data.accountId ?? null,
          connectionId: data.connectionId ?? null,
          status: data.status,
          payload: (data.payload as Prisma.InputJsonValue) ?? undefined,
          errorCode: data.errorCode ?? null,
          errorMessage: data.errorMessage ?? null,
        },
        include: { project: { select: { title: true } } },
      });
      return mapRecord(row);
    } catch {
      /* fallback — schema may lag until migrate */
    }
  }

  return fileCreatePublishRecord({
    projectId: data.projectId,
    platform: data.platform,
    accountId: data.accountId ?? null,
    connectionId: data.connectionId ?? null,
    status: data.status,
    publishedAt: null,
    externalPostId: null,
    externalUrl: null,
    errorCode: data.errorCode ?? null,
    errorMessage: data.errorMessage ?? null,
    payload: data.payload ?? null,
    projectTitle: data.projectTitle ?? null,
  });
}

async function updateRecord(
  id: string,
  patch: {
    status?: PublishStatus;
    publishedAt?: Date | null;
    externalPostId?: string | null;
    externalUrl?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<PublishRecordView | null> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.publishRecord.update({
        where: { id },
        data: {
          status: patch.status,
          publishedAt: patch.publishedAt,
          externalPostId: patch.externalPostId,
          externalId: patch.externalPostId,
          externalUrl: patch.externalUrl,
          errorCode: patch.errorCode,
          errorMessage: patch.errorMessage,
          payload: patch.payload as Prisma.InputJsonValue | undefined,
        },
        include: { project: { select: { title: true } } },
      });
      return mapRecord(row);
    } catch {
      /* fallback */
    }
  }

  return fileUpdatePublishRecord(id, {
    status: patch.status,
    publishedAt:
      patch.publishedAt === null
        ? null
        : patch.publishedAt
          ? patch.publishedAt.toISOString()
          : undefined,
    externalPostId: patch.externalPostId,
    contentId: patch.externalPostId ?? undefined,
    externalUrl: patch.externalUrl,
    errorCode: patch.errorCode,
    errorMessage: patch.errorMessage,
    payload: patch.payload,
  } as Partial<PublishRecordView>);
}

export async function listPublishRecords(opts?: {
  projectId?: string;
  userId?: string | null;
}): Promise<PublishRecordView[]> {
  if (await isDatabaseAvailable()) {
    try {
      const rows = await prisma.publishRecord.findMany({
        where: {
          ...(opts?.projectId ? { projectId: opts.projectId } : {}),
          ...(opts?.userId
            ? { project: { userId: opts.userId } }
            : opts?.projectId
              ? {}
              : { project: { userId: null } }),
        },
        orderBy: { createdAt: "desc" },
        include: { project: { select: { title: true } } },
        take: 100,
      });
      return rows.map(mapRecord);
    } catch {
      /* fallback */
    }
  }
  return fileListPublishRecords(opts);
}

export async function getPublishRecord(
  id: string
): Promise<PublishRecordView | null> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.publishRecord.findUnique({
        where: { id },
        include: { project: { select: { title: true } } },
      });
      if (row) return mapRecord(row);
    } catch {
      /* fallback */
    }
  }
  return fileGetPublishRecord(id);
}

/**
 * Step 1–2: QA + platform adaptation + preview snapshot.
 * Does not publish. Never auto-publishes.
 */
export async function buildPublishPreview(input: {
  projectId: string;
  platform?: string;
  connectionId?: string | null;
}): Promise<PublishPreview> {
  const project = await getProject(input.projectId);
  if (!project) {
    return {
      projectId: input.projectId,
      platform: asPlatform(input.platform || "x"),
      connectionId: input.connectionId ?? null,
      contentSnapshot: {},
      adaptation: {
        ok: false,
        issues: [
          {
            field: "project",
            message: "创作项目不存在。",
            severity: "error",
          },
        ],
        summary: "创作项目不存在。",
      },
      qa: {
        passed: false,
        verdict: "NEEDS_REVISION",
        issues: ["创作项目不存在。"],
        details: [
          {
            id: "project_missing",
            category: "fact",
            where: "创作项目",
            why: "创作项目不存在。",
            how: "返回创作列表重新打开项目。",
            severity: "error",
          },
        ],
        suggestions: [],
        blockedAi: false,
      },
      canPublish: false,
      blockReason: "创作项目不存在。",
    };
  }

  const platform = asPlatform(
    input.platform || project.platform || "x"
  );
  const cap = getPlatformCapability(platform);
  const connection = input.connectionId
    ? await getConnection(input.connectionId)
    : null;

  const content =
    (project.content as Record<string, unknown> | null) ?? {};
  const videoMeta = content.__videoProject as
    | { durationSec?: number; aspectRatio?: string }
    | undefined;

  const adaptation = checkPlatformAdaptation(platform, {
    contentType: project.contentType,
    platform: project.platform,
    content,
    hasVideo:
      project.contentType === "short_video" ||
      Boolean(content.__videoProject),
    videoDurationSec: videoMeta?.durationSec ?? null,
    aspectRatio: videoMeta?.aspectRatio ?? null,
    imageCount: Array.isArray(content.images) ? content.images.length : 0,
  });

  const qaReport = await runContentQA({
    projectId: project.id,
    platform,
  });

  const qa: PublishPreview["qa"] = {
    passed: qaReport.verdict === "PASS",
    verdict: qaReport.verdict,
    issues: qaReport.issues.map(
      (i: { where: string; why: string }) => `${i.where}：${i.why}`
    ),
    details: qaReport.issues,
    suggestions: qaReport.suggestions,
    blockedAi: qaReport.blockedAi,
    checks: qaReport.checks,
  };

  let blockReason: string | null = null;
  // QA / preview never requires platform OAuth connection.
  // Direct one-click publish is optional and gated separately in the UI.
  if (qaReport.verdict === "NEEDS_REVISION") {
    blockReason = "内容质检未通过（NEEDS_REVISION）。请按问题清单修改后再发布。";
  } else if (!adaptation.ok) {
    blockReason = "该内容不符合当前平台适配要求，请按问题调整。";
  }

  const canDirectPublish =
    Boolean(cap.publishApiAvailable && cap.oauthConfigured) &&
    Boolean(connection && connection.status === "connected") &&
    !blockReason;

  return {
    projectId: project.id,
    platform,
    connectionId: connection?.id ?? input.connectionId ?? null,
    accountLabel:
      connection?.displayName ||
      PLATFORM_LABELS[platform] ||
      platform,
    contentSnapshot: contentSnapshot(project),
    adaptation,
    qa,
    canPublish: canDirectPublish,
    blockReason:
      blockReason ||
      (!cap.publishApiAvailable || !cap.oauthConfigured
        ? "一键直发暂未接入该平台；质检与预览已可用，可复制成稿自行发布。"
        : !connection || connection.status !== "connected"
          ? "质检与预览无需连接平台；若需一键直发，可稍后在账户中心连接（可选）。"
          : null),
  };
}

/**
 * Step 3–4: user confirm → publish attempt.
 * Never auto-publish; never fake published.
 */
export async function confirmAndPublish(input: {
  projectId: string;
  platform: string;
  connectionId?: string | null;
  confirmed: boolean;
}): Promise<{
  ok: boolean;
  record: PublishRecordView | null;
  message: string;
}> {
  if (!input.confirmed) {
    return {
      ok: false,
      record: null,
      message: userFacingPublishError("NOT_CONFIRMED"),
    };
  }

  const preview = await buildPublishPreview({
    projectId: input.projectId,
    platform: input.platform,
    connectionId: input.connectionId,
  });

  const project = await getProject(input.projectId);
  if (!project) {
    return {
      ok: false,
      record: null,
      message: userFacingPublishError("PROJECT_NOT_FOUND"),
    };
  }

  if (!preview.canPublish) {
    const record = await createRecord({
      projectId: input.projectId,
      platform: preview.platform,
      accountId: null,
      connectionId: preview.connectionId,
      status: "failed",
      payload: {
        preview: preview.contentSnapshot,
        adaptation: preview.adaptation,
        qa: preview.qa,
      },
      errorCode: preview.blockReason?.includes("质检")
        ? "QA_NEEDS_REVISION"
        : preview.blockReason?.includes("不符合")
          ? "ADAPTATION_FAILED"
          : preview.blockReason?.includes("连接")
            ? "CONNECTION_REQUIRED"
            : "PUBLISH_UNSUPPORTED",
      errorMessage: preview.blockReason,
      projectTitle: project.title,
    });
    return {
      ok: false,
      record,
      message: preview.blockReason ?? userFacingPublishError(),
    };
  }

  const connection = preview.connectionId
    ? await getConnection(preview.connectionId)
    : null;

  const publishPayload = {
    preview: preview.contentSnapshot,
    adaptation: preview.adaptation,
    qa: preview.qa,
    confirmedAt: new Date().toISOString(),
  };

  const publishing = await createRecord({
    projectId: input.projectId,
    platform: preview.platform,
    accountId: connection?.externalId ?? null,
    connectionId: connection?.id ?? null,
    status: "publishing",
    payload: publishPayload,
    projectTitle: project.title,
  });

  const provider = createPublishingProvider(preview.platform);
  const result = await provider.publish({
    platform: preview.platform,
    content: preview.contentSnapshot,
    connectionId: connection?.id,
  });

  if (result.status === "published") {
    const record = await updateRecord(publishing.id, {
      status: "published",
      publishedAt: new Date(),
      externalPostId: result.externalId ?? null,
      externalUrl: result.externalUrl ?? null,
      errorCode: null,
      errorMessage: null,
      payload: {
        ...publishPayload,
        contentId: result.externalId ?? null,
      },
    });
    return {
      ok: true,
      record: record
        ? {
            ...record,
            contentId: result.externalId ?? record.contentId ?? null,
            accountLabel: connection?.displayName ?? preview.accountLabel ?? null,
          }
        : record,
      message: "已发布",
    };
  }

  const code = result.errorCode ?? "PUBLISH_UNSUPPORTED";
  const message = userFacingPublishError(code);
  const record = await updateRecord(publishing.id, {
    status: result.status === "queued" ? "ready" : "failed",
    errorCode: code,
    errorMessage: message,
  });

  return {
    ok: false,
    record: record
      ? {
          ...record,
          accountLabel: connection?.displayName ?? preview.accountLabel ?? null,
        }
      : record,
    message,
  };
}

/**
 * Retry a failed publish — requires user confirm again.
 */
export async function retryPublish(input: {
  recordId: string;
  confirmed: boolean;
}): Promise<{
  ok: boolean;
  record: PublishRecordView | null;
  message: string;
}> {
  if (!input.confirmed) {
    return {
      ok: false,
      record: null,
      message: userFacingPublishError("NOT_CONFIRMED"),
    };
  }

  const prev = await getPublishRecord(input.recordId);
  if (!prev?.projectId) {
    return {
      ok: false,
      record: null,
      message: userFacingPublishError("PROJECT_NOT_FOUND"),
    };
  }

  if (prev.status === "published" || prev.status === "publishing") {
    return {
      ok: false,
      record: prev,
      message:
        prev.status === "published"
          ? "该记录已发布成功，无需重试。"
          : "正在发布中，请稍候。",
    };
  }

  return confirmAndPublish({
    projectId: prev.projectId,
    platform: prev.platform,
    connectionId: prev.connectionId,
    confirmed: true,
  });
}
