import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  listProjects,
} from "@/modules/create/services/creation-service";
import type {
  ContentType,
  CreationPlatform,
  CreationStartMode,
} from "@/modules/create/types";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        goal: p.goal,
        platform: p.platform,
        contentType: p.contentType,
        status: p.status,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error("[Create API GET]", err);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const goal = String(body.goal ?? "").trim();
    if (!goal) {
      return NextResponse.json({ error: "请填写创作目标" }, { status: 400 });
    }

    const project = await createProject({
      goal,
      contentType: (body.contentType ?? "social_post") as ContentType,
      platform: (body.platform ?? "xiaohongshu") as CreationPlatform,
      startMode: (body.startMode ?? "idea") as CreationStartMode,
      title: body.title,
      brief: body.brief,
      workspaceId: body.workspaceId,
      researchId: body.researchId ? String(body.researchId) : undefined,
      linkUrl: body.linkUrl,
      sources: body.sources,
      assetIds: body.assetIds,
      commerceContext: body.commerceContext
        ? String(body.commerceContext)
        : undefined,
      promptOverride: body.promptOverride
        ? String(body.promptOverride)
        : undefined,
      referenceStoryboard: body.referenceStoryboard ?? undefined,
      seedContent:
        body.seedContent && typeof body.seedContent === "object"
          ? body.seedContent
          : undefined,
    });

    // Enrich cover vision server-side when package has cover but no vision yet
    if (
      project?.id &&
      body.referenceStoryboard?.coverUrl &&
      !body.referenceStoryboard?.coverVision
    ) {
      try {
        const { enrichCoverVision } = await import(
          "@/modules/create/services/reference-storyboard-enrich"
        );
        const { REFERENCE_STORYBOARD_KEY } = await import(
          "@/modules/create/services/reference-storyboard-package"
        );
        const { getProject, updateProject } = await import(
          "@/modules/create/services/creation-service"
        );
        const vision = await enrichCoverVision(
          body.referenceStoryboard.coverUrl,
          {
            title: body.referenceStoryboard.title,
            caption: body.referenceStoryboard.caption,
          }
        );
        if (vision) {
          const fresh = await getProject(project.id);
          if (fresh) {
            const content = {
              ...((fresh.content as Record<string, unknown>) ?? {}),
              [REFERENCE_STORYBOARD_KEY]: {
                ...body.referenceStoryboard,
                coverVision: vision,
                structureHints: [
                  `封面画面线索：${vision.slice(0, 120)}`,
                  ...(body.referenceStoryboard.structureHints || []).filter(
                    (h: string) => !h.includes("封面")
                  ),
                ].slice(0, 12),
              },
            };
            await updateProject(project.id, { content });
          }
        }
      } catch (err) {
        console.error("[Create API] cover vision enrich skipped", err);
      }
    }

    const { getProject } = await import(
      "@/modules/create/services/creation-service"
    );
    const finalProject = (await getProject(project.id)) ?? project;
    return NextResponse.json(finalProject);
  } catch (err) {
    console.error("[Create API POST]", err);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
