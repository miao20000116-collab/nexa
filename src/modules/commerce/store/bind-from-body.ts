import { resolveCommerceStoreContext } from "@/modules/commerce/store";
import type { CommercePlatform, CommerceStoreContext } from "@/modules/commerce/store/types";

/** Bind optional body.storeId before running Commerce AI capabilities. */
export async function bindStoreFromBody(
  body: Record<string, unknown>,
  platform: CommercePlatform
): Promise<CommerceStoreContext> {
  const storeId =
    typeof body.storeId === "string" && body.storeId.trim()
      ? body.storeId.trim()
      : undefined;
  return resolveCommerceStoreContext({ storeId, platform });
}
