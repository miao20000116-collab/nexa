import type {
  PublishResult,
  PublishingProvider,
  ProviderStatus,
} from "@/modules/providers/interfaces";
import { notConfiguredStatus } from "@/modules/providers/interfaces";
import { getPlatformCapability } from "./capabilities";
import {
  executePlatformPublish,
  UNSUPPORTED,
} from "./oauth/publish-executor";
import { loadConnectionTokens } from "./oauth/token-store";
import type { PublishPlatform } from "./types";

function unsupportedResult(code = "PUBLISH_UNSUPPORTED"): PublishResult {
  return {
    status: "unsupported",
    errorCode: code,
  };
}

/**
 * Platform publishing providers.
 * Never fake published success. Publish only when OAuth + API + token exist.
 */
export function createPublishingProvider(
  platform: PublishPlatform | string
): PublishingProvider {
  const p = platform as PublishPlatform;
  const cap = (() => {
    try {
      return getPlatformCapability(p);
    } catch {
      return null;
    }
  })();

  const configured = Boolean(cap?.oauthConfigured && cap?.publishApiAvailable);

  return {
    platform,
    isConfigured: () => configured,
    getStatus: async (): Promise<ProviderStatus> => {
      if (!configured) {
        return notConfiguredStatus(UNSUPPORTED);
      }
      return {
        available: true,
        code: "PROVIDER_AVAILABLE",
        message: "可尝试发布（需已连接账号且用户确认）",
      };
    },
    publish: async (req): Promise<PublishResult> => {
      if (!configured) {
        return unsupportedResult("PUBLISH_NOT_CONFIGURED");
      }
      if (!req.connectionId) {
        return { status: "failed", errorCode: "CONNECTION_REQUIRED" };
      }
      const tokens = await loadConnectionTokens(req.connectionId);
      if (!tokens?.accessToken) {
        return unsupportedResult("PUBLISH_API_PENDING");
      }
      try {
        return await executePlatformPublish(p, req);
      } catch {
        return { status: "failed", errorCode: "PUBLISH_API_ERROR" };
      }
    },
  };
}

export function userFacingPublishError(code?: string | null): string {
  switch (code) {
    case "PUBLISH_NOT_CONFIGURED":
    case "PUBLISH_API_PENDING":
    case "PUBLISH_UNSUPPORTED":
      return UNSUPPORTED;
    case "PUBLISH_API_ERROR":
      return "发布失败，请稍后重试。";
    case "CONNECTION_REQUIRED":
      return "请先通过官方授权连接平台账号。";
    case "CONNECTION_EXPIRED":
      return "授权已失效，请重新授权连接。";
    case "ADAPTATION_FAILED":
      return "该内容不符合当前平台要求。";
    case "NOT_CONFIRMED":
      return "请先确认发布预览后再发布。";
    case "ALREADY_PUBLISHING":
      return "正在发布中，请稍候。";
    case "PROJECT_NOT_FOUND":
      return "创作项目不存在。";
    case "QA_NEEDS_REVISION":
      return "内容质检未通过，请修改后再发布。";
    default:
      return code ? "发布失败，请稍后重试。" : UNSUPPORTED;
  }
}
