import { NextRequest, NextResponse } from "next/server";
import {
  getProject,
  updateProject,
  deleteProject,
  updateContentField,
  setProjectAssets,
  requestAiGeneration,
  requestFieldRewrite,
} from "@/modules/create/services/creation-service";
import { assertProjectAccess } from "@/lib/creation-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }
  const access = await assertProjectAccess(project);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await getProject(id);
    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const access = await assertProjectAccess(existing);
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status });
    }

    const body = await request.json();
    const action = body.action as string | undefined;

    if (action === "update_field") {
      const field = String(body.field ?? "");
      if (!field) {
        return NextResponse.json({ error: "缺少字段" }, { status: 400 });
      }
      const project = await updateContentField(id, field, body.value ?? "");
      if (!project) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      return NextResponse.json(project);
    }

    if (action === "set_assets") {
      const project = await setProjectAssets(id, body.assetIds ?? []);
      if (!project) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      return NextResponse.json(project);
    }

    if (action === "import_workspace_media") {
      const { linkWorkspaceMediaToProject } = await import(
        "@/modules/create/services/link-workspace-media"
      );
      const result = await linkWorkspaceMediaToProject(id);
      if (!result) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      return NextResponse.json({
        ...result.project,
        importResult: {
          imported: result.imported,
          linkedExisting: result.linkedExisting,
          skippedExternal: result.skippedExternal,
          skippedUnreadable: result.skippedUnreadable,
          messages: result.messages,
        },
      });
    }

    if (action === "generate") {
      const result = await requestAiGeneration(id, {
        confirm: Boolean(body.confirm),
        jobId: body.jobId ? String(body.jobId) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json(result, {
          status:
            result.code === "blocked_ai_unavailable"
              ? 503
              : result.code === "insufficient_credits"
                ? 402
                : 400,
        });
      }
      return NextResponse.json(result.project);
    }

    if (action === "rewrite_field") {
      const result = await requestFieldRewrite(
        id,
        String(body.field ?? ""),
        String(body.rewriteAction ?? "more_natural"),
        {
          confirm: Boolean(body.confirm),
          jobId: body.jobId ? String(body.jobId) : undefined,
        }
      );
      if (!result.ok) {
        return NextResponse.json(result, {
          status:
            result.code === "blocked_ai_unavailable"
              ? 503
              : result.code === "insufficient_credits"
                ? 402
                : 400,
        });
      }
      return NextResponse.json(result.project);
    }

    if (action === "generate_variants") {
      const { requestVariantGeneration } = await import(
        "@/modules/create/services/creation-intelligence"
      );
      const result = await requestVariantGeneration(id, {
        confirm: Boolean(body.confirm),
        jobId: body.jobId ? String(body.jobId) : undefined,
      });
      if (!result.ok) {
        return NextResponse.json(result, {
          status:
            result.code === "blocked_ai_unavailable"
              ? 503
              : result.code === "insufficient_credits"
                ? 402
                : 400,
        });
      }
      return NextResponse.json({
        project: result.project,
        variants: result.variants,
        explainability: result.explainability,
      });
    }

    if (action === "mark_completed") {
      const done = await updateProject(id, { status: "completed" });
      if (!done) {
        return NextResponse.json({ error: "项目不存在" }, { status: 404 });
      }
      return NextResponse.json(done);
    }

    if (action === "save_prompt") {
      const content = {
        ...((existing.content ?? {}) as Record<string, unknown>),
        _promptOverride: String(body.promptOverride ?? "") || undefined,
      };
      const withPrompt = await updateProject(id, {
        content: content as import("@/modules/create/types").StructuredContent,
      });
      return NextResponse.json(withPrompt);
    }

    const project = await updateProject(id, {
      title: body.title,
      goal: body.goal,
      brief: body.brief,
      status: body.status,
      content: body.content,
      timeline: body.timeline,
      sources: body.sources,
      platform: body.platform,
      contentType: body.contentType,
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (err) {
    console.error("[Create Project API]", err);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await getProject(id);
    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const access = await assertProjectAccess(existing);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.message },
        { status: access.status }
      );
    }
    await deleteProject(id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("[Create Project DELETE]", err);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
