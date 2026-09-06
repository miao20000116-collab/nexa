/**
 * Internal model routing: Capability → Model slug.
 * Model names are server env only — never exposed to pages or client responses.
 */

import type { AICapability } from "@/modules/ai/gateway/types";

export type ModelTier =
  | "fast"
  | "main"
  | "reasoning"
  | "vision"
  | "embed"
  | "image"
  | "video";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const CAPABILITY_TIER: Partial<Record<AICapability, ModelTier>> = {
  generateText: "main",
  reason: "reasoning",
  summarize: "fast",
  classify: "fast",
  rewrite: "main",
  research: "main",
  analyzeImage: "vision",
  analyzeVideo: "main",
  qualityCheck: "main",
  embed: "embed",
  generateImage: "image",
  editImage: "image",
  generateVideo: "video",
};

const TIER_ENV: Record<ModelTier, string> = {
  fast: "AI_MODEL_FAST",
  main: "AI_MODEL_MAIN",
  reasoning: "AI_MODEL_REASONING",
  vision: "AI_MODEL_VISION",
  embed: "AI_MODEL_EMBED",
  image: "AI_MODEL_IMAGE",
  video: "AI_MODEL_VIDEO",
};

const TIER_DEFAULT: Record<ModelTier, string> = {
  fast: "nexa-fast",
  main: "nexa-main",
  reasoning: "nexa-reasoning",
  vision: "nexa-vision",
  embed: "nexa-embed",
  image: "nexa-image",
  video: "nexa-video",
};

/** Resolve internal model slug for a capability (never send to client). */
export function resolveModelForCapability(
  capability: AICapability,
  quality?: "fast" | "balanced" | "high"
): string {
  let tier = CAPABILITY_TIER[capability] ?? "main";

  if (quality === "fast" && tier === "main") tier = "fast";
  if (quality === "high" && (tier === "main" || tier === "fast")) tier = "reasoning";

  const key = TIER_ENV[tier];
  const fallback =
    tier === "reasoning"
      ? env("AI_MODEL_MAIN", TIER_DEFAULT.main)
      : TIER_DEFAULT[tier];

  return env(key, fallback);
}
