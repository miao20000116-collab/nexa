"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  AMAZON_NAV,
  TIKTOK_NAV,
  type CommerceNavItem,
} from "@/modules/commerce/components/commerce-nav-config";
import { useCommerceHubPager } from "@/modules/commerce/lib/hub-pager";

export function CommerceSideNav({
  platform,
}: {
  platform: "amazon" | "tiktok";
}) {
  const pathname = usePathname();
  const base = platform === "amazon" ? "/commerce/amazon" : "/commerce/tiktok";
  const items: CommerceNavItem[] =
    platform === "amazon" ? AMAZON_NAV : TIKTOK_NAV;
  const ids = items.map((i) => i.id);
  const pager = useCommerceHubPager();

  const isHubPage = pathname === base;
  const isDetail = /\/products\/[^/]+$/.test(pathname);

  const activeId = (() => {
    if (isHubPage && pager) return pager.activeId;
    for (const item of items) {
      if (item.pathMatch && pathname.startsWith(item.pathMatch)) return item.id;
    }
    const seg = pathname.slice(base.length).replace(/^\//, "").split("/")[0];
    if (seg && ids.includes(seg)) return seg;
    return items[0]?.id ?? "";
  })();

  const go = (id: string) => {
    if (isHubPage && pager) {
      pager.goTo(id);
      return;
    }
    window.location.assign(`${base}#${id}`);
  };

  return (
    <nav
      aria-label="店铺模块"
      className="lg:sticky lg:top-[calc(var(--nexa-header-height)+1rem)] lg:max-h-[calc(100vh-var(--nexa-header-height)-2rem)] lg:overflow-y-auto"
    >
      <p className="mb-3 text-[12px] font-medium tracking-wide text-zinc-400">
        {platform === "amazon" ? "Amazon" : "TikTok Shop"}
      </p>
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? "page" : undefined}
                className={`w-full rounded-lg px-3 py-2 text-left text-[14px] transition-colors ${
                  active
                    ? "bg-zinc-900 font-medium text-white"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      {isDetail && (
        <p className="mt-4 hidden text-[12px] leading-relaxed text-zinc-400 lg:block">
          当前为商品详情。点左侧模块可回到经营长页。
        </p>
      )}
      {isHubPage && (
        <p className="mt-4 hidden text-[12px] leading-relaxed text-zinc-400 lg:block">
          滚轮只在当前模块内滚动；点左侧目录或「下一模块」切换。
        </p>
      )}
    </nav>
  );
}

/**
 * Click to switch hub module — not driven by mouse-wheel paging.
 */
export function CommerceNextSectionFab({
  platform,
}: {
  platform: "amazon" | "tiktok";
}) {
  const pathname = usePathname();
  const base = platform === "amazon" ? "/commerce/amazon" : "/commerce/tiktok";
  const pager = useCommerceHubPager();
  const items = platform === "amazon" ? AMAZON_NAV : TIKTOK_NAV;
  const isHubPage = pathname === base;

  if (!isHubPage || !pager) return null;

  const index = Math.max(0, pager.ids.indexOf(pager.activeId));
  const isLast = index >= pager.ids.length - 1;
  const next = isLast ? items[0] : items[index + 1];
  if (!next) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 sm:bottom-8 sm:justify-end sm:pr-8 lg:pr-10">
      <button
        type="button"
        onClick={() => pager.goNext()}
        className="pointer-events-auto group flex items-center gap-2 rounded-full border border-zinc-200/90 bg-white/95 px-4 py-2.5 text-[13px] font-medium text-zinc-800 shadow-[0_8px_28px_rgba(24,24,27,0.12)] backdrop-blur-sm transition hover:border-zinc-300 hover:bg-white hover:shadow-[0_10px_32px_rgba(24,24,27,0.16)]"
        aria-label={
          isLast ? `回到${next.label}` : `前往下一模块：${next.label}`
        }
      >
        <span className="max-w-[11rem] truncate text-zinc-600 group-hover:text-zinc-900 sm:max-w-[14rem]">
          {isLast ? `回到 ${next.label}` : `下一模块 · ${next.label}`}
        </span>
        {isLast ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
        )}
      </button>
    </div>
  );
}

/** One visible module at a time on the hub pager. */
export function CommerceScrollSection({
  id,
  label,
  description,
  eager,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  eager?: boolean;
  children: ReactNode;
}) {
  const pager = useCommerceHubPager();
  const active = !pager || pager.activeId === id;
  const [mounted, setMounted] = useState(Boolean(eager) || active);

  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  return (
    <section
      id={id}
      hidden={!active}
      aria-hidden={!active}
      className={
        active
          ? "scroll-mt-[calc(var(--nexa-header-height)+1.25rem)] pb-24"
          : "hidden"
      }
    >
      <div className="mb-8">
        <h2 className="text-[22px] font-semibold tracking-tight text-zinc-900">
          {label}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-zinc-500">
            {description}
          </p>
        )}
      </div>
      {mounted ? (
        children
      ) : (
        <div className="h-36 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
      )}
    </section>
  );
}
