/**
 * OpenAI-compatible text / vision provider.
 * Configured only via server env — never user API keys.
 */

import type {
  LLMProvider,
  MediaAnalysisRequest,
  MediaAnalysisResult,
  ProviderStatus,
  QualityCheckRequest,
  QualityCheckResult,
  ResearchRequest,
  ResearchResult,
  TextGenerationRequest,
  TextGenerationResult,
} from "@/modules/providers/interfaces";
import { notConfiguredStatus } from "@/modules/providers/interfaces";
import type { ContentQAResult } from "@/modules/ai/gateway/types";
import {
  AIProviderError,
  AIRateLimitError,
  AITimeoutError,
  AIUnavailableError,
} from "@/modules/ai/gateway/errors";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

interface ChatResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface OpenAITextProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
}

function env(name: string, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export class OpenAITextProvider implements LLMProvider {
  readonly id: string;
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: OpenAITextProviderConfig) {
    this.id = config.id;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeout = Number(env("AI_TIMEOUT_MS", "60000")) || 60000;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConfigured()) {
      return notConfiguredStatus("AI 服务暂未接入");
    }
    return {
      available: true,
      code: "PROVIDER_AVAILABLE",
      message: "文本能力已就绪",
    };
  }

  async generateText(
    req: TextGenerationRequest,
    model?: string
  ): Promise<TextGenerationResult & { model: string; latencyMs: number }> {
    const result = await this.chat(
      [
        ...(req.system
          ? [{ role: "system" as const, content: req.system }]
          : []),
        { role: "user", content: req.prompt },
      ],
      req.temperature ?? 0.4,
      model ?? env("AI_MODEL_MAIN", "nexa-main"),
      req.maxTokens
    );
    return {
      text: result.text,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  async reason(
    req: TextGenerationRequest,
    model?: string
  ): Promise<TextGenerationResult & { model: string; latencyMs: number }> {
    const reasoningModel =
      model ?? env("AI_MODEL_REASONING", env("AI_MODEL_MAIN", "nexa-reasoning"));

    const result = await this.chat(
      [
        {
          role: "system",
          content:
            req.system ||
            "你是 Nexa 推理助手。请逐步分析问题，给出清晰、准确的结论。用简体中文回答。",
        },
        { role: "user", content: req.prompt },
      ],
      req.temperature ?? 0.2,
      reasoningModel,
      req.maxTokens ?? 2048
    );

    return {
      text: result.text,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
  }

  async summarize(text: string, goal?: string): Promise<string> {
    const result = await this.chat(
      [
        {
          role: "system",
          content:
            "你是研究助手。只根据给定文本总结，不要编造。用简体中文，简洁输出。",
        },
        {
          role: "user",
          content: `${goal ? `目标：${goal}\n\n` : ""}文本：\n${text.slice(0, 12000)}`,
        },
      ],
      0.2,
      env("AI_MODEL_FAST", "nexa-fast")
    );
    return result.text;
  }

  async classify(text: string, labels: string[]): Promise<string> {
    const result = await this.chat(
      [
        {
          role: "system",
          content: `只从以下标签中选一个输出，不要解释：${labels.join(", ")}`,
        },
        { role: "user", content: text.slice(0, 4000) },
      ],
      0,
      env("AI_MODEL_FAST", "nexa-fast")
    );
    const hit = labels.find((l) =>
      result.text.toLowerCase().includes(l.toLowerCase())
    );
    return hit ?? labels[0] ?? "unknown";
  }

  async rewrite(text: string, instruction: string): Promise<string> {
    const result = await this.chat(
      [
        {
          role: "system",
          content:
            "按指令改写文本。保持事实，不要新增无来源信息。用简体中文。只输出改写结果。",
        },
        {
          role: "user",
          content: `指令：${instruction}\n\n原文：\n${text}`,
        },
      ],
      0.5,
      env("AI_MODEL_MAIN", "nexa-main")
    );
    return result.text;
  }

  async analyzeImage(
    req: MediaAnalysisRequest,
    model?: string
  ): Promise<MediaAnalysisResult & { model: string; latencyMs: number }> {
    if (!req.url && !req.storageKey) {
      return { summary: "缺少图片", labels: [], model: model ?? "", latencyMs: 0 };
    }
    const url = req.url || req.storageKey || "";
    const visionModel =
      model ?? env("AI_MODEL_VISION", env("AI_MODEL_MAIN", "nexa-vision"));
    const result = await this.chat(
      [
        {
          role: "system",
          content: "分析图片内容，用简体中文给出简要描述与标签。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: req.prompt || "请描述这张图片，并列出 3-8 个标签。",
            },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
      0.2,
      visionModel
    );
    return {
      summary: result.text,
      labels: result.text
        .split(/[,，、\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
      model: result.model,
      latencyMs: result.latencyMs,
    };
  }

  async analyzeVideo(req: MediaAnalysisRequest): Promise<MediaAnalysisResult> {
    const result = await this.chat(
      [
        {
          role: "system",
          content:
            "根据视频 URL/描述做内容理解假设说明。若信息不足请明确说明。用简体中文。",
        },
        {
          role: "user",
          content: `视频：${req.url || req.storageKey || "未知"}\n${req.prompt || "请分析可能的画面与用途。"}`,
        },
      ],
      0.3,
      env("AI_MODEL_MAIN", "nexa-main")
    );
    return { summary: result.text, labels: [] };
  }

  async research(req: ResearchRequest): Promise<ResearchResult> {
    const sources = (req.sources ?? [])
      .slice(0, 20)
      .map(
        (s, i) =>
          `[S${i + 1}] ${s.title ?? ""} | ${s.url}\n${(s.snippet ?? "").slice(0, 400)}`
      )
      .join("\n\n");

    const result = await this.chat(
      [
        {
          role: "system",
          content: `你是研究报告写作者。只能基于提供的资料撰写。禁止输出思维链或推理过程。
输出 JSON（字段名保持英文，内容用简体中文）：
{
  "conclusion": "研究结论（一段话）",
  "findings": ["核心发现1", "核心发现2"],
  "evidence": [{"claim":"证据陈述","source":"S1"}],
  "disagreements": ["分歧"],
  "trends": ["市场趋势"],
  "risks": ["风险"],
  "opportunities": ["机会"],
  "sources": [{"id":"S1","url":"...","title":"..."}]
}
禁止无来源事实。sources 必须使用资料中的真实 URL。`,
        },
        {
          role: "user",
          content: `研究目标：${req.goal}\n报告类型：${req.reportType ?? "standard"}\n\n资料：\n${sources || "（无额外资料）"}`,
        },
      ],
      0.3,
      env("AI_MODEL_MAIN", "nexa-main"),
      4000
    );

    const json = extractJson(result.text);
    return {
      status: "completed",
      report: json ?? {
        conclusion: result.text.slice(0, 2000),
        findings: [],
        evidence: [],
        sources: req.sources ?? [],
      },
    };
  }

  async qualityCheck(
    req: QualityCheckRequest
  ): Promise<QualityCheckResult & ContentQAResult> {
    const result = await this.chat(
      [
        {
          role: "system",
          content: `你是内容质检员。只输出最终检测结果 JSON，不要输出思考过程、推理步骤或 chain-of-thought。

检查维度：
1. 事实
2. 来源
3. 素材
4. 版权风险
5. 平台规范（platform=${req.platform ?? "general"}）
6. 安全
7. 商业信息

输出 JSON（仅此）：
{
  "passed": true/false,
  "verdict": "PASS" | "NEEDS_REVISION",
  "checks": [{"id":"fact","label":"事实","ok":true,"detail":"..."}],
  "issues": [{"id":"...","category":"fact","where":"哪里","why":"为什么","how":"怎么改","severity":"error"}],
  "suggestions": ["..."]
}
用简体中文填写 where/why/how。禁止输出 reasoning 字段。`,
        },
        { role: "user", content: req.content.slice(0, 10000) },
      ],
      0.1,
      env("AI_MODEL_MAIN", "nexa-main")
    );

    const json = extractJson(result.text) as ContentQAResult | null;
    if (!json) {
      return {
        passed: false,
        verdict: "需要修改",
        reasons: ["质检结果解析失败，请重试"],
        checks: [],
        suggestions: [],
        issues: ["质检结果解析失败"],
      };
    }
    return {
      ...json,
      score: undefined,
      issues: json.reasons?.length
        ? json.reasons
        : (json as { issues?: string[] }).issues,
      suggestions: json.suggestions ?? [],
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) throw new AIUnavailableError();
    const model = env("AI_MODEL_EMBED", env("AI_MODEL_FAST", "nexa-fast"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) {
        throw await mapHttpError(res);
      }
      const data = (await res.json()) as {
        data?: Array<{ embedding: number[] }>;
      };
      return (data.data ?? []).map((d) => d.embedding);
    } catch (err) {
      throw mapFetchError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  async chatTracked(
    messages: ChatMessage[],
    model?: string,
    temperature = 0.3,
    maxTokens?: number
  ): Promise<ChatResult> {
    return this.chat(
      messages,
      temperature,
      model ?? env("AI_MODEL_MAIN", "nexa-main"),
      maxTokens
    );
  }

  private async chat(
    messages: ChatMessage[],
    temperature: number,
    model: string,
    maxTokens?: number
  ): Promise<ChatResult> {
    if (!this.isConfigured()) {
      throw new AIUnavailableError();
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
      });
      if (!response.ok) {
        throw await mapHttpError(response);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: data.model || model,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      throw mapFetchError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function mapHttpError(response: Response): Promise<AIProviderError | AIRateLimitError> {
  if (response.status === 429) {
    return new AIRateLimitError();
  }
  const err = await response.json().catch(() => ({}));
  const message =
    (err as { error?: { message?: string } }).error?.message ||
    `AI API ${response.status}`;
  return new AIProviderError(message);
}

function mapFetchError(err: unknown): AIProviderError | AITimeoutError | AIUnavailableError {
  if (err instanceof AIProviderError || err instanceof AIRateLimitError) {
    return err as AIProviderError;
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return new AITimeoutError();
    if (err instanceof AIUnavailableError) return err;
    return new AIProviderError(err.message);
  }
  return new AIProviderError("AI 服务未知错误");
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
