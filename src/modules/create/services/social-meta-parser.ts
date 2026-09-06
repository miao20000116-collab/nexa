/**
 * Parse supported social share pages for recreate reference metadata.
 *
 * Copyright rule: extract title / caption / author / cover / structure hints only.
 * Never return playable original video or platform BGM URLs for reuse in renders.
 */

import { fetchThroughEgress } from "@/lib/read/fetch-page";
import type { SocialRecreatePlatform } from "@/lib/social-link";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

export type SocialParseStatus = "ok" | "partial" | "failed";

/** Fields we attempt to obtain from a share link (honest checklist for UI). */
export type SocialMetaField =
  | "canonicalUrl"
  | "awemeId"
  | "title"
  | "description"
  | "author"
  | "coverUrl"
  | "topics";

const META_FIELD_LABELS: Record<SocialMetaField, string> = {
  canonicalUrl: "真实链接",
  awemeId: "作品 ID",
  title: "标题",
  description: "文案/描述",
  author: "作者",
  coverUrl: "封面",
  topics: "话题",
};

export type SocialReferenceMeta = {
  parseStatus: SocialParseStatus;
  parseMethod: string;
  awemeId?: string | null;
  /** Real long URL after short-link expansion (iesdouyin share page). */
  canonicalUrl?: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  /** Cover image URL for reference preview only — not used as render source. */
  coverUrl: string | null;
  durationSec: number | null;
  likeCount: number | null;
  topics: string[];
  structureHints: string[];
  parseNote: string;
  /** Honest checklist — what we actually got vs still missing. */
  obtainedFields?: SocialMetaField[];
  missingFields?: SocialMetaField[];
};

export function fieldLabel(field: SocialMetaField): string {
  return META_FIELD_LABELS[field];
}

export function withFieldChecklist(
  meta: SocialReferenceMeta
): SocialReferenceMeta {
  const checks: Array<[SocialMetaField, boolean]> = [
    ["canonicalUrl", Boolean(meta.canonicalUrl?.trim())],
    ["awemeId", Boolean(meta.awemeId?.trim())],
    ["title", Boolean(meta.title?.trim())],
    ["description", Boolean(meta.description?.trim())],
    ["author", Boolean(meta.author?.trim())],
    ["coverUrl", Boolean(meta.coverUrl?.trim())],
    ["topics", meta.topics.length > 0],
  ];
  const obtainedFields = checks.filter(([, ok]) => ok).map(([f]) => f);
  const missingFields = checks.filter(([, ok]) => !ok).map(([f]) => f);

  // Identity alone (URL/ID) is never full success — platforms often strip body.
  const hasBody = Boolean(
    meta.title?.trim() || meta.description?.trim() || meta.coverUrl?.trim()
  );
  const hasIdentity = Boolean(meta.canonicalUrl || meta.awemeId);
  let parseStatus = meta.parseStatus;
  if (hasIdentity && !hasBody && parseStatus === "failed") {
    parseStatus = "partial";
  } else if (hasIdentity && !hasBody && parseStatus === "ok") {
    parseStatus = "partial";
  }

  return { ...meta, parseStatus, obtainedFields, missingFields };
}

/** Merge share-paste caption/title when SSR body is empty. */
export function enrichMetaFromPaste(
  meta: SocialReferenceMeta,
  paste?: { title?: string | null; caption?: string | null; raw?: string | null }
): SocialReferenceMeta {
  if (!paste) return withFieldChecklist(meta);
  const title = paste.title?.trim() || null;
  const caption = paste.caption?.trim() || null;
  const raw = paste.raw?.trim() || null;
  const topics = new Set(meta.topics);
  for (const t of extractTopics(`${caption ?? ""} ${title ?? ""} ${raw ?? ""}`)) {
    topics.add(t);
  }
  const next: SocialReferenceMeta = {
    ...meta,
    title: meta.title?.trim() || (title ? title.slice(0, 80) : null) ||
      (caption ? caption.slice(0, 80) : null),
    description: meta.description?.trim() || caption || title || null,
    topics: [...topics].slice(0, 12),
  };
  if (!meta.awemeId && raw) {
    next.awemeId = extractAwemeIdFromText(raw) || meta.awemeId;
  }
  if (
    (caption || title) &&
    !next.structureHints.some((h) => h.includes("分享口令"))
  ) {
    next.structureHints = [
      "标题/文案来自分享口令文字（页面正文未下发）",
      ...next.structureHints,
    ];
  }
  return withFieldChecklist(next);
}

function emptyMeta(
  note: string,
  method = "none",
  extra?: Partial<SocialReferenceMeta>
): SocialReferenceMeta {
  return withFieldChecklist({
    parseStatus: "failed",
    parseMethod: method,
    title: null,
    description: null,
    author: null,
    coverUrl: null,
    durationSec: null,
    likeCount: null,
    topics: [],
    structureHints: [],
    parseNote: note,
    ...extra,
  });
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&");
}

function extractOg(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i"
  );
  const m = html.match(re) || html.match(re2);
  return m?.[1]?.trim() ? decodeHtml(m[1].trim()) : null;
}

function extractTopics(text: string): string[] {
  // Douyin paste often has "# 话题" with a space after #
  const tags = text.match(/#[\s]*[\w\u4e00-\u9fff]+/g) ?? [];
  return [
    ...new Set(tags.map((t) => t.replace(/^#\s*/, "").slice(0, 30))),
  ].slice(0, 12);
}

export { extractTopics as extractHashtagTopics };

function extractAwemeId(url: string): string | null {
  const patterns = [
    /\/(?:share\/)?video\/(\d{8,})/i,
    /\/(?:share\/)?note\/(\d{8,})/i,
    /aweme[_-]?id[=:](\d{8,})/i,
    /modal_id=(\d{8,})/i,
    /[?&]id=(\d{8,})/i,
    /douyin\.com\/video\/(\d{8,})/i,
    /\/(\d{15,})(?:\/|\?|$)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Scan free-text share paste for embedded long video ids. */
export function extractAwemeIdFromText(text: string): string | null {
  return (
    extractAwemeId(text) ||
    text.match(/(?:video|note)\/(\d{15,})/i)?.[1] ||
    text.match(/\b(\d{19})\b/)?.[1] ||
    null
  );
}

function isHomepageDeadEnd(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const host = u.hostname.toLowerCase();
    if (host.includes("douyin.com") || host.includes("iesdouyin.com")) {
      return (
        path === "/" || path === "" || path === "/share" || path === "/discover"
      );
    }
    if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) {
      return (
        path === "/" ||
        path === "" ||
        path === "/explore" ||
        path === "/discovery" ||
        path.startsWith("/search")
      );
    }
    if (host.includes("tiktok.com")) {
      return path === "/" || path === "" || path === "/foryou" || path === "/explore";
    }
    return false;
  } catch {
    return false;
  }
}

function extractRouterDataJson(html: string): unknown | null {
  const marker = "window._ROUTER_DATA";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const eq = html.indexOf("=", idx);
  if (eq < 0) return null;
  let i = eq + 1;
  while (i < html.length && /\s/.test(html[i]!)) i++;
  if (html[i] !== "{") {
    const brace = html.indexOf("{", i);
    if (brace < 0) return null;
    i = brace;
  }
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function findVideoInfoRes(
  router: Record<string, unknown>
): Record<string, unknown> | null {
  const loader = router.loaderData;
  if (!loader || typeof loader !== "object") return null;
  for (const page of Object.values(loader as Record<string, unknown>)) {
    if (!page || typeof page !== "object") continue;
    const info = (page as Record<string, unknown>).videoInfoRes;
    if (info && typeof info === "object") return info as Record<string, unknown>;
  }
  return null;
}

/** When videoInfoRes is stripped, loader still often has itemId / lastPath. */
function extractItemIdFromRouter(
  router: Record<string, unknown>
): string | null {
  const loader = router.loaderData;
  if (!loader || typeof loader !== "object") return null;
  for (const page of Object.values(loader as Record<string, unknown>)) {
    if (!page || typeof page !== "object") continue;
    const p = page as Record<string, unknown>;
    for (const key of ["itemId", "awemeId", "aweme_id", "lastPath"]) {
      const v = p[key];
      if (typeof v === "string" && /^\d{8,}$/.test(v)) return v;
      if (typeof v === "number" && String(v).length >= 8) return String(v);
    }
  }
  return null;
}

function firstUrlList(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const list = (obj as { url_list?: unknown }).url_list;
  if (Array.isArray(list) && typeof list[0] === "string" && list[0]) {
    return list[0];
  }
  return null;
}

function parseDouyinItem(item: Record<string, unknown>): SocialReferenceMeta {
  const desc = typeof item.desc === "string" ? item.desc.trim() : null;
  const authorObj = item.author as Record<string, unknown> | undefined;
  const author =
    typeof authorObj?.nickname === "string" ? authorObj.nickname : null;
  const video = item.video as Record<string, unknown> | undefined;
  const cover =
    firstUrlList(video?.cover) ||
    firstUrlList(video?.origin_cover) ||
    firstUrlList(video?.dynamic_cover) ||
    null;
  const durationRaw = video?.duration;
  const durationSec =
    typeof durationRaw === "number"
      ? Math.round(durationRaw > 1000 ? durationRaw / 1000 : durationRaw)
      : null;
  const stats = item.statistics as Record<string, unknown> | undefined;
  const likeCount =
    typeof stats?.digg_count === "number" ? stats.digg_count : null;

  const topics = new Set<string>(extractTopics(desc ?? ""));
  const extras = item.text_extra;
  if (Array.isArray(extras)) {
    for (const ex of extras) {
      if (!ex || typeof ex !== "object") continue;
      const name = (ex as { hashtag_name?: string }).hashtag_name;
      if (name) topics.add(String(name).slice(0, 30));
    }
  }

  const structureHints: string[] = [];
  if (durationSec)
    structureHints.push(`参考时长约 ${durationSec} 秒（仅作节奏参考）`);
  if (topics.size)
    structureHints.push(
      `话题方向：${[...topics].slice(0, 6).map((t) => `#${t}`).join(" ")}`
    );
  if (desc && desc.length > 20)
    structureHints.push("有完整文案线索，二创需原创改写");
  structureHints.push("成片禁止使用原片画面与平台原声");

  const ok = Boolean(desc || cover || author);
  return withFieldChecklist({
    parseStatus: ok ? (desc && cover ? "ok" : "partial") : "failed",
    parseMethod: "douyin_router_data",
    awemeId: typeof item.aweme_id === "string" ? item.aweme_id : null,
    title: desc ? desc.slice(0, 80) : null,
    description: desc,
    author,
    coverUrl: cover,
    durationSec,
    likeCount,
    topics: [...topics].slice(0, 12),
    structureHints,
    parseNote: ok
      ? "已从抖音分享页解析到标题/描述/封面等元数据（不含可播放原片）。"
      : "分享页有数据但缺少有效字段。",
  });
}

function parseOgFallback(html: string, method: string): SocialReferenceMeta {
  const rawTitle =
    extractOg(html, "og:title") || extractOg(html, "twitter:title") || null;
  const rawDescription =
    extractOg(html, "og:description") ||
    extractOg(html, "description") ||
    null;
  const coverUrl =
    extractOg(html, "og:image") || extractOg(html, "twitter:image") || null;

  // Strip Douyin share OG template — it is not real video content
  const isBoiler =
    (t: string | null) =>
      Boolean(
        t &&
          (/发布在抖音|来抖音[，,]?\s*记录美好生活|已经收获了\d+个喜欢|于\d{6,8}发布/.test(
            t
          ) ||
            /^抖音$|^Douyin$/i.test(t.trim()))
      );
  const title = rawTitle && !isBoiler(rawTitle) ? rawTitle.slice(0, 80) : null;
  const description =
    rawDescription && !isBoiler(rawDescription) ? rawDescription : null;

  const topics = extractTopics(`${title ?? ""} ${description ?? ""}`);
  const ok = Boolean(title || description || coverUrl);
  return withFieldChecklist({
    parseStatus: ok ? (title && description ? "ok" : "partial") : "partial",
    parseMethod: method,
    title,
    description,
    author: null,
    coverUrl,
    durationSec: null,
    likeCount: null,
    topics,
    structureHints: ok
      ? [
          "仅从页面 Open Graph 拿到摘要信息",
          "成片禁止使用原片画面与平台原声",
        ]
      : coverUrl
        ? ["仅拿到封面图，标题/文案需依赖分享口令或用户补充"]
        : [],
    parseNote: ok
      ? "已从页面 OG 标签解析到部分元数据（深度低于抖音路由数据）。"
      : isBoiler(rawTitle) || isBoiler(rawDescription)
        ? "页面 OG 仅为抖音通用分享文案，不含作品真实标题；请粘贴完整分享口令。"
        : "页面无可读元数据。",
  });
}

async function fetchDomestic(
  url: string,
  opts?: {
    timeoutMs?: number;
    redirect?: RequestRedirect;
    mobile?: boolean;
  }
): Promise<Response> {
  return fetchThroughEgress(url, {
    timeoutMs: opts?.timeoutMs ?? 12_000,
    userAgent: opts?.mobile === false ? undefined : MOBILE_UA,
    redirect: opts?.redirect ?? "follow",
    bypassProxy: true,
    headers: {
      Referer: "https://www.douyin.com/",
    },
  });
}

/** TikTok / international hosts — must use egress proxy when configured. */
async function fetchInternational(
  url: string,
  opts?: {
    timeoutMs?: number;
    redirect?: RequestRedirect;
    mobile?: boolean;
  }
): Promise<Response> {
  return fetchThroughEgress(url, {
    timeoutMs: opts?.timeoutMs ?? 18_000,
    userAgent: opts?.mobile === false ? undefined : MOBILE_UA,
    redirect: opts?.redirect ?? "follow",
    bypassProxy: false,
    headers: {
      Referer: "https://www.tiktok.com/",
    },
  });
}

async function fetchHtml(
  url: string,
  opts?: { mobile?: boolean; international?: boolean }
): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = opts?.international
      ? await fetchInternational(url, {
          mobile: opts?.mobile !== false,
          redirect: "follow",
        })
      : await fetchDomestic(url, {
          mobile: opts?.mobile !== false,
          redirect: "follow",
        });
    if (!res.ok) return null;
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/**
 * Expand v.douyin.com short link → real iesdouyin share URL + aweme id.
 * MUST bypass international proxy (NEXA_FETCH_PROXY) or Location collapses to homepage.
 */
async function resolveDouyinAwemeId(
  startUrl: string,
  pasteHint?: string | null
): Promise<{
  awemeId: string | null;
  canonicalUrl: string | null;
  note: string;
}> {
  const fromStart = extractAwemeId(startUrl);
  if (fromStart) {
    const canonical = `https://www.iesdouyin.com/share/video/${fromStart}/`;
    return {
      awemeId: fromStart,
      canonicalUrl: canonical,
      note: "从长链直接识别到作品 ID",
    };
  }
  const fromPaste = pasteHint ? extractAwemeIdFromText(pasteHint) : null;
  if (fromPaste) {
    return {
      awemeId: fromPaste,
      canonicalUrl: `https://www.iesdouyin.com/share/video/${fromPaste}/`,
      note: "从分享粘贴文本识别到作品 ID",
    };
  }

  let cur = startUrl.trim();
  // Normalize short URL
  if (!/^https?:\/\//i.test(cur)) cur = `https://${cur}`;

  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetchDomestic(cur, {
        redirect: "manual",
        timeoutMs: 10_000,
      });
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, cur).toString();
      const id = extractAwemeId(next);
      if (id) {
        return {
          awemeId: id,
          canonicalUrl: next.includes("/video/") || next.includes("/note/")
            ? next
            : `https://www.iesdouyin.com/share/video/${id}/`,
          note: "短链已展开为真实分享页",
        };
      }
      if (isHomepageDeadEnd(next)) {
        return {
          awemeId: null,
          canonicalUrl: null,
          note: "短链被重定向到抖音首页，无法得到作品 ID",
        };
      }
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      cur = next;
    } catch {
      break;
    }
  }

  return {
    awemeId: null,
    canonicalUrl: null,
    note: "未能从短链解析出作品 ID",
  };
}

function itemFromRouterHtml(html: string): Record<string, unknown> | null {
  const router = extractRouterDataJson(html) as Record<string, unknown> | null;
  if (!router) return null;
  const info = findVideoInfoRes(router);
  const itemList = info?.item_list;
  if (
    Array.isArray(itemList) &&
    itemList[0] &&
    typeof itemList[0] === "object"
  ) {
    return itemList[0] as Record<string, unknown>;
  }
  return null;
}

function awemeIdFromRouterHtml(html: string): string | null {
  const router = extractRouterDataJson(html) as Record<string, unknown> | null;
  if (!router) return null;
  return extractItemIdFromRouter(router);
}

export async function parseDouyinReference(
  startUrl: string,
  opts?: { pasteText?: string | null; pasteTitle?: string | null; pasteCaption?: string | null }
): Promise<SocialReferenceMeta> {
  const pasteOpts = {
    title: opts?.pasteTitle,
    caption: opts?.pasteCaption,
    raw: opts?.pasteText,
  };
  const resolved = await resolveDouyinAwemeId(startUrl, opts?.pasteText);
  let awemeId = resolved.awemeId;
  let canonicalUrl = resolved.canonicalUrl;

  if (!awemeId) {
    const first = await fetchHtml(startUrl, { mobile: true });
    if (first) {
      awemeId =
        extractAwemeId(first.finalUrl) ||
        extractAwemeId(startUrl) ||
        awemeIdFromRouterHtml(first.html) ||
        null;
      if (awemeId) {
        canonicalUrl =
          first.finalUrl.includes("/video/") || first.finalUrl.includes("/note/")
            ? first.finalUrl
            : `https://www.iesdouyin.com/share/video/${awemeId}/`;
      }
      const item = itemFromRouterHtml(first.html);
      if (item) {
        const meta = parseDouyinItem(item);
        meta.awemeId = meta.awemeId || awemeId;
        meta.canonicalUrl = canonicalUrl;
        return enrichMetaFromPaste(meta, pasteOpts);
      }
    }
  }

  if (!awemeId) {
    return enrichMetaFromPaste(
      emptyMeta(resolved.note, "douyin_shortlink_dead"),
      pasteOpts
    );
  }

  if (!canonicalUrl) {
    canonicalUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
  }

  let html: string | null = null;
  for (const path of [
    canonicalUrl,
    `https://www.iesdouyin.com/share/video/${awemeId}/`,
    `https://www.iesdouyin.com/share/note/${awemeId}/`,
    `https://www.douyin.com/video/${awemeId}`,
  ]) {
    const page = await fetchHtml(path, { mobile: true });
    if (!page) continue;
    if (page.html.includes("_ROUTER_DATA") || page.html.includes("videoInfoRes")) {
      html = page.html;
      const fromRouter = awemeIdFromRouterHtml(page.html);
      if (fromRouter && !awemeId) awemeId = fromRouter;
      break;
    }
    if (!html) html = page.html;
  }

  if (!html) {
    return enrichMetaFromPaste(
      {
        parseStatus: "partial",
        parseMethod: "douyin_shortlink_expand",
        awemeId,
        canonicalUrl,
        title: null,
        description: null,
        author: null,
        coverUrl: null,
        durationSec: null,
        likeCount: null,
        topics: [],
        structureHints: [],
        parseNote: `短链已展开：${canonicalUrl}`,
      },
      pasteOpts
    );
  }

  const item = itemFromRouterHtml(html);
  if (item) {
    const meta = parseDouyinItem(item);
    meta.awemeId = meta.awemeId || awemeId;
    meta.canonicalUrl = canonicalUrl;
    meta.parseNote = `${meta.parseNote}（${resolved.note}）`;
    return enrichMetaFromPaste(meta, pasteOpts);
  }

  // Prefer itemId from thin loader even without videoInfoRes
  const thinId = awemeIdFromRouterHtml(html);
  if (thinId) awemeId = thinId;

  const og = parseOgFallback(html, "douyin_og_fallback");
  if (og.title || og.description || og.coverUrl) {
    og.awemeId = awemeId;
    og.canonicalUrl = canonicalUrl;
    og.parseNote = `${og.parseNote} 真实链接：${canonicalUrl}`;
    return enrichMetaFromPaste(og, pasteOpts);
  }

  return enrichMetaFromPaste(
    {
      parseStatus: "partial",
      parseMethod: "douyin_shortlink_expand",
      awemeId,
      canonicalUrl,
      title: null,
      description: null,
      author: null,
      coverUrl: null,
      durationSec: null,
      likeCount: null,
      topics: [],
      structureHints: [],
      parseNote: `短链已展开为 ${canonicalUrl}，但当前分享页不再下发作品正文（无标题/封面）。请粘贴完整「分享口令」或手动补充结构描述。`,
    },
    pasteOpts
  );
}

export async function parseXiaohongshuReference(
  startUrl: string,
  opts?: { pasteText?: string | null; pasteTitle?: string | null; pasteCaption?: string | null }
): Promise<SocialReferenceMeta> {
  const pasteOpts = {
    title: opts?.pasteTitle,
    caption: opts?.pasteCaption,
    raw: opts?.pasteText,
  };

  // Expand xhslink short URLs without international proxy
  let cur = startUrl;
  let canonicalUrl: string | null = null;
  let noteId =
    extractAwemeId(startUrl) ||
    (opts?.pasteText ? extractAwemeIdFromText(opts.pasteText) : null);

  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetchDomestic(cur, {
        redirect: "manual",
        timeoutMs: 10_000,
      });
      const loc = res.headers.get("location");
      if (!loc || ![301, 302, 303, 307, 308].includes(res.status)) break;
      const next = new URL(loc, cur).toString();
      const id = extractAwemeId(next);
      if (id) noteId = noteId || id;
      if (next.includes("xiaohongshu.com") && !next.includes("xhslink.com")) {
        if (isHomepageDeadEnd(next)) {
          return enrichMetaFromPaste(
            emptyMeta(
              "短链被重定向到小红书首页，无法得到笔记 ID。请粘贴完整分享口令或长链。",
              "xhs_shortlink_dead"
            ),
            pasteOpts
          );
        }
        canonicalUrl = next;
        cur = next;
        break;
      }
      cur = next;
    } catch {
      break;
    }
  }

  if (!canonicalUrl && noteId) {
    canonicalUrl = `https://www.xiaohongshu.com/explore/${noteId}`;
  }

  const page = await fetchHtml(canonicalUrl || startUrl, { mobile: true });
  if (!page) {
    return enrichMetaFromPaste(
      emptyMeta(
        "无法打开小红书链接（可能需登录或短链失效）。",
        "xhs_fetch_failed",
        { canonicalUrl, awemeId: noteId }
      ),
      pasteOpts
    );
  }

  if (!noteId) {
    noteId =
      extractAwemeId(page.finalUrl) || awemeIdFromRouterHtml(page.html) || null;
  }
  if (!canonicalUrl) {
    canonicalUrl = page.finalUrl || startUrl;
  }

  if (isHomepageDeadEnd(canonicalUrl) && !noteId) {
    return enrichMetaFromPaste(
      emptyMeta(
        "短链落到小红书首页，未得到笔记页。请粘贴完整分享口令或含 /explore/ 的长链。",
        "xhs_shortlink_dead"
      ),
      pasteOpts
    );
  }

  // Prefer embedded note state over thin OG
  const stateMatch =
    page.html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/) ||
    page.html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*(?:window\.|<\/script>)/);
  if (stateMatch?.[1]) {
    try {
      const raw = stateMatch[1]
        .replace(/undefined/g, "null")
        .replace(/:\s*undefined/g, ":null");
      const state = JSON.parse(raw) as Record<string, unknown>;
      const note =
        (state.note as Record<string, unknown> | undefined)?.noteDetailMap ||
        (state.noteData as Record<string, unknown> | undefined) ||
        null;
      let title: string | null = null;
      let description: string | null = null;
      let author: string | null = null;
      let coverUrl: string | null = null;
      if (note && typeof note === "object") {
        const dataBag =
          "data" in note && note.data && typeof note.data === "object"
            ? (note.data as Record<string, unknown>)
            : null;
        const firstFromMap = (() => {
          const values = Object.values(note);
          const hit = values.find(
            (v) =>
              v &&
              typeof v === "object" &&
              ("note" in (v as object) ||
                "title" in (v as object) ||
                "displayTitle" in (v as object))
          );
          return hit as Record<string, unknown> | undefined;
        })();
        const detail = (firstFromMap?.note ||
          firstFromMap ||
          dataBag) as Record<string, unknown> | undefined;
        if (detail && typeof detail === "object") {
          title =
            (typeof detail.title === "string" && detail.title) ||
            (typeof detail.displayTitle === "string" && detail.displayTitle) ||
            null;
          description =
            (typeof detail.desc === "string" && detail.desc) ||
            (typeof detail.description === "string" && detail.description) ||
            null;
          const user = detail.user as Record<string, unknown> | undefined;
          author =
            (typeof user?.nickname === "string" && user.nickname) ||
            (typeof user?.nickName === "string" && user.nickName) ||
            null;
          const images = detail.imageList as unknown;
          if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
            const img = images[0] as Record<string, unknown>;
            coverUrl =
              (typeof img.urlDefault === "string" && img.urlDefault) ||
              (typeof img.url === "string" && img.url) ||
              null;
          }
        }
      }
      if (title || description || coverUrl) {
        const topics = extractTopics(`${title ?? ""} ${description ?? ""}`);
        return enrichMetaFromPaste(
          {
            parseStatus: title || description ? "ok" : "partial",
            parseMethod: "xhs_initial_state",
            awemeId: noteId,
            title: title ? title.slice(0, 80) : null,
            description,
            author,
            coverUrl,
            durationSec: null,
            likeCount: null,
            topics,
            structureHints: [
              "已从小红书页面状态解析到标题/正文线索（不含原片）。",
              "成片禁止使用原片画面与平台原声",
            ],
            parseNote: "已从小红书 __INITIAL_STATE__ 解析元数据。",
            canonicalUrl: canonicalUrl || page.finalUrl || null,
          },
          pasteOpts
        );
      }
    } catch {
      /* fall through to OG */
    }
  }

  const og = parseOgFallback(page.html, "xhs_og");
  og.canonicalUrl = canonicalUrl || page.finalUrl || null;
  og.awemeId = noteId;
  if (!og.title && !og.description && !og.coverUrl) {
    og.parseStatus = "partial";
    og.parseNote =
      noteId || canonicalUrl
        ? `短链已展开${canonicalUrl ? `：${canonicalUrl}` : ""}${
            noteId ? ` · 笔记 ID ${noteId}` : ""
          }，但笔记正文未下发（常需登录/完整分享口令）。`
        : "小红书页面已打开，但笔记正文未下发。请粘贴口令全文或手动补充结构。";
  }
  return enrichMetaFromPaste(og, pasteOpts);
}

async function resolveTikTokCanonical(
  startUrl: string
): Promise<{ canonicalUrl: string | null; videoId: string | null; note: string }> {
  const fromStart = extractAwemeId(startUrl);
  if (fromStart && /tiktok\.com\/@/i.test(startUrl)) {
    return {
      canonicalUrl: startUrl,
      videoId: fromStart,
      note: "从长链识别到作品 ID",
    };
  }
  if (fromStart && !/vm\.|vt\./i.test(startUrl)) {
    return {
      canonicalUrl: startUrl,
      videoId: fromStart,
      note: "从链接识别到作品 ID",
    };
  }

  let cur = startUrl.trim();
  if (!/^https?:\/\//i.test(cur)) cur = `https://${cur}`;

  // Prefer international egress for vm/vt short links
  for (let i = 0; i < 10; i++) {
    try {
      let res: Response;
      try {
        res = await fetchInternational(cur, {
          redirect: "manual",
          timeoutMs: 12_000,
        });
      } catch {
        // Proxy down — try direct (may fail in CN)
        res = await fetchThroughEgress(cur, {
          timeoutMs: 10_000,
          userAgent: MOBILE_UA,
          redirect: "manual",
          bypassProxy: true,
          headers: { Referer: "https://www.tiktok.com/" },
        });
      }
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, cur).toString();
      const id = extractAwemeId(next);
      if (id || /tiktok\.com\/@[^/]+\/video\//i.test(next)) {
        return {
          canonicalUrl: next,
          videoId: id,
          note: "短链已展开为真实作品页",
        };
      }
      if (![301, 302, 303, 307, 308].includes(res.status)) break;
      cur = next;
    } catch {
      break;
    }
  }

  return {
    canonicalUrl: null,
    videoId: fromStart,
    note: "未能展开 TikTok 短链（国际出口不可用或短链失效）",
  };
}

export async function parseTikTokReference(
  startUrl: string,
  opts?: { pasteText?: string | null; pasteTitle?: string | null; pasteCaption?: string | null }
): Promise<SocialReferenceMeta> {
  const pasteOpts = {
    title: opts?.pasteTitle,
    caption: opts?.pasteCaption,
    raw: opts?.pasteText,
  };

  const resolved = await resolveTikTokCanonical(startUrl);
  const targetUrl = resolved.canonicalUrl || startUrl;
  let videoId =
    resolved.videoId ||
    extractAwemeId(targetUrl) ||
    (opts?.pasteText ? extractAwemeIdFromText(opts.pasteText) : null);

  // 1) Official oembed — try both original short URL and expanded URL
  for (const candidate of [...new Set([targetUrl, startUrl])]) {
    try {
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(candidate)}`;
      let res: Response;
      try {
        res = await fetchInternational(oembedUrl, {
          mobile: false,
          timeoutMs: 15_000,
        });
      } catch {
        res = await fetchThroughEgress(oembedUrl, {
          timeoutMs: 12_000,
          userAgent: MOBILE_UA,
          redirect: "follow",
          bypassProxy: true,
          headers: { Referer: "https://www.tiktok.com/" },
        });
      }
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
          author_url?: string;
        };
        const title = data.title?.trim() || null;
        const author = data.author_name?.trim() || null;
        const coverUrl = data.thumbnail_url?.trim() || null;
        if (title || author || coverUrl) {
          const topics = extractTopics(title ?? "");
          return enrichMetaFromPaste(
            {
              parseStatus: title ? "ok" : "partial",
              parseMethod: "tiktok_oembed",
              awemeId: videoId,
              title: title ? title.slice(0, 80) : null,
              description: title,
              author,
              coverUrl,
              durationSec: null,
              likeCount: null,
              topics,
              structureHints: [
                "已从 TikTok oEmbed 拿到标题/作者/封面（不含可播放原片）。",
                "成片禁止使用原片画面与平台原声",
              ],
              parseNote: `已通过 TikTok oEmbed 解析。${resolved.note}`,
              canonicalUrl: resolved.canonicalUrl || candidate,
            },
            pasteOpts
          );
        }
      }
    } catch {
      /* try next candidate */
    }
  }

  // 2) Page OG via proxy, then direct
  let page = await fetchHtml(targetUrl, { mobile: true, international: true });
  if (!page) {
    page = await fetchHtml(targetUrl, { mobile: true, international: false });
  }
  if (!page) {
    return enrichMetaFromPaste(
      emptyMeta(
        resolved.canonicalUrl
          ? `短链已展开：${resolved.canonicalUrl}，但 oEmbed/页面元数据均不可用（需可用的国际代理 NEXA_FETCH_PROXY）。`
          : "无法打开 TikTok 链接（需配置可用的国际代理 NEXA_FETCH_PROXY）。当前环境 oEmbed 亦不可用。",
        "tiktok_fetch_failed",
        {
          canonicalUrl: resolved.canonicalUrl,
          awemeId: videoId,
          parseStatus: resolved.canonicalUrl || videoId ? "partial" : "failed",
        }
      ),
      pasteOpts
    );
  }

  videoId = videoId || extractAwemeId(page.finalUrl);
  const og = parseOgFallback(page.html, "tiktok_og");
  og.canonicalUrl = resolved.canonicalUrl || page.finalUrl || startUrl;
  og.awemeId = videoId;
  if (og.parseStatus === "failed" || (!og.title && !og.coverUrl)) {
    og.parseStatus = "partial";
    og.parseNote =
      resolved.canonicalUrl
        ? `短链已展开：${resolved.canonicalUrl}，但标题/封面未下发。请粘贴完整分享文案，或手动补充结构描述。`
        : "TikTok oEmbed / 页面元数据均不可用（代理或区域限制）。请粘贴完整分享文案，或手动补充结构描述。";
  }
  return enrichMetaFromPaste(og, pasteOpts);
}

function textFromEmbedHtml(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 1200) : null;
}

/**
 * X returns public embed metadata only. Raw post/video playback is never
 * inferred from it; frame analysis requires the authorized remote analyzer.
 */
export async function parseXReference(
  startUrl: string,
  opts?: { pasteText?: string | null; pasteTitle?: string | null; pasteCaption?: string | null }
): Promise<SocialReferenceMeta> {
  const pasteOpts = {
    title: opts?.pasteTitle,
    caption: opts?.pasteCaption,
    // X status IDs are not Douyin work IDs. Do not let the generic
    // share-text fallback populate the legacy awemeId field.
    raw: null,
  };
  let canonicalUrl: string;
  try {
    const parsed = new URL(startUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") {
      return enrichMetaFromPaste(
        emptyMeta("不是可识别的 X 公开链接。", "x_invalid_url"),
        pasteOpts
      );
    }
    parsed.hostname = "x.com";
    canonicalUrl = parsed.toString();
  } catch {
    return enrichMetaFromPaste(
      emptyMeta("X 链接格式无效。", "x_invalid_url"),
      pasteOpts
    );
  }

  try {
    const endpoint = `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(canonicalUrl)}`;
    const response = await fetchThroughEgress(endpoint, {
      timeoutMs: 15_000,
      headers: { Referer: "https://publish.twitter.com/" },
    });
    if (!response.ok) throw new Error(`oembed_${response.status}`);
    const data = (await response.json()) as {
      author_name?: string;
      html?: string;
    };
    const description = textFromEmbedHtml(data.html || "");
    const author = data.author_name?.trim() || null;
    if (!description && !author) throw new Error("empty_oembed");
    const topics = extractTopics(description || "");
    return enrichMetaFromPaste(
      {
        parseStatus: description ? "ok" : "partial",
        parseMethod: "x_oembed",
        canonicalUrl,
        awemeId: null,
        title: description ? description.slice(0, 80) : null,
        description,
        author,
        coverUrl: null,
        durationSec: null,
        likeCount: null,
        topics,
        structureHints: [
          "已从 X 公开嵌入信息获取文本/作者（不含原帖媒体播放）。",
          "视频镜头、关键帧和节奏仅在已配置且有权处理的远程视频分析服务返回后使用。",
          "成片禁止使用原帖媒体、原声与原文案。",
        ],
        parseNote: "已从 X oEmbed 获取公开嵌入元数据。",
      },
      pasteOpts
    );
  } catch {
    return enrichMetaFromPaste(
      emptyMeta(
        "X 公开嵌入信息暂不可用。可先使用搜索摘要和手动补充的结构线索；Nexa 不承诺原帖在国内可播放。",
        "x_oembed_failed",
        { canonicalUrl, awemeId: null, parseStatus: "partial" }
      ),
      pasteOpts
    );
  }
}

export async function parseSocialReference(
  platform: SocialRecreatePlatform,
  url: string,
  opts?: {
    pasteText?: string | null;
    pasteTitle?: string | null;
    pasteCaption?: string | null;
  }
): Promise<SocialReferenceMeta> {
  switch (platform) {
    case "douyin":
      return parseDouyinReference(url, opts);
    case "xiaohongshu":
      return parseXiaohongshuReference(url, opts);
    case "tiktok":
      return parseTikTokReference(url, opts);
    case "x":
      return parseXReference(url, opts);
  }
}
