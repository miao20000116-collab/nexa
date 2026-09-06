import type { SearchIntent, SearchPlatform } from "../types";

export interface SourceRoute {
  web: boolean;
  wikipedia: boolean;
  youtube: boolean;
  social: boolean;
  image: boolean;
  news: boolean;
  video: boolean;
}

export function routeSources(intent: SearchIntent): SourceRoute {
  switch (intent) {
    case "knowledge":
      return {
        web: true,
        wikipedia: true,
        youtube: false,
        social: false,
        image: true,
        news: false,
        video: false,
      };
    case "news":
      return {
        web: false,
        wikipedia: false,
        youtube: false,
        social: false,
        image: true,
        news: true,
        video: true,
      };
    case "social":
      return {
        web: false,
        wikipedia: false,
        youtube: false,
        social: true,
        image: true,
        news: false,
        video: true,
      };
    case "opinion":
      return {
        web: true,
        wikipedia: false,
        youtube: false,
        social: true,
        image: true,
        news: false,
        video: true,
      };
    case "product":
      return {
        web: true,
        wikipedia: false,
        youtube: false,
        social: false,
        image: true,
        news: false,
        video: true,
      };
    case "research":
      return {
        web: true,
        wikipedia: true,
        youtube: false,
        social: false,
        image: true,
        news: true,
        video: true,
      };
    case "video":
      return {
        web: false,
        wikipedia: false,
        youtube: true,
        social: false,
        image: false,
        news: false,
        video: true,
      };
    case "image":
      return {
        web: false,
        wikipedia: false,
        youtube: false,
        social: false,
        image: true,
        news: false,
        video: false,
      };
    case "general":
    default:
      return {
        web: true,
        wikipedia: false,
        youtube: false,
        social: false,
        image: true,
        news: false,
        video: true,
      };
  }
}

/** Prefer platforms mentioned explicitly in the query. */
export function detectPreferredSocialPlatforms(query: string): SearchPlatform[] {
  const q = query.toLowerCase();
  const preferred: SearchPlatform[] = [];
  if (/x\s*上|twitter|推特|x\.com|\bx\b/.test(q)) preferred.push("x");
  if (/reddit/.test(q)) preferred.push("reddit");
  if (/小红书|xiaohongshu|xhs/.test(q)) preferred.push("xiaohongshu");
  if (/tiktok|tiktok\.com|抖音/.test(q)) preferred.push("tiktok");
  return preferred.length > 0
    ? preferred
    : ["x", "reddit", "xiaohongshu", "tiktok"];
}

export function expandSocialQuery(query: string): string {
  return query
    .replace(/x\s*上/gi, " ")
    .replace(/推特/gi, " ")
    .replace(/twitter/gi, " ")
    .replace(/reddit/gi, " ")
    .replace(/小红书/g, " ")
    .replace(/tiktok/gi, " ")
    .replace(/抖音/g, " ")
    .replace(/最近/g, " ")
    .replace(/大家/g, " ")
    .replace(/怎么看/g, " ")
    .replace(/有哪些/g, " ")
    .replace(/值得关注的/g, " ")
    .replace(/讨论/g, " ")
    .replace(/[？?！!。，,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
