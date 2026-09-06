"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  ContextItem,
  ContextSourceRole,
  WorkspaceContext,
} from "@/modules/workspace/types";

const KIND_LABELS: Record<string, string> = {
  search_result: "搜索",
  research_report: "研究",
  image: "图片",
  video: "视频",
  pdf: "PDF",
  docx: "DOCX",
  txt: "文本",
  user_upload: "上传",
  creation_draft: "草稿",
  commerce_diagnosis: "商业诊断",
};

const SOURCE_ROLE_LABELS: Record<ContextSourceRole, string> = {
  fact: "事实依据",
  visual_reference: "视频/视觉参考",
  image_reference: "图片/风格参考",
};

function sourceRoleForItem(item: ContextItem): ContextSourceRole {
  const role = item.payload?.contextRole;
  if (
    role === "fact" ||
    role === "visual_reference" ||
    role === "image_reference"
  ) {
    return role;
  }
  if (item.payload?.sourceType === "video") return "visual_reference";
  if (item.payload?.sourceType === "image") return "image_reference";
  return "fact";
}

function isVideoUrl(url: string) {
  return /\.mp4($|\?)|\/api\/video\//i.test(url);
}

function isImageUrl(url: string) {
  return (
    /\.(png|jpe?g|webp|gif)($|\?)/i.test(url) || /\/api\/assets\//i.test(url)
  );
}

/**
 * V3.0 — Context control panel.
 * Toggle include/exclude; show explainability; no technical internals.
 */
export function WorkspaceContextPanel({
  workspaceId,
  onChanged,
}: {
  workspaceId: string;
  onChanged?: () => void;
}) {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [allItems, setAllItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/context`);
      if (!res.ok) return;
      const data = await res.json();
      setContext(data.context);
      setAllItems(data.allItems ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const toggle = async (itemId: string, included: boolean) => {
    const res = await fetch(`/api/workspace/${workspaceId}/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", itemId, included }),
    });
    if (res.ok) {
      const data = await res.json();
      setContext(data.context);
      await reload();
      onChanged?.();
      setMessage(
        included
          ? "已加入本次生成 Context"
          : "已取消作为 Context，AI 将不再使用该项"
      );
    }
  };

  const remove = async (itemId: string) => {
    const res = await fetch(`/api/workspace/${workspaceId}/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", itemId }),
    });
    if (res.ok) {
      await reload();
      onChanged?.();
    }
  };

  const setSourceRole = async (
    itemId: string,
    contextRole: ContextSourceRole
  ) => {
    const res = await fetch(`/api/workspace/${workspaceId}/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_source_role", itemId, contextRole }),
    });
    if (res.ok) {
      const data = await res.json();
      setContext(data.context);
      await reload();
      onChanged?.();
      setMessage(
        contextRole === "fact"
          ? "该来源将用于支撑事实与结论"
          : "该来源将只用于画面、镜头和风格参考"
      );
    }
  };

  if (loading && !context) {
    return <p className="text-[13px] text-zinc-400">加载 Context…</p>;
  }

  const items = allItems.length
    ? allItems
    : (context?.items ?? []).map((i) => ({ ...i }));

  const mediaItems = items.filter(
    (i) => (i.kind === "video" || i.kind === "image") && Boolean(i.url)
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[12px] font-medium text-zinc-400">AI Context</p>
        <p className="mt-1 text-[13px] text-zinc-600">
          {context?.explainability?.summary ??
            "选择要让 AI 参考的内容。取消勾选后，生成时不再使用该项。"}
        </p>
      </div>

      {message && <p className="text-[12px] text-zinc-500">{message}</p>}

      {mediaItems.length > 0 && (
        <div className="space-y-3 rounded-xl border border-zinc-100 p-3">
          <p className="text-[12px] font-medium text-zinc-400">
            成片 / 素材 · {mediaItems.length}
          </p>
          {mediaItems.map((item) => {
            const url = item.url!;
            return (
              <div key={`media_${item.id}`} className="space-y-1.5">
                <p className="line-clamp-1 text-[13px] font-medium text-zinc-800">
                  {item.title}
                </p>
                {item.kind === "video" || isVideoUrl(url) ? (
                  <video
                    src={url}
                    controls
                    preload="metadata"
                    className="max-h-[280px] w-full rounded-lg bg-black"
                  />
                ) : item.kind === "image" || isImageUrl(url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={item.title}
                    className="max-h-[240px] w-full rounded-lg object-contain bg-zinc-50"
                  />
                ) : null}
                <Link
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-zinc-500 underline underline-offset-2"
                >
                  新窗口打开
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {items.length === 0 && (
        <p className="py-4 text-[13px] text-zinc-400">
          暂无 Context。从搜索加入资料，或在创作页生成成片后会出现在这里。
        </p>
      )}

      <ul className="divide-y divide-zinc-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-2.5">
            <input
              type="checkbox"
              checked={item.includedInContext}
              onChange={(e) => void toggle(item.id, e.target.checked)}
              className="mt-1"
              aria-label="作为 Context"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-zinc-400">
                {KIND_LABELS[item.kind] ?? item.kind}
              </p>
              <p className="line-clamp-2 text-[13px] font-medium text-zinc-800">
                {item.title}
              </p>
              {item.summary && (
                <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">
                  {item.summary}
                </p>
              )}
              {item.kind === "search_result" && (
                <label className="mt-1.5 flex items-center gap-2 text-[12px] text-zinc-500">
                  <span>创作角色</span>
                  <select
                    value={sourceRoleForItem(item)}
                    onChange={(event) =>
                      void setSourceRole(
                        item.id,
                        event.target.value as ContextSourceRole
                      )
                    }
                    className="border-0 bg-transparent p-0 text-[12px] text-zinc-700 outline-none"
                    aria-label={`${item.title} 的创作角色`}
                  >
                    {Object.entries(SOURCE_ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {item.url && (item.kind === "video" || item.kind === "image") && (
                <Link
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[12px] text-zinc-500 underline underline-offset-2"
                >
                  查看成片
                </Link>
              )}
            </div>
            {item.kind !== "search_result" && (
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="shrink-0 text-[12px] text-zinc-400 hover:text-zinc-700"
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
