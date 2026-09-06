"use client";

import { useState } from "react";
import {
  CreditsConfirmPanel,
  useCreditsConfirm,
} from "@/modules/account/components/credits-confirm";
import type {
  ListingIntelligenceResult,
  ListingMode,
  ListingPartialField,
  ListingRecommendation,
} from "@/modules/commerce/capability/listing-types";
import { AppliedKnowledgeBanner } from "@/modules/commerce/components/applied-knowledge-banner";
import { WorkflowActions } from "@/modules/commerce/components/workflow-actions";

/**
 * Inline Listing Intelligence — V4.5-B
 * generate / review / partial + keywords + QA/Compliance/Create/Publish.
 */
export function ListingIntelligencePanel({
  productTitle,
  productId,
  channel,
  platform,
  category,
  listingWeaknesses,
  listingChecklist,
}: {
  productTitle: string;
  productId?: string;
  channel: "amazon" | "tiktok";
  platform: "Amazon" | "TikTok Shop";
  category?: string | null;
  listingWeaknesses?: string[];
  listingChecklist?: string[];
}) {
  const [sku, setSku] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [featuresText, setFeaturesText] = useState("");
  const [imageNotes, setImageNotes] = useState("");
  const [researchNotes, setResearchNotes] = useState("");
  const [draft, setDraft] = useState("");
  const [marketplace, setMarketplace] = useState(
    platform === "TikTok Shop" ? "TikTok US" : "Amazon US"
  );
  const [country, setCountry] = useState("US");
  const [mode, setMode] = useState<ListingMode>("generate");
  const [partialField, setPartialField] =
    useState<ListingPartialField>("title");
  const [showMore, setShowMore] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    ListingIntelligenceResult,
    { ok: true }
  > | null>(null);
  const [lastListing, setLastListing] =
    useState<ListingRecommendation | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const credits = useCreditsConfirm();

  const run = async (
    confirm = false,
    override?: { mode?: ListingMode; partialField?: ListingPartialField }
  ) => {
    setRunning(true);
    setError(null);
    const activeMode = override?.mode || mode;
    const activePartial = override?.partialField || partialField;
    try {
      const features = featuresText
        .split(/[,\n；;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const images = imageNotes
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/commerce/listing-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle,
          productId,
          sku: sku || undefined,
          productDescription: productDescription || undefined,
          imageNotes: images,
          channel,
          platform,
          marketplace,
          country: country || undefined,
          category: category || undefined,
          features,
          currentListing: draft || undefined,
          researchNotes: researchNotes || undefined,
          listingWeaknesses,
          listingChecklist,
          mode: activeMode,
          partialField:
            activeMode === "partial" ? activePartial : undefined,
          baseListing:
            activeMode === "partial" && lastListing
              ? lastListing
              : undefined,
          confirm,
          jobId: confirm ? pendingJobId : undefined,
        }),
      });
      const data = (await res.json()) as ListingIntelligenceResult;

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
        setError(data.message || "商品页分析失败");
        return;
      }

      credits.reset();
      setPendingJobId(undefined);
      setResult(data);
      setLastListing(data.listing);
      if (override?.mode) setMode(override.mode);
      if (override?.partialField) setPartialField(override.partialField);
    } catch {
      setError("商品页分析失败，请稍后重试");
    } finally {
      setRunning(false);
    }
  };

  const insight = result?.insight;
  const listing = result?.listing;
  const keywords = result?.keywords;
  const review = result?.review;

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div>
        <p className="text-[12px] font-medium tracking-wide text-zinc-400">
          商品页智能建议
        </p>
        <h2 className="mt-1 text-[17px] font-semibold text-zinc-900">
          商品页优化
        </h2>
        <p className="mt-1 text-[13px] text-zinc-500">
          本土化不是直译。支持生成 / 审阅 / 局部改写；关键词不伪造搜索量。
        </p>
      </div>

      {(listingWeaknesses?.length ?? 0) > 0 && (
        <p className="text-[12px] text-amber-800">
          演示弱点：{listingWeaknesses!.slice(0, 3).join("；")}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-[12px]">
        {(
          [
            ["generate", "生成商品页"],
            ["review", "审阅商品页"],
            ["partial", "局部修改"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              mode === m
                ? "rounded-md bg-zinc-900 px-3 py-1.5 text-white"
                : "rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "partial" && (
        <div className="flex flex-wrap gap-2 text-[12px]">
          {(
            [
              ["title", "只改 Title"],
              ["bullets", "只改 Bullets"],
              ["description", "只改 Description"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setPartialField(f)}
              className={
                partialField === f
                  ? "rounded-md bg-zinc-800 px-3 py-1.5 text-white"
                  : "rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-600"
              }
            >
              {label}
            </button>
          ))}
          {!lastListing && (
            <p className="basis-full text-[12px] text-amber-700">
              局部修改建议先完整生成一次，或粘贴现有商品页。
            </p>
          )}
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">
          产品特点（逗号或换行）
        </span>
        <textarea
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          rows={2}
          placeholder="例如：便携、USB-C、静音、易清洗"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] text-zinc-500">
          现有商品页 / 草稿（审阅 / 局部修改建议填写）
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="粘贴标题、Bullet、描述"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-400"
        />
      </label>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-[12px] text-zinc-500 hover:text-zinc-800"
      >
        {showMore ? "收起更多输入" : "展开货号 / 说明 / 图片 / 调研上下文"}
      </button>

      {showMore && (
        <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="货号（可选）"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={marketplace}
              onChange={(e) => setMarketplace(e.target.value)}
              placeholder="Marketplace"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
            />
          </div>
          <textarea
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            rows={2}
            placeholder="Product Description（可选）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <textarea
            value={imageNotes}
            onChange={(e) => setImageNotes(e.target.value)}
            rows={2}
            placeholder="Images：URL 或图注（可选，不做假视觉分析）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
          <textarea
            value={researchNotes}
            onChange={(e) => setResearchNotes(e.target.value)}
            rows={2}
            placeholder="Research / Product Research 摘要（可选，自动带入 Context）"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void run(false)}
        disabled={running}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {running
          ? "分析中…"
          : mode === "review"
            ? "开始 商品页审阅"
            : mode === "partial"
              ? `只改 ${partialField}`
              : "生成商品页 建议"}
      </button>

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

      {insight && listing && result && (
        <div className="space-y-4 border-t border-zinc-100 pt-4 text-[13px]">
          <AppliedKnowledgeBanner
            knowledge={
              result.appliedKnowledge ?? insight.appliedKnowledge ?? null
            }
          />
          <div className="space-y-2">
            <p>
              <span className="text-zinc-400">Situation · </span>
              {insight.situation}
            </p>
            <p>
              <span className="text-zinc-400">Diagnosis · </span>
              {insight.diagnosis}
            </p>
            <p>
              <span className="text-zinc-400">Opportunity · </span>
              {insight.opportunity}
            </p>
            <p>
              <span className="text-zinc-400">Recommendation · </span>
              {insight.recommendation}
            </p>
          </div>

          {review && (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-3">
              <p className="text-[12px] text-zinc-400">商品页审阅</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {Object.entries(review.scores).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-zinc-400">{k}</dt>
                    <dd className="text-zinc-800">{v}</dd>
                  </div>
                ))}
              </dl>
              {review.strengths.length > 0 && (
                <div className="mt-3">
                  <p className="text-zinc-400">Strengths</p>
                  <ul className="mt-1 space-y-0.5 text-zinc-800">
                    {review.strengths.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.problems.length > 0 && (
                <div className="mt-2">
                  <p className="text-zinc-400">Problems</p>
                  <ul className="mt-1 space-y-0.5 text-zinc-800">
                    {review.problems.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.recommendations.length > 0 && (
                <div className="mt-2">
                  <p className="text-zinc-400">Recommendations</p>
                  <ul className="mt-1 space-y-0.5 text-zinc-800">
                    {review.recommendations.map((s) => (
                      <li key={s}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-[12px] text-zinc-500">{review.dataNotice}</p>
            </div>
          )}

          <div>
            <p className="text-[12px] text-zinc-400">
              Title
              {listing.regeneratedFields.includes("title") ||
              listing.regeneratedFields.includes("full")
                ? " · updated"
                : ""}
            </p>
            <p className="mt-1 font-medium text-zinc-900">{listing.title}</p>
          </div>

          {listing.bulletPoints.length > 0 && (
            <div>
              <p className="text-[12px] text-zinc-400">Bullet Points</p>
              <ul className="mt-1 space-y-1 text-zinc-800">
                {listing.bulletPoints.map((b) => (
                  <li key={b}>· {b}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[12px] text-zinc-400">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">
              {listing.description}
            </p>
          </div>

          {listing.positioning &&
            listing.positioning !== "数据暂缺" && (
              <p className="text-zinc-700">
                <span className="text-zinc-400">Positioning · </span>
                {listing.positioning}
              </p>
            )}

          {listing.cta && listing.cta !== "数据暂缺" && (
            <p className="text-zinc-700">
              <span className="text-zinc-400">CTA · </span>
              {listing.cta}
            </p>
          )}

          {listing.localizedCopy &&
            listing.localizedCopy !== "数据暂缺" && (
              <div>
                <p className="text-[12px] text-zinc-400">
                  Localized Copy（≠ Translation）
                </p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                  {listing.localizedCopy}
                </p>
              </div>
            )}

          {keywords && (
            <div className="rounded-lg border border-zinc-100 px-3 py-3">
              <p className="text-[12px] text-zinc-400">
                Keyword Intelligence · keyword_intelligence
              </p>
              <p className="mt-1 text-[12px] text-amber-800">
                {keywords.volumeNotice}
              </p>
              <p className="mt-2 text-zinc-700">
                <span className="text-zinc-400">Search Intent · </span>
                {keywords.searchIntent}
              </p>
              {(
                [
                  ["Primary", keywords.primary],
                  ["Secondary", keywords.secondary],
                  ["Long-tail", keywords.longTail],
                  ["Negative", keywords.potentialNegative],
                ] as const
              ).map(([label, list]) =>
                list.length > 0 ? (
                  <div key={label} className="mt-2">
                    <p className="text-[12px] text-zinc-400">{label}</p>
                    <ul className="mt-1 space-y-1 text-zinc-800">
                      {list.map((k) => (
                        <li key={k.term + k.source}>
                          <span className="font-medium">{k.term}</span>
                          <span className="text-zinc-400">
                            {" "}
                            · {k.source}
                            {k.intent ? ` · ${k.intent}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              )}
            </div>
          )}

          <p className="text-[12px] text-zinc-500">{listing.localizationNotes}</p>
          <p className="text-[12px] text-amber-800">{listing.complianceNotes}</p>
          <p className="text-[12px] text-zinc-500">{insight.dataNotice}</p>
          <p className="text-[12px] text-zinc-400">{result.qaHint}</p>

          {lastListing && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running}
                onClick={() =>
                  void run(false, { mode: "partial", partialField: "title" })
                }
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                只改 Title
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() =>
                  void run(false, { mode: "partial", partialField: "bullets" })
                }
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                只改 Bullets
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() =>
                  void run(false, {
                    mode: "partial",
                    partialField: "description",
                  })
                }
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
              >
                只改 Description
              </button>
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
