/**
 * Webpage / media → compressed context for AI (low token).
 *
 * Pipeline:
 * - HTML pages: fetch readable text → excerpts (+ optional short summary)
 * - Video/image/social: media recognition (share meta + cover vision + structure
 *   hints) aligned with creation recreate/storyboard — never download platform
 *   original video/audio bytes.
 */

import {
  extractReadableContent,
  fetchReadablePage,
  fetchThroughEgress,
  isDomesticContentHost,
} from "@/lib/read/fetch-page";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import type {
  SourceSnapshot,
  WorkspaceSource,
} from "@/modules/workspace/types";
import {
  getSourceIngestMap,
  patchSourceIngest,
  type IngestPayload,
} from "@/modules/workspace/services/source-ingest-store";
import {
  isMediaRecognitionComplete,
  recognizeMediaForIngest,
} from "@/modules/workspace/services/media-recognize";

const EXTRACT_CAP = 12_000;
const SUMMARY_CAP = 400;
const EXCERPT_COUNT = 3;
const EXCERPT_LEN = 280;
const INGEST_CONCURRENCY = 3;

export type { IngestPayload };

function isProbablyMediaUrl(url: string, sourceType?: string): boolean {
  const t = (sourceType || "").toLowerCase();
  if (t === "video" || t === "image" || t === "audio") return true;
  return /\.(mp4|webm|mov|m4v|jpg|jpeg|png|gif|webp|mp3|wav)(\?|$)/i.test(url);
}

function isSocialHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("douyin") ||
      h.includes("tiktok") ||
      h.includes("xiaohongshu") ||
      h.includes("xhslink") ||
      h.includes("bilibili") ||
      h.includes("youtube") ||
      h.includes("youtu.be")
    );
  } catch {
    return false;
  }
}

function shouldBypassProxy(url: string): boolean {
  return isSocialHost(url) || isDomesticContentHost(url);
}

/** Pick dense paragraphs without calling the LLM. */
export function pickKeyExcerpts(text: string, n = EXCERPT_COUNT): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40);
  if (parts.length === 0) {
    const one = text.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LEN);
    return one ? [one] : [];
  }
  const scored = parts.map((p) => ({
    p,
    score:
      Math.min(p.length, 500) +
      (/\d/.test(p) ? 40 : 0) +
      (/[：:]/.test(p) ? 20 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  for (const { p } of scored) {
    if (picked.length >= n) break;
    if (
      picked.some(
        (x) => x.includes(p.slice(0, 60)) || p.includes(x.slice(0, 60))
      )
    ) {
      continue;
    }
    picked.push(p.slice(0, EXCERPT_LEN));
  }
  return picked;
}

function heuristicSummary(
  title: string | undefined,
  text: string,
  snippet?: string
): string {
  const head = text.replace(/\s+/g, " ").trim().slice(0, SUMMARY_CAP);
  if (head.length >= 80) {
    return `${title ? `《${title}》` : ""}${head}`.slice(0, SUMMARY_CAP + 40);
  }
  return (snippet || title || head || "").slice(0, SUMMARY_CAP);
}

async function maybeAiSummary(
  title: string,
  text: string,
  snippet?: string
): Promise<string> {
  const base = heuristicSummary(title, text, snippet);
  if (text.length < 1600 || !AIGateway.isAvailable("summarize")) {
    return base;
  }
  try {
    const result = await AIGateway.summarize(
      `标题：${title}\n\n正文：\n${text.slice(0, 6000)}`,
      "用中文写 120–200 字摘要：主题、关键事实、可对比观点。不要列表套话。"
    );
    const s = (typeof result === "string" ? result : "").trim();
    return s ? s.slice(0, SUMMARY_CAP + 80) : base;
  } catch {
    return base;
  }
}

async function enrichFromSearch(input: {
  url: string;
  title?: string | null;
  snippet?: string | null;
}): Promise<{ text: string; title: string } | null> {
  if (!process.env.SEARXNG_BASE_URL?.trim()) return null;
  try {
    const { createSearXNGProvider } = await import(
      "@/modules/search/providers/searxng-provider"
    );
    const provider = createSearXNGProvider();
    const host = (() => {
      try {
        return new URL(input.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    const titleQ = (input.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const queries = [
      titleQ ? `${titleQ}` : "",
      host && titleQ ? `site:${host} ${titleQ}` : "",
      host ? `site:${host} ${input.snippet || titleQ || "要点"}` : "",
      input.url,
    ].filter((q) => q.length >= 4);

    const blobs: string[] = [];
    let bestTitle = input.title || "";
    const seen = new Set<string>();

    for (const q of queries.slice(0, 3)) {
      const hits = await provider.search({ query: q, maxResults: 8 });
      for (const h of hits) {
        const snip = (h.snippet || "").replace(/\s+/g, " ").trim();
        if (snip.length < 24) continue;
        const key = snip.slice(0, 48);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!bestTitle && h.title) bestTitle = h.title;
        blobs.push(
          h.url === input.url || (host && h.url.includes(host))
            ? snip
            : `【相关】${h.title || ""}：${snip}`
        );
        if (blobs.join("").length > 6000) break;
      }
      if (blobs.join("").length > 2500) break;
    }

    if (input.snippet && input.snippet.trim().length >= 12) {
      blobs.unshift(input.snippet.trim());
    }

    const text = blobs.join("\n\n").trim();
    if (text.replace(/\s/g, "").length < 80) return null;
    return {
      text: text.slice(0, EXTRACT_CAP),
      title: bestTitle || host || "资料",
    };
  } catch (err) {
    console.warn(
      "[ingest] search enrichment failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

export async function ingestUrl(input: {
  url: string;
  title?: string | null;
  snippet?: string | null;
  sourceType?: string;
  thumbnail?: string | null;
  platform?: string;
}): Promise<IngestPayload> {
  const now = new Date().toISOString();

  // Media / social first — same recognition path as creation storyboard
  const media = await recognizeMediaForIngest({
    url: input.url,
    title: input.title,
    snippet: input.snippet,
    sourceType: input.sourceType,
    thumbnail: input.thumbnail,
    platform: input.platform,
  });
  if (media) return media;

  if (isProbablyMediaUrl(input.url, input.sourceType)) {
    return {
      contentSummary: heuristicSummary(
        input.title ?? undefined,
        "",
        input.snippet ?? undefined
      ),
      keyExcerpts: input.snippet ? [input.snippet.slice(0, EXCERPT_LEN)] : [],
      mediaSummary:
        "媒体链接：未能完成识别（无封面/摘要可用）。未下载原片。",
      ingestStatus: "skipped_thin",
      ingestedAt: now,
    };
  }

  try {
    // Prefer domestic direct + Jina reader fallback for login-walled articles
    const readable = await fetchReadablePage(input.url, { timeoutMs: 16_000 });
    const title = readable.title || input.title || undefined;
    const cleaned = readable.text.slice(0, EXTRACT_CAP);

    if (cleaned.replace(/\s/g, "").length < 40) {
      // Last chance: social/media recognition from OG meta
      try {
        const response = await fetchThroughEgress(input.url, {
          timeoutMs: 12_000,
          bypassProxy: shouldBypassProxy(input.url),
        });
        if (response.ok) {
          const contentType = response.headers.get("content-type") ?? "";
          if (/^(image|video|audio|application\/pdf)\b/i.test(contentType)) {
            const again = await recognizeMediaForIngest({
              ...input,
              sourceType: contentType.startsWith("video")
                ? "video"
                : contentType.startsWith("image")
                  ? "image"
                  : input.sourceType,
            });
            if (again) return again;
          }
          const html = await response.text();
          const extracted = extractReadableContent(html, input.url);
          const socialFallback = await recognizeMediaForIngest({
            ...input,
            title: extracted.title || input.title,
            snippet: input.snippet || extracted.text.slice(0, 200),
          });
          if (socialFallback) return socialFallback;
        }
      } catch {
        /* fall through */
      }

      // Wall/403/proxy-down: reconstruct usable article context via SearXNG snippets
      const enriched = await enrichFromSearch({
        url: input.url,
        title: title || input.title,
        snippet: input.snippet,
      });
      if (enriched) {
        const keyExcerpts = pickKeyExcerpts(enriched.text);
        const contentSummary = await maybeAiSummary(
          enriched.title,
          enriched.text,
          input.snippet ?? undefined
        );
        return {
          contentSummary,
          keyExcerpts,
          ingestStatus: "ready",
          ingestedAt: now,
          extractedText: enriched.text,
          mediaSummary: "页面直抓受阻，已用检索结果聚合正文上下文。",
        };
      }

      return {
        contentSummary: heuristicSummary(
          title,
          "",
          input.snippet ?? undefined
        ),
        keyExcerpts: input.snippet ? [input.snippet.slice(0, EXCERPT_LEN)] : [],
        ingestStatus: "skipped_thin",
        ingestedAt: now,
      };
    }

    const keyExcerpts = pickKeyExcerpts(cleaned);
    const contentSummary = await maybeAiSummary(
      title || "",
      cleaned,
      input.snippet ?? undefined
    );

    return {
      contentSummary,
      keyExcerpts,
      ingestStatus: "ready",
      ingestedAt: now,
      extractedText: cleaned,
    };
  } catch {
    return {
      contentSummary: heuristicSummary(
        input.title ?? undefined,
        "",
        input.snippet ?? undefined
      ),
      keyExcerpts: input.snippet ? [input.snippet.slice(0, EXCERPT_LEN)] : [],
      ingestStatus: "failed",
      ingestedAt: now,
    };
  }
}

export function promptTextForSource(s: SourceSnapshot | WorkspaceSource): string {
  const parts: string[] = [];
  if (s.contentSummary) parts.push(s.contentSummary);
  if (s.keyExcerpts?.length) {
    parts.push(s.keyExcerpts.map((e, i) => `摘录${i + 1}：${e}`).join("\n"));
  }
  if (s.mediaSummary) parts.push(`媒体识别：${s.mediaSummary}`);
  if (parts.length === 0 && s.snippet) parts.push(s.snippet);
  return parts.join("\n");
}

export async function mergeIngestIntoSources(
  workspaceId: string,
  sources: WorkspaceSource[]
): Promise<WorkspaceSource[]> {
  const map = await getSourceIngestMap(workspaceId);
  return sources.map((s) => {
    const ing = map[s.id] || (s.url ? map[`url:${s.url}`] : undefined);
    if (!ing) return s;
    return {
      ...s,
      contentSummary: ing.contentSummary ?? s.contentSummary,
      keyExcerpts: ing.keyExcerpts ?? s.keyExcerpts,
      mediaSummary: ing.mediaSummary ?? s.mediaSummary,
      ingestStatus: ing.ingestStatus ?? s.ingestStatus,
      ingestedAt: ing.ingestedAt ?? s.ingestedAt,
      extractedText: ing.extractedText ?? s.extractedText,
    };
  });
}

function needsIngest(s: WorkspaceSource, force?: boolean): boolean {
  if (force) return true;
  if (
    !s.ingestStatus ||
    s.ingestStatus === "pending" ||
    s.ingestStatus === "failed" ||
    s.ingestStatus === "skipped_thin"
  ) {
    return true;
  }
  // Upgrade legacy meta-only skips to real media recognition
  if (
    s.ingestStatus === "skipped_binary" &&
    !isMediaRecognitionComplete(s.mediaSummary)
  ) {
    return true;
  }
  return false;
}

/** Lazy-ingest missing sources (bounded concurrency). */
export async function ensureSourcesIngested(
  workspaceId: string,
  sources: WorkspaceSource[],
  opts?: { limit?: number; force?: boolean }
): Promise<WorkspaceSource[]> {
  const merged = await mergeIngestIntoSources(workspaceId, sources);
  const limit = opts?.limit ?? 8;
  const pending = merged
    .filter((s) => needsIngest(s, opts?.force))
    .slice(0, limit);

  if (pending.length === 0) return merged;

  const results = new Map<string, IngestPayload>();
  let i = 0;
  async function worker() {
    while (i < pending.length) {
      const idx = i++;
      const s = pending[idx];
      const payload = await ingestUrl({
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        sourceType: s.sourceType,
        thumbnail: s.thumbnail,
        platform: s.platform,
      });
      results.set(s.id, payload);
      await patchSourceIngest(workspaceId, s.id, payload, s.url);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(INGEST_CONCURRENCY, pending.length) }, () =>
      worker()
    )
  );

  return merged.map((s) => {
    const payload = results.get(s.id);
    if (!payload) return s;
    return {
      ...s,
      contentSummary: payload.contentSummary,
      keyExcerpts: payload.keyExcerpts,
      mediaSummary: payload.mediaSummary ?? null,
      ingestStatus: payload.ingestStatus,
      ingestedAt: payload.ingestedAt,
      extractedText: payload.extractedText ?? null,
    };
  });
}
