"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { AIOverview, OverviewStatus, SearchResult } from "@/modules/search/types";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

interface AIOverviewCardProps {
  overview: AIOverview | null;
  overviewStatus?: OverviewStatus;
  results: SearchResult[];
  query: string;
  onRequestOverview?: () => void;
  overviewBusy?: boolean;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white min-[390px]:mb-7 min-[390px]:rounded-[14px] sm:mb-8 sm:rounded-2xl">
      <div className="relative px-3.5 pb-3.5 pt-3.5 min-[390px]:px-5 min-[390px]:pb-4 min-[390px]:pt-4 sm:px-6 sm:pt-5">
        {children}
      </div>
    </section>
  );
}

function BrandHeader() {
  return (
    <div className="mb-3 flex items-center justify-between min-[390px]:mb-3.5">
      <div className="flex items-baseline gap-1 text-[15px] font-semibold tracking-tight text-zinc-900 min-[390px]:text-[16px] sm:text-[17px]">
        <span>Nexa</span>
        <span className="text-[12px] font-medium text-zinc-400">概览</span>
      </div>
    </div>
  );
}

/** Highlight query terms and numeric facts in Baidu-blue. */
function highlightText(text: string, query: string) {
  const tokens = Array.from(
    new Set(
      query
        .split(/[\s,，。、；;！!？?（）()【】\[\]「」""''·/\\|]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).sort((a, b) => b.length - a.length);

  if (!tokens.length) return text;

  const escaped = tokens.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const re = new RegExp(`(${escaped.join("|")}|\\d+(?:\\.\\d+)?%?)`, "g");
  const parts = text.split(re);

  return parts.map((part, i) => {
    if (!part) return null;
    const isHit =
      tokens.some((t) => t === part) || /^\d+(?:\.\d+)?%?$/.test(part);
    if (isHit) {
      return (
        <span key={i} className="font-medium text-[#3b6cf5]">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function splitPoint(text: string): { label: string | null; body: string } {
  const m = text.match(/^([^：:]{1,24})[：:](.+)$/);
  if (m) return { label: m[1].trim(), body: m[2].trim() };
  return { label: null, body: text };
}

export function AIOverviewCard({
  overview,
  overviewStatus,
  results,
  query,
  onRequestOverview,
  overviewBusy,
}: AIOverviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const resultMap = useMemo(
    () => new Map(results.map((r) => [r.id, r])),
    [results]
  );
  const sourceIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const r of results) map.set(r.id, ++i);
    return map;
  }, [results]);

  const plainText = useMemo(() => {
    if (!overview) return "";
    const lines = [
      overview.summary,
      ...overview.points.map((p, i) => `${i + 1}. ${p.text}`),
    ];
    return lines.filter(Boolean).join("\n");
  }, [overview]);

  const collapseNeeded = (overview?.points.length ?? 0) > 2 || plainText.length > 220;
  const remainingPct = useMemo(() => {
    if (!overview || !collapseNeeded) return 0;
    const total = Math.max(overview.points.length, 1);
    const hidden = Math.max(total - 2, 0);
    return Math.min(75, Math.max(35, Math.round((hidden / total) * 100) || 55));
  }, [overview, collapseNeeded]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: `Nexa AI · ${query}`, text: plainText, url });
        return;
      } catch {
        /* fall through */
      }
    }
    await handleCopy();
  };

  const handleFeedback = (vote: "up" | "down") => {
    const next = feedback === vote ? null : vote;
    setFeedback(next);
    if (next) {
      trackEvent(
        next === "up" ? "overview_feedback_up" : "overview_feedback_down",
        { query, points: overview?.points.length ?? 0 }
      );
    }
  };

  if (overviewStatus === "unavailable") {
    return (
      <Shell>
        <BrandHeader />
        <p className="text-[14px] leading-relaxed text-[#8a8f99]">AI 概览暂未接入</p>
      </Shell>
    );
  }

  if (overviewBusy || overviewStatus === "skipped") {
    return (
      <Shell>
        <BrandHeader />
        <p className="text-[14px] leading-relaxed text-[#8a8f99]">正在生成 AI 概览…</p>
      </Shell>
    );
  }

  if (overviewStatus === "error") {
    return (
      <Shell>
        <BrandHeader />
        <p className="text-[14px] leading-relaxed text-[#8a8f99]">
          AI 服务暂时不可用，请稍后重试
        </p>
        {onRequestOverview && (
          <button
            type="button"
            disabled={overviewBusy || !query}
            onClick={onRequestOverview}
            className="mt-3 text-[13px] text-[#4b7cff] hover:underline"
          >
            重新生成
          </button>
        )}
      </Shell>
    );
  }

  if (!overview || (!overview.summary && overview.points.length === 0)) {
    return null;
  }

  const visiblePoints =
    !expanded && collapseNeeded ? overview.points.slice(0, 2) : overview.points;

  const renderCitations = (sourceIds: string[]) => {
    if (!sourceIds.length) return null;
    return (
      <span className="ml-1 inline-flex gap-0.5 align-middle">
        {sourceIds.map((id) => {
          const source = resultMap.get(id);
          if (!source) return null;
          const idx = sourceIndexMap.get(id);
          return (
            <a
              key={id}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium text-[#3b6cf5] hover:underline"
              title={source.title}
            >
              [{idx}]
            </a>
          );
        })}
      </span>
    );
  };

  return (
    <Shell>
      <BrandHeader />

      {overview.summary && (
        <p
          className={cn(
            "text-[15px] leading-[1.75] text-zinc-800 min-[390px]:text-[16px] min-[390px]:leading-[1.8]",
            !expanded && collapseNeeded && "line-clamp-3 min-[390px]:line-clamp-4"
          )}
        >
          {highlightText(overview.summary, query)}
        </p>
      )}

      {overview.points.length > 0 && (
        <div className="mt-3 min-[390px]:mt-4">
          <h3 className="mb-2 text-[12px] font-medium tracking-wide text-zinc-400 min-[390px]:mb-2.5">
            核心结论
          </h3>
          <ol className="space-y-2 min-[390px]:space-y-2.5">
            {visiblePoints.map((point, i) => {
              const { label, body } = splitPoint(point.text);
              return (
                <li
                  key={i}
                  className="text-[13px] leading-[1.65] text-[#3c4048] min-[390px]:text-[14px] min-[390px]:leading-[1.7]"
                >
                  <span className="font-semibold text-[#1f2329]">
                    {i + 1}. {label ? `${label}：` : ""}
                  </span>
                  <span>{label ? body : point.text}</span>
                  {renderCitations(point.sourceIds)}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {collapseNeeded && (
        <div className="mt-2.5 flex justify-center min-[390px]:mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] text-[#8a8f99] transition-colors hover:text-[#5c6370] min-[390px]:text-[13px]"
          >
            {expanded ? "收起内容" : `展开剩余${remainingPct}%内容`}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-180"
              )}
              strokeWidth={2}
            />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[#f0f1f3] pt-2.5 min-[390px]:mt-4 min-[390px]:pt-3">
        <p className="text-[11px] text-[#b0b4bc] min-[390px]:text-[12px]">内容由AI生成</p>
        <div className="flex items-center gap-0">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-md p-1.5 text-[#b0b4bc] transition-colors hover:bg-zinc-50 hover:text-[#5c6370]"
            aria-label="复制"
            title="复制"
          >
            {copied ? (
              <Check className="size-3.5 text-[#3b6cf5]" strokeWidth={2} />
            ) : (
              <Copy className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="rounded-md p-1.5 text-[#b0b4bc] transition-colors hover:bg-zinc-50 hover:text-[#5c6370]"
            aria-label="分享"
            title="分享"
          >
            <Share2 className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => handleFeedback("up")}
            className={cn(
              "rounded-md p-1.5 transition-colors hover:bg-zinc-50",
              feedback === "up" ? "text-[#3b6cf5]" : "text-[#b0b4bc] hover:text-[#5c6370]"
            )}
            aria-label="有用"
            title="有用"
          >
            <ThumbsUp className="size-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => handleFeedback("down")}
            className={cn(
              "hidden rounded-md p-1.5 transition-colors hover:bg-zinc-50 min-[390px]:inline-flex",
              feedback === "down" ? "text-[#3b6cf5]" : "text-[#b0b4bc] hover:text-[#5c6370]"
            )}
            aria-label="无用"
            title="无用"
          >
            <ThumbsDown className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </Shell>
  );
}
