import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { retryPublish } from "@/modules/publish/services/publish-service";

export async function POST(req: Request) {
  const auth = await requireLogin("publish");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    recordId?: string;
    confirmed?: boolean;
  };

  if (!body.recordId) {
    return NextResponse.json(
      { ok: false, message: "缺少发布记录 ID" },
      { status: 400 }
    );
  }

  if (!body.confirmed) {
    return NextResponse.json(
      { ok: false, message: "请先确认后再重新发布。" },
      { status: 400 }
    );
  }

  const result = await retryPublish({
    recordId: body.recordId,
    confirmed: true,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
