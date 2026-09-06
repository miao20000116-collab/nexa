"use client";

/**
 * Inline placeholder while first commerce payload loads.
 * Layout chrome (nav / store / range) stays mounted outside this slot.
 */
export function CommerceContentPlaceholder() {
  return (
    <div
      className="min-h-[40vh] space-y-4"
      aria-busy="true"
      aria-label="加载中"
    >
      <div className="h-4 w-2/3 max-w-md animate-pulse rounded bg-zinc-100" />
      <div className="h-28 w-full animate-pulse rounded-lg bg-zinc-50" />
      <div className="h-4 w-1/2 max-w-sm animate-pulse rounded bg-zinc-50" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-zinc-50" />
    </div>
  );
}

/** Used when the page segment suspends (shell title not mounted yet). */
export function CommerceRouteFallback() {
  return (
    <div className="min-h-[48vh]">
      <div className="mb-8 space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-zinc-100" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-zinc-50" />
      </div>
      <CommerceContentPlaceholder />
    </div>
  );
}
