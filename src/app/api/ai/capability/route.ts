import { NextResponse } from "next/server";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import { listProviders } from "@/modules/ai/gateway/provider-registry";
import { routeCapability } from "@/modules/ai/router/capability-router";

const CAPABILITY_LABELS: Record<string, string> = {
  generateText: "文本生成",
  reason: "推理",
  analyzeImage: "图片理解",
  generateImage: "图片生成",
  generateVideo: "视频生成",
  research: "深度研究",
  summarize: "摘要",
  qualityCheck: "内容质检",
};

/**
 * GET /api/ai/capability
 * Returns capability availability — no API keys, no model names.
 */
export async function GET() {
  bootstrapAIProviders();

  const capabilities = [
    "generateText",
    "reason",
    "analyzeImage",
    "generateImage",
    "generateVideo",
    "research",
    "summarize",
    "qualityCheck",
  ] as const;

  const statuses: Record<
    string,
    { status: "available" | "not_configured"; label: string }
  > = {};

  for (const cap of capabilities) {
    const route = routeCapability({ capability: cap });
    statuses[cap] = {
      label: CAPABILITY_LABELS[cap] ?? cap,
      status: route ? "available" : "not_configured",
    };
  }

  return NextResponse.json({
    configuredProviderCount: listProviders().filter((p) => p.isConfigured()).length,
    capabilities: statuses,
    // Legacy shape for existing UI — no provider/model names
    research: statuses.research?.status ?? "not_configured",
    summarization: statuses.summarize?.status ?? "not_configured",
    creation: statuses.generateText?.status ?? "not_configured",
    image: statuses.generateImage?.status ?? "not_configured",
    video: statuses.generateVideo?.status ?? "not_configured",
    reasoning: statuses.reason?.status ?? "not_configured",
  });
}
