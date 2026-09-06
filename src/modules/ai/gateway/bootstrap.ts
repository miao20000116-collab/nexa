import { registerProvider } from "./provider-registry";
import { registerProviderExecutor } from "./provider-executors";
import { resolveRegion } from "./region-policy";
import {
  getActiveProviderKey,
  getPrimaryTextProvider,
  registerFutureProviderStubs,
} from "@/modules/ai/providers/provider-factory";
import {
  DomesticImageProvider,
  DomesticMusicProvider,
  DomesticTTSProvider,
  DomesticVideoProvider,
} from "@/modules/ai/providers/domestic-media";
import type { AICapability } from "./types";
import {
  AIProviderError,
  AIRateLimitError,
  AITimeoutError,
} from "./errors";

let bootstrapped = false;

const TEXT_CAPABILITIES: AICapability[] = [
  "generateText",
  "reason",
  "summarize",
  "classify",
  "rewrite",
  "research",
  "analyzeImage",
  "analyzeVideo",
  "qualityCheck",
  "embed",
];

/** Register server-managed providers once. No user keys. */
export function bootstrapAIProviders() {
  if (bootstrapped) return;
  bootstrapped = true;

  const text = getPrimaryTextProvider();
  const region = resolveRegion();
  const activeKey = getActiveProviderKey();

  registerProvider({
    id: text.id,
    kind: "text",
    labelInternal: `primary-text:${activeKey}`,
    region,
    priority: 100,
    capabilities: TEXT_CAPABILITIES,
    isConfigured: () => text.isConfigured(),
  });

  registerProviderExecutor({
    providerId: text.id,
    isConfigured: () => text.isConfigured(),
    supports: (cap) => TEXT_CAPABILITIES.includes(cap),
    async generateText(req, model) {
      return text.generateText(req, model);
    },
    async reason(req, model) {
      return text.reason(req, model);
    },
    async analyzeImage(req, model) {
      return text.analyzeImage(req, model);
    },
  });

  // Future providers — registered but inactive until NEXA_AI_PRIMARY_PROVIDER switches
  for (const stubKey of registerFutureProviderStubs()) {
    if (stubKey === activeKey) continue;
    registerProvider({
      id: stubKey,
      kind: "text",
      labelInternal: `stub:${stubKey}`,
      region,
      priority: 0,
      capabilities: TEXT_CAPABILITIES,
      isConfigured: () => false,
    });
  }

  const image = new DomesticImageProvider();
  registerProvider({
    id: image.id,
    kind: "image",
    labelInternal: "domestic-image",
    region,
    priority: 80,
    capabilities: ["generateImage", "editImage"],
    isConfigured: () => image.isConfigured(),
  });

  registerProviderExecutor({
    providerId: image.id,
    isConfigured: () => image.isConfigured(),
    supports: (cap) => cap === "generateImage" || cap === "editImage",
    async generateImage(req, model) {
      const started = Date.now();
      try {
        const result = await image.generateImage(req);
        return { ...result, model, latencyMs: Date.now() - started };
      } catch (err) {
        throw mapMediaError(err);
      }
    },
  });

  const video = new DomesticVideoProvider();
  registerProvider({
    id: video.id,
    kind: "video",
    labelInternal: "domestic-video",
    region,
    priority: 70,
    capabilities: ["generateVideo"],
    isConfigured: () => video.isConfigured(),
  });

  registerProviderExecutor({
    providerId: video.id,
    isConfigured: () => video.isConfigured(),
    supports: (cap) => cap === "generateVideo",
    async generateVideo(req, model) {
      const started = Date.now();
      try {
        const result = await video.generateVideo(req);
        return { ...result, model, latencyMs: Date.now() - started };
      } catch (err) {
        throw mapMediaError(err);
      }
    },
  });

  const music = new DomesticMusicProvider();
  registerProvider({
    id: music.id,
    kind: "music",
    labelInternal: "domestic-music",
    region,
    priority: 60,
    capabilities: ["generateMusic", "analyzeMusic"],
    isConfigured: () => music.isConfigured(),
  });

  const tts = new DomesticTTSProvider();
  registerProvider({
    id: tts.id,
    kind: "speech",
    labelInternal: "domestic-tts",
    region,
    priority: 75,
    capabilities: ["textToSpeech", "transcribe"],
    isConfigured: () => tts.isConfigured(),
  });
}

function mapMediaError(err: unknown): AIProviderError | AITimeoutError | AIRateLimitError {
  if (err instanceof Error) {
    if (/429|rate/i.test(err.message)) return new AIRateLimitError();
    if (/timeout|abort/i.test(err.message)) return new AITimeoutError();
    return new AIProviderError(err.message);
  }
  return new AIProviderError("媒体生成失败");
}

export function getImageProvider() {
  return new DomesticImageProvider();
}
export function getVideoProvider() {
  return new DomesticVideoProvider();
}
export function getMusicGenProvider() {
  return new DomesticMusicProvider();
}
export function getTTSProvider() {
  return new DomesticTTSProvider();
}
