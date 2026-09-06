/**
 * Server-side fetch for in-app reader.
 * Uses NEXA_FETCH_PROXY / HTTPS_PROXY / HTTP_PROXY when set (international egress).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function resolveProxyUrl(): string | null {
  return (
    process.env.NEXA_FETCH_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    process.env.https_proxy?.trim() ||
    process.env.http_proxy?.trim() ||
    null
  );
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  const normalized = address.toLowerCase();

  if (family === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (family === 6) {
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff")
    );
  }

  return false;
}

/** Only public HTTP(S) origins may be requested by server-side fetchers. */
export async function assertPublicHttpUrl(input: string): Promise<URL> {
  const target = new URL(input);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("unsupported_url_protocol");
  }
  if (target.username || target.password) {
    throw new Error("url_credentials_not_allowed");
  }

  const hostname = target.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("private_host_not_allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("private_host_not_allowed");
    }
    return target;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateAddress(entry.address))
  ) {
    throw new Error("private_host_not_allowed");
  }
  return target;
}

export async function fetchThroughEgress(
  url: string,
  opts?: {
    timeoutMs?: number;
    userAgent?: string;
    redirect?: RequestRedirect;
    headers?: Record<string, string>;
    /**
     * Domestic platforms (Douyin / XHS) must not go through international proxy —
     * proxy often collapses short links to homepage or fails entirely.
     */
    bypassProxy?: boolean;
  }
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 18_000;
  const proxy = opts?.bypassProxy ? null : resolveProxyUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "User-Agent": opts?.userAgent ?? DEFAULT_UA,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...(opts?.headers ?? {}),
  };

  const request = async (target: string) => {
    if (proxy) {
      try {
        const agent = new ProxyAgent(proxy);
        return (await undiciFetch(target, {
          signal: controller.signal,
          dispatcher: agent,
          headers,
          redirect: "manual",
        })) as unknown as Response;
      } catch (err) {
        console.warn(
          "[fetchThroughEgress] proxy failed, retry direct:",
          err instanceof Error ? err.message : err
        );
      }
    }

    return fetch(target, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
  };

  try {
    let target = (await assertPublicHttpUrl(url)).toString();
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await request(target);
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location) {
        return response;
      }
      if (redirects === 5) throw new Error("too_many_redirects");
      target = (
        await assertPublicHttpUrl(new URL(location, target).toString())
      ).toString();
    }
    throw new Error("too_many_redirects");
  } finally {
    clearTimeout(timer);
  }
}

export function hasFetchProxy(): boolean {
  return Boolean(resolveProxyUrl());
}

/** CN content sites where international proxy often returns login shells / empty SPA. */
export function isDomesticContentHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.includes("zhihu.com") ||
      h.includes("zhuanlan.zhihu") ||
      h.includes("weixin.qq.com") ||
      h.includes("mp.weixin") ||
      h.includes("juejin.cn") ||
      h.includes("csdn.net") ||
      h.includes("jianshu.com") ||
      h.includes("sspai.com") ||
      h.includes("douban.com") ||
      h.includes("toutiao.com") ||
      h.includes("36kr.com") ||
      h.includes("ifanr.com") ||
      h.includes("bilibili.com") ||
      h.includes("xiaohongshu.com") ||
      h.includes("douyin.com")
    );
  } catch {
    return false;
  }
}

/**
 * Fetch page HTML/text with domestic bypass + public reader fallback (Jina).
 * Returns best-effort { title, text, via }.
 */
export async function fetchReadablePage(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<{ title: string; text: string; via: "direct" | "jina" | "thin" }> {
  const timeoutMs = opts?.timeoutMs ?? 16_000;
  const domestic = isDomesticContentHost(url);

  const tryExtract = async (bypassProxy: boolean) => {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };
    if (domestic) headers.Referer = "https://www.zhihu.com/";
    const response = await fetchThroughEgress(url, {
      timeoutMs,
      bypassProxy,
      headers,
    });
    if (!response.ok) return null;
    const html = await response.text();
    const extracted = extractReadableContent(html, url);
    if (extracted.text.replace(/\s/g, "").length < 40) return null;
    return extracted;
  };

  // 1) Domestic: prefer direct; 2) also try via proxy when configured
  for (const bypass of domestic ? [true, false] : [false, true]) {
    try {
      const hit = await tryExtract(bypass);
      if (hit) return { ...hit, via: "direct" };
    } catch (err) {
      console.warn(
        "[fetchReadablePage] direct failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Public reader proxy — recovers login-walled article text when egress works
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetchThroughEgress(jinaUrl, {
      timeoutMs: Math.max(timeoutMs, 20_000),
      bypassProxy: false,
      headers: {
        Accept: "text/plain,text/markdown,*/*",
        "X-Return-Format": "markdown",
      },
    });
    if (response.ok) {
      const raw = await response.text();
      const titleMatch = raw.match(/^Title:\s*(.+)$/im);
      const title =
        titleMatch?.[1]?.trim() ||
        extractReadableContent(raw, url).title;
      let text = raw
        .replace(/^Title:.*$/im, "")
        .replace(/^URL Source:.*$/im, "")
        .replace(/^Published Time:.*$/im, "")
        .replace(/^Markdown Content:\s*/im, "")
        .replace(/^#{1,6}\s*/gm, "")
        .trim();
      text = text.slice(0, 40_000);
      if (text.replace(/\s/g, "").length >= 40) {
        return { title, text, via: "jina" };
      }
    }
  } catch (err) {
    console.warn(
      "[fetchReadablePage] jina failed:",
      err instanceof Error ? err.message : err
    );
  }

  return { title: "", text: "", via: "thin" };
}

export function extractReadableContent(html: string, pageUrl: string): {
  title: string;
  text: string;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  title = decodeBasicEntities(title);

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const articleMatch =
    body.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i) ||
    body.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i) ||
    body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const chunk = articleMatch?.[1] ?? body;
  let text = chunk
    .replace(/<\/(p|div|h1|h2|h3|h4|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  text = decodeBasicEntities(text).slice(0, 40_000);

  if (!title) {
    try {
      title = new URL(pageUrl).hostname;
    } catch {
      title = "未命名页面";
    }
  }

  return { title, text };
}

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}
