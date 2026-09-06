"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  connectionStatusLabel,
  marketplaceLabel,
} from "@/modules/commerce/lib/metric-labels";

type StoreRow = {
  id: string;
  platform: string;
  marketplace: string;
  country: string;
  currency: string;
  connectionStatus: string;
  label: string;
  demoAvailable: boolean;
};

type StoresResponse = {
  stores: StoreRow[];
  active: { storeId: string; label: string; connectionStatus: string };
};

const storeCache = new Map<
  string,
  { stores: StoreRow[]; activeId: string }
>();

export function StoreSwitcher({
  platform,
}: {
  platform: "Amazon" | "TikTok Shop";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cached = storeCache.get(platform);
  const [stores, setStores] = useState<StoreRow[]>(() => cached?.stores ?? []);
  const [activeId, setActiveId] = useState<string>(() => cached?.activeId ?? "");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/commerce/stores?platform=${encodeURIComponent(platform)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        setError("无法加载店铺列表");
        return;
      }
      const data = (await res.json()) as StoresResponse;
      const nextStores = data.stores ?? [];
      const nextActive = data.active?.storeId ?? "";
      storeCache.set(platform, { stores: nextStores, activeId: nextActive });
      setStores(nextStores);
      setActiveId(nextActive);
      setError(null);
    } catch {
      setError("无法加载店铺列表");
    }
  }, [platform]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelect = (storeId: string) => {
    if (!storeId || storeId === activeId) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/commerce/stores", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select", storeId }),
        });
        if (!res.ok) {
          setError("切换店铺失败");
          return;
        }
        const data = (await res.json()) as { active?: { storeId: string } };
        const next = data.active?.storeId ?? storeId;
        setActiveId(next);
        const prev = storeCache.get(platform);
        if (prev) storeCache.set(platform, { ...prev, activeId: next });
        router.refresh();
      } catch {
        setError("切换店铺失败");
      }
    });
  };

  // Fixed footprint — never swap to a short "加载店铺…" label (CLS).
  return (
    <div className="flex min-h-[52px] min-w-[200px] flex-col items-end justify-center gap-1">
      {!stores.length && !error ? (
        <span className="text-[12px] text-zinc-400">加载店铺…</span>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[12px] text-zinc-600">
            <span className="whitespace-nowrap">店铺</span>
            <select
              value={activeId}
              disabled={pending || !stores.length}
              onChange={(e) => onSelect(e.target.value)}
              className="max-w-[220px] rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[12px] text-zinc-800 disabled:opacity-50"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {marketplaceLabel(s.marketplace)} · {s.currency} ·{" "}
                  {connectionStatusLabel(s.connectionStatus)}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <span className="text-[11px] text-red-600">{error}</span>
          ) : (
            <span className="text-[11px] text-zinc-400">
              数据按店铺隔离 · 真实 API 未接入时显示「未接入」
            </span>
          )}
        </>
      )}
    </div>
  );
}
