/**
 * AIOrchestrator — single entry for AI capabilities.
 * Flow: Capability → CapabilityRouter → ProviderRegistry → Model
 */

import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import {
  AIError,
  AIUnavailableError,
  classifyProviderError,
  usageStatusFromError,
} from "@/modules/ai/gateway/errors";
import { getProviderExecutor } from "@/modules/ai/gateway/provider-executors";
import { recordAIUsage } from "@/modules/ai/gateway/usage-log";
import type { AICapability, ContentQAResult } from "@/modules/ai/gateway/types";
import { routeCapability } from "@/modules/ai/router/capability-router";
import {
  chargeCreditsForUsage,
  creditsForCapability,
} from "@/modules/ai/gateway/credits-bridge";
import type {
  ImageGenerationRequest,
  MediaAnalysisRequest,
  QualityCheckRequest,
  ResearchRequest,
  TextGenerationRequest,
  VideoGenerationRequest,
} from "@/modules/providers/interfaces";
import { getPrimaryTextProvider } from "@/modules/ai/providers/provider-factory";

export interface AICallOptions {
  userId?: string | null;
  /** Ledger account (user id or guest:uuid) */
  accountId?: string | null;
  jobId?: string;
  /** Bill a different capability key than the routed one (e.g. aiOverview) */
  billingCapability?: string;
  referenceType?: string;
  referenceId?: string;
  quality?: "fast" | "balanced" | "high";
}

interface ExecuteResult<T> {
  data: T;
  requestId: string;
  usage: {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
    creditsUsed: number | null;
  };
}

async function executeCapability<T>(
  capability: AICapability,
  opts: AICallOptions | undefined,
  run: (providerId: string, model: string) => Promise<{
    result: T;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs: number;
  }>
): Promise<ExecuteResult<T>> {
  bootstrapAIProviders();

  const route = routeCapability({
    capability,
    quality: opts?.quality,
  });

  if (!route) {
    throw new AIUnavailableError();
  }

  const executor = getProviderExecutor(route.providerId);
  if (!executor?.isConfigured()) {
    throw new AIUnavailableError();
  }

  const started = Date.now();

  try {
    const out = await run(route.providerId, route.model);
    const accountId = opts?.accountId ?? opts?.userId ?? null;
    const charge = await chargeCreditsForUsage({
      accountId,
      userId: accountId,
      capability: opts?.billingCapability ?? capability,
      referenceId: opts?.referenceId,
      jobId: opts?.jobId,
    });

    if (charge.status === "failed") {
      await recordAIUsage({
        userId: opts?.userId,
        capability,
        provider: route.providerId,
        model: out.model,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        latencyMs: out.latencyMs || Date.now() - started,
        status: "failed",
        errorCode: charge.code,
        referenceType: opts?.referenceType,
        referenceId: opts?.referenceId,
        creditsUsed: null,
      });
      throw new AIError(
        charge.code === "pricing_unavailable"
          ? "pricing_unavailable"
          : "insufficient_credits",
        charge.error
      );
    }

    const creditsUsed =
      charge.status === "charged" ? charge.amount : null;

    const record = await recordAIUsage({
      userId: opts?.userId,
      capability,
      provider: route.providerId,
      model: out.model,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      latencyMs: out.latencyMs || Date.now() - started,
      status: "success",
      creditsUsed,
      referenceType: opts?.referenceType,
      referenceId: opts?.referenceId,
    });

    return {
      data: out.result,
      requestId: record.requestId,
      usage: {
        provider: route.providerId,
        model: out.model,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        latencyMs: out.latencyMs,
        creditsUsed,
      },
    };
  } catch (err) {
    if (err instanceof AIError) throw err;
    const aiErr = classifyProviderError(err);
    await recordAIUsage({
      userId: opts?.userId,
      capability,
      provider: route.providerId,
      model: route.model,
      latencyMs: Date.now() - started,
      status: usageStatusFromError(aiErr),
      errorCode: aiErr.code,
      referenceType: opts?.referenceType,
      referenceId: opts?.referenceId,
    });
    throw aiErr;
  }
}

export const AIOrchestrator = {
  isAvailable(capability: AICapability): boolean {
    bootstrapAIProviders();
    return routeCapability({ capability }) !== null;
  },

  async generateText(req: TextGenerationRequest, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("generateText", opts, async (_pid, model) => {
      const result = await text.generateText(req, model);
      return {
        result,
        model: result.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        latencyMs: result.latencyMs,
      };
    });
    return out.data;
  },

  async reason(req: TextGenerationRequest, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("reason", opts, async (_pid, model) => {
      const result = await text.reason(req, model);
      return {
        result,
        model: result.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        latencyMs: result.latencyMs,
      };
    });
    return out.data;
  },

  async analyzeImage(req: MediaAnalysisRequest, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("analyzeImage", opts, async (_pid, model) => {
      const result = await text.analyzeImage(req, model);
      return {
        result,
        model: result.model,
        latencyMs: result.latencyMs,
      };
    });
    return out.data;
  },

  async generateImage(req: ImageGenerationRequest, opts?: AICallOptions) {
    const out = await this.generateImageWithMeta(req, opts);
    return out.data;
  },

  async generateImageWithMeta(
    req: ImageGenerationRequest,
    opts?: AICallOptions
  ) {
    return executeCapability("generateImage", opts, async (providerId, model) => {
      const executor = getProviderExecutor(providerId);
      if (!executor?.generateImage) {
        throw new AIUnavailableError("图片生成暂未接入");
      }
      const result = await executor.generateImage(req, model);
      return {
        result,
        model: result.model || model,
        latencyMs: result.latencyMs ?? 0,
      };
    });
  },

  async generateVideo(req: VideoGenerationRequest, opts?: AICallOptions) {
    const out = await executeCapability("generateVideo", opts, async (providerId, model) => {
      const executor = getProviderExecutor(providerId);
      if (!executor?.generateVideo) {
        throw new AIUnavailableError("视频生成暂未接入");
      }
      const result = await executor.generateVideo(req, model);
      return {
        result,
        model: result.model,
        latencyMs: result.latencyMs,
      };
    });
    return out.data;
  },

  /** Raw generateText with full usage metadata — for smoke tests / internal APIs */
  async generateTextWithMeta(req: TextGenerationRequest, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    return executeCapability("generateText", opts, async (_pid, model) => {
      const result = await text.generateText(req, model);
      return {
        result,
        model: result.model,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        latencyMs: result.latencyMs,
      };
    });
  },

  // --- Legacy capability aliases used by existing services ---

  async summarize(content: string, goal?: string, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("summarize", opts, async () => {
      const started = Date.now();
      const result = await text.summarize(content, goal);
      return {
        result,
        model: process.env.AI_MODEL_FAST || "nexa-fast",
        latencyMs: Date.now() - started,
      };
    });
    return out.data;
  },

  async research(req: ResearchRequest, opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("research", opts, async () => {
      const started = Date.now();
      const result = await text.research(req);
      return {
        result,
        model: process.env.AI_MODEL_MAIN || "nexa-main",
        latencyMs: Date.now() - started,
      };
    });
    return out.data;
  },

  async qualityCheck(
    req: QualityCheckRequest,
    opts?: AICallOptions
  ): Promise<ContentQAResult> {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("qualityCheck", opts, async () => {
      const started = Date.now();
      const result = await text.qualityCheck(req);
      return {
        result,
        model: process.env.AI_MODEL_MAIN || "nexa-main",
        latencyMs: Date.now() - started,
      };
    });
    return out.data as ContentQAResult;
  },

  async embed(texts: string[], opts?: AICallOptions) {
    const text = getPrimaryTextProvider();
    const out = await executeCapability("embed", opts, async () => {
      const started = Date.now();
      const result = await text.embed(texts);
      return {
        result,
        model: process.env.AI_MODEL_EMBED || "nexa-embed",
        latencyMs: Date.now() - started,
      };
    });
    return out.data;
  },

  creditsForCapability,
};

export { AIError, AIUnavailableError };
