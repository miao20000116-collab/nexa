/**
 * AIGateway — application facade over AIOrchestrator.
 * Business services call this — never concrete SDKs or model names.
 */

import type {
  ImageGenerationRequest,
  MediaAnalysisRequest,
  MusicGenerationRequest,
  QualityCheckRequest,
  ResearchRequest,
  TextGenerationRequest,
  TTSRequest,
  VideoGenerationRequest,
} from "@/modules/providers/interfaces";
import {
  bootstrapAIProviders,
  getMusicGenProvider,
  getTTSProvider,
} from "./bootstrap";
import { isCapabilityAvailable } from "./provider-registry";
import type { AICapability, ContentQAResult } from "./types";
import {
  AIOrchestrator,
  AIUnavailableError,
} from "@/modules/ai/orchestrator/ai-orchestrator";

export class CapabilityNotConfiguredError extends Error {
  code = "AI_CAPABILITY_NOT_CONFIGURED";
  constructor(message = "AI 服务暂未接入") {
    super(message);
    this.name = "CapabilityNotConfiguredError";
  }
}

function ensureBoot() {
  bootstrapAIProviders();
}

function wrapUnavailable<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof AIUnavailableError) {
      throw new CapabilityNotConfiguredError();
    }
    throw err;
  });
}

export const AIGateway = {
  isAvailable(capability: AICapability) {
    ensureBoot();
    return AIOrchestrator.isAvailable(capability) || isCapabilityAvailable(capability);
  },

  async generateText(
    req: TextGenerationRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(() => AIOrchestrator.generateText(req, opts));
  },

  async reason(
    req: TextGenerationRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(() => AIOrchestrator.reason(req, opts));
  },

  async summarize(
    content: string,
    goal?: string,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(() =>
      AIOrchestrator.summarize(content, goal, opts)
    );
  },

  async classify(content: string, labels: string[]) {
    return wrapUnavailable(async () => {
      const text = (await import("@/modules/ai/providers/provider-factory"))
        .getPrimaryTextProvider();
      const { routeCapability } = await import(
        "@/modules/ai/router/capability-router"
      );
      const { recordAIUsage } = await import("./usage-log");
      const route = routeCapability({ capability: "classify" });
      if (!route) throw new CapabilityNotConfiguredError();
      const started = Date.now();
      try {
        const result = await text.classify(content, labels);
        await recordAIUsage({
          capability: "classify",
          provider: route.providerId,
          model: route.model,
          latencyMs: Date.now() - started,
          status: "success",
        });
        return result;
      } catch (err) {
        const { classifyProviderError, usageStatusFromError } = await import(
          "./errors"
        );
        const aiErr = classifyProviderError(err);
        await recordAIUsage({
          capability: "classify",
          provider: route.providerId,
          model: route.model,
          latencyMs: Date.now() - started,
          status: usageStatusFromError(aiErr),
          errorCode: aiErr.code,
        });
        throw aiErr;
      }
    });
  },

  async rewrite(
    content: string,
    instruction: string,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(async () => {
      const text = (await import("@/modules/ai/providers/provider-factory"))
        .getPrimaryTextProvider();
      const { routeCapability } = await import(
        "@/modules/ai/router/capability-router"
      );
      const { recordAIUsage } = await import("./usage-log");
      const { chargeCreditsForUsage } = await import("./credits-bridge");
      const route = routeCapability({ capability: "rewrite" });
      if (!route) throw new CapabilityNotConfiguredError();
      const started = Date.now();
      const accountId = opts?.accountId ?? opts?.userId ?? null;
      try {
        const result = await text.rewrite(content, instruction);
        const charge = await chargeCreditsForUsage({
          accountId,
          userId: accountId,
          capability: opts?.billingCapability ?? "rewrite",
          referenceId: opts?.referenceId,
          jobId: opts?.jobId,
        });
        if (charge.status === "failed") {
          await recordAIUsage({
            userId: opts?.userId,
            capability: "rewrite",
            provider: route.providerId,
            model: route.model,
            latencyMs: Date.now() - started,
            status: "failed",
            errorCode: charge.code,
            creditsUsed: null,
          });
          throw new Error(charge.error);
        }
        const creditsUsed =
          charge.status === "charged" ? charge.amount : null;
        await recordAIUsage({
          userId: opts?.userId,
          capability: "rewrite",
          provider: route.providerId,
          model: route.model,
          latencyMs: Date.now() - started,
          status: "success",
          creditsUsed,
        });
        return result;
      } catch (err) {
        const { classifyProviderError, usageStatusFromError } = await import(
          "./errors"
        );
        const aiErr = classifyProviderError(err);
        await recordAIUsage({
          userId: opts?.userId,
          capability: "rewrite",
          provider: route.providerId,
          model: route.model,
          latencyMs: Date.now() - started,
          status: usageStatusFromError(aiErr),
          errorCode: aiErr.code,
        });
        throw aiErr;
      }
    });
  },

  async research(req: ResearchRequest, opts?: { userId?: string | null }) {
    return wrapUnavailable(() => AIOrchestrator.research(req, opts));
  },

  async analyzeImage(
    req: MediaAnalysisRequest,
    opts?: { userId?: string | null }
  ) {
    return wrapUnavailable(() => AIOrchestrator.analyzeImage(req, opts));
  },

  async analyzeVideo(
    req: MediaAnalysisRequest,
    _opts?: { userId?: string | null }
  ) {
    const { getPrimaryTextProvider } = await import(
      "@/modules/ai/providers/provider-factory"
    );
    ensureBoot();
    if (!AIOrchestrator.isAvailable("analyzeVideo")) {
      throw new CapabilityNotConfiguredError();
    }
    return getPrimaryTextProvider().analyzeVideo(req);
  },

  async generateImage(
    req: ImageGenerationRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(() =>
      AIOrchestrator.generateImage(req, opts)
    );
  },

  async generateImageWithMeta(
    req: ImageGenerationRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return wrapUnavailable(() =>
      AIOrchestrator.generateImageWithMeta(req, opts)
    );
  },

  async editImage(
    req: ImageGenerationRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ) {
    return this.generateImageWithMeta(
      { ...req, mode: req.mode ?? "edit" },
      opts
    );
  },

  async generateVideo(
    req: VideoGenerationRequest,
    opts?: { userId?: string | null }
  ) {
    return wrapUnavailable(() => AIOrchestrator.generateVideo(req, opts));
  },

  async generateMusic(
    req: MusicGenerationRequest,
    _opts?: { userId?: string | null }
  ) {
    ensureBoot();
    const music = getMusicGenProvider();
    if (!music.isConfigured()) throw new CapabilityNotConfiguredError();
    return music.generateMusic(req);
  },

  async textToSpeech(req: TTSRequest, _opts?: { userId?: string | null }) {
    ensureBoot();
    const tts = getTTSProvider();
    if (!tts.isConfigured()) throw new CapabilityNotConfiguredError();
    return tts.synthesize(req);
  },

  async qualityCheck(
    req: QualityCheckRequest,
    opts?: import("@/modules/ai/orchestrator/ai-orchestrator").AICallOptions
  ): Promise<ContentQAResult> {
    return wrapUnavailable(() => AIOrchestrator.qualityCheck(req, opts));
  },

  async embed(texts: string[]) {
    return wrapUnavailable(() => AIOrchestrator.embed(texts));
  },
};

export { routeCapability as CapabilityRouter } from "@/modules/ai/router/capability-router";
export {
  registerProvider,
  listProviders,
  resolveProvider,
  getProvider,
} from "./provider-registry";
