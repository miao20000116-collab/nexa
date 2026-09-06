/** Map internal errors to user-safe Chinese messages. Never expose keys, endpoints, or stack traces. */

const SENSITIVE =
  /api[_-]?key|bearer\s|https?:\/\/|localhost|openai|anthropic|searxng|youtube|ffmpeg|prisma|ECONNREFUSED|ENOTFOUND|fetch failed|at\s+\w+\.|\.ts:\d+|stack trace/i;

export const USER_ERRORS = {
  generic: "出了点问题，请稍后再试",
  searchUnavailable: "搜索暂时不可用，请稍后再试",
  searchTimeout: "搜索超时，请稍后再试",
  aiUnavailable: "AI 服务暂未接入",
  aiTimeout: "AI 处理超时，请稍后再试",
  providerUnavailable: "服务暂时不可用",
  renderFailed: "渲染失败，请检查素材与音乐轨道后重试",
  oauthFailed: "授权失败，请重新连接平台账号",
  storageFailed: "存储暂时不可用，请稍后再试",
  loginRequired: "需要登录后使用",
} as const;

export function toUserErrorMessage(
  error: unknown,
  fallback: string = USER_ERRORS.generic
): string {
  if (!error) return fallback;

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;

  if (code === "AI_CAPABILITY_NOT_CONFIGURED") return USER_ERRORS.aiUnavailable;
  if (code === "blocked_ai_unavailable") return USER_ERRORS.aiUnavailable;
  if (code === "ai_unavailable") return USER_ERRORS.aiUnavailable;
  if (code === "ai_timeout") return USER_ERRORS.aiTimeout;
  if (code === "ai_rate_limit") return "AI 服务请求过于频繁，请稍后再试";
  if (code === "ai_error") return "AI 服务返回错误，请稍后再试";

  const raw = error instanceof Error ? error.message : String(error);
  if (!raw.trim()) return fallback;

  if (/AI_CAPABILITY_NOT_CONFIGURED|blocked_ai/i.test(raw)) {
    return USER_ERRORS.aiUnavailable;
  }
  if (/not configured|unavailable/i.test(raw)) {
    return USER_ERRORS.providerUnavailable;
  }
  if (/timeout|timed out/i.test(raw)) {
    return USER_ERRORS.aiTimeout;
  }
  if (/oauth|authorization/i.test(raw)) {
    return USER_ERRORS.oauthFailed;
  }
  if (/storage|ENOENT|EACCES|EPERM/i.test(raw)) {
    return USER_ERRORS.storageFailed;
  }
  if (/render|ffmpeg/i.test(raw)) {
    return USER_ERRORS.renderFailed;
  }
  if (SENSITIVE.test(raw)) return fallback;

  // Allow short Chinese messages from business logic
  if (/[\u4e00-\u9fff]/.test(raw) && raw.length <= 120) {
    return raw;
  }

  return fallback;
}
