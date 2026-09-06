/**
 * Gateway-backed workspace research actions.
 */

import { AIGateway, CapabilityNotConfiguredError } from "@/modules/ai/gateway/ai-gateway";
import { retrieveForQuery } from "@/modules/ai/rag/retrieve";
import type { AIResearchService, AIResearchResponse } from "./types";
import { AI_CAPABILITY_NOT_CONFIGURED } from "./types";
import type { SourceSnapshot } from "@/modules/workspace/types";
import { toUserErrorMessage } from "@/lib/user-errors";
import { promptTextForSource } from "@/modules/workspace/services/source-ingest";
import {
  EXTRACT_KEYPOINTS_SYSTEM,
  parseExtractResult,
} from "@/modules/workspace/services/creation-pack";

function packSources(sources: SourceSnapshot[]) {
  return sources
    .slice(0, 30)
    .map((s, i) => {
      const body = promptTextForSource(s).slice(0, 1200);
      const role =
        s.contextRole === "fact"
          ? "事实依据"
          : "视觉参考（不可作为事实依据）";
      return `[${i + 1}] ${role} | ${s.title || ""} | ${s.url}\n${body}`;
    })
    .join("\n\n");
}

async function buildContext(
  sources: SourceSnapshot[],
  goal: string | undefined,
  instruction: string
): Promise<string> {
  const docs = sources.map((s, i) => {
    const compressed = promptTextForSource(s);
    const body =
      compressed.length > 80
        ? compressed
        : `${s.title || ""}\n${s.snippet || ""}`;
    const role =
      s.contextRole === "fact"
        ? "事实依据：可用于支持事实断言"
        : "视觉参考：只用于镜头、构图、风格与节奏，不可用于事实断言";
    return {
      id: `s${i}`,
      title: s.title,
      text: `【${role}】\n${body}`.slice(0, 3500),
    };
  });
  const retrieved = await retrieveForQuery(goal || instruction, docs, 8);
  return retrieved.join("\n\n") || packSources(sources);
}

async function runAction(
  label: string,
  sources: SourceSnapshot[],
  goal: string | undefined,
  instruction: string,
  opts?: { temperature?: number; maxTokens?: number; system?: string }
): Promise<AIResearchResponse> {
  if (!AIGateway.isAvailable("generateText")) {
    return {
      success: false,
      code: AI_CAPABILITY_NOT_CONFIGURED,
      message: "AI 服务暂未接入",
    };
  }

  try {
    const context = await buildContext(sources, goal, instruction);

    const text = await AIGateway.generateText({
      system:
        opts?.system ??
        `${instruction} 只用给定资料，禁止无来源事实。用简体中文。资料可能含「摘要+摘录」压缩层，视为该页有效内容。`,
      prompt: `${goal ? `目标：${goal}\n\n` : ""}资料：\n${context}`,
      temperature: opts?.temperature ?? 0.3,
      maxTokens: opts?.maxTokens ?? 2000,
    });

    return {
      success: true,
      code: "OK",
      message: label,
      data: { text: text.text },
    };
  } catch (err) {
    if (err instanceof CapabilityNotConfiguredError) {
      return {
        success: false,
        code: AI_CAPABILITY_NOT_CONFIGURED,
        message: "AI 服务暂未接入",
      };
    }
    return {
      success: false,
      code: "AI_ERROR",
      message: toUserErrorMessage(err, "AI 调用失败，请稍后再试"),
    };
  }
}

export class GatewayAIResearchProvider implements AIResearchService {
  async summarizeSources(req: {
    sources: SourceSnapshot[];
    goal?: string;
  }) {
    return runAction(
      "总结资料",
      req.sources,
      req.goal,
      "总结这些资料的核心观点与共识。"
    );
  }

  async compareSources(req: { sources: SourceSnapshot[]; goal?: string }) {
    return runAction(
      "对比观点",
      req.sources,
      req.goal,
      "对比不同来源的观点异同。"
    );
  }

  async extractKeyPoints(req: { sources: SourceSnapshot[]; goal?: string }) {
    const result = await runAction(
      "提取要点",
      req.sources,
      req.goal,
      "研究笔记 + 创作包（口播与分镜）",
      {
        system: EXTRACT_KEYPOINTS_SYSTEM,
        temperature: 0.65,
        maxTokens: 4200,
      }
    );
    if (!result.success || !result.data || typeof result.data !== "object") {
      return result;
    }
    const text =
      typeof (result.data as { text?: unknown }).text === "string"
        ? (result.data as { text: string }).text
        : "";
    if (!text) return result;
    const parsed = parseExtractResult(text);
    return {
      ...result,
      data: {
        text,
        notes: parsed.notes,
        pack: parsed.pack,
      },
    };
  }

  async findDisagreements(req: {
    sources: SourceSnapshot[];
    goal?: string;
  }) {
    return runAction(
      "发现分歧",
      req.sources,
      req.goal,
      "找出资料之间的分歧与冲突证据。"
    );
  }

  async planResearch(req: { sources: SourceSnapshot[]; goal?: string }) {
    return runAction(
      "研究规划",
      req.sources,
      req.goal,
      "基于现有资料，给出下一步研究问题清单。"
    );
  }

  async generateResearchReport(req: {
    sources: SourceSnapshot[];
    goal?: string;
  }) {
    if (!AIGateway.isAvailable("research")) {
      return {
        success: false,
        code: AI_CAPABILITY_NOT_CONFIGURED,
        message: "AI 服务暂未接入",
      };
    }
    try {
      const result = await AIGateway.research({
        goal: req.goal || "综合研究报告",
        sources: req.sources.map((s) => ({
          title: s.title,
          url: s.url,
          snippet: s.snippet,
        })),
      });
      return {
        success: true,
        code: "OK",
        message: "研究报告",
        data: result.report,
      };
    } catch {
      return {
        success: false,
        code: AI_CAPABILITY_NOT_CONFIGURED,
        message: "AI 服务暂未接入",
      };
    }
  }

  async getStatus() {
    const ok = AIGateway.isAvailable("generateText");
    return {
      available: ok,
      code: ok ? "AI_CAPABILITY_AVAILABLE" : AI_CAPABILITY_NOT_CONFIGURED,
    };
  }
}

let provider: AIResearchService | null = null;

export function getAIResearchService(): AIResearchService {
  if (!provider) {
    provider = new GatewayAIResearchProvider();
  }
  return provider;
}

export function getAICapabilityInfo() {
  const textOk = AIGateway.isAvailable("generateText");
  const status = (ok: boolean) =>
    ok ? ("available" as const) : ("not_configured" as const);
  return {
    generateText: status(textOk),
    reason: status(AIGateway.isAvailable("reason") || textOk),
    analyzeImage: status(AIGateway.isAvailable("analyzeImage")),
    generateImage: status(AIGateway.isAvailable("generateImage")),
    generateVideo: status(AIGateway.isAvailable("generateVideo")),
    research: status(AIGateway.isAvailable("research") || textOk),
    summarization: status(textOk),
    comparison: status(textOk),
    creation: status(textOk),
    image: status(AIGateway.isAvailable("generateImage")),
    video: status(AIGateway.isAvailable("generateVideo")),
    music: status(AIGateway.isAvailable("generateMusic")),
    quality: status(AIGateway.isAvailable("qualityCheck")),
    code: textOk ? "AI_CAPABILITY_AVAILABLE" : AI_CAPABILITY_NOT_CONFIGURED,
  };
}
