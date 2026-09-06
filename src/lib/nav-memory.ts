/**
 * Per-module last-URL memory for top nav.
 *
 * Storage: sessionStorage (`nexa_nav_last_v1`)
 * Lifetime: current browser tab only — closed tab/window clears it.
 * There is NO time-based expiry (not 5 minutes / not 1 day).
 *
 * “没有记录” = this tab has never opened a memorable URL for that module
 * (for search: never opened `/search?q=…` with a non-empty query).
 */

export type NavModule = "search" | "workspace" | "create" | "commerce";

const STORAGE_KEY = "nexa_nav_last_v1";

export const NAV_DEFAULTS: Record<NavModule, string> = {
  /** No remembered search → brand home (search box lives there). */
  search: "/",
  workspace: "/workspace",
  create: "/create",
  commerce: "/commerce",
};

type Store = Partial<Record<NavModule, string>>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

function isMemorableSearchHref(href: string): boolean {
  try {
    const u = new URL(href, "http://nexa.local");
    return (
      u.pathname === "/search" && Boolean(u.searchParams.get("q")?.trim())
    );
  } catch {
    return false;
  }
}

export function getLastNavHref(module: NavModule): string {
  const last = readStore()[module];
  return typeof last === "string" && last.startsWith("/")
    ? last
    : NAV_DEFAULTS[module];
}

export function setLastNavHref(module: NavModule, href: string) {
  if (!href.startsWith("/")) return;

  // Search only remembers real result URLs — never overwrite with "/" or bare /search
  if (module === "search" && !isMemorableSearchHref(href)) {
    return;
  }

  const store = readStore();
  if (store[module] === href) return;
  store[module] = href;
  writeStore(store);
}

/** Map current location → module whose memory should update. Home `/` is brand-only. */
export function moduleForLocation(pathname: string): NavModule | null {
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/workspace")) return "workspace";
  if (pathname.startsWith("/create")) return "create";
  if (pathname.startsWith("/commerce")) return "commerce";
  return null;
}

/**
 * Resolve nav target.
 * - Search: always last `/search?q=…` if any; else home. Never “escape” to home
 *   while sitting on results (logo is the way home).
 * - Other modules: second click on the same remembered page returns to hub.
 */
export function resolveNavHref(
  module: NavModule,
  pathname: string,
  search: string
): string {
  const last = getLastNavHref(module);

  if (module === "search") {
    return last;
  }

  const current = `${pathname}${search}`;
  if (last !== NAV_DEFAULTS[module] && current === last) {
    return NAV_DEFAULTS[module];
  }
  return last;
}
