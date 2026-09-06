/**
 * Keyword Intelligence (V4.5-B) — Companion to Listing Intelligence.
 *
 * Uses real Search evidence for keyword suggestions.
 * Never invents search volume / rank / official keyword tools data.
 */

import { getSearchOrchestrator } from "@/modules/search/services/search-orchestrator";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";
import type { KeywordBucket, KeywordIntelligence } from "./listing-types";

const BILLING = "keyword_intelligence";

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] || text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapBuckets(v: unknown, fallbackSource: string): KeywordBucket[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 12).map((item) => {
    if (typeof item === "string") {
      return {
        term: item.trim(),
        source: fallbackSource,
      };
    }
    const row = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    return {
      term: String(row.term || row.keyword || "").trim(),
      source: String(row.source || fallbackSource).slice(0, 200),
      intent: row.intent ? String(row.intent).slice(0, 120) : undefined,
      relevance: row.relevance
        ? String(row.relevance).slice(0, 120)
        : undefined,
    };
  }).filter((b) => b.term);
}

export async function runKeywordIntelligence(opts: {
  productTitle: string;
  marketplace: string;
  country: string;
  category?: string | null;
  features?: string[];
  accountId: string | null;
  jobId: string;
}): Promise<KeywordIntelligence> {
  const volumeNotice =
    "无第三方关键词工具 / 搜索量 API。禁止伪造 Search Volume。来源仅为公开检索标题与摘要 + AI 归纳。";

  let evidenceUrls: string[] = [];
  let evidenceBlock = "";
  try {
    const q = [
      opts.productTitle,
      opts.marketplace,
      opts.category,
      "keywords buying intent reviews",
    ]
      .filter(Boolean)
      .join(" ");
    const orchestrator = getSearchOrchestrator();
    const response = await orchestrator.search(q, { includeOverview: false });
    const rows = (response.results ?? []).slice(0, 10);
    evidenceUrls = rows.map((r) => r.url).filter(Boolean);
    evidenceBlock = rows
      .map(
        (r, i) =>
          `[${i}] ${r.title || r.url}\n${(r.snippet || "").slice(0, 200)}\n${r.url}`
      )
      .join("\n\n");
  } catch (err) {
    console.error("[keyword-intelligence] search failed", err);
    return {
      primary: [],
      secondary: [],
      longTail: [],
      searchIntent: "数据暂缺 — 公开检索失败",
      relevanceNotes: "Insufficient Evidence",
      potentialNegative: [],
      volumeNotice,
      evidenceUrls: [],
      aiAssisted: false,
    };
  }

  bootstrapAIProviders();
  if (!AIGateway.isAvailable("generateText") || !evidenceBlock) {
    const fromTitles = evidenceBlock
      ? evidenceBlock
          .split("\n")
          .filter((l) => l.startsWith("["))
          .slice(0, 5)
          .map((l) => ({
            term: l.replace(/^\[\d+\]\s*/, "").slice(0, 60),
            source: "公开检索标题片段（未 AI 结构化）",
          }))
      : [];
    return {
      primary: fromTitles.slice(0, 3),
      secondary: [],
      longTail: [],
      searchIntent: evidenceBlock
        ? "需结合证据人工判断 Search Intent"
        : "Insufficient Evidence",
      relevanceNotes: evidenceBlock
        ? "仅有公开检索证据，无搜索量"
        : "Insufficient Evidence",
      potentialNegative: [],
      volumeNotice,
      evidenceUrls,
      aiAssisted: false,
    };
  }

  const prompt = `你是跨境电商关键词顾问。只能基于公开检索证据建议关键词。
禁止输出任何搜索量、CPC、排名数字。每个词必须写 source（例如「来自证据[0]标题」或「由产品特点推断·无量级数据」）。

商品：${opts.productTitle}
市场：${opts.marketplace} · ${opts.country}
类目：${opts.category || "n/a"}
特点：${(opts.features || []).join("；") || "none"}

输出 JSON：
{
  "primary": [{"term":"","source":"","intent":"","relevance":""}],
  "secondary": [{"term":"","source":""}],
  "longTail": [{"term":"","source":""}],
  "searchIntent": "整体意图判断",
  "relevanceNotes": "相关性说明",
  "potentialNegative": [{"term":"","source":"为何可能负向"}]
}

【公开检索证据】
${evidenceBlock}`;

  try {
    const gen = await AIGateway.generateText(
      { prompt, maxTokens: 1200 },
      {
        accountId: opts.accountId,
        jobId: opts.jobId,
        billingCapability: BILLING,
        referenceType: "keyword_intelligence",
        quality: "balanced",
      }
    );
    const parsed = extractJsonObject(gen.text || "");
    if (!parsed) {
      return {
        primary: [],
        secondary: [],
        longTail: [],
        searchIntent: "AI 未返回结构化关键词",
        relevanceNotes: "见公开检索证据链接",
        potentialNegative: [],
        volumeNotice,
        evidenceUrls,
        aiAssisted: true,
      };
    }
    const src = "公开检索证据 + AI 归纳（无搜索量）";
    return {
      primary: mapBuckets(parsed.primary, src),
      secondary: mapBuckets(parsed.secondary, src),
      longTail: mapBuckets(parsed.longTail, src),
      searchIntent: String(
        parsed.searchIntent || "Insufficient Evidence"
      ).slice(0, 400),
      relevanceNotes: String(
        parsed.relevanceNotes || "Based on available search snippets"
      ).slice(0, 400),
      potentialNegative: mapBuckets(parsed.potentialNegative, src),
      volumeNotice,
      evidenceUrls,
      aiAssisted: true,
    };
  } catch (err) {
    console.error("[keyword-intelligence] AI failed", err);
    return {
      primary: [],
      secondary: [],
      longTail: [],
      searchIntent: "AI 调用失败",
      relevanceNotes: "Insufficient Evidence",
      potentialNegative: [],
      volumeNotice,
      evidenceUrls,
      aiAssisted: false,
    };
  }
}
