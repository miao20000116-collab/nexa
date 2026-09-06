/** Typed AI failures — never return fake success payloads. */

export type AIErrorCode =
  | "ai_timeout"
  | "ai_rate_limit"
  | "ai_error"
  | "ai_unavailable"
  | "insufficient_credits"
  | "pricing_unavailable";

export type AIUsageStatus =
  | "success"
  | "failed"
  | "timeout"
  | "rate_limited"
  | "unavailable";

export class AIError extends Error {
  readonly code: AIErrorCode;

  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.name = "AIError";
    this.code = code;
  }
}

export class AITimeoutError extends AIError {
  constructor(message = "AI 请求超时") {
    super("ai_timeout", message);
    this.name = "AITimeoutError";
  }
}

export class AIRateLimitError extends AIError {
  constructor(message = "AI 服务请求过于频繁，请稍后再试") {
    super("ai_rate_limit", message);
    this.name = "AIRateLimitError";
  }
}

export class AIProviderError extends AIError {
  constructor(message = "AI 服务返回错误") {
    super("ai_error", message);
    this.name = "AIProviderError";
  }
}

export class AIUnavailableError extends AIError {
  constructor(message = "AI 服务暂未接入") {
    super("ai_unavailable", message);
    this.name = "AIUnavailableError";
  }
}

export function classifyProviderError(err: unknown): AIError {
  if (err instanceof AIError) return err;

  if (err instanceof Error) {
    if (err.name === "AbortError" || /abort|timeout/i.test(err.message)) {
      return new AITimeoutError();
    }
    if (/429|rate.?limit|too many requests/i.test(err.message)) {
      return new AIRateLimitError();
    }
    if (/not configured|暂未接入/i.test(err.message)) {
      return new AIUnavailableError();
    }
    return new AIProviderError(err.message);
  }

  return new AIProviderError("AI 服务未知错误");
}

export function usageStatusFromError(err: unknown): AIUsageStatus {
  if (err instanceof AITimeoutError) return "timeout";
  if (err instanceof AIRateLimitError) return "rate_limited";
  if (err instanceof AIUnavailableError) return "unavailable";
  return "failed";
}
