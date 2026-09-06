import type { SearchIntent, SearchResult } from "../types";
import { cleanQuery, rewriteQuery } from "./query-rewriter";

const STOP_WORDS = new Set([
  "什么",
  "是",
  "的",
  "了",
  "在",
  "有",
  "和",
  "与",
  "或",
  "如何",
  "怎么",
  "为什么",
  "what",
  "is",
  "are",
  "the",
  "a",
  "an",
  "how",
  "why",
  "who",
  "最近",
  "最新",
  "大家",
  "看",
  "上",
  "关于",
  "有什么",
  "图片",
  "照片",
  "图像",
  "新闻",
  "消息",
  "动态",
  "评测",
  "视频",
  "做法",
  "菜谱",
  "教程",
  "入门",
  "指南",
  "攻略",
  "步骤",
]);

/**
 * Tokens that may appear in a compound query but alone never prove relevance
 * for a multi-component concept (AI in AI眼镜, 量子 in 量子纠缠, etc.).
 */
const WEAK_ALONE_TERMS = new Set([
  "ai",
  "人工智能",
  "artificial",
  "intelligence",
  "news",
  "agent",
  "agents",
  "smart",
  "零",
  "学",
  "基础",
  "入门",
  "教程",
  "攻略",
  "怎么",
  "如何",
  "做法",
  "菜谱",
  "步骤",
  "指南",
  "优化",
  "广告",
  "投放",
  "加密",
  "计算",
  "检索",
  "生成",
  "增强",
]);

const CHINESE_FILLERS =
  /最近|最新|大家|怎么|如何|什么|有没有|有什么|关于|一下|评测|视频|图片|照片|图像|新闻|消息|动态/g;

/** Complete-phrase synonym groups (recall + relevance equivalence). Not domain gates. */
const PHRASE_SYNONYM_GROUPS: string[][] = [
  ["西红柿炒鸡蛋", "西红柿炒蛋", "番茄炒蛋", "番茄炒鸡蛋"],
  ["ai眼镜", "ai glasses", "smart glasses", "智能眼镜", "人工智能眼镜"],
  ["端到端加密", "e2ee", "endtoendencryption", "end-to-end encryption"],
  ["量子纠缠", "quantum entanglement"],
  ["量子计算", "quantum computing", "quantum computer"],
  ["rag", "retrievalaugmentedgeneration", "检索增强生成"],
  ["零基础学摄影", "摄影入门", "摄影入门教程", "摄影教程"],
  ["成都三日游", "成都三日游攻略", "成都旅游攻略", "成都行程"],
  ["amazon listing优化", "amazon listing", "亚马逊listing优化"],
  ["tiktok shop广告投放", "tiktok shop广告", "tiktok shop ads"],
  ["光刻机", "euv光刻机", "lithography"],
];

export interface RelevanceBreakdown {
  exactPhraseMatch: number;
  normalizedPhraseMatch: number;
  titleMatch: number;
  bodyMatch: number;
  componentCoverage: number;
  weakOnlyMatch: boolean;
  sourceQuality: number;
  score: number;
  /** True when title/body contains a full concept phrase (original or synonym). */
  fullConceptHit: boolean;
  /** True when only a weak/partial component matched. */
  partialOnly: boolean;
}

function compact(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase();
}

/** Significant tokens from the *original* query only (no rewrite pollution). */
export function extractSignificantTerms(query: string): string[] {
  const cleaned = cleanQuery(query)
    .replace(CHINESE_FILLERS, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = new Set<string>();

  const english = cleaned.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  for (const t of english) {
    if (t.length >= 2 && !STOP_WORDS.has(t.toLowerCase())) {
      terms.add(t.toLowerCase());
    }
  }

  // Keep contiguous Chinese runs as whole concepts — no uncontrolled 2–3 char windows.
  const chineseOnly = cleaned.replace(/[A-Za-z0-9\s-]+/g, " ").trim();
  const chinese = chineseOnly.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const t of chinese) {
    if (!STOP_WORDS.has(t)) terms.add(t);
  }

  // Mixed: also keep space-separated Chinese tokens if any
  for (const part of cleaned.split(/\s+/)) {
    if (/[\u4e00-\u9fff]{2,}/.test(part) && !STOP_WORDS.has(part)) {
      terms.add(part);
    }
  }

  return [...terms];
}

/**
 * Core components used for coverage. For a single Chinese compound like
 * 西红柿炒鸡蛋 we keep the full phrase as one component (not character slices).
 * Multi-token / mixed queries split on whitespace and Latin boundaries.
 */
export function extractQueryComponents(query: string): string[] {
  const cleaned = cleanQuery(query)
    .replace(CHINESE_FILLERS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const components: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2 || STOP_WORDS.has(t.toLowerCase())) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    components.push(t);
  };

  // Always keep the full cleaned phrase as the primary concept when long enough
  const fullZh = cleaned.replace(/[A-Za-z0-9\s_-]+/g, "").trim();
  if (fullZh.length >= 2) add(fullZh);

  // Latin / spaced tokens
  const spaced = cleaned.split(/[\s_/|-]+/).filter(Boolean);
  if (spaced.length >= 2) {
    for (const part of spaced) {
      if (/[A-Za-z]/.test(part)) add(part);
      else if (/[\u4e00-\u9fff]{2,}/.test(part)) add(part);
    }
  }

  // AI眼镜 style: Latin glued to Chinese
  const mixed = cleaned.match(/[A-Za-z][A-Za-z0-9-]*|[\u4e00-\u9fff]{2,}/g) ?? [];
  if (mixed.length >= 2) {
    for (const m of mixed) add(m);
  }

  return components;
}

function synonymPhrasesFor(query: string): string[] {
  const compactQ = compact(cleanQuery(query));
  const out = new Set<string>();
  if (compactQ.length >= 2) out.add(compactQ);

  for (const group of PHRASE_SYNONYM_GROUPS) {
    const compactGroup = group.map((g) => compact(g));
    if (compactGroup.some((g) => g === compactQ || compactQ.includes(g) || g.includes(compactQ))) {
      for (const g of compactGroup) {
        if (g.length >= 2) out.add(g);
      }
    }
  }

  // Rewrites are alternate *phrases* for matching, but only if they look like
  // real multi-token / long concepts — bare "Amazon" or "AI" must not count.
  for (const candidate of rewriteQuery(query)) {
    const value = compact(candidate);
    if (value.length < 4) continue;
    const isSingleLatinToken =
      /^[a-z0-9]+$/i.test(value) && !/[\u4e00-\u9fff]/.test(candidate);
    if (isSingleLatinToken && value.length < 12) continue;
    if (STOP_WORDS.has(candidate.toLowerCase())) continue;
    out.add(value);
  }

  return [...out].sort((a, b) => b.length - a.length);
}

function expandTermVariants(term: string): string[] {
  const key = compact(term);
  const variants = new Set<string>([key, term.toLowerCase()]);
  for (const group of PHRASE_SYNONYM_GROUPS) {
    const compactGroup = group.map((g) => compact(g));
    if (compactGroup.includes(key) || group.some((g) => g.toLowerCase() === term.toLowerCase())) {
      for (const g of group) {
        variants.add(compact(g));
        variants.add(g.toLowerCase());
      }
    }
  }
  // Glasses / agent micro-synonyms
  if (/眼镜|glasses/i.test(term)) {
    variants.add("眼镜");
    variants.add("glasses");
    variants.add("智能眼镜");
    variants.add("smartglasses");
  }
  return [...variants];
}

function textMatchesTerm(text: string, term: string): boolean {
  const haystack = normalizeForMatch(text);
  const hayCompact = compact(text);
  return expandTermVariants(term).some(
    (v) => haystack.includes(v) || hayCompact.includes(compact(v))
  );
}

function longestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  let best = 0;
  for (const char of a) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (char === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        best = Math.max(best, current[j]);
      }
    }
    previous = current;
  }
  return best;
}

function sourceQualityScore(result: SearchResult): number {
  try {
    const host = new URL(result.url).hostname.replace(/^www\./, "");
    if (/wikipedia\.org|arxiv\.org|nature\.com|reuters\.com|bbc\.com/.test(host))
      return 0.95;
    if (/github\.com|openai\.com|microsoft\.com|anthropic\.com/.test(host))
      return 0.85;
    if (/zhihu\.com|xiachufang\.com|meishichina\.com|sspai\.com|36kr\.com/.test(host))
      return 0.75;
    if (/baike\.baidu\.com|health\.baidu\.com/.test(host)) return 0.45;
    if (/bilibili\.com|douyin\.com|tiktok\.com/.test(host)) return 0.35;
    return 0.55;
  } catch {
    return 0.4;
  }
}

function isCompoundQuery(query: string): boolean {
  const compactQ = compact(cleanQuery(query));
  const components = extractQueryComponents(query);
  // Single short concept (西红柿, 光刻机) is not a multi-part compound for the weak-only gate
  if (components.length <= 1 && compactQ.length <= 4) return false;
  if (components.length >= 2) return true;
  return compactQ.length >= 5;
}

export function analyzeRelevance(
  result: SearchResult,
  query: string
): RelevanceBreakdown {
  const titleRaw = result.title ?? "";
  const bodyRaw = `${result.snippet ?? ""} ${result.content ?? ""}`;
  const titleN = normalizeForMatch(titleRaw);
  const bodyN = normalizeForMatch(bodyRaw);
  const titleC = compact(titleRaw);
  const bodyC = compact(bodyRaw);
  const originalC = compact(cleanQuery(query));
  const phrases = synonymPhrasesFor(query);
  const components = extractQueryComponents(query);
  const compound = isCompoundQuery(query);

  let exactPhraseMatch = 0;
  let normalizedPhraseMatch = 0;
  if (originalC.length >= 2) {
    if (titleC.includes(originalC)) exactPhraseMatch = 1;
    else if (bodyC.includes(originalC)) exactPhraseMatch = 0.75;
  }

  for (const phrase of phrases) {
    if (phrase === originalC) continue;
    if (titleC.includes(phrase)) {
      normalizedPhraseMatch = Math.max(normalizedPhraseMatch, 0.95);
    } else if (bodyC.includes(phrase)) {
      normalizedPhraseMatch = Math.max(normalizedPhraseMatch, 0.7);
    }
  }

  const fullConceptHit = exactPhraseMatch >= 0.75 || normalizedPhraseMatch >= 0.7;

  // Component coverage against original components (not rewrite fillers)
  let coverageTargets =
    components.length > 0
      ? components
      : originalC.length >= 2
        ? [cleanQuery(query)]
        : [];

  // Prefer informative components when the full phrase is also listed
  if (coverageTargets.length >= 2) {
    const informative = coverageTargets.filter(
      (t) => !WEAK_ALONE_TERMS.has(t.toLowerCase())
    );
    if (informative.length >= 2) coverageTargets = informative;
  }

  let matchedComponents = 0;
  let matchedStrong = 0;
  let titleComponentHits = 0;
  for (const term of coverageTargets) {
    const inTitle = textMatchesTerm(titleRaw, term);
    const inBody = textMatchesTerm(`${titleRaw} ${bodyRaw}`, term);
    if (!inTitle && !inBody) continue;
    matchedComponents++;
    if (inTitle) titleComponentHits++;
    if (!WEAK_ALONE_TERMS.has(term.toLowerCase()) && compact(term).length >= 2) {
      matchedStrong++;
    }
  }

  const componentCoverage =
    coverageTargets.length === 0
      ? 0.5
      : matchedComponents / coverageTargets.length;

  // LCS coverage for unbroken Chinese compounds (西红柿炒鸡蛋 vs 西红柿功效)
  let lcsRatio = 1;
  if (originalC.length >= 4) {
    const run = Math.max(
      longestCommonSubstringLength(originalC, titleC),
      longestCommonSubstringLength(originalC, bodyC)
    );
    lcsRatio = run / originalC.length;
  }

  const titleMatch = Math.max(
    exactPhraseMatch === 1 ? 1 : 0,
    normalizedPhraseMatch >= 0.95 ? 0.95 : 0,
    titleComponentHits / Math.max(coverageTargets.length, 1)
  );
  const bodyMatch = Math.max(
    exactPhraseMatch === 0.75 ? 0.75 : 0,
    normalizedPhraseMatch >= 0.7 && normalizedPhraseMatch < 0.95 ? 0.7 : 0,
    componentCoverage * 0.6
  );

  // Weak-only: compound query but only a short/weak fragment matched
  const weakOnlyMatch =
    compound &&
    !fullConceptHit &&
    (lcsRatio < 0.55 || (matchedStrong === 0 && matchedComponents > 0)) &&
    componentCoverage < 0.85;

  const partialOnly = compound && !fullConceptHit && (weakOnlyMatch || lcsRatio < 0.7);

  const sourceQuality = sourceQualityScore(result);

  let score = 0;
  if (exactPhraseMatch >= 1) score = Math.max(score, 0.98);
  else if (exactPhraseMatch >= 0.75) score = Math.max(score, 0.88);
  if (normalizedPhraseMatch >= 0.95) score = Math.max(score, 0.92);
  else if (normalizedPhraseMatch >= 0.7) score = Math.max(score, 0.8);

  // High component coverage without full phrase still middling-high
  if (!weakOnlyMatch && componentCoverage >= 0.99 && coverageTargets.length >= 2) {
    score = Math.max(score, 0.78);
  } else if (!weakOnlyMatch && componentCoverage >= 0.66 && lcsRatio >= 0.55) {
    score = Math.max(score, 0.55 + componentCoverage * 0.2);
  } else if (!compound && matchedComponents > 0) {
    // Simple query (西红柿): a single component hit is enough
    score = Math.max(score, titleComponentHits > 0 ? 0.7 : 0.45);
  }

  // LCS for long compounds
  if (compound && lcsRatio >= 0.85) score = Math.max(score, 0.82);
  else if (compound && lcsRatio >= 0.7) score = Math.max(score, 0.62);

  if (weakOnlyMatch || (compound && lcsRatio < 0.45 && !fullConceptHit)) {
    score = Math.min(score, 0.06);
  }

  // Slight title preference already encoded; nudge source quality lightly
  score = Math.min(1, score * (0.92 + sourceQuality * 0.08));

  // Ensure empty match is zero
  if (
    matchedComponents === 0 &&
    exactPhraseMatch === 0 &&
    normalizedPhraseMatch === 0 &&
    lcsRatio < 0.35
  ) {
    score = 0;
  }

  return {
    exactPhraseMatch,
    normalizedPhraseMatch,
    titleMatch,
    bodyMatch,
    componentCoverage: Math.max(componentCoverage, lcsRatio * 0.5),
    weakOnlyMatch,
    sourceQuality,
    score,
    fullConceptHit,
    partialOnly,
  };
}

export function phraseMatchScore(result: SearchResult, query: string): number {
  const a = analyzeRelevance(result, query);
  return Math.max(a.exactPhraseMatch, a.normalizedPhraseMatch);
}

export function hasStrongQueryCoverage(
  result: SearchResult,
  query: string,
  minimum = 0.18
): boolean {
  const a = analyzeRelevance(result, query);
  if (a.weakOnlyMatch || a.partialOnly) return false;
  return a.score >= minimum;
}

/** Score plain text against a search/research query (shared with deep research). */
export function scoreQueryRelevance(text: string, query: string): number {
  return computeRelevanceScore(
    {
      id: "text",
      type: "web",
      platform: "web",
      sourceType: "web",
      url: "https://example.invalid/",
      title: text.slice(0, 180),
      snippet: text,
      content: text,
    },
    query
  );
}

export function computeRelevanceScore(
  result: SearchResult,
  query: string
): number {
  return analyzeRelevance(result, query).score;
}

const DEFAULT_THRESHOLD = 0.12;
const WIKI_THRESHOLD = 0.18;

export function relevanceThresholdForIntent(intent: SearchIntent): number {
  switch (intent) {
    case "knowledge":
      return 0.18;
    case "news":
      return 0.08;
    case "social":
    case "opinion":
      return 0.1;
    case "image":
      return 0.14;
    default:
      return DEFAULT_THRESHOLD;
  }
}

export function filterByRelevance(
  results: SearchResult[],
  query: string,
  threshold = DEFAULT_THRESHOLD
): { kept: SearchResult[]; filtered: SearchResult[] } {
  const kept: SearchResult[] = [];
  const filtered: SearchResult[] = [];

  for (const result of results) {
    const isNewsChannel =
      result.sourceType === "news" ||
      Boolean(result.retrievalMethod?.includes("news"));

    if (isNewsChannel) {
      const relevance = computeRelevanceScore(result, query);
      kept.push({ ...result, rankScore: Math.max(relevance, 0.2) });
      continue;
    }

    if (result.sourceType === "image" || result.type === "image") {
      if (!result.thumbnail) {
        filtered.push(result);
        continue;
      }
    }

    const breakdown = analyzeRelevance(result, query);
    // Compound queries: never keep weak-only partial hits in the main list
    if (breakdown.weakOnlyMatch && breakdown.score < threshold) {
      filtered.push(result);
      continue;
    }
    if (breakdown.score >= threshold) {
      kept.push({ ...result, rankScore: breakdown.score });
    } else {
      filtered.push(result);
    }
  }

  return { kept, filtered };
}

export function isWikiResultRelevant(
  title: string,
  snippet: string,
  query: string
): boolean {
  const score = computeRelevanceScore(
    {
      id: "wiki",
      type: "web",
      platform: "wikipedia",
      sourceType: "encyclopedia",
      url: "https://wikipedia.org/",
      title,
      snippet,
      content: snippet,
    },
    query
  );
  return score >= WIKI_THRESHOLD;
}

export function scoreWikiCandidate(
  title: string,
  snippet: string,
  query: string
): number {
  return computeRelevanceScore(
    {
      id: "wiki",
      type: "web",
      platform: "wikipedia",
      sourceType: "encyclopedia",
      url: "https://wikipedia.org/",
      title,
      snippet,
      content: snippet,
    },
    query
  );
}

export { WIKI_THRESHOLD, DEFAULT_THRESHOLD };
