import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  fileDeleteConnection,
  fileGetConnection,
  fileListConnections,
  fileUpsertConnection,
} from "@/lib/publish/file-store";
import { getPlatformCapability } from "@/modules/publish/capabilities";
import { exchangeOAuthCode } from "@/modules/publish/oauth/exchange";
import {
  clearConnectionTokens,
  saveConnectionTokens,
} from "@/modules/publish/oauth/token-store";
import type {
  PlatformConnection,
  PublishPlatform,
} from "@/modules/publish/types";
import { PLATFORM_LABELS } from "@/modules/publish/types";
import { getSession } from "@/modules/account/auth/service";

function mapConnection(row: {
  id: string;
  userId: string | null;
  provider: string;
  status: string;
  displayName: string | null;
  externalId: string | null;
  scopes: string | null;
  connectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PlatformConnection {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    status: row.status,
    displayName: row.displayName,
    externalId: row.externalId,
    scopes: row.scopes,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConnections(
  userId?: string | null
): Promise<PlatformConnection[]> {
  // Never return encrypted tokens — metadata stripped in mapConnection
  if (await isDatabaseAvailable()) {
    try {
      const rows = await prisma.connection.findMany({
        where: userId ? { userId } : undefined,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(mapConnection);
    } catch {
      /* fallback */
    }
  }
  return fileListConnections(userId);
}

export async function getConnection(
  id: string
): Promise<PlatformConnection | null> {
  if (await isDatabaseAvailable()) {
    try {
      const row = await prisma.connection.findUnique({ where: { id } });
      if (row) return mapConnection(row);
    } catch {
      /* fallback */
    }
  }
  return fileGetConnection(id);
}

/**
 * Start OAuth connection. Never asks for user API keys.
 * If platform OAuth app is not configured on Nexa backend → unsupported.
 */
export async function startOAuthConnect(platform: PublishPlatform): Promise<{
  ok: boolean;
  message: string;
  authorizeUrl?: string;
  connectionId?: string;
}> {
  const cap = getPlatformCapability(platform);
  if (!cap.oauthConfigured) {
    return {
      ok: false,
      message: "当前平台暂不支持直接发布",
    };
  }

  const session = await getSession();
  const pending = await upsertConnection({
    userId: session.user?.id ?? null,
    provider: platform,
    status: "pending",
    displayName: `${PLATFORM_LABELS[platform] ?? platform}（授权中）`,
  });

  const base =
    process.env.NEXA_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const redirectUri = `${base}/api/publish/oauth/callback`;
  const state = pending.id;

  // Build authorize URL when client id exists — exchange still requires wired secrets.
  let authorizeUrl: string | undefined;
  switch (platform) {
    case "x": {
      const clientId =
        process.env.NEXA_X_CLIENT_ID || process.env.X_CLIENT_ID || "";
      authorizeUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("tweet.read tweet.write users.read offline.access")}&state=${encodeURIComponent(state)}&code_challenge=challenge&code_challenge_method=plain`;
      break;
    }
    case "youtube": {
      const clientId =
        process.env.NEXA_YOUTUBE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.YOUTUBE_CLIENT_ID ||
        "";
      authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("https://www.googleapis.com/auth/youtube.upload")}&access_type=offline&state=${encodeURIComponent(state)}`;
      break;
    }
    case "tiktok": {
      const clientKey =
        process.env.NEXA_TIKTOK_CLIENT_KEY ||
        process.env.TIKTOK_CLIENT_KEY ||
        "";
      authorizeUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}&scope=video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
      break;
    }
    case "instagram": {
      const clientId =
        process.env.NEXA_INSTAGRAM_CLIENT_ID ||
        process.env.INSTAGRAM_CLIENT_ID ||
        process.env.NEXA_META_APP_ID ||
        "";
      authorizeUrl = `https://api.instagram.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user_profile,user_media&response_type=code&state=${encodeURIComponent(state)}`;
      break;
    }
    case "linkedin": {
      const clientId =
        process.env.NEXA_LINKEDIN_CLIENT_ID ||
        process.env.LINKEDIN_CLIENT_ID ||
        "";
      authorizeUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("w_member_social")}&state=${encodeURIComponent(state)}`;
      break;
    }
    default:
      return {
        ok: false,
        message: "当前平台暂不支持直接发布",
        connectionId: pending.id,
      };
  }

  return {
    ok: true,
    message: "正在跳转官方授权…",
    authorizeUrl,
    connectionId: pending.id,
  };
}

/**
 * OAuth callback — exchange code for tokens; store encrypted server-side only.
 */
export async function handleOAuthCallback(input: {
  state?: string | null;
  code?: string | null;
  error?: string | null;
}): Promise<{ ok: boolean; message: string; redirect: string }> {
  const connectionId = input.state?.trim();
  if (!connectionId) {
    return {
      ok: false,
      message: "授权无效",
      redirect: "/account/connections?error=invalid_state",
    };
  }

  const existing = await getConnection(connectionId);
  const platform = (existing?.provider ?? "unknown") as PublishPlatform;

  if (input.error || !input.code) {
    await upsertConnection({
      id: connectionId,
      provider: platform,
      status: "error",
      displayName: "授权已取消",
    });
    await clearConnectionTokens(connectionId);
    return {
      ok: false,
      message: "授权已取消或失败，请重新授权连接。",
      redirect: "/account/connections?error=oauth_denied",
    };
  }

  try {
    const exchanged = await exchangeOAuthCode(platform, input.code);
    if (!exchanged.ok || !exchanged.tokens) {
      await upsertConnection({
        id: connectionId,
        provider: platform,
        status: "error",
        displayName: "授权未完成",
      });
      await clearConnectionTokens(connectionId);
      return {
        ok: false,
        message: exchanged.message,
        redirect: "/account/connections?error=publish_unsupported",
      };
    }

    await saveConnectionTokens(connectionId, exchanged.tokens);
    await upsertConnection({
      id: connectionId,
      userId: existing?.userId ?? null,
      provider: platform,
      status: "connected",
      displayName:
        exchanged.displayName ??
        `${PLATFORM_LABELS[platform] ?? platform} 账号`,
      externalId: exchanged.externalId ?? null,
      scopes: exchanged.scopes ?? null,
      connectedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      message: "已连接",
      redirect: "/account/connections?connected=1",
    };
  } catch {
    await upsertConnection({
      id: connectionId,
      provider: platform,
      status: "error",
      displayName: "授权失败",
    });
    await clearConnectionTokens(connectionId);
    return {
      ok: false,
      message: "授权交换失败，请重试。",
      redirect: "/account/connections?error=oauth_denied",
    };
  }
}

export async function upsertConnection(input: {
  id?: string;
  userId?: string | null;
  provider: string;
  status: string;
  displayName?: string | null;
  externalId?: string | null;
  scopes?: string | null;
  connectedAt?: string | null;
}): Promise<PlatformConnection> {
  if (await isDatabaseAvailable()) {
    try {
      if (input.id) {
        const row = await prisma.connection.update({
          where: { id: input.id },
          data: {
            status: input.status,
            displayName: input.displayName ?? undefined,
            externalId: input.externalId ?? undefined,
            scopes: input.scopes ?? undefined,
            connectedAt: input.connectedAt
              ? new Date(input.connectedAt)
              : input.status === "connected"
                ? new Date()
                : undefined,
          },
        });
        return mapConnection(row);
      }

      const existing = await prisma.connection.findFirst({
        where: {
          provider: input.provider,
          ...(input.userId ? { userId: input.userId } : { userId: null }),
        },
      });
      if (existing) {
        const row = await prisma.connection.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            displayName: input.displayName ?? undefined,
            externalId: input.externalId ?? undefined,
            scopes: input.scopes ?? undefined,
            connectedAt:
              input.status === "connected"
                ? new Date()
                : existing.connectedAt,
          },
        });
        return mapConnection(row);
      }

      const row = await prisma.connection.create({
        data: {
          userId: input.userId ?? null,
          provider: input.provider,
          status: input.status,
          displayName: input.displayName ?? null,
          externalId: input.externalId ?? null,
          scopes: input.scopes ?? null,
          connectedAt: input.status === "connected" ? new Date() : null,
        },
      });
      return mapConnection(row);
    } catch {
      /* fallback */
    }
  }

  return fileUpsertConnection(input);
}

export async function disconnectConnection(id: string): Promise<boolean> {
  await clearConnectionTokens(id);
  if (await isDatabaseAvailable()) {
    try {
      await prisma.connection.update({
        where: { id },
        data: {
          status: "disconnected",
          connectedAt: null,
        },
      });
      return true;
    } catch {
      /* fallback */
    }
  }
  const existing = await fileGetConnection(id);
  if (!existing) return false;
  await fileUpsertConnection({
    ...existing,
    status: "disconnected",
    connectedAt: null,
  });
  return true;
}

export async function removeConnection(id: string): Promise<boolean> {
  if (await isDatabaseAvailable()) {
    try {
      await prisma.connection.delete({ where: { id } });
      return true;
    } catch {
      /* fallback */
    }
  }
  return fileDeleteConnection(id);
}
