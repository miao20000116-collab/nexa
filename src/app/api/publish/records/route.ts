import { NextResponse } from "next/server";
import { assertProjectAccess } from "@/lib/creation-access";
import { getSession } from "@/modules/account/auth/service";
import { getProject } from "@/modules/create/services/creation-service";
import {
  getPublishRecord,
  listPublishRecords,
} from "@/modules/publish/services/publish-service";

/** Publish history — scoped by project or current user. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const id = url.searchParams.get("id");
  const session = await getSession();
  const userId = session.authenticated ? session.user?.id ?? null : null;

  if (id) {
    const record = await getPublishRecord(id);
    if (!record) {
      return NextResponse.json(
        { ok: false, message: "记录不存在" },
        { status: 404 }
      );
    }
    if (record.projectId) {
      const project = await getProject(record.projectId);
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
    }
    return NextResponse.json({ ok: true, record });
  }

  if (projectId) {
    const project = await getProject(projectId);
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
    const records = await listPublishRecords({ projectId });
    return NextResponse.json({ ok: true, records });
  }

  // List only current user's (or guest null-owner) records — never global dump
  const records = await listPublishRecords({ userId });
  return NextResponse.json({ ok: true, records });
}
