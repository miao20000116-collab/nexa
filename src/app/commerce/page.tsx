import Link from "next/link";

/**
 * Commerce home — platform gateway only.
 * Selection research / customer insight live inside each platform, not here.
 */
export default function CommercePage() {
  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
      <header className="mb-10 max-w-3xl">
        <h1 className="text-[32px] font-semibold tracking-tight text-zinc-900 sm:text-[36px]">
          跨境商业
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-zinc-500 sm:text-[17px]">
          选择平台进入经营台。选品、洞察、广告与库存都在店内完成。
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Link
          href="/commerce/amazon"
          className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-amber-50/40 px-7 py-7 transition-[border-color,transform] hover:border-zinc-400 hover:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.25)] sm:min-h-[260px] sm:px-8 sm:py-8"
        >
          <div>
            <p className="text-[13px] font-medium tracking-wide text-zinc-400">
              北美零售
            </p>
            <p className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[32px]">
              Amazon
            </p>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-zinc-600">
              经营概览、商品诊断、广告与利润、库存与选品调研
            </p>
          </div>
          <p className="mt-8 text-[15px] font-medium text-zinc-900 transition-transform group-hover:translate-x-1">
            进入 Amazon →
          </p>
        </Link>

        <Link
          href="/commerce/tiktok"
          className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-zinc-50 via-white to-sky-50/50 px-7 py-7 transition-[border-color,transform] hover:border-zinc-400 hover:shadow-[0_12px_40px_-24px_rgba(0,0,0,0.25)] sm:min-h-[260px] sm:px-8 sm:py-8"
        >
          <div>
            <p className="text-[13px] font-medium tracking-wide text-zinc-400">
              内容电商
            </p>
            <p className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900 sm:text-[32px]">
              TikTok Shop
            </p>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-zinc-600">
              内容情报、商品与达人、客户洞察与合规
            </p>
          </div>
          <p className="mt-8 text-[15px] font-medium text-zinc-900 transition-transform group-hover:translate-x-1">
            进入 TikTok Shop →
          </p>
        </Link>
      </div>
    </div>
  );
}
