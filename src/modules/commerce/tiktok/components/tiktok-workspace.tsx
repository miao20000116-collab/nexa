"use client";

import { CommerceEmbeddedProvider } from "@/modules/commerce/components/commerce-nav-config";
import {
  CommerceNextSectionFab,
  CommerceScrollSection,
} from "@/modules/commerce/components/commerce-side-nav";
import { TikTokOverviewClient } from "@/modules/commerce/tiktok/components/overview-client";
import { TikTokProductsClient } from "@/modules/commerce/tiktok/components/products-client";
import { TikTokSelectionClient } from "@/modules/commerce/tiktok/components/selection-client";
import { TikTokComplianceClient } from "@/modules/commerce/tiktok/components/compliance-client";
import { TikTokCustomerClient } from "@/modules/commerce/tiktok/components/customer-client";
import { TikTokContentClient } from "@/modules/commerce/tiktok/components/content-client";
import { TikTokCreatorsClient } from "@/modules/commerce/tiktok/components/creators-client";
import { TikTokMetricsClient } from "@/modules/commerce/tiktok/components/metrics-client";

const SECTIONS = [
  {
    id: "overview",
    label: "经营概览",
    description: "今天最值得处理的事与店况总览",
    eager: true,
    node: <TikTokOverviewClient />,
  },
  {
    id: "products",
    label: "商品诊断",
    description: "商品表现与问题清单，展开即可诊断，可随时收起",
    eager: true,
    node: <TikTokProductsClient />,
  },
  {
    id: "selection",
    label: "选品调研",
    description: "选品机会与公开证据",
    node: <TikTokSelectionClient />,
  },
  {
    id: "compliance",
    label: "合规风险",
    description: "内容与货盘合规信号",
    node: <TikTokComplianceClient />,
  },
  {
    id: "customer",
    label: "客户洞察",
    description: "客户声音与需求线索",
    eager: true,
    node: <TikTokCustomerClient />,
  },
  {
    id: "content",
    label: "内容经营",
    description: "内容表现与经营动作",
    eager: true,
    node: <TikTokContentClient />,
  },
  {
    id: "creators",
    label: "达人 / 联盟",
    description: "达人与联盟合作线索",
    node: <TikTokCreatorsClient />,
  },
  {
    id: "metrics",
    label: "指标定义",
    description: "本页指标口径说明",
    node: <TikTokMetricsClient />,
  },
] as const;

export function TikTokWorkspace() {
  return (
    <CommerceEmbeddedProvider>
      <div className="space-y-0">
        {SECTIONS.map((s) => (
          <CommerceScrollSection
            key={s.id}
            id={s.id}
            label={s.label}
            description={s.description}
            eager={"eager" in s ? s.eager : false}
          >
            {s.node}
          </CommerceScrollSection>
        ))}
      </div>
      <CommerceNextSectionFab platform="tiktok" />
    </CommerceEmbeddedProvider>
  );
}
