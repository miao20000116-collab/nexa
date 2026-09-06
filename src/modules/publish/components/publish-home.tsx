"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/hierarchy";
import { type as typeStyle } from "@/lib/ui-hierarchy";
import type {
  PlatformCapability,
  PlatformConnection,
  PublishRecordView,
} from "@/modules/publish/types";
import {
  PLATFORM_LABELS,
  PUBLISH_STATUS_LABELS,
} from "@/modules/publish/types";

export function PublishHome({
  continuity,
}: {
  continuity?: {
    from?: string | null;
    product?: string | null;
    marketplace?: string | null;
    projectId?: string | null;
  } | null;
} = {}) {
  const [records, setRecords] = useState<PublishRecordView[]>([]);
  const [platforms, setPlatforms] = useState<PlatformCapability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const recordsUrl = continuity?.projectId
          ? `/api/publish/records?projectId=${encodeURIComponent(continuity.projectId)}`
          : "/api/publish/records";
        const [rRes, pRes] = await Promise.all([
          fetch(recordsUrl),
          fetch("/api/publish/platforms"),
        ]);
        if (cancelled) return;
        if (rRes.ok) {
          const data = await rRes.json();
          setRecords(data.records ?? []);
        }
        if (pRes.ok) {
          const data = await pRes.json();
          setPlatforms(data.platforms ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [continuity?.projectId]);

  return (
    <div className="mx-auto w-full max-w-[900px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="发布"
        description="当前作品 → 发布检查 → 确认发布。未连接时不会假装成功。"
        actions={
          <div className="flex gap-2">
            <Link
              href="/account/connections"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50"
            >
              连接平台
            </Link>
            <Link
              href="/create"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              去创作
            </Link>
          </div>
        }
      />

      {(continuity?.from === "commerce" ||
        continuity?.product ||
        continuity?.marketplace ||
        continuity?.projectId) && (
        <section className="mb-8 border-b border-zinc-100 pb-8">
          <p className={typeStyle.insightLabel}>当前作品</p>
          <h2 className={`mt-1 ${typeStyle.focusTitle}`}>
            {continuity.product || continuity.projectId || "来自工作流的项目"}
          </h2>
          <p className={`mt-2 ${typeStyle.bodyMuted}`}>
            {[
              continuity.marketplace
                ? `市场：${continuity.marketplace}`
                : null,
              continuity.projectId ? `项目：${continuity.projectId}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={`mt-3 ${typeStyle.meta}`}>
            发布检查：请先在创作台完成 QA 与预览确认。
          </p>
          {continuity.projectId ? (
            <Link
              href={`/create/${continuity.projectId}?panel=qa`}
              className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              打开 QA / 发布面板
            </Link>
          ) : (
            <Link
              href="/create"
              className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              去创作列表选择项目
            </Link>
          )}
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-[15px] font-medium text-zinc-900">发布记录</h2>
        {loading ? (
          <p className="text-[14px] text-zinc-400">正在加载…</p>
        ) : records.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[14px] text-zinc-600">
              暂无发布记录。在创作工作台完成预览确认后会出现在这里。
            </p>
            <Link
              href="/create"
              className="text-[13px] text-zinc-500 underline-offset-2 hover:underline"
            >
              去创作
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {records.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[14px] text-zinc-800">
                    {r.projectTitle || r.projectId || "未命名项目"}
                    <span className="ml-2 text-[12px] text-zinc-400">
                      {PLATFORM_LABELS[r.platform] ?? r.platform}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-400">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                    {r.accountId || r.accountLabel
                      ? ` · 账号 ${r.accountLabel ?? r.accountId}`
                      : ""}
                    {r.contentId || r.externalPostId
                      ? ` · contentId ${r.contentId ?? r.externalPostId}`
                      : ""}
                  </p>
                  {r.errorMessage && (
                    <p className="mt-1 text-[12px] text-zinc-500">
                      {r.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[12px] text-zinc-600">
                    {PUBLISH_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  {r.externalUrl && (
                    <a
                      href={r.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-zinc-700 underline"
                    >
                      打开链接
                    </a>
                  )}
                  {r.projectId && (
                    <Link
                      href={`/create/${r.projectId}`}
                      className="text-[12px] text-zinc-700 underline"
                    >
                      打开项目
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <details>
          <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
            查看平台能力与连接要求
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {platforms.map((p) => (
              <div key={p.platform} className="border-t border-zinc-100 pt-3">
                <p className="text-[14px] font-medium text-zinc-800">{p.label}</p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  {p.publishApiAvailable
                    ? "已获得 API 权限，可 OAuth 连接"
                    : "当前平台暂不支持直接发布"}
                </p>
                <p className="mt-2 text-[11px] text-zinc-400">
                  {[
                    p.canPublishText && "文本",
                    p.canPublishImage && "图片",
                    p.canPublishVideo && "视频",
                    p.supportsSchedule && "定时",
                    p.supportsDraft && "草稿",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}

export function ConnectionsHome() {
  const [platforms, setPlatforms] = useState<PlatformCapability[]>([]);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    const [pRes, cRes] = await Promise.all([
      fetch("/api/publish/platforms"),
      fetch("/api/publish/connections"),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setPlatforms(data.platforms ?? []);
    }
    if (cRes.ok) {
      const data = await cRes.json();
      setConnections(data.connections ?? []);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const [pRes, cRes] = await Promise.all([
          fetch("/api/publish/platforms"),
          fetch("/api/publish/connections"),
        ]);
        if (cancelled) return;
        if (pRes.ok) {
          const data = await pRes.json();
          setPlatforms(data.platforms ?? []);
        }
        if (cRes.ok) {
          const data = await cRes.json();
          setConnections(data.connections ?? []);
        }
        const err = new URLSearchParams(window.location.search).get("error");
        if (err === "publish_unsupported" || err === "oauth_denied") {
          setMessage(
            err === "oauth_denied"
              ? "授权已取消或失败，请重新授权连接。"
              : "当前平台暂不支持直接发布"
          );
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const connect = async (platform: string) => {
    setBusy(platform);
    setMessage(null);
    try {
      const res = await fetch("/api/publish/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", platform }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "当前平台暂不支持直接发布");
        await reload();
        return;
      }
      if (data.authorizeUrl) {
        window.location.href = data.authorizeUrl as string;
        return;
      }
      setMessage(data.message ?? "当前平台暂不支持直接发布");
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (connectionId: string) => {
    setBusy(connectionId);
    try {
      await fetch("/api/publish/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", connectionId }),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[800px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="平台连接"
        description="通过官方 OAuth 授权连接发布渠道。不会要求你填写 API Key。"
      />

      {message && (
        <p className="mt-4 text-[14px] text-zinc-600">{message}</p>
      )}

      <section className="mt-8 space-y-3">
        <h2 className={typeStyle.sectionLabel}>内容平台</h2>
        {platforms.map((p) => {
          const conn = connections.find((c) => c.provider === p.platform);
          return (
            <div
              key={p.platform}
              className="flex flex-col gap-3 rounded-xl border border-zinc-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[15px] font-medium text-zinc-800">
                  {p.label}
                </p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  {conn
                    ? `状态：${
                        conn.status === "connected"
                          ? "已连接"
                          : conn.status === "pending"
                            ? "授权中"
                            : conn.status === "error"
                              ? "授权失败"
                              : "未连接"
                      }${conn.displayName ? ` · ${conn.displayName}` : ""}`
                    : p.oauthConfigured
                      ? "可发起官方授权"
                      : "当前平台暂不支持直接发布"}
                </p>
              </div>
              <div className="flex gap-2">
                {conn?.status === "connected" ? (
                  <button
                    type="button"
                    disabled={busy === conn.id}
                    onClick={() => void disconnect(conn.id)}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    断开连接
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === p.platform || !p.oauthConfigured}
                    onClick={() => void connect(p.platform)}
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {busy === p.platform ? "处理中…" : "连接"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-[13px] font-medium text-zinc-400">经营平台</h2>
        <div className="rounded-xl border border-zinc-100 px-4 py-4">
          <p className="text-[15px] font-medium text-zinc-800">Amazon</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Demo 店铺后续开放连接
          </p>
        </div>
        <div className="rounded-xl border border-zinc-100 px-4 py-4">
          <p className="text-[15px] font-medium text-zinc-800">TikTok Shop</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Demo 店铺后续开放连接
          </p>
        </div>
      </section>
    </div>
  );
}
