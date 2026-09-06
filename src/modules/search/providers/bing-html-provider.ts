/**
 * Direct Bing HTML SERP fetch for China cloud hosts where SearXNG engines
 * return empty / junk (CAPTCHA, bot walls). Parses classic `li.b_algo` blocks.
 */

import type { SearchResult, WebSearchOptions } from "../types";
import type { WebSearchProvider } from "./interfaces";
import { extractDomain, getFaviconUrl } from "@/lib/utils";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHref(href: string): string {
  try {
    // Bing often wraps as /ck/a?...&u=a1aHR0cHM6...
    const u = new URL(href, "https://cn.bing.com");
    const nested = u.searchParams.get("u");
    if (nested?.startsWith("a1")) {
      const b64 = nested.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      try {
        return Buffer.from(b64, "base64").toString("utf8");
      } catch {
        /* keep */
      }
    }
    if (href.startsWith("http")) return href;
    return u.toString();
  } catch {
    return href;
  }
}

function parseBingHtml(html: string, query: string): SearchResult[] {
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) ?? [];
  const out: SearchResult[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const m = b.match(
      /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!m) continue;
    const url = decodeHref(m[1]);
    const title = stripTags(m[2]);
    if (!title || !url.startsWith("http")) continue;

    const sn =
      b.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i) ||
      b.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = sn ? stripTags(sn[1]) : "";

    // Skip obvious video-only hosts in article mode (caller may still want them)
    out.push({
      id: `bing_html_${i}_${Buffer.from(url)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")
        .slice(0, 16)}`,
      type: "web",
      platform: "web",
      sourceType: "web",
      source: "web",
      title,
      snippet,
      content: snippet,
      url,
      thumbnail: getFaviconUrl(url) || undefined,
      author: extractDomain(url) || undefined,
      retrievalMethod: "bing_html",
      rankScore: Math.max(0.2, 1 - i * 0.05),
      rawSource: { engine: "bing_html", query },
    });
  }
  return out;
}

function parseBingImagesHtml(html: string, query: string): SearchResult[] {
  const out: SearchResult[] = [];
  // Bing image tiles often embed murl / turl in metadata
  const re =
    /murl&quot;:&quot;(https?:[^&"]+)&quot;[\s\S]{0,400}?turl&quot;:&quot;(https?:[^&"]+)&quot;/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null && i < 40) {
    const img = m[1].replace(/\\u0026/g, "&").replace(/\\+/g, "");
    const page = m[2].replace(/\\u0026/g, "&");
    if (!img.startsWith("http")) continue;
    out.push({
      id: `bing_img_${i}_${Buffer.from(img).toString("base64").slice(0, 12)}`,
      type: "image",
      platform: "web",
      sourceType: "image",
      source: "bing_images",
      title: query,
      url: page.startsWith("http") ? page : img,
      thumbnail: img,
      retrievalMethod: "bing_images_html",
      rankScore: Math.max(0.2, 1 - i * 0.03),
      rawSource: { engine: "bing_images", query },
    });
    i++;
  }
  // Fallback: plain img src from media cards
  if (out.length === 0) {
    const imgs = html.match(/src="(https:\/\/[^"]+(?:bing\.net|mm\.bing)[^"]+)"/gi) ?? [];
    for (const tag of imgs.slice(0, 24)) {
      const src = tag.match(/src="([^"]+)"/i)?.[1];
      if (!src) continue;
      out.push({
        id: `bing_img_fb_${out.length}`,
        type: "image",
        platform: "web",
        sourceType: "image",
        title: query,
        url: src,
        thumbnail: src,
        retrievalMethod: "bing_images_html",
        rankScore: 0.5,
      });
    }
  }
  return out;
}

function parseBingVideosHtml(html: string, query: string): SearchResult[] {
  const blocks =
    html.match(/<div[^>]+class="[^"]*mc_vtvc[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) ??
    html.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi) ??
    [];
  const out: SearchResult[] = [];
  for (let i = 0; i < blocks.length && out.length < 20; i++) {
    const b = blocks[i];
    const href =
      b.match(/href="([^"]+)"/i)?.[1] ||
      b.match(/href='([^']+)'/i)?.[1];
    const thumb = b.match(/src="(https?:[^"]+)"/i)?.[1];
    const title =
      stripTags(b.match(/title="([^"]+)"/i)?.[1] || "") ||
      stripTags(b.match(/aria-label="([^"]+)"/i)?.[1] || "") ||
      query;
    if (!href) continue;
    const url = decodeHref(href);
    if (!url.startsWith("http")) continue;
    const isVideoHost =
      /youtube|youtu\.be|bilibili|douyin|tiktok|youku|iqiyi|v\.qq|ixigua/i.test(
        url
      ) || /\/videos?\//i.test(url);
    out.push({
      id: `bing_vid_${out.length}_${Buffer.from(url).toString("base64").slice(0, 12)}`,
      type: "video",
      platform: /bilibili/i.test(url)
        ? "bilibili"
        : /youtube|youtu\.be/i.test(url)
          ? "youtube"
          : /tiktok|douyin/i.test(url)
            ? "tiktok"
            : "web",
      sourceType: "video",
      source: "bing_videos",
      title,
      url,
      thumbnail: thumb,
      retrievalMethod: "bing_videos_html",
      rankScore: Math.max(0.2, 1 - out.length * 0.04),
      rawSource: { engine: "bing_videos", query, isVideoHost },
    });
  }
  return out;
}

export class BingHtmlProvider implements WebSearchProvider {
  private timeout: number;

  constructor(timeout = 18_000) {
    this.timeout = timeout;
  }

  isConfigured(): boolean {
    return true;
  }

  async search(options: WebSearchOptions): Promise<SearchResult[]> {
    const q = options.query.trim();
    if (!q) return [];

    const page = Math.max(1, options.page ?? 1);
    const first = (page - 1) * 10 + 1;
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(q)}&mkt=zh-CN&setlang=zh-Hans&FORM=QBRE&ensearch=0&first=${first}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://cn.bing.com/",
          Cookie: "SRCHHPGUSR=SRCHLANG=zh-Hans; _EDGE_S=mkt=zh-CN",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`Bing HTML HTTP ${res.status}`);
      }
      const html = await res.text();
      const max = options.maxResults ?? 20;
      return parseBingHtml(html, q).slice(0, max);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bing image SERP for when SearXNG images are empty. */
  async searchImages(options: WebSearchOptions): Promise<SearchResult[]> {
    const q = options.query.trim();
    if (!q) return [];
    const page = Math.max(1, options.page ?? 1);
    const first = (page - 1) * 35 + 1;
    const url = `https://cn.bing.com/images/search?q=${encodeURIComponent(q)}&first=${first}&qft=+filterui:photo-photo&FORM=IRFLTR`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          Accept: "text/html",
          Referer: "https://cn.bing.com/",
        },
        redirect: "follow",
      });
      if (!res.ok) return [];
      const html = await res.text();
      return parseBingImagesHtml(html, q).slice(0, options.maxResults ?? 24);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bing video SERP fallback. */
  async searchVideos(options: WebSearchOptions): Promise<SearchResult[]> {
    const q = options.query.trim();
    if (!q) return [];
    const page = Math.max(1, options.page ?? 1);
    const first = (page - 1) * 10 + 1;
    const url = `https://cn.bing.com/videos/search?q=${encodeURIComponent(q)}&first=${first}&FORM=VRFLTR`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
          Accept: "text/html",
          Referer: "https://cn.bing.com/",
        },
        redirect: "follow",
      });
      if (!res.ok) return [];
      const html = await res.text();
      return parseBingVideosHtml(html, q).slice(0, options.maxResults ?? 16);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createBingHtmlProvider(): BingHtmlProvider {
  return new BingHtmlProvider();
}
