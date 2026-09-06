"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CommerceShell } from "@/modules/commerce/amazon/components/shell";
import { CommerceContentPlaceholder } from "@/modules/commerce/components/commerce-content-placeholder";
import { IntelligenceFindingsPanel } from "@/modules/commerce/intelligence/findings-panel";
import { ComplianceIntelligencePanel } from "@/modules/commerce/components/compliance-intelligence-panel";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";
import type { ComplianceOverview } from "@/modules/commerce/amazon/types";

export function ComplianceClient() {
  const searchParams = useSearchParams();
  const productIdParam = searchParams.get("productId")?.trim() || "";
  const productParam = searchParams.get("product")?.trim() || "";
  const [data, setData] = useState<ComplianceOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/commerce/amazon?view=compliance");
      if (!res.ok || cancelled) return;
      setData(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => {
    const rows = data?.rows ?? [];
    if (productIdParam) {
      return rows.find((r) => r.productId === productIdParam) ?? rows[0];
    }
    if (productParam) {
      return (
        rows.find((r) =>
          r.title.toLowerCase().includes(productParam.toLowerCase())
        ) ?? rows[0]
      );
    }
    return rows[0];
  }, [data, productIdParam, productParam]);

  return (
    <CommerceShell
      title="合规风险"
      description="跨货号合规 / 侵权信号清单。演示数据驱动规则诊断，行动出口为搜索规则与合规改写创作。"
    >
      {(productIdParam || productParam) && (
        <p className="mb-4 text-[13px] text-zinc-500">
          已从工作流带入：
          {[productParam && `商品 ${productParam}`, productIdParam && `ID ${productIdParam}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="mb-10">
        <ComplianceIntelligencePanel
          key={selected?.productId || productIdParam || "pending"}
          channel="amazon"
          platform="Amazon"
          defaultProductTitle={selected?.title || productParam || undefined}
          defaultProductId={selected?.productId || productIdParam || undefined}
          defaultFlags={selected?.flags}
          defaultClaimRisks={selected?.claimRisks}
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
                      requestExpandCommerceProduct(r.productId, "amazon")
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
                        : "提示"}{" "}
                    · {r.asin}
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
                {r.checklist.length > 0 && (
                  <p className="mt-2 text-[13px] text-zinc-600">
                    清单：{r.checklist.join("；")}
                  </p>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </CommerceShell>
  );
}
