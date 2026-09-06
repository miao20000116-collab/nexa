"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { UI } from "@/lib/ui-copy";
import type { SessionView } from "@/modules/account/types";
import { getUserTier, TIER_LABELS } from "@/modules/account/permissions/tier-policy";
import {
  type NavModule,
  NAV_DEFAULTS,
  moduleForLocation,
  resolveNavHref,
  setLastNavHref,
} from "@/lib/nav-memory";

const NAV_ITEMS: { label: string; module: NavModule }[] = [
  { label: UI.nav.search, module: "search" },
  { label: UI.nav.workspace, module: "workspace" },
  { label: UI.nav.create, module: "create" },
  { label: UI.nav.commerce, module: "commerce" },
];

function useNavHrefs(pathname: string, search: string) {
  const [hrefs, setHrefs] = useState<Record<NavModule, string>>({
    ...NAV_DEFAULTS,
  });

  useEffect(() => {
    const mod = moduleForLocation(pathname);
    if (mod) {
      setLastNavHref(mod, `${pathname}${search}`);
    }
    setHrefs({
      search: resolveNavHref("search", pathname, search),
      workspace: resolveNavHref("workspace", pathname, search),
      create: resolveNavHref("create", pathname, search),
      commerce: resolveNavHref("commerce", pathname, search),
    });
  }, [pathname, search]);

  return hrefs;
}

function isActive(module: NavModule, pathname: string) {
  if (module === "search") {
    return pathname === "/" || pathname.startsWith("/search");
  }
  return pathname.startsWith(NAV_DEFAULTS[module]);
}

function NavigationInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString()
    ? `?${searchParams.toString()}`
    : "";
  const hrefs = useNavHrefs(pathname, search);
  const [session, setSession] = useState<SessionView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/auth/session");
          if (!res.ok || cancelled) return;
          setSession(await res.json());
        } catch {
          /* ignore */
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  const accountLabel = session?.authenticated
    ? session.user?.name || session.user?.email || UI.nav.account
    : UI.nav.guest;

  const tierLabel = session?.authenticated
    ? TIER_LABELS[getUserTier(session.user)]
    : null;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--nexa-border-subtle)] bg-[var(--nexa-bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-[var(--nexa-header-height)] w-full max-w-[var(--nexa-content-max)] items-center justify-between px-[var(--nexa-page-pad-x)]">
        <div className="flex min-w-0 items-center gap-4 md:gap-8">
          <Link
            href="/"
            className="shrink-0 text-[20px] font-semibold tracking-tight text-[var(--nexa-fg)] sm:text-[22px]"
          >
            {UI.appName}
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={hrefs[item.module]}
                className={cn(
                  "px-3 py-1.5 text-[14px] transition-colors",
                  isActive(item.module, pathname)
                    ? "font-medium text-[var(--nexa-fg)]"
                    : "text-[var(--nexa-fg-tertiary)] hover:text-[var(--nexa-fg-secondary)]"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/account"
          className="flex max-w-[120px] flex-col items-end truncate text-right sm:max-w-[180px]"
        >
          <span className="truncate text-[13px] text-[var(--nexa-fg-tertiary)] hover:text-[var(--nexa-fg-secondary)] sm:text-[14px]">
            {accountLabel}
          </span>
          {tierLabel && (
            <span className="hidden text-[10px] text-zinc-400 sm:block">
              {tierLabel}
            </span>
          )}
        </Link>
      </div>
      <nav className="flex border-t border-[var(--nexa-border-subtle)] md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={hrefs[item.module]}
            className={cn(
              "flex flex-1 items-center justify-center px-0.5 py-2 text-[11px] transition-colors min-[390px]:py-2.5 min-[390px]:text-[12px]",
              isActive(item.module, pathname)
                ? "font-medium text-[var(--nexa-fg)]"
                : "text-[var(--nexa-fg-tertiary)]"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function Navigation() {
  return (
    <Suspense fallback={<header className="h-[var(--nexa-header-height)] border-b border-[var(--nexa-border-subtle)]" />}>
      <NavigationInner />
    </Suspense>
  );
}
