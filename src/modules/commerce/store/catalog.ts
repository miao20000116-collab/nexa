/**
 * Commerce store catalog (V4.5-G).
 * Amazon US/UK/DE + TikTok US — each with isolated dataKey.
 */

import type { CommerceStoreRecord } from "./types";

/**
 * Initial stores. Live API not wired → Not Connected (never Fake Connected).
 * Demo data is available separately via demoAvailable.
 */
export const COMMERCE_STORES: CommerceStoreRecord[] = [
  {
    id: "store_amazon_us",
    platform: "Amazon",
    marketplace: "Amazon US",
    country: "US",
    currency: "USD",
    dataKey: "demo_store_us_01",
    label: "亚马逊美国 · 演示",
    liveApiSupported: false,
    connectionStatus: "Not Connected",
    demoAvailable: true,
  },
  {
    id: "store_amazon_uk",
    platform: "Amazon",
    marketplace: "Amazon UK",
    country: "UK",
    currency: "GBP",
    dataKey: "demo_store_uk_01",
    label: "亚马逊英国 · 演示",
    liveApiSupported: false,
    connectionStatus: "Not Connected",
    demoAvailable: true,
  },
  {
    id: "store_amazon_de",
    platform: "Amazon",
    marketplace: "Amazon DE",
    country: "DE",
    currency: "EUR",
    dataKey: "demo_store_de_01",
    label: "亚马逊德国 · 演示",
    liveApiSupported: false,
    connectionStatus: "Not Connected",
    demoAvailable: true,
  },
  {
    id: "store_tiktok_us",
    platform: "TikTok Shop",
    marketplace: "TikTok US",
    country: "US",
    currency: "USD",
    dataKey: "tiktok_demo_store_us_01",
    label: "TikTok 美国 · 演示",
    liveApiSupported: false,
    connectionStatus: "Not Connected",
    demoAvailable: true,
  },
];

export const DEFAULT_AMAZON_STORE_ID = "store_amazon_us";
export const DEFAULT_TIKTOK_STORE_ID = "store_tiktok_us";

export function getStoreById(id: string): CommerceStoreRecord | null {
  return COMMERCE_STORES.find((s) => s.id === id) ?? null;
}

export function listStores(platform?: "Amazon" | "TikTok Shop"): CommerceStoreRecord[] {
  if (!platform) return [...COMMERCE_STORES];
  return COMMERCE_STORES.filter((s) => s.platform === platform);
}

export function assertNeverFakeConnected(store: CommerceStoreRecord): void {
  if (!store.liveApiSupported && store.connectionStatus === "Connected") {
    throw new Error(
      `[commerce-store] Forbidden: Fake Connected for ${store.id}`
    );
  }
}
