"use client";

import { useEffect, useState } from "react";
import {
  listAiCapabilityRecords,
  NEXA_AI_HISTORY_EVENT,
} from "@/modules/ai-workbench/store";
import type { AiCapabilityRecord } from "@/modules/ai-workbench/types";

/** Inline “本页 AI 记录” block for pages that generate AI content. */
export function PageAiHistory({ pageKey }: { pageKey: string }) {
  const [rows, setRows] = useState<AiCapabilityRecord[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const load = () => setRows(listAiCapabilityRecords(pageKey));
    load();
    window.addEventListener(NEXA_AI_HISTORY_EVENT, load);
    return () => window.removeEventListener(NEXA_AI_HISTORY_EVENT, load);
  }, [pageKey]);

  if (rows.length === 0) return null;

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-zinc-900">本页 AI 记录</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[13px] text-zinc-500 hover:text-zinc-800"
        >
          {open ? "收起" : `展开 ${rows.length} 条`}
        </button>
      </div>
      {open && (
        <ul className="space-y-3">
          {rows.slice(0, 20).map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-zinc-100 px-3.5 py-3"
            >
              <p className="text-[14px] font-medium text-zinc-900">{r.title}</p>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                {r.capabilityLabel} ·{" "}
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </p>
              {r.summary && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
                  {r.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
