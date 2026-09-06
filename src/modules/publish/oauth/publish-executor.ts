/**
 * Platform publish executors — only real API calls when tokens + credentials exist.
 */

import { loadConnectionTokens } from "@/modules/publish/oauth/token-store";
import type { PublishRequest, PublishResult } from "@/modules/providers/interfaces";

const UNSUPPORTED = "当前平台暂不支持直接发布";

function textFromContent(content: Record<string, unknown>): string {
  const c = (content.content as Record<string, unknown> | undefined) ?? content;
  const parts = [
    c.title,
    c.hook,
    c.body ?? c.script ?? c.caption,
    c.cta,
    Array.isArray(c.hashtags) ? (c.hashtags as string[]).join(" ") : null,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  const text = parts.join("\n\n").slice(0, 280);
  return text || String(content.title ?? "Nexa 发布");
}

export async function executePlatformPublish(
  platform: string,
  req: PublishRequest
): Promise<PublishResult> {
  if (!req.connectionId) {
    return { status: "failed", errorCode: "CONNECTION_REQUIRED" };
  }

  const tokens = await loadConnectionTokens(req.connectionId);
  if (!tokens?.accessToken) {
    return { status: "failed", errorCode: "CONNECTION_EXPIRED" };
  }

  if (platform === "x") {
    const text = textFromContent(req.content);
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok) {
      return {
        status: "failed",
        errorCode: "PUBLISH_API_ERROR",
      };
    }
    const tweetId = data.data?.id;
    return {
      status: "published",
      externalId: tweetId ?? undefined,
      externalUrl: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
    };
  }

  return { status: "unsupported", errorCode: "PUBLISH_UNSUPPORTED" };
}

export { UNSUPPORTED };
