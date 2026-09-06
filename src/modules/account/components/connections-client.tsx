"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BackLink } from "@/components/ui/hierarchy";
import type { ConnectionCatalogItem } from "@/modules/account/types";
import { useSession } from "@/modules/account/components/account-home";

export function ConnectionsCenterClient() {
  const { session } = useSession();
  const [items, setItems] = useState<ConnectionCatalogItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    const res = await fetch("/api/account/connections");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        await reload();
        if (cancelled) return;
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

  const connect = async (provider: string) => {
    if (!session?.authenticated) {
      setMessage("连接平台需要登录。");
      return;
    }
    setBusy(provider);
    setMessage(null);
    try {
      const res = await fetch("/api/publish/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", platform: provider }),
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

  const content = items.filter((i) => i.category === "content");
  const commerce = items.filter((i) => i.category === "commerce");

  return (
    <div className="mx-auto w-full max-w-[800px] px-[var(--nexa-page-pad-x)] py-10">
      <BackLink href="/account">← 返回账户</BackLink>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900">
        连接中心
      </h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-zinc-500">
        通过官方授权连接发布渠道。
      </p>

      {!session?.authenticated && (
        <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          连接平台需要登录。
          <Link href="/account/login?redirect=/account/connections" className="ml-2 underline">
            去登录
          </Link>
        </p>
      )}

      {message && (
        <p className="mt-4 text-[14px] text-zinc-600">{message}</p>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="text-[13px] font-medium text-zinc-400">内容平台</h2>
        {content.map((item) => (
          <ConnectionRow
            key={item.id}
            item={item}
            busy={busy}
            onConnect={() => void connect(item.provider)}
            onDisconnect={() =>
              item.connectionId
                ? void disconnect(item.connectionId)
                : undefined
            }
          />
        ))}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-[13px] font-medium text-zinc-400">跨境电商</h2>
        {commerce.map((item) => (
          <ConnectionRow
            key={item.id}
            item={item}
            busy={busy}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
          />
        ))}
      </section>
    </div>
  );
}

function ConnectionRow({
  item,
  busy,
  onConnect,
  onDisconnect,
}: {
  item: ConnectionCatalogItem;
  busy: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[15px] font-medium text-zinc-800">{item.label}</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          状态：{item.statusLabel}
          {item.isDemo ? " · 演示" : ""}
        </p>
        <p className="mt-1 text-[12px] text-zinc-400">{item.detail}</p>
      </div>
      <div className="flex gap-2">
        {item.isDemo ? null : item.status === "connected" ? (
          <button
            type="button"
            disabled={busy === item.connectionId}
            onClick={onDisconnect}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            断开连接
          </button>
        ) : (
          <button
            type="button"
            disabled={!item.canConnect || busy === item.provider}
            onClick={onConnect}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy === item.provider
              ? "处理中…"
              : item.status === "needs_reauth"
                ? "重新授权"
                : "连接"}
          </button>
        )}
      </div>
    </div>
  );
}

export function PrivacyClient() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-[var(--nexa-page-pad-x)] py-10">
      <BackLink href="/account">← 返回账户</BackLink>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-zinc-900">
        数据与隐私
      </h1>
      <div className="mt-6 space-y-5 text-[14px] leading-relaxed text-zinc-600">
        <p>
          访客可以使用搜索、查看真实结果、临时工作区，并体验 Commerce Demo。相关数据默认按本地/会话范围处理，不保证长期跨设备同步。
        </p>
        <p>
          登录后可长期保存工作区与素材，并连接平台、发布内容。我们不会要求你填写第三方
          API Key；平台连接仅通过官方 OAuth。
        </p>
        <p>
          AI Credits 流水用于追踪用量，不展示 Token。Credits 不会在界面绑定到某个具体模型。
        </p>
        <p>
          跨境演示店仅供体验，不会显示为「已连接」。
        </p>
      </div>
    </div>
  );
}
