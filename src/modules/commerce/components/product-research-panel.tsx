"use client";

import { useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type {
  ProductOpportunity,
  ProductResearchResult,
} from "@/modules/commerce/capability/types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";

const MARKETPLACES = [
  "Amazon US",
  "Amazon UK",
  "Amazon DE",
  "TikTok US",
] as const;

function RecBadge({ value }: { value: ProductOpportunity["recommendation"] }) {
  const label =
    value === "HIGH"
      ? "HIGH"
      : value === "MEDIUM"
        ? "MEDIUM"
        : value === "LOW"
          ? "LOW"
          : "UNKNOWN";
  return (
    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[12px] font-medium text-zinc-800">
      推荐 · {label}
    </span>
  );
}

function optionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Inline Product Research panel — Commerce Capability Action.
 * Entries: Commerce selection / Product / Search / Workspace deep links.
 */
export function ProductResearchPanel({
  defaultMarketplace = "Amazon US",
  initialQuery = "",
  workspaceId,
}: {
  defaultMarketplace?: string;
  initialQuery?: string;
  workspaceId?: string | null;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [marketplace, setMarketplace] = useState(defaultMarketplace);
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [existingProduct, setExistingProduct] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [targetProfit, setTargetProfit] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [productCost, setProductCost] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [platformFees, setPlatformFees] = useState("");
  const [adCost, setAdCost] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareC, setCompareC] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    ProductResearchResult,
    { ok: true }
  > | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const credits = useCreditsConfirm();

  const run = async (confirm = false) => {
    const q = query.trim();
    if (!q) {
      setError("请输入选品方向");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const compareProducts = [compareA, compareB, compareC]
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/commerce/product-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          marketplace,
          country: country.trim() || undefined,
          category: category.trim() || undefined,
          keywords: keywords.trim() || undefined,
          existingProduct: existingProduct.trim() || undefined,
          targetPrice: optionalNumber(targetPrice),
          targetProfit: optionalNumber(targetProfit),
          sellPrice: optionalNumber(sellPrice),
          productCost: optionalNumber(productCost),
          shippingCost: optionalNumber(shippingCost),
          platformFees: optionalNumber(platformFees),
          adCost: optionalNumber(adCost),
          compareProducts:
            compareProducts.length >= 2 ? compareProducts : undefined,
          workspaceId: workspaceId || undefined,
          confirm,
          jobId: confirm ? pendingJobId : undefined,
        }),
      });
      const data = (await res.json()) as ProductResearchResult & {
        code?: string;
        message?: string;
        estimate?: { message?: string; estimatedCredits?: number | null };
        jobId?: string;
      };

      if (!data.ok) {
        if (
          credits.applyGateResponse({
            code: data.code,
            message: data.message,
            estimate: data.estimate
              ? {
                  message: data.estimate.message,
                  estimatedCredits: data.estimate.estimatedCredits ?? undefined,
                }
              : undefined,
          })
        ) {
          setPendingJobId(data.jobId);
          return;
        }
        setError(data.message || "选品调研失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(data);
    } catch {
      setError("选品调研失败，请稍后重试");
    } finally {
      setRunning(false);
    }
  };

  const o = result?.opportunity;
  const compare = result?.compare;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          Product Research · selection_analysis
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          AI 选品调研
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          真实公开检索作证据，再做市场 / 竞争 / 需求 / 风险 / 机会判断。不编造销量或成本。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run(false);
          }}
          placeholder="例如：适合 Amazon US 的便携式厨房产品"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-[14px] outline-none focus:border-zinc-400"
        />
        <select
          value={marketplace}
          onChange={(e) => setMarketplace(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2.5 text-[13px]"
        >
          {MARKETPLACES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void run(false)}
          disabled={running}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {running ? "分析中…" : "开始调研"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        {showMore ? "收起可选条件" : "展开可选条件（品类 / 成本 / 比较）"}
      </button>

      {showMore && (
        <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="品类（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="国家（可选，默认随平台）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="关键词（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={existingProduct}
              onChange={(e) => setExistingProduct(e.target.value)}
              placeholder="已有产品（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="目标售价（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              placeholder="目标利润（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
          </div>

          <p className="text-[12px] text-zinc-500">
            利润计算（缺一则 Incomplete Data，不假设成本）
          </p>
          <div className="grid gap-2 sm:grid-cols-5">
            <input
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="售价"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
            />
            <input
              value={productCost}
              onChange={(e) => setProductCost(e.target.value)}
              placeholder="产品成本"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
            />
            <input
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              placeholder="物流"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
            />
            <input
              value={platformFees}
              onChange={(e) => setPlatformFees(e.target.value)}
              placeholder="平台费"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
            />
            <input
              value={adCost}
              onChange={(e) => setAdCost(e.target.value)}
              placeholder="广告成本"
              className="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[13px]"
            />
          </div>

          <p className="text-[12px] text-zinc-500">
            产品比较 Product A / B / C（至少填 2 个）
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={compareA}
              onChange={(e) => setCompareA(e.target.value)}
              placeholder="Product A"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              placeholder="Product B"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={compareC}
              onChange={(e) => setCompareC(e.target.value)}
              placeholder="Product C"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
          </div>
        </div>
      )}

      {credits.state.pending && (
        <CreditsConfirmPanel
          message={credits.state.estimateMessage}
          estimatedCredits={credits.state.estimatedCredits}
          onConfirm={() => void run(true)}
          onCancel={() => {
            credits.reset();
            setPendingJobId(undefined);
          }}
          busy={running}
        />
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {o && result && (
        <div className="space-y-4 border-t border-zinc-100 pt-4">
          <AppliedKnowledgeBanner knowledge={result.appliedKnowledge ?? null} />
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold text-zinc-900">
              {o.product}
            </h3>
            <RecBadge value={o.recommendation} />
            <span className="text-[12px] text-zinc-400">
              {o.marketplace} · {o.country}
              {o.aiAssisted ? " · AI" : " · 证据 only"}
            </span>
          </div>

          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-zinc-400">Market</dt>
              <dd className="mt-0.5 text-zinc-800">{o.market}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Target Audience</dt>
              <dd className="mt-0.5 text-zinc-800">{o.targetAudience}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Price Range</dt>
              <dd className="mt-0.5 text-zinc-800">{o.priceRange}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Competition</dt>
              <dd className="mt-0.5 text-zinc-800">{o.competition}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Estimated Margin</dt>
              <dd className="mt-0.5 text-zinc-800">{o.estimatedMargin}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">Opportunity</dt>
              <dd className="mt-0.5 text-zinc-800">{o.opportunity}</dd>
            </div>
          </dl>

          {o.demandSignals.length > 0 && (
            <div>
              <p className="text-[12px] text-zinc-400">Demand Signals</p>
              <ul className="mt-1 space-y-0.5 text-[13px] text-zinc-700">
                {o.demandSignals.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </div>
          )}

          {o.sellingPoints.length > 0 && (
            <div>
              <p className="text-[12px] text-zinc-400">Selling Points</p>
              <ul className="mt-1 space-y-0.5 text-[13px] text-zinc-700">
                {o.sellingPoints.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </div>
          )}

          {o.painPoints.length > 0 && (
            <div>
              <p className="text-[12px] text-zinc-400">Pain Points</p>
              <ul className="mt-1 space-y-0.5 text-[13px] text-zinc-700">
                {o.painPoints.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </div>
          )}

          {o.risks.length > 0 && (
            <div>
              <p className="text-[12px] text-zinc-400">Risks</p>
              <ul className="mt-1 space-y-0.5 text-[13px] text-zinc-700">
                {o.risks.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
              </ul>
            </div>
          )}

          {o.profit && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3 text-[13px]">
              <p className="text-[12px] text-zinc-400">
                Profit · {o.profit.label}
              </p>
              {o.profit.status === "incomplete" ? (
                <p className="mt-1 text-zinc-700">
                  Incomplete Data
                  {o.profit.missingFields.length > 0
                    ? `（缺：${o.profit.missingFields.join("、")}）`
                    : ""}
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-zinc-800">
                  <li>
                    Gross Margin ·{" "}
                    {o.profit.grossMarginPct != null
                      ? `${o.profit.grossMarginPct.toFixed(1)}%`
                      : "—"}
                  </li>
                  <li>
                    Estimated Profit ·{" "}
                    {o.profit.estimatedProfit != null
                      ? o.profit.estimatedProfit.toFixed(2)
                      : "—"}
                  </li>
                  <li>Break-even · {o.profit.breakEvenNote}</li>
                </ul>
              )}
            </div>
          )}

          {o.claims.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                Claims · Evidence
              </p>
              <ul className="space-y-2 text-[13px]">
                {o.claims.map((c) => (
                  <li key={c.claim} className="text-zinc-700">
                    <span className="font-medium text-zinc-900">{c.claim}</span>
                    {c.status === "insufficient" ? (
                      <span className="ml-2 text-amber-700">
                        Insufficient Evidence
                      </span>
                    ) : (
                      <span className="ml-2 text-zinc-500">
                        backed · #{c.evidenceIndexes.join(", #")}
                      </span>
                    )}
                    {c.note && c.status === "backed" && (
                      <p className="mt-0.5 text-[12px] text-zinc-500">{c.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-zinc-500">{o.dataNotice}</p>

          {o.evidence.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                Evidence · {o.evidence.length}
              </p>
              <ul className="space-y-2">
                {o.evidence.slice(0, 8).map((e, i) => (
                  <li key={e.url + i} className="text-[13px]">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-zinc-900 underline underline-offset-2"
                    >
                      [{i}] {e.title}
                    </a>
                    <p className="mt-0.5 text-[12px] text-zinc-400">
                      Source · {e.source} · {e.timestamp}
                    </p>
                    {e.snippet && (
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">
                        {e.snippet}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {compare && compare.rows.length > 0 && (
            <div>
              <p className="mb-2 text-[12px] font-medium text-zinc-400">
                Product Compare
              </p>
              <p className="mb-3 text-[12px] text-zinc-500">{compare.summary}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-400">
                      <th className="py-2 pr-2 font-medium">Product</th>
                      <th className="py-2 pr-2 font-medium">Market</th>
                      <th className="py-2 pr-2 font-medium">Price</th>
                      <th className="py-2 pr-2 font-medium">Competition</th>
                      <th className="py-2 pr-2 font-medium">Margin</th>
                      <th className="py-2 pr-2 font-medium">Risk</th>
                      <th className="py-2 pr-2 font-medium">Rec</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.rows.map((row) => (
                      <tr
                        key={row.product}
                        className="border-b border-zinc-100 align-top text-zinc-800"
                      >
                        <td className="py-2 pr-2 font-medium">{row.product}</td>
                        <td className="py-2 pr-2">{row.market}</td>
                        <td className="py-2 pr-2">{row.price}</td>
                        <td className="py-2 pr-2">{row.competition}</td>
                        <td className="py-2 pr-2">{row.margin}</td>
                        <td className="py-2 pr-2">{row.risk}</td>
                        <td className="py-2 pr-2">{row.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[12px] text-zinc-500">
                {compare.dataNotice}
              </p>
            </div>
          )}

          <WorkflowActions
            actions={result.workflowActions}
            chainLabel={result.chainLabel}
          />
        </div>
      )}
    </section>
  );
}
