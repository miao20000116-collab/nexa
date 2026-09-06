import type { SearchIntent, SearchResult } from "../types";
import { rewriteQuery } from "./query-rewriter";

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
]);

/** Terms too generic to alone prove relevance for compound / product queries. */
const WEAK_ALONE_TERMS = new Set([
  "ai",
  "人工智能",
  "artificial",
  "intelligence",
  "news",
  "agent",
  "agents",
  "smart",
]);

const CHINESE_FILLERS =
  /最近|最新|大家|怎么|如何|什么|有没有|有什么|关于|一下|评测|视频|图片|照片|图像|新闻|消息|动态/g;

export function extractSignificantTerms(query: string): string[] {
  const rewritten = rewriteQuery(query);
  const terms = new Set<string>();

  for (const q of rewritten) {
    const english = q.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
    for (const t of english) {
      if (t.length >= 2 && !STOP_WORDS.has(t.toLowerCase())) {
        terms.add(t.toLowerCase());
      }
    }

    // Split Chinese by fillers so "人工智能最近有什么" → "人工智能"
    const chineseOnly = q
      .replace(/[A-Za-z0-9\s-]+/g, " ")
      .replace(CHINESE_FILLERS, " ")
      .replace(/\s+/g, " ")
      .trim();
    const chinese = chineseOnly.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
    for (const t of chinese) {
      if (!STOP_WORDS.has(t)) terms.add(t);
    }
  }

  // Compound product: keep object noun even when AI is present
  if (/眼镜|智能眼镜/.test(query)) {
    terms.add("眼镜");
    terms.add("智能眼镜");
    terms.add("glasses");
    terms.add("smartglasses");
  }
  if (/glasses/i.test(query)) {
    terms.add("glasses");
    terms.add("眼镜");
    terms.add("智能眼镜");
  }

  return [...terms];
}

/** Cross-language / product synonyms for relevance matching. */
const TERM_SYNONYMS: Record<string, string[]> = {
  眼镜: ["眼镜", "glasses", "smartglasses", "smart glasses", "智能眼镜", "ar glasses"],
  智能眼镜: ["眼镜", "glasses", "smartglasses", "smart glasses", "智能眼镜"],
  glasses: ["眼镜", "glasses", "smartglasses", "smart glasses", "智能眼镜"],
  smartglasses: ["眼镜", "glasses", "smartglasses", "smart glasses", "智能眼镜"],
  agent: ["agent", "agents", "智能体", "ai agent"],
  agents: ["agent", "agents", "智能体", "ai agent"],
  智能体: ["agent", "agents", "智能体", "ai agent"],
};

function expandTermVariants(term: string): string[] {
  const key = term.toLowerCase();
  const variants = new Set<string>([key, term]);
  for (const [anchor, group] of Object.entries(TERM_SYNONYMS)) {
    const anchorLower = anchor.toLowerCase();
    if (
      anchorLower === key ||
      group.some((g) => g.toLowerCase() === key)
    ) {
      variants.add(anchorLower);
      for (const g of group) variants.add(g.toLowerCase());
    }
  }
  return [...variants];
}

function textMatchesTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  return expandTermVariants(term).some((v) => haystack.includes(v));
}

/** Score plain text against a search/research query (shared with deep research). */
export function scoreQueryRelevance(text: string, query: string): number {
  const terms = extractSignificantTerms(query);
  if (terms.length === 0) return 0.5;

  const haystack = text.toLowerCase();
  let matched = 0;
  let strongMatched = 0;
  const strong = strongTerms(terms);

  for (const term of terms) {
    if (textMatchesTerm(haystack, term)) {
      matched++;
      if (strong.some((s) => s.toLowerCase() === term.toLowerCase())) {
        strongMatched++;
      }
    }
  }

  if (matched === 0) return 0;
  if (strong.length > 0 && strongMatched === 0) {
    return Math.min((matched / terms.length) * 0.12, 0.06);
  }
  const denom = Math.max((strong.length > 0 ? strong : terms).length, 1);
  return Math.min(matched / denom, 1);
}

function strongTerms(terms: string[]): string[] {
  return terms.filter((t) => !WEAK_ALONE_TERMS.has(t.toLowerCase()));
}

export function computeRelevanceScore(
  result: SearchResult,
  query: string
): number {
  const terms = extractSignificantTerms(query);
  if (terms.length === 0) return 0.5;

  const title = (result.title ?? "").toLowerCase();
  const text =
    `${result.title ?? ""} ${result.snippet ?? ""} ${result.content ?? ""} ${result.url}`.toLowerCase();

  let score = 0;
  let matched = 0;
  let strongMatched = 0;
  const strong = strongTerms(terms);
  const denomTerms = strong.length > 0 ? strong : terms;

  for (const term of terms) {
    const inTitle = textMatchesTerm(title, term);
    const inText = textMatchesTerm(text, term);
    if (!inTitle && !inText) continue;

    const weight = inTitle ? 0.4 : 0.22;
    score += weight;
    matched++;
    if (strong.some((s) => s.toLowerCase() === term.toLowerCase())) strongMatched++;
  }

  if (matched === 0) return 0;

  // Compound queries (e.g. AI眼镜): matching only "AI" is not enough
  if (strong.length > 0 && strongMatched === 0) {
    return Math.min(score * 0.12, 0.06);
  }

  return Math.min(score / Math.max(denomTerms.length * 0.35, 0.35), 1);
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

    // News engines already scoped the corpus — don't over-filter dated/news hits
    if (isNewsChannel) {
      const relevance = computeRelevanceScore(result, query);
      kept.push({ ...result, rankScore: Math.max(relevance, 0.2) });
      continue;
    }

    // Real image results: require a thumbnail; drop article pages labeled as images
    if (result.sourceType === "image" || result.type === "image") {
      if (!result.thumbnail) {
        filtered.push(result);
        continue;
      }
    }

    const relevance = computeRelevanceScore(result, query);
    if (relevance >= threshold) {
      kept.push({ ...result, rankScore: relevance });
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
  const terms = extractSignificantTerms(query);
  if (terms.length === 0) return false;

  const titleLower = title.toLowerCase();
  const snippetText = snippet.replace(/<[^>]+>/g, "").toLowerCase();
  const combined = `${titleLower} ${snippetText}`;

  let matched = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (combined.includes(t)) matched++;
    if (snippet.includes(term.toUpperCase()) && term.length <= 5) matched++;
  }

  if (matched === 0) return false;

  const isDisambiguation =
    titleLower === terms[0]?.toLowerCase() &&
    snippetText.includes("may refer to");
  if (isDisambiguation) return false;

  return matched >= 1;
}

export function scoreWikiCandidate(
  title: string,
  snippet: string,
  query: string
): number {
  const terms = extractSignificantTerms(query);
  if (terms.length === 0) return 0;

  const titleLower = title.toLowerCase();
  const snippetText = snippet.replace(/<[^>]+>/g, "");
  const snippetLower = snippetText.toLowerCase();
  let score = 0;

  for (const term of terms) {
    const t = term.toLowerCase();
    if (titleLower === t) score += 0.5;
    else if (titleLower.includes(t)) score += 0.3;
    if (snippetLower.includes(t)) score += 0.2;
    if (snippetText.includes(term.toUpperCase()) && term.length <= 5)
      score += 0.35;
  }

  if (
    snippetLower.includes("may refer to") &&
    titleLower === terms[0]?.toLowerCase()
  ) {
    score -= 0.4;
  }

  const hasAcronym = terms.some((t) => /^[a-z]{2,5}$/.test(t) && t.length <= 5);
  if (hasAcronym && title.split(/[\s-]+/).length >= 2) {
    score += 0.25;
  }

  return score;
}

export { WIKI_THRESHOLD, DEFAULT_THRESHOLD };
