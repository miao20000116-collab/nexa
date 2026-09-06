/**
 * Creation Agent tool catalog.
 * Real tools wrap existing Nexa services. MCP connectors are only marked
 * configured here; their handshake is verified immediately before use.
 */

import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import type { CreationIntentKind } from "@/modules/intent/creation-intent";
import {
  isMcpConnectorConfigured,
  type McpConnectorId,
} from "@/modules/ai/agent/mcp-client";

export type AgentToolKind = "capability" | "service" | "mcp";

export type AgentToolStatus =
  | "ready"
  | "unavailable"
  | "needs_input"
  | "configured";

export type AgentTool = {
  id: string;
  kind: AgentToolKind;
  label: string;
  description: string;
  /** AIGateway capability when kind=capability */
  aiCapability?: string;
  /** Soft dependency hint shown in plan */
  needs?: string[];
  status: AgentToolStatus;
  statusReason?: string;
  href?: string;
};

function mcpTool(
  id: string,
  label: string,
  description: string,
  connectorId: McpConnectorId
): AgentTool {
  const configured = isMcpConnectorConfigured(connectorId);
  return {
    id,
    kind: "mcp",
    label,
    description,
    status: configured ? "configured" : "unavailable",
    statusReason: configured
      ? "已配置远程地址，执行时验证连接与工具清单"
      : "尚未配置远程 MCP",
  };
}

/** Snapshot of tools available for planning (honest availability). */
export function listCreationAgentTools(): AgentTool[] {
  bootstrapAIProviders();
  const textOk = AIGateway.isAvailable("generateText");
  const imageOk = AIGateway.isAvailable("generateImage");
  const videoOk = AIGateway.isAvailable("generateVideo");
  const visionOk = AIGateway.isAvailable("analyzeImage");
  const researchOk = AIGateway.isAvailable("research") || textOk;

  return [
    {
      id: "create.generate_text",
      kind: "capability",
      label: "生成文案脚本",
      description: "结构化草稿（标题 / Hook / 正文 / CTA）",
      aiCapability: "generateText",
      status: textOk ? "ready" : "unavailable",
      statusReason: textOk ? undefined : "文本生成能力暂未接入",
      href: "/create",
    },
    {
      id: "create.image",
      kind: "capability",
      label: "生成图片 / 封面",
      description: "按用途生成图片并入库",
      aiCapability: "generateImage",
      status: imageOk ? "ready" : "unavailable",
      statusReason: imageOk ? undefined : "图片生成能力暂未接入",
      href: "/create/image",
    },
    {
      id: "create.video",
      kind: "capability",
      label: "短视频一键成片",
      description: "文案→分镜→无素材时 AI 补镜（即梦）→导出；不必先有自有素材",
      aiCapability: "generateVideo",
      status: videoOk ? "ready" : "unavailable",
      statusReason: videoOk ? undefined : "视频生成能力暂未接入",
      href: "/create",
    },
    {
      id: "create.social_recreate",
      kind: "service",
      label: "链接同款二创",
      description: "解析分享元数据 + 封面识别 → 版权安全二创",
      needs: ["社交链接或分享口令", "可选：自有人脸素材"],
      status: "needs_input",
      statusReason: "需要粘贴抖音 / 小红书 / TikTok / X 链接",
      href: "/create?mode=link",
    },
    {
      id: "media.recognize",
      kind: "service",
      label: "媒体识别",
      description: "封面视觉 + 结构线索（与分镜一致）",
      aiCapability: "analyzeImage",
      status: visionOk || textOk ? "ready" : "unavailable",
      statusReason:
        visionOk || textOk ? undefined : "视觉 / 摘要能力暂未接入",
    },
    {
      id: "workspace.research",
      kind: "capability",
      label: "深入研究",
      description: "结构化研究报告后再创作",
      aiCapability: "research",
      status: researchOk ? "ready" : "unavailable",
      href: "/workspace",
    },
    {
      id: "commerce.customer",
      kind: "service",
      label: "客户洞察",
      description: "差评痛点聚类与本土化回复",
      status: "ready",
      href: "/commerce/amazon#customer",
    },
    {
      id: "commerce.strategy",
      kind: "service",
      label: "经营诊断 → 创作",
      description: "从 Amazon / TikTok 诊断带入策略上下文",
      status: "ready",
      href: "/commerce/amazon",
    },
    {
      id: "commerce.financial",
      kind: "service",
      label: "利润 / 库存智能分析",
      description: "基线 + 深度经营诊断（演示数据）",
      status: "ready",
      href: "/commerce/amazon#profit",
    },
    {
      id: "commerce.ads",
      kind: "service",
      label: "广告智能分析",
      description: "基线 + 深度广告诊断（演示数据）",
      status: "ready",
      href: "/commerce/amazon#ads",
    },
    {
      id: "commerce.refine",
      kind: "service",
      label: "优化智能分析",
      description: "按用户意愿改写已有诊断结论",
      status: "ready",
    },
    {
      id: "search.overview",
      kind: "capability",
      label: "搜索 AI 概览",
      description: "对检索结果生成概览",
      aiCapability: "generateText",
      status: textOk ? "ready" : "unavailable",
      statusReason: textOk ? undefined : "文本生成能力暂未接入",
      href: "/search",
    },
    {
      id: "search.web",
      kind: "service",
      label: "全网检索服务",
      description: "全网检索补充证据（搜索基础设施）",
      status: process.env.SEARXNG_BASE_URL ? "ready" : "unavailable",
      statusReason: process.env.SEARXNG_BASE_URL
        ? undefined
        : "SearXNG 检索服务未配置",
    },
    mcpTool(
      "mcp.browser",
      "浏览器 MCP",
      "打开页面核对原文 / 截图（未配置则跳过）",
      "browser"
    ),
    mcpTool(
      "mcp.codegraph",
      "Codegraph MCP",
      "代码库符号检索（产品工程场景）",
      "codegraph"
    ),
  ];
}

/** Pick ordered tool ids for a creation intent. */
export function toolsForCreationIntent(
  kind: CreationIntentKind
): string[] {
  switch (kind) {
    case "social_recreate":
      return [
        "create.social_recreate",
        "media.recognize",
        "create.generate_text",
        "create.video",
        "mcp.browser",
      ];
    case "commerce_strategy":
      return [
        "commerce.strategy",
        "commerce.financial",
        "commerce.ads",
        "commerce.refine",
        "search.web",
        "create.generate_text",
        "create.image",
      ];
    case "customer_insight":
      return [
        "commerce.customer",
        "commerce.refine",
        "create.generate_text",
      ];
    case "research_then_create":
      return [
        "search.web",
        "search.overview",
        "workspace.research",
        "create.generate_text",
        "create.image",
      ];
    case "short_video":
      return [
        "media.recognize",
        "create.generate_text",
        "create.video",
        "create.image",
      ];
    case "image_cover":
      return ["create.image", "create.generate_text"];
    case "multimodal":
      return [
        "create.generate_text",
        "create.image",
        "create.video",
        "search.web",
      ];
    case "copy_script":
      return ["create.generate_text", "search.web", "create.image"];
    case "general_create":
    default:
      return ["create.generate_text", "create.image"];
  }
}
