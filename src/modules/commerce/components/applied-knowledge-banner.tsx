"use client";

import { useState } from "react";
import type { AppliedKnowledgeSummary } from "@/modules/commerce/skills/types";

/**
 * Applied Knowledge UX (V4.5-H).
 * Shows human summary — never "Agent 1 / Skill 3".
 * Advanced users expand for rule + evidence details.
 */
export function AppliedKnowledgeBanner({
  knowledge,
}: {
  knowledge: AppliedKnowledgeSummary | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!knowledge?.items?.length) return null;

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-zinc-800">
            {knowledge.summaryLine}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            系统已按平台 / 市场 / 任务自动匹配知识（非 Agent / Skill 市场）
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] text-zinc-600 underline-offset-2 hover:underline"
        >
          {open ? "收起 Applied Knowledge" : "展开 Applied Knowledge"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
          {knowledge.items.map((item) => (
            <div key={`${item.skillName}-${item.version}`}>
              <p className="text-[12px] font-medium text-zinc-700">
                {item.skillName}
                <span className="ml-2 font-normal text-zinc-400">
                  v{item.version}
                </span>
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-zinc-600">
                {item.ruleHighlights.map((h) => (
                  <li key={h.slice(0, 48)}>{h}</li>
                ))}
              </ul>
              {item.evidence.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[11px] font-medium text-zinc-500">
                    Evidence
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px] text-zinc-500">
                    {item.evidence.map((e, i) => (
                      <li key={`${e.source}-${i}`}>
                        {e.source}
                        {" · "}
                        {e.platform}/{e.region}
                        {" · "}
                        {e.timestamp.slice(0, 10)}
                        {e.url ? (
                          <>
                            {" · "}
                            <a
                              href={e.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-600 underline-offset-2 hover:underline"
                            >
                              Source
                            </a>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
