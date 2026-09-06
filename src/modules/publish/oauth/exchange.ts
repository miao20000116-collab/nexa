/**
 * OAuth code → token exchange. Never fakes success without real credentials.
 */

import type { PublishPlatform } from "@/modules/publish/types";
import type { OAuthTokenBundle } from "@/lib/publish/token-vault";

function redirectUri(): string {
  const base =
    process.env.NEXA_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return `${base}/api/publish/oauth/callback`;
}

async function postForm(
  url: string,
  body: Record<string, string>,
  headers?: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : typeof json.error_description === "string"
          ? json.error_description
          : `OAuth exchange failed (${res.status})`
    );
  }
  return json;
}

export async function exchangeOAuthCode(
  platform: PublishPlatform,
  code: string
): Promise<{
  ok: boolean;
  tokens?: OAuthTokenBundle;
  externalId?: string | null;
  displayName?: string | null;
  scopes?: string | null;
  message: string;
}> {
  const redirect = redirectUri();

  switch (platform) {
    case "x": {
      const clientId =
        process.env.NEXA_X_CLIENT_ID || process.env.X_CLIENT_ID || "";
      const clientSecret =
        process.env.NEXA_X_CLIENT_SECRET || process.env.X_CLIENT_SECRET || "";
      if (!clientId || !clientSecret) {
        return { ok: false, message: "当前平台暂不支持直接发布" };
      }
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64"
      );
      const data = await postForm(
        "https://api.twitter.com/2/oauth2/token",
        {
          grant_type: "authorization_code",
          code,
          redirect_uri: redirect,
          code_verifier: "challenge",
          client_id: clientId,
        },
        { Authorization: `Basic ${basic}` }
      );
      const accessToken = String(data.access_token ?? "");
      if (!accessToken) {
        return { ok: false, message: "授权交换失败" };
      }
      let externalId: string | null = null;
      let displayName: string | null = null;
      try {
        const meRes = await fetch("https://api.twitter.com/2/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as {
            data?: { id?: string; username?: string; name?: string };
          };
          externalId = me.data?.id ?? null;
          displayName = me.data?.username
            ? `@${me.data.username}`
            : me.data?.name ?? null;
        }
      } catch {
        /* optional profile */
      }
      const expiresIn = Number(data.expires_in ?? 0);
      return {
        ok: true,
        tokens: {
          accessToken,
          refreshToken: data.refresh_token ? String(data.refresh_token) : null,
          expiresAt:
            expiresIn > 0
              ? new Date(Date.now() + expiresIn * 1000).toISOString()
              : null,
          tokenType: data.token_type ? String(data.token_type) : "bearer",
        },
        externalId,
        displayName,
        scopes: data.scope ? String(data.scope) : null,
        message: "已连接",
      };
    }

    case "youtube": {
      const clientId =
        process.env.NEXA_YOUTUBE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        process.env.YOUTUBE_CLIENT_ID ||
        "";
      const clientSecret =
        process.env.NEXA_YOUTUBE_CLIENT_SECRET ||
        process.env.GOOGLE_CLIENT_SECRET ||
        "";
      if (!clientId || !clientSecret) {
        return { ok: false, message: "当前平台暂不支持直接发布" };
      }
      const data = await postForm("https://oauth2.googleapis.com/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const accessToken = String(data.access_token ?? "");
      if (!accessToken) {
        return { ok: false, message: "授权交换失败" };
      }
      const expiresIn = Number(data.expires_in ?? 0);
      return {
        ok: true,
        tokens: {
          accessToken,
          refreshToken: data.refresh_token ? String(data.refresh_token) : null,
          expiresAt:
            expiresIn > 0
              ? new Date(Date.now() + expiresIn * 1000).toISOString()
              : null,
          tokenType: "bearer",
        },
        externalId: null,
        displayName: "YouTube 账号",
        scopes: data.scope ? String(data.scope) : null,
        message: "已连接",
      };
    }

    default:
      return { ok: false, message: "当前平台暂不支持直接发布" };
  }
}
