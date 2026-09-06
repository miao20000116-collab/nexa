/**
 * Preserve a way back to Commerce when jumping into Create / Workspace.
 */

export type CommerceReturnPlatform =
  | "Amazon"
  | "TikTok Shop"
  | "amazon"
  | "tiktok"
  | string
  | null
  | undefined;

export function commerceHubPath(
  platform?: CommerceReturnPlatform,
  section?: string
): string {
  const p = String(platform || "").toLowerCase();
  const base = p.includes("tiktok")
    ? "/commerce/tiktok"
    : p.includes("amazon")
      ? "/commerce/amazon"
      : "/commerce";
  return section ? `${base}#${section}` : base;
}

export function commerceReturnLabel(
  platform?: CommerceReturnPlatform
): string {
  const p = String(platform || "").toLowerCase();
  if (p.includes("tiktok")) return "返回 TikTok Shop";
  if (p.includes("amazon")) return "返回 Amazon";
  return "返回跨境商业";
}

/** Only same-origin relative paths (incl. hash). */
export function safeReturnPath(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) {
    return null;
  }
  return t;
}

export function applyReturnNavParams(
  params: URLSearchParams,
  platform?: CommerceReturnPlatform,
  opts?: { returnTo?: string; returnLabel?: string; section?: string }
): void {
  const returnTo =
    safeReturnPath(opts?.returnTo) ||
    commerceHubPath(platform, opts?.section);
  params.set("returnTo", returnTo);
  params.set(
    "returnLabel",
    opts?.returnLabel?.trim() || commerceReturnLabel(platform)
  );
}

/** Append returnTo / returnLabel onto any relative app href. */
export function appendReturnNav(
  href: string,
  platform?: CommerceReturnPlatform,
  opts?: { returnTo?: string; returnLabel?: string; section?: string }
): string {
  try {
    const u = new URL(href, "https://nexa.local");
    applyReturnNavParams(u.searchParams, platform, opts);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

/** Carry return nav from current URL onto the next path. */
export function withPreservedReturnNav(
  path: string,
  searchParams: { get(name: string): string | null }
): string {
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  if (!returnTo) return path;
  try {
    const u = new URL(path, "https://nexa.local");
    u.searchParams.set("returnTo", returnTo);
    const label = searchParams.get("returnLabel")?.trim();
    if (label) u.searchParams.set("returnLabel", label);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return path;
  }
}
