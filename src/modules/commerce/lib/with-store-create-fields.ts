/**
 * Attach active Commerce Store fields into create-context builders.
 */

import { getActiveStoreContext } from "@/modules/commerce/store/active-store";
import type { CommercePlatform } from "@/modules/commerce/store/types";
import type { CommerceCreateContextInput } from "./commerce-create-context";

type CreateContextExtras = {
  listingWeaknesses?: string[];
  complianceRisks?: string[];
  adsNotes?: string[];
  audience?: string;
  opportunity?: string;
  researchSummary?: string;
  contentGoal?: string;
  productId?: string;
  diagnosis?: string;
};

export async function withStoreCreateFields(
  platform: CommercePlatform,
  input: Omit<
    CommerceCreateContextInput,
    | "storeId"
    | "storeMarketplace"
    | "storeCountry"
    | "storeCurrency"
    | "storeConnectionStatus"
  > &
    CreateContextExtras
): Promise<CommerceCreateContextInput & CreateContextExtras> {
  const store = await getActiveStoreContext(platform);
  return {
    ...input,
    storeId: store.storeId,
    storeMarketplace: store.marketplace,
    storeCountry: store.country,
    storeCurrency: store.currency,
    storeConnectionStatus: store.connectionStatus,
  };
}
