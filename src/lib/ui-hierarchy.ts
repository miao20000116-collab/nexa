/**
 * Site-wide visual hierarchy tokens.
 * 5 levels of attention — never let Level 1–5 look the same weight.
 *
 * L1 focusTitle / focusMetric — the one thing that matters now
 * L2 evidence — why (compact deltas / facts)
 * L3 insight — “Nexa 判断”
 * L4 actions — one primary + secondary/tertiary
 * L5 detail — tables, glossaries, raw fields (collapsed by default)
 */

export const type = {
  /** Page H1 */
  pageTitle:
    "text-[26px] font-semibold tracking-tight text-zinc-900 sm:text-[30px]",
  /** One-line support under H1 */
  pageLead: "mt-2 max-w-3xl text-[15px] leading-relaxed text-zinc-500",
  /** Level 1 — current most important thing */
  focusTitle: "text-[22px] font-semibold tracking-tight text-zinc-900 sm:text-[24px]",
  focusMetric:
    "text-[30px] font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-[34px]",
  /** Level 2 — evidence strip */
  evidence: "text-[14px] leading-relaxed text-zinc-600",
  /** Level 3 — Nexa judgment voice */
  insightLabel: "text-[14px] font-semibold tracking-wide text-zinc-500",
  insightBody: "mt-1.5 text-[16px] leading-relaxed text-zinc-800",
  /** Section H2 inside content */
  sectionTitle: "text-[18px] font-semibold tracking-tight text-zinc-900 sm:text-[19px]",
  /** Section eyebrow — readable, not washed-out 11px */
  sectionLabel: "text-[14px] font-semibold tracking-wide text-zinc-500",
  /** Explicit step / rank index (01, 02, 1.) — must read clearly, never washed-out */
  stepIndex:
    "inline-flex items-center rounded-md bg-zinc-100 px-2 py-1 text-[14px] font-semibold tabular-nums tracking-tight text-zinc-800",
  body: "text-[16px] leading-relaxed text-zinc-700",
  bodyMuted: "text-[14px] leading-relaxed text-zinc-500",
  meta: "text-[14px] text-zinc-500",
  fieldLabel: "text-[14px] font-medium tracking-wide text-zinc-500",
  fieldValue: "text-[16px] leading-relaxed text-zinc-900",
  fieldControl:
    "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white",
  metricLabel: "text-[14px] font-medium tracking-wide text-zinc-500",
  metricValue: "mt-1 text-[22px] font-semibold tabular-nums text-zinc-900",
} as const;

export const action = {
  primary:
    "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40",
  secondary:
    "inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40",
  tertiary:
    "text-[14px] text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline",
  ghost:
    "rounded-lg px-3 py-2 text-[14px] text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
  /** Site-wide parent back — Shopify/Linear weight; never tiny gray */
  back: "inline-flex items-center gap-1.5 text-[15px] font-semibold text-zinc-800 hover:text-zinc-950",
} as const;

export const layout = {
  /** Shared horizontal gutter — keeps content off the viewport edges */
  pagePad: "px-[var(--nexa-page-pad-x)]",
  page: "mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10",
  pageWide:
    "mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10",
  pageNarrow:
    "mx-auto w-full max-w-[var(--nexa-content-narrow)] px-[var(--nexa-page-pad-x)] py-10",
  pageCreate:
    "mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10",
  pageAccount:
    "mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10",
  section: "mb-10",
  /** Clear break between major blocks (Stripe / Linear style) */
  sectionDivided: "mt-12 border-t border-zinc-200 pt-10",
  fieldStack: "space-y-2",
  contentBlock:
    "rounded-lg bg-zinc-50/70 px-3.5 py-3 text-[16px] leading-relaxed text-zinc-800",
  focusBand: "border-b border-zinc-200 pb-8 mb-10",
} as const;
