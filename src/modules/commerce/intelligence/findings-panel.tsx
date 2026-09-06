"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useState } from "react";
import { StepIndex } from "@/components/ui/hierarchy";
import {
  DIMENSION_LABELS,
  type CommerceIntelligenceReport,
  type IntelligenceAction,
  type IntelligenceFinding,
} from "@/modules/commerce/intelligence/types";
import { requestExpandCommerceProduct } from "@/modules/commerce/lib/expand-product";

const SEVERITY_LABEL: Record<IntelligenceFinding["severity"], string> = {
  high: "高优",
  medium: "关注",
  low: "提示",
  positive: "机会",
};

const SEVERITY_RANK: Record<IntelligenceFinding["severity"], number> = {
  high: 0,
  medium: 1,
  positive: 2,
  low: 3,
};

function sortFindings(findings: IntelligenceFinding[]) {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );
}

function FindingActions({ actions }: { actions: IntelligenceAction[] }) {
  if (!actions.length) return null;

  const onExpandHref = (href: string, e: MouseEvent) => {
    const m = href.match(
      /\/commerce\/(amazon|tiktok).*[?&]expand=([^&#]+)/
    );
    if (!m) return;
    const platform = m[1] as "amazon" | "tiktok";
    const productId = decodeURIComponent(m[2]);
    if (!document.getElementById("products")) return;
    e.preventDefault();
    requestExpandCommerceProduct(productId, platform);
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={`${a.label}-${a.href}`}
          href={a.href}
          onClick={(e) => onExpandHref(a.href, e)}
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

function FindingBlock({ f }: { f: IntelligenceFinding }) {
  return (
    <div>
      <p className="text-[12px] text-zinc-400">
        {DIMENSION_LABELS[f.dimension]} · {SEVERITY_LABEL[f.severity]}
      </p>
      <p className="mt-1 text-[15px] font-medium text-zinc-900">{f.problem}</p>
      <ul className="mt-2 space-y-1">
        {f.evidence.slice(0, 2).map((e) => (
          <li key={e} className="text-[13px] text-zinc-600">
            {e}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-700">
        {f.suggestion}
      </p>
      {f.actions && f.actions.length > 0 && (
        <FindingActions actions={f.actions} />
      )}
    </div>
  );
}

/**
 * Analysis-first findings: surface top issues, keep the rest collapsed.
 * Avoids the long “edit document” dump of every dimension.
 */
export function IntelligenceFindingsPanel({
  report,
  previewCount = 2,
}: {
  report: CommerceIntelligenceReport;
  previewCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = sortFindings(report.findings);
  const visible = expanded ? sorted : sorted.slice(0, previewCount);
  const hidden = Math.max(0, sorted.length - previewCount);

  return (
    <div>
      <p className="mb-4 text-[12px] text-zinc-400">
        {report.demoStoreLabel}
        {report.aiAssisted ? " · 含 AI 补充" : " · 规则诊断"}
      </p>
      <ol className="space-y-6">
        {visible.map((f, i) => (
          <li
            key={f.id}
            className="border-b border-zinc-100 pb-6 last:border-0 last:pb-0"
          >
            <StepIndex value={i + 1} className="mb-2" />
            <FindingBlock f={f} />
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-[13px] text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
        >
          {expanded ? "收起其余诊断" : `展开其余 ${hidden} 条诊断`}
        </button>
      )}
    </div>
  );
}
