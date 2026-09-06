/**
 * Detect Douyin / Xiaohongshu / TikTok / X share links for recreate flow.
 * Handles full clipboard share text (口令), not only bare URLs.
 */

export type SocialRecreatePlatform = "douyin" | "xiaohongshu" | "tiktok" | "x";

export type SocialLinkMatch = {
  url: string;
  platform: SocialRecreatePlatform;
  kind: "social_recreate";
  /** Clean caption / hook from share paste, if any */
  shareCaption?: string | null;
  /** Author / work title hint from 【】 etc. */
  shareTitle?: string | null;
  /** Original pasted blob (for debugging / brief fallback) */
  rawPaste?: string;
  /** All social URLs found in paste (short + long) */
  allUrls?: string[];
};

const HOST_RULES: Array<{
  platform: SocialRecreatePlatform;
  suffixes: string[];
}> = [
  {
    platform: "douyin",
    suffixes: ["douyin.com", "iesdouyin.com"],
  },
  {
    platform: "xiaohongshu",
    suffixes: ["xiaohongshu.com", "xhslink.com"],
  },
  {
    platform: "tiktok",
    suffixes: ["tiktok.com"],
  },
  {
    platform: "x",
    suffixes: ["x.com", "twitter.com"],
  },
];

function hostnameOf(raw: string): string | null {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, suffix: string) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function platformForHost(hostname: string): SocialRecreatePlatform | null {
  for (const rule of HOST_RULES) {
    if (rule.suffixes.some((s) => hostMatches(hostname, s))) {
      return rule.platform;
    }
  }
  return null;
}

/** Strip trailing punctuation / share junk stuck to URL. */
function cleanUrlCandidate(raw: string): string {
  let u = raw.trim();
  // Common Douyin paste: trailing Chinese punctuation or path noise
  u = u.replace(/[),.;!?，。】》」』、]+$/g, "");
  // Cut at first CJK or @ junk sometimes glued on (rare)
  u = u.replace(/[\u4e00-\u9fff].*$/, "");
  try {
    const parsed = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    // Drop hash/query noise that is not part of short-link id when junk
    return parsed.toString();
  } catch {
    return u;
  }
}

/**
 * Extract first social short/long URL from free text.
 * Supports: https://v.douyin.com/xxx/  and bare v.douyin.com/xxx
 */
export function extractFirstUrl(text: string): string | null {
  const all = extractAllSocialUrls(text);
  return all[0] ?? null;
}

/**
 * Extract ALL supported social URLs from paste (short + long).
 * User expectation: every share link in the clipboard should be resolved.
 */
export function extractAllSocialUrls(text: string): string[] {
  const patterns = [
    /https?:\/\/(?:v\.|www\.)?douyin\.com\/[^\s<>"'，。]+/gi,
    /https?:\/\/(?:www\.)?iesdouyin\.com\/[^\s<>"'，。]+/gi,
    /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s<>"'，。]+/gi,
    /https?:\/\/(?:vm\.|vt\.|www\.)?tiktok\.com\/[^\s<>"'，。]+/gi,
    /https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+[^\s<>"'，。]*/gi,
    /(?<![A-Za-z0-9])(?:v\.)?douyin\.com\/[A-Za-z0-9_\-/]+/gi,
    /(?<![A-Za-z0-9])(?:xhslink\.com|xiaohongshu\.com)\/[A-Za-z0-9_\-/?=]+/gi,
    /(?<![A-Za-z0-9])(?:vm\.|vt\.)?tiktok\.com\/[A-Za-z0-9_\-/?=@.]+/gi,
    /(?<![A-Za-z0-9])(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+[A-Za-z0-9_\-/?=&.]+/gi,
  ];

  const found: string[] = [];
  const seen = new Set<string>();
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let cleaned = cleanUrlCandidate(m[0]);
      if (!cleaned) continue;
      if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
      const host = hostnameOf(cleaned);
      if (!host || !platformForHost(host)) continue;
      const key = cleaned.replace(/\/+$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(cleaned);
    }
  }
  return found;
}

/** Pull author/title and caption from Douyin/XHS share clipboard text. */
export function extractShareMeta(text: string): {
  title: string | null;
  caption: string | null;
} {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return { title: null, caption: null };

  // 【陈柯的作品】
  const bracket = raw.match(/【([^】]{1,40})】/);
  const title = bracket?.[1]?.trim() || null;

  // 看看【x的作品】caption… or 看看xxx
  let caption: string | null = null;
  const afterKanKan = raw.match(
    /看看(?:【[^】]*】)?\s*(.+?)(?:\s*https?:\/\/|\s+(?:v\.)?douyin\.com)/i
  );
  if (afterKanKan?.[1]) {
    caption = afterKanKan[1]
      .replace(/^复制打开抖音[，,\s]*/i, "")
      .replace(/\.{2,}$/, "")
      .trim();
  }

  if (!caption) {
    // Strip leading score / 复制打开抖音 boilerplate, cut at URL
    caption = raw
      .replace(/^\d+(?:\.\d+)?\s*/, "")
      .replace(/^复制打开抖音[，,\s]*/i, "")
      .replace(/^打开小红书[，,\s]*/i, "")
      .replace(/https?:\/\/\S+/i, "")
      .replace(/(?:v\.)?douyin\.com\/\S+/i, "")
      .replace(/\s+[a-zA-Z0-9@./:\-]{3,}\s*$/g, "")
      .trim();
    if (caption.length < 4) caption = null;
  }

  if (caption && caption.length > 200) {
    caption = `${caption.slice(0, 200)}…`;
  }

  return { title, caption };
}

export function detectSocialLink(input: string): SocialLinkMatch | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const allUrls = extractAllSocialUrls(trimmed);
  const url = allUrls[0] ?? extractFirstUrl(trimmed);
  if (!url) {
    // bare host paste
    const host = hostnameOf(trimmed);
    if (!host) return null;
    const platform = platformForHost(host);
    if (!platform) return null;
    const normalized = /^https?:\/\//i.test(trimmed)
      ? cleanUrlCandidate(trimmed)
      : `https://${cleanUrlCandidate(trimmed)}`;
    const meta = extractShareMeta(trimmed);
    return {
      url: normalized,
      platform,
      kind: "social_recreate",
      shareCaption: meta.caption,
      shareTitle: meta.title,
      rawPaste: trimmed,
      allUrls: [normalized],
    };
  }

  const host = hostnameOf(url);
  if (!host) return null;
  const platform = platformForHost(host);
  if (!platform) return null;

  const meta = extractShareMeta(trimmed);
  return {
    url: cleanUrlCandidate(url),
    platform,
    kind: "social_recreate",
    shareCaption: meta.caption,
    shareTitle: meta.title,
    rawPaste: trimmed,
    allUrls: allUrls.length ? allUrls : [cleanUrlCandidate(url)],
  };
}

export function socialPlatformLabel(platform: SocialRecreatePlatform): string {
  switch (platform) {
    case "douyin":
      return "抖音";
    case "xiaohongshu":
      return "小红书";
    case "tiktok":
      return "TikTok";
    case "x":
      return "X";
  }
}
