import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import { getSession } from "@/modules/account/auth/service";
import {
  disconnectConnection,
  listConnections,
  startOAuthConnect,
} from "@/modules/publish/services/connection-service";
import type { PublishPlatform } from "@/modules/publish/types";

export async function GET() {
  const session = await getSession();
  const connections = await listConnections(session.user?.id ?? null);
  return NextResponse.json({ connections });
}

export async function POST(req: Request) {
  const auth = await requireLogin("connect_platform");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: auth.message },
      { status: auth.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    platform?: string;
    connectionId?: string;
  };

  if (body.action === "disconnect" && body.connectionId) {
    const ok = await disconnectConnection(body.connectionId);
    return NextResponse.json({ ok });
  }

  if (body.action === "connect" && body.platform) {
    const result = await startOAuthConnect(body.platform as PublishPlatform);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json(
    { ok: false, message: "无效请求" },
    { status: 400 }
  );
}
