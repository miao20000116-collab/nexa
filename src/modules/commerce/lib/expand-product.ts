/**
 * Cross-module: open a product diagnosis accordion on the hub products module.
 */

import { requestCommerceGoto } from "@/modules/commerce/lib/hub-pager";

export const COMMERCE_EXPAND_PRODUCT = "nexa:commerce-expand-product";

export type CommerceExpandProductDetail = {
  productId: string;
  platform: "amazon" | "tiktok";
};

/** Deep link into workspace products section with accordion open. */
export function commerceProductExpandHref(
  platform: "amazon" | "tiktok",
  productId: string
): string {
  const base =
    platform === "amazon" ? "/commerce/amazon" : "/commerce/tiktok";
  return `${base}?expand=${encodeURIComponent(productId)}#products`;
}

export function requestExpandCommerceProduct(
  productId: string,
  platform: "amazon" | "tiktok"
) {
  if (typeof window === "undefined") return;
  requestCommerceGoto("products");
  window.dispatchEvent(
    new CustomEvent<CommerceExpandProductDetail>(COMMERCE_EXPAND_PRODUCT, {
      detail: { productId, platform },
    })
  );
  const el = document.getElementById("products");
  if (!el) {
    try {
      sessionStorage.setItem(
        "nexa_commerce_expand_product",
        JSON.stringify({ productId, platform })
      );
    } catch {
      /* ignore */
    }
    window.location.assign(commerceProductExpandHref(platform, productId));
  }
}

export function consumePendingExpandProduct(
  platform: "amazon" | "tiktok"
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("nexa_commerce_expand_product");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommerceExpandProductDetail;
    if (parsed.platform !== platform) return null;
    sessionStorage.removeItem("nexa_commerce_expand_product");
    return parsed.productId;
  } catch {
    return null;
  }
}
