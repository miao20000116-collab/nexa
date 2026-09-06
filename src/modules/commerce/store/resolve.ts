/**
 * Resolve Commerce Store for AI / API requests (V4.5-G).
 */

import {
  getActiveStoreContext,
  setActiveStoreId,
} from "./active-store";
import { getStoreById } from "./catalog";
import type { CommercePlatform, CommerceStoreContext } from "./types";

export async function resolveCommerceStoreContext(opts?: {
  storeId?: string | null;
  platform?: CommercePlatform;
}): Promise<CommerceStoreContext> {
  if (opts?.storeId) {
    const store = getStoreById(opts.storeId);
    if (!store) {
      throw new Error(`Unknown storeId: ${opts.storeId}`);
    }
    if (opts.platform && store.platform !== opts.platform) {
      throw new Error(
        `Store ${opts.storeId} is ${store.platform}, expected ${opts.platform}`
      );
    }
    await setActiveStoreId(opts.storeId);
  }
  return getActiveStoreContext(opts?.platform);
}

/** Assert product belongs to this store's dataKey (isolation guard). */
export function assertProductBelongsToStore(
  productId: string,
  ctx: CommerceStoreContext
): boolean {
  // US catalog keeps unprefixed seed ids; UK/DE use idPrefix_
  if (ctx.dataKey === "demo_store_us_01") {
    return !productId.startsWith("uk_") && !productId.startsWith("de_");
  }
  if (ctx.dataKey === "demo_store_uk_01") {
    return productId.startsWith("uk_");
  }
  if (ctx.dataKey === "demo_store_de_01") {
    return productId.startsWith("de_");
  }
  if (ctx.platform === "TikTok Shop") {
    return productId.startsWith("tt_") || ctx.dataKey.includes("tiktok");
  }
  return true;
}
