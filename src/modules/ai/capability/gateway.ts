/**
 * Application-facing AI capabilities.
 * UI / services call these — never call concrete model SDKs or show model names.
 */

import {
  AIGateway,
  CapabilityNotConfiguredError,
} from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import { listProviders } from "@/modules/ai/gateway/provider-registry";
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

export { CapabilityNotConfiguredError };

export async function generateText(req: TextGenerationRequest) {
  return AIGateway.generateText(req);
}

export async function summarize(text: string, goal?: string) {
  return AIGateway.summarize(text, goal);
}

export async function classify(text: string, labels: string[]) {
  return AIGateway.classify(text, labels);
}

export async function rewrite(text: string, instruction: string) {
  return AIGateway.rewrite(text, instruction);
}

export async function analyzeImage(req: MediaAnalysisRequest) {
  return AIGateway.analyzeImage(req);
}

export async function analyzeVideo(req: MediaAnalysisRequest) {
  return AIGateway.analyzeVideo(req);
}

export async function generateImage(req: ImageGenerationRequest) {
  return AIGateway.generateImage(req);
}

export async function editImage(req: ImageGenerationRequest) {
  return AIGateway.editImage(req);
}

export async function generateVideo(req: VideoGenerationRequest) {
  return AIGateway.generateVideo(req);
}

export async function generateMusic(req: MusicGenerationRequest) {
  return AIGateway.generateMusic(req);
}

export async function synthesizeSpeech(req: TTSRequest) {
  return AIGateway.textToSpeech(req);
}

export async function research(req: ResearchRequest) {
  if (!AIGateway.isAvailable("research")) {
    return { status: "blocked_ai_unavailable", report: undefined };
  }
  try {
    return await AIGateway.research(req);
  } catch (err) {
    if (err instanceof CapabilityNotConfiguredError) {
      return { status: "blocked_ai_unavailable", report: undefined };
    }
    throw err;
  }
}

export async function qualityCheck(req: QualityCheckRequest) {
  return AIGateway.qualityCheck(req);
}

export async function getCapabilityStatuses() {
  bootstrapAIProviders();
  const providers = listProviders();
  const available = (cap: string) =>
    providers.some((p) => p.capabilities.includes(cap as never) && p.isConfigured());

  const status = (ok: boolean) =>
    ok
      ? { available: true as const, code: "PROVIDER_AVAILABLE" as const }
      : {
          available: false as const,
          code: "PROVIDER_NOT_CONFIGURED" as const,
          message: "AI 服务暂未接入",
        };

  return {
    text: status(available("generateText")),
    reasoning: status(available("reason")),
    vision: status(available("analyzeImage")),
    imageGeneration: status(available("generateImage")),
    videoGeneration: status(available("generateVideo")),
    music: status(available("generateMusic")),
    tts: status(available("textToSpeech")),
    research: status(available("research")),
    quality: status(available("qualityCheck")),
  };
}
