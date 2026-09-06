import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import { listIntegrationStatuses } from "@/modules/integrations/status";
import {
  disconnectConnection,
  listConnections,
} from "@/modules/publish/services/connection-service";

/**
 * V4.6 Ecosystem Integrations
 * Lifecycle: Connect → Sync → Use → Disconnect (honest states only)
 */
export async function GET() {
  const integrations = await listIntegrationStatuses();
  return NextResponse.json({ integrations });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await request.json();
  const action = body.action as string;

  if (action === "status") {
    const integrations = await listIntegrationStatuses();
    return NextResponse.json({ integrations });
  }

  if (action === "sync") {
    const connections = await listConnections();
    const target = connections.find(
      (c) => c.provider === body.provider && c.status === "connected"
    );
    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          state: "disconnected",
          message: "未连接或无权同步，不会假装 Sync 成功",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      state: "connected",
      message: "连接有效，可继续使用发布/同步能力",
      connectionId: target.id,
      syncedAt: new Date().toISOString(),
    });
  }

  if (action === "disconnect") {
    const connections = await listConnections();
    const target = connections.find((c) => c.provider === body.provider);
    if (!target) {
      return NextResponse.json(
        { ok: false, message: "没有可断开的连接" },
        { status: 404 }
      );
    }
    await disconnectConnection(target.id);
    return NextResponse.json({
      ok: true,
      state: "disconnected",
      message: "已断开连接",
    });
  }

  if (action === "connect") {
    // Real OAuth starts at /api/publish/oauth — never fake connect
    return NextResponse.json({
      ok: true,
      state: "disconnected",
      message: "请通过官方 OAuth 完成连接",
      href: `/api/publish/oauth?provider=${encodeURIComponent(body.provider || "")}`,
    });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
