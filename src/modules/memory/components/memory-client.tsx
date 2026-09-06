"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/hierarchy";
import { type as typeStyle } from "@/lib/ui-hierarchy";
import type { MemoryType, UserMemory } from "@/modules/memory/types";

const TYPE_OPTIONS: { value: MemoryType; label: string }[] = [
  { value: "Preference", label: "偏好" },
  { value: "ContentStyle", label: "内容风格" },
  { value: "Project", label: "长期项目" },
  { value: "Brand", label: "品牌信息" },
  { value: "WorkflowPreference", label: "工作流偏好" },
];

/**
 * V3.1 — Memory management (under Account, no new top-level nav).
 */
export function MemoryClient() {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MemoryType>("Preference");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory");
      if (res.status === 401) {
        setError("请先登录后管理记忆");
        setMemories([]);
        return;
      }
      if (!res.ok) {
        setError("加载失败");
        return;
      }
      const data = await res.json();
      setMemories(data.memories ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const create = async () => {
    if (!label.trim() || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          type,
          key: label.trim().toLowerCase().replace(/\s+/g, "_"),
          label: label.trim(),
          value: value.trim(),
          requireConfirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存失败");
        return;
      }
      setLabel("");
      setValue("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (memoryId: string) => {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", memoryId }),
    });
    await reload();
  };

  const remove = async (memoryId: string) => {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", memoryId }),
    });
    await reload();
  };

  return (
    <div className="mx-auto w-full max-w-[640px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="用户记忆"
        description="保存长期有效的工作偏好。不是聊天记录。创作会自动读取已激活的偏好；本次明确要求可覆盖。"
      />

      {error && <p className="mb-4 text-[13px] text-red-600">{error}</p>}

      {!loading && (
        <section className="mb-8 border-b border-zinc-100 pb-6">
          <p className={typeStyle.insightLabel}>Nexa 记住了什么</p>
          <p className={`mt-1 ${typeStyle.focusTitle}`}>
            {memories.filter((m) => m.status === "active").length} 条已激活
            {memories.some((m) => m.status === "candidate")
              ? ` · ${memories.filter((m) => m.status === "candidate").length} 条待确认`
              : ""}
          </p>
          <p className={`mt-2 ${typeStyle.bodyMuted}`}>
            创作会自动读取已激活偏好；本次明确要求可覆盖。
          </p>
        </section>
      )}

      {loading ? (
        <p className="mb-8 text-[14px] text-zinc-400">加载中…</p>
      ) : memories.length === 0 ? (
        <p className="mb-8 text-[14px] text-zinc-400">暂无记忆。可在下方新增一条偏好。</p>
      ) : (
        <ul className="mb-10 space-y-4">
          {memories.map((m) => (
            <li key={m.id} className="border-b border-zinc-50 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-zinc-400">
                    {m.type} · {m.status}
                  </p>
                  <p className="text-[14px] font-medium text-zinc-900">{m.label}</p>
                  <p className="mt-1 text-[13px] text-zinc-600">{m.value}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {m.status === "candidate" && (
                    <button
                      type="button"
                      onClick={() => void confirm(m.id)}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white"
                    >
                      确认激活
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    className="text-[12px] text-zinc-400 hover:text-zinc-700"
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-3 border-t border-zinc-100 pt-8">
        <p className={typeStyle.sectionLabel}>新增偏好（需确认后生效）</p>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MemoryType)}
          className={typeStyle.fieldControl}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="名称，例如：内容语言"
          className={typeStyle.fieldControl}
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例如：默认中文；偏好小红书短标题"
          rows={3}
          className={typeStyle.fieldControl}
        />
        <button
          type="button"
          disabled={busy || !label.trim() || !value.trim()}
          onClick={() => void create()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-[14px] text-white disabled:opacity-40"
        >
          保存为候选
        </button>
      </section>
    </div>
  );
}
