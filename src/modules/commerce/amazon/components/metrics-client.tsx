"use client";

import { CommerceShell } from "@/modules/commerce/amazon/components/shell";
import { CommerceMetricDefinitionsPage } from "@/modules/commerce/components/metric-glossary";

export function AmazonMetricsClient() {
  return (
    <CommerceShell
      title="指标定义"
      description="跨境各页指标的统一口径与计算方式。"
    >
      <CommerceMetricDefinitionsPage channel="all" />
    </CommerceShell>
  );
}
