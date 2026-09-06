"use client";

import { Suspense, type ReactNode } from "react";
import { BackLink } from "@/components/ui/hierarchy";
import {
  DemoBadge,
  RangeSwitcher,
} from "@/modules/commerce/amazon/components/shell";
import {
  DemoBadge as TikTokDemoBadge,
  RangeSwitcher as TikTokRangeSwitcher,
} from "@/modules/commerce/tiktok/components/shell";
import { StoreSwitcher } from "@/modules/commerce/components/store-switcher";
import { CommerceRouteFallback } from "@/modules/commerce/components/commerce-content-placeholder";
import { CommerceSideNav } from "@/modules/commerce/components/commerce-side-nav";
import { CommerceHubPagerProvider } from "@/modules/commerce/lib/hub-pager";

/**
 * Stable chrome for Amazon / TikTok — left module nav + one-module pager.
 */
export function CommercePlatformChrome({
  platform,
  children,
}: {
  platform: "amazon" | "tiktok";
  children: ReactNode;
}) {
  const isAmazon = platform === "amazon";

  return (
    <CommerceHubPagerProvider platform={platform}>
      <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <BackLink href="/commerce">← 返回跨境商业</BackLink>
            {isAmazon ? <DemoBadge /> : <TikTokDemoBadge />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StoreSwitcher platform={isAmazon ? "Amazon" : "TikTok Shop"} />
            <Suspense
              fallback={
                <div
                  className="h-[34px] w-[148px] rounded-lg border border-zinc-100 bg-zinc-50"
                  aria-hidden
                />
              }
            >
              {isAmazon ? (
                <RangeSwitcher value="" />
              ) : (
                <TikTokRangeSwitcher value="" />
              )}
            </Suspense>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
          <CommerceSideNav platform={platform} />
          <div
            id="commerce-hub-pane"
            className="min-h-0 min-w-0 max-h-[calc(100vh-var(--nexa-header-height)-7.5rem)] overflow-y-auto overscroll-contain"
          >
            <Suspense fallback={<CommerceRouteFallback />}>{children}</Suspense>
          </div>
        </div>
      </div>
    </CommerceHubPagerProvider>
  );
}
