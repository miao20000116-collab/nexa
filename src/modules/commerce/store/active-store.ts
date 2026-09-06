/**
 * Active Commerce Store selection (V4.5-G).
 * Cookie is store id only — never tokens.
 */

import { cookies } from "next/headers";
import {
  connectionStatusLabel,
  marketplaceLabel,
} from "@/modules/commerce/lib/metric-labels";
import {
  COMMERCE_STORES,
  DEFAULT_AMAZON_STORE_ID,
  DEFAULT_TIKTOK_STORE_ID,
  getStoreById,
} from "./catalog";
import { hasLiveCommerceCredentials } from "./secrets";
import type { CommerceStoreContext, CommerceStoreRecord } from "./types";

export const ACTIVE_STORE_COOKIE = "nexa_commerce_store_id";

function resolveStatus(store: CommerceStoreRecord): CommerceStoreRecord {
  if (!store.liveApiSupported) {
    return { ...store, connectionStatus: "Not Connected" };
  }
  if (hasLiveCommerceCredentials(store.id)) {
    return { ...store, connectionStatus: "Connected" };
  }
  return { ...store, connectionStatus: "Not Connected" };
}

export function listCommerceStoresResolved(): CommerceStoreRecord[] {
  return COMMERCE_STORES.map(resolveStatus);
}

export async function getActiveStoreId(
  preferredPlatform?: "Amazon" | "TikTok Shop"
): Promise<string> {
  const jar = await cookies();
  const raw = jar.get(ACTIVE_STORE_COOKIE)?.value?.trim();
  if (raw && getStoreById(raw)) {
    const store = getStoreById(raw)!;
    if (!preferredPlatform || store.platform === preferredPlatform) {
      return raw;
    }
  }
  return preferredPlatform === "TikTok Shop"
    ? DEFAULT_TIKTOK_STORE_ID
    : DEFAULT_AMAZON_STORE_ID;
}

export async function setActiveStoreId(storeId: string): Promise<boolean> {
  const store = getStoreById(storeId);
  if (!store) return false;
  const jar = await cookies();
  jar.set(ACTIVE_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

export async function getActiveStoreContext(
  preferredPlatform?: "Amazon" | "TikTok Shop"
): Promise<CommerceStoreContext> {
  const id = await getActiveStoreId(preferredPlatform);
  const store = resolveStatus(getStoreById(id) || COMMERCE_STORES[0]);
  return {
    storeId: store.id,
    platform: store.platform,
    marketplace: store.marketplace,
    country: store.country,
    currency: store.currency,
    connectionStatus: store.connectionStatus,
    isDemo: store.demoAvailable && store.connectionStatus !== "Connected",
    dataKey: store.dataKey,
    label: store.label,
  };
}

export function formatStoreContextLine(ctx: CommerceStoreContext): string {
  return `店铺：${ctx.storeId} · ${ctx.platform} · ${marketplaceLabel(ctx.marketplace)} · ${ctx.country} · ${ctx.currency} · ${connectionStatusLabel(ctx.connectionStatus)}${ctx.isDemo ? " · 演示数据" : ""}`;
}
