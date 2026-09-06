import { NextResponse } from "next/server";
import { assertProjectAccess } from "@/lib/creation-access";
import { getProject } from "@/modules/create/services/creation-service";
import { buildPublishPreview } from "@/modules/publish/services/publish-service";

/** QA + preview — requires project access. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    platform?: string;
    connectionId?: string;
  };

  if (!body.projectId) {
    return NextResponse.json(
      { ok: false, message: "缺少项目 ID" },
      { status: 400 }
    );
  }

  const project = await getProject(body.projectId);
  if (!project) {
    return NextResponse.json(
      { ok: false, message: "项目不存在" },
      { status: 404 }
    );
  }
  const access = await assertProjectAccess(project);
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, message: access.message },
      { status: access.status }
    );
  }

  const preview = await buildPublishPreview({
    projectId: body.projectId,
    platform: body.platform,
    connectionId: body.connectionId,
  });

  return NextResponse.json({ ok: true, preview });
}
