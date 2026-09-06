import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `/api/favicon?domain=${encodeURIComponent(domain)}`;
}

/** Same-origin thumbnail URL to avoid CDN hotlink failures. */
export function getProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    // Already same-origin / data / blob — no proxy needed
    if (
      url.startsWith("/") ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    ) {
      return url;
    }
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}
