"use client";

import { Suspense, type ReactNode } from "react";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";

/**
 * @deprecated Prefer CommercePlatformChrome in platform layouts.
 * Kept for any nested Suspense that only needs a content skeleton.
 */
export function CommercePageFallback({
  platform: _platform,
}: {
  platform: "amazon" | "tiktok";
}) {
  return <CommerceContentPlaceholder />;
}

export function CommerceSuspense({
  platform: _platform,
  children,
}: {
  platform: "amazon" | "tiktok";
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<CommerceContentPlaceholder />}>{children}</Suspense>
  );
}
