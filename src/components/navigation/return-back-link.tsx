"use client";

import { useSearchParams } from "next/navigation";
import { BackLink } from "@/components/ui/hierarchy";
import { safeReturnPath } from "@/modules/commerce/lib/return-nav";

/**
 * Prefer returnTo from the URL (Commerce → Create/Workspace).
 * Falls back to the in-module list link when absent.
 */
export function ReturnBackLink({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  fallbackHref?: string;
  fallbackLabel?: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const returnLabel =
    searchParams.get("returnLabel")?.trim() || "返回跨境商业";

  if (returnTo) {
    return (
      <BackLink href={returnTo} className={className}>
        ← {returnLabel}
      </BackLink>
    );
  }

  if (fallbackHref && fallbackLabel) {
    return (
      <BackLink href={fallbackHref} className={className}>
        ← {fallbackLabel}
      </BackLink>
    );
  }

  return null;
}
