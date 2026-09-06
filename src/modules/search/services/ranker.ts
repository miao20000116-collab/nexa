import type { SearchIntent, SearchResult } from "../types";
import { analyzeRelevance } from "./relevance-validator";

interface RankFeatures {
  relevance: number;
  phrase: number;
  coverage: number;
  freshness: number;
  authority: number;
  intentMatch: number;
  sourceMatch: number;
  contentQuality: number;
}

const AUTHORITY_DOMAINS = [
  "wikipedia.org",
  "github.com",
  "arxiv.org",
  "openai.com",
  "google.com",
  "microsoft.com",
  "anthropic.com",
  "nature.com",
  "reuters.com",
  "bbc.com",
  "techcrunch.com",
  "theverge.com",
];

const INTENT_PLATFORM_WEIGHTS: Record<
  SearchIntent,
  Partial<Record<SearchResult["platform"], number>>
> = {
  knowledge: { wikipedia: 1.6, web: 1.0 },
  news: { web: 1.35 },
  opinion: { x: 1.3, reddit: 1.25, youtube: 1.15, web: 1.0 },
  product: { youtube: 1.2, web: 1.25, xiaohongshu: 1.1 },
  research: { wikipedia: 1.3, web: 1.2 },
  social: { x: 1.45, reddit: 1.35, xiaohongshu: 1.25, tiktok: 1.2, web: 0.7 },
  video: { youtube: 1.55, web: 0.85 },
  image: { web: 1.2 },
  general: { wikipedia: 1.25, web: 1.15, youtube: 0.45, bilibili: 0.4, tiktok: 0.4 },
};

function computeFreshness(result: SearchResult, intent?: SearchIntent): number {
  if (!result.publishedAt) {
    // News without a date is less trustworthy than dated items
    return intent === "news" ? 0.2 : 0.3;
  }
  const age = Date.now() - new Date(result.publishedAt).getTime();
  const days = age / (1000 * 60 * 60 * 24);
  if (Number.isNaN(days)) return intent === "news" ? 0.2 : 0.3;
  if (days < 1) return 1;
  if (days < 7) return 0.9;
  if (days < 30) return 0.7;
  if (days < 90) return 0.45;
  if (days < 365) return 0.3;
  return intent === "news" ? 0.1 : 0.2;
}

const NEWS_FRIENDLY_DOMAINS = [
  "reuters.com",
  "bbc.com",
  "techcrunch.com",
  "theverge.com",
  "bloomberg.com",
  "cnn.com",
  "nytimes.com",
  "wsj.com",
  "apnews.com",
  "36kr.com",
  "jiemian.com",
  "caixin.com",
  "openai.com",
];

const NEWS_DEMOTE_DOMAINS = [
  "github.com",
  "stackoverflow.com",
  "npmjs.com",
  "pypi.org",
  "baike.baidu.com",
  "britannica.com",
  "coursera.org",
  "wikipedia.org",
  "ibm.com",
  "sciencedirect.com",
  "runoob.com",
  "iciba.com",
  "oecd.org",
  "bing.com",
];

const DEFINITION_TITLE =
  /^(what is|什么是|定义|definition|百科|journal\b)/i;

function computeAuthority(result: SearchResult, intent: SearchIntent): number {
  try {
    const domain = new URL(result.url).hostname.replace(/^www\./, "");

    if (intent === "news") {
      if (NEWS_DEMOTE_DOMAINS.some((d) => domain.includes(d))) return 0.12;
      if (DEFINITION_TITLE.test(result.title ?? "")) return 0.18;
      if (NEWS_FRIENDLY_DOMAINS.some((d) => domain.includes(d))) return 1;
      if (result.sourceType === "news") return 0.92;
      if (result.sourceType === "official") return 0.85;
      if (/news|新闻|快讯|日报|时报|post|verge|crunch/i.test(domain + (result.title ?? "")))
        return 0.8;
      return 0.45;
    }

    if (AUTHORITY_DOMAINS.some((d) => domain.includes(d))) return 1;
    if (result.platform === "wikipedia") return 1;
    if (result.sourceType === "official") return 0.95;
    if (result.sourceType === "academic") return 0.95;
    if (result.sourceType === "news") return 0.75;
    return 0.5;
  } catch {
    return 0.3;
  }
}

function computeIntentMatch(
  result: SearchResult,
  intent: SearchIntent
): number {
  if (intent === "news" && (result.sourceType === "news" || result.retrievalMethod?.includes("news"))) {
    return 1.55;
  }
  if (intent === "news" && /教程|入门|词典|百科|what is|定义|科普/i.test(result.title ?? "")) {
    return 0.25;
  }
  const weights = INTENT_PLATFORM_WEIGHTS[intent];
  return weights[result.platform] ?? 0.7;
}

function computeSourceMatch(result: SearchResult, intent: SearchIntent): number {
  const intentSourceMap: Record<SearchIntent, string[]> = {
    knowledge: ["encyclopedia", "official", "academic", "web", "news"],
    news: ["news", "official", "web"],
    opinion: ["social", "forum", "web", "news"],
    product: ["commerce", "web", "official", "news"],
    research: ["academic", "encyclopedia", "news", "official", "web"],
    social: ["social", "forum"],
    video: ["video"],
    image: ["image", "web"],
    general: ["web", "encyclopedia", "official", "news", "academic"],
  };
  const preferred = intentSourceMap[intent].includes(result.sourceType) ? 1 : 0.45;
  // Extra demotion: video pages in non-video intents
  if (
    intent !== "video" &&
    (result.sourceType === "video" ||
      result.platform === "bilibili" ||
      result.platform === "youtube" ||
      result.platform === "tiktok")
  ) {
    return Math.min(preferred, 0.28);
  }
  return preferred;
}

function computeContentQuality(result: SearchResult): number {
  let score = 0.45;
  if (result.title && result.title.length > 8) score += 0.2;
  if (result.snippet && result.snippet.length > 40) score += 0.2;
  if (result.thumbnail) score += 0.1;
  if (result.sourceType === "image" && result.thumbnail) score += 0.15;
  return Math.min(score, 1);
}

function computeFeatures(
  result: SearchResult,
  query: string,
  intent: SearchIntent
) {
  const breakdown = analyzeRelevance(result, query);
  return {
    relevance: breakdown.score,
    phrase: Math.max(breakdown.exactPhraseMatch, breakdown.normalizedPhraseMatch),
    coverage: breakdown.componentCoverage,
    freshness: computeFreshness(result, intent),
    authority: computeAuthority(result, intent),
    intentMatch: computeIntentMatch(result, intent),
    sourceMatch: computeSourceMatch(result, intent),
    contentQuality: computeContentQuality(result),
  } satisfies RankFeatures;
}

function intentWeights(intent: SearchIntent) {
  switch (intent) {
    case "news":
      return {
        relevance: 0.18,
        phrase: 0.12,
        coverage: 0.08,
        freshness: 0.3,
        authority: 0.14,
        intentMatch: 0.1,
        sourceMatch: 0.06,
        contentQuality: 0.02,
      };
    case "knowledge":
      return {
        relevance: 0.22,
        phrase: 0.2,
        coverage: 0.12,
        freshness: 0.04,
        authority: 0.18,
        intentMatch: 0.12,
        sourceMatch: 0.08,
        contentQuality: 0.04,
      };
    case "social":
    case "opinion":
      return {
        relevance: 0.2,
        phrase: 0.12,
        coverage: 0.08,
        freshness: 0.16,
        authority: 0.06,
        intentMatch: 0.2,
        sourceMatch: 0.12,
        contentQuality: 0.06,
      };
    case "video":
      return {
        relevance: 0.22,
        phrase: 0.12,
        coverage: 0.08,
        freshness: 0.12,
        authority: 0.08,
        intentMatch: 0.2,
        sourceMatch: 0.1,
        contentQuality: 0.08,
      };
    case "image":
      return {
        relevance: 0.24,
        phrase: 0.14,
        coverage: 0.08,
        freshness: 0.08,
        authority: 0.08,
        intentMatch: 0.16,
        sourceMatch: 0.12,
        contentQuality: 0.1,
      };
    case "product":
      return {
        relevance: 0.22,
        phrase: 0.14,
        coverage: 0.1,
        freshness: 0.12,
        authority: 0.1,
        intentMatch: 0.14,
        sourceMatch: 0.1,
        contentQuality: 0.08,
      };
    case "research":
      return {
        relevance: 0.2,
        phrase: 0.16,
        coverage: 0.12,
        freshness: 0.08,
        authority: 0.18,
        intentMatch: 0.12,
        sourceMatch: 0.08,
        contentQuality: 0.06,
      };
    default:
      return {
        relevance: 0.22,
        phrase: 0.18,
        coverage: 0.12,
        freshness: 0.1,
        authority: 0.12,
        intentMatch: 0.1,
        sourceMatch: 0.08,
        contentQuality: 0.08,
      };
  }
}

export function rankResults(
  results: SearchResult[],
  query: string,
  intent: SearchIntent
): SearchResult[] {
  const weights = intentWeights(intent);

  const scored = results.map((result) => {
    const features = computeFeatures(result, query, intent);
    let finalScore =
      features.relevance * weights.relevance +
      features.phrase * weights.phrase +
      features.coverage * weights.coverage +
      features.freshness * weights.freshness +
      features.authority * weights.authority +
      features.intentMatch * weights.intentMatch +
      features.sourceMatch * weights.sourceMatch +
      features.contentQuality * weights.contentQuality;

    const breakdown = analyzeRelevance(result, query);
    // Generic: full concept beats partial; never let weak-only float up
    if (breakdown.fullConceptHit) finalScore *= 1.2;
    // Soft demote only — never zero out / remove in ranker
    if (breakdown.weakOnlyMatch || breakdown.partialOnly) finalScore *= 0.55;
    // Non-video intents: demote video-heavy hosts (already in sourceMatch; reinforce)
    if (
      intent !== "video" &&
      /bilibili\.com|douyin\.com|tiktok\.com|youtube\.com/i.test(result.url)
    ) {
      finalScore *= 0.55;
    }

    return { ...result, rankScore: finalScore };
  });

  return scored.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
}
