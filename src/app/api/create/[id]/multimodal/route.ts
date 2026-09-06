import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/modules/create/services/creation-service";
import { assertProjectAccess } from "@/lib/creation-access";
import { runMultimodalPipeline } from "@/modules/create/services/multimodal-pipeline";

/** Multimodal pipeline — available without login (creation is guest-open). */
export async function POST(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}));
  const result = await runMultimodalPipeline(id, {
    steps: body.steps,
    confirm: Boolean(body.confirm),
    preferExistingAssets: body.preferExistingAssets !== false,
  });

  return NextResponse.json(result);
}
