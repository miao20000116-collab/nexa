"use client";

import { useSearchParams } from "next/navigation";
import { TikTokShell } from "@/modules/commerce/tiktok/components/shell";
import { CustomerIntelligencePanel } from "@/modules/commerce/components/customer-intelligence-panel";
import { PageAiHistory } from "@/modules/ai-workbench/components/page-ai-history";

export function TikTokCustomerClient() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") || "7";
  const productTitle = searchParams.get("product") || "";
  const productId = searchParams.get("productId") || undefined;

  return (
    <TikTokShell
      title="客户洞察"
      description="差评与消息聚类 → 痛点 → 本土化回复 → 商品诊断 / 创作。非完整客服系统。"
      range={range}
    >
      <CustomerIntelligencePanel
        channel="tiktok"
        platform="TikTok Shop"
        productTitle={productTitle || undefined}
        productId={productId}
      />
      <PageAiHistory pageKey="commerce.tiktok.customer" />
    </TikTokShell>
  );
}
