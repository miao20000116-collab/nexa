"use client";

import { TikTokShell } from "@/modules/commerce/tiktok/components/shell";
import { CommerceMetricDefinitionsPage } from "@/modules/commerce/components/metric-glossary";

export function TikTokMetricsClient() {
  return (
    <TikTokShell
      title="指标定义"
      description="跨境各页指标的统一口径与计算方式。"
    >
      <CommerceMetricDefinitionsPage channel="all" />
    </TikTokShell>
  );
}
