import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { assertProjectAccess } from "@/lib/creation-access";
import { getProject } from "@/modules/create/services/creation-service";
import { confirmAndPublish } from "@/modules/publish/services/publish-service";

export async function POST(req: Request) {
  const auth = await requireLogin("publish");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    platform?: string;
    connectionId?: string;
    confirmed?: boolean;
  };

  if (!body.projectId || !body.platform) {
    return NextResponse.json(
      { ok: false, message: "缺少项目或平台" },
      { status: 400 }
    );
  }

  if (!body.confirmed) {
    return NextResponse.json(
      { ok: false, message: "请先确认发布预览后再发布。" },
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

  const result = await confirmAndPublish({
    projectId: body.projectId,
    platform: body.platform,
    connectionId: body.connectionId,
    confirmed: true,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
