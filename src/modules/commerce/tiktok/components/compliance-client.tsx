"use client";

import { useEffect, useState } from "react";
import { TikTokShell } from "@/modules/commerce/tiktok/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { IntelligenceFindingsPanel } from "@/modules/commerce/intelligence/findings-panel";
import { ComplianceIntelligencePanel } from "@/modules/commerce/components/compliance-intelligence-panel";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import type { CommerceIntelligenceReport } from "@/modules/commerce/intelligence/types";

type ComplianceView = {
  isDemo: true;
  demoStoreLabel: string;
  rows: Array<{
    productId: string;
    title: string;
    flags: string[];
    claimRisks: string[];
    severity: "high" | "medium" | "low";
  }>;
  intelligence: CommerceIntelligenceReport;
};

export function TikTokComplianceClient() {
  const [data, setData] = useState<ComplianceView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/commerce/tiktok?view=compliance");
        if (!res.ok || cancelled) return;
        setData(await res.json());
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const first = data?.rows[0];

  return (
    <TikTokShell
      title="合规风险"
      description="跨货盘内容合规 / 披露风险清单。演示规则诊断，行动出口为搜索平台规则与合规改写创作。"
    >
      <div className="mb-10">
        <ComplianceIntelligencePanel
          key={first?.productId || "pending"}
          channel="tiktok"
          platform="TikTok Shop"
          defaultProductTitle={first?.title}
          defaultProductId={first?.productId}
          defaultFlags={first?.flags}
          defaultClaimRisks={first?.claimRisks}
        />
      </div>

      {!data && (
        <CommerceContentPlaceholder />
      )}

      {data && (
        <div className="space-y-10">
          <section>
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              优先结论
            </p>
            <h2 className="mt-2 text-[18px] font-semibold text-zinc-900">
              {data.intelligence.diagnosis}
            </h2>
            <div className="mt-5">
              <IntelligenceFindingsPanel
                report={data.intelligence}
                previewCount={3}
              />
            </div>
          </section>

          <section className="space-y-6">
            <p className="text-[12px] font-medium tracking-wide text-zinc-400">
              风险清单
            </p>
            {data.rows.map((r) => (
              <div
                key={r.productId}
                className="border-b border-zinc-100 pb-6 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      requestExpandCommerceProduct(r.productId, "tiktok")
                    }
                    className="text-[15px] font-medium text-zinc-900 hover:underline"
                  >
                    {r.title}
                  </button>
                  <span className="text-[12px] text-zinc-400">
                    {r.severity === "high"
                      ? "高优"
                      : r.severity === "medium"
                        ? "关注"
                        : "提示"}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-zinc-500">
                  标记：{r.flags.join("、") || "—"}
                </p>
                <ul className="mt-2 space-y-1">
                  {r.claimRisks.map((c) => (
                    <li key={c} className="text-[13px] text-zinc-700">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </TikTokShell>
  );
}
