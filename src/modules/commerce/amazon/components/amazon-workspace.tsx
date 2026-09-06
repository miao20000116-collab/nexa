"use client";

import { CommerceEmbeddedProvider } from "@/modules/commerce/components/commerce-nav-config";
import {
  CommerceNextSectionFab,
  CommerceScrollSection,
} from "@/modules/commerce/components/commerce-side-nav";
import { AmazonOverviewClient } from "@/modules/commerce/amazon/components/overview-client";
import { ProductsListClient } from "@/modules/commerce/amazon/components/products-list-client";
import { SelectionClient } from "@/modules/commerce/amazon/components/selection-client";
import { ComplianceClient } from "@/modules/commerce/amazon/components/compliance-client";
import { AmazonCustomerClient } from "@/modules/commerce/amazon/components/customer-client";
import { AdsClient } from "@/modules/commerce/amazon/components/ads-client";
import { ProfitClient } from "@/modules/commerce/amazon/components/profit-client";
import { InventoryClient } from "@/modules/commerce/amazon/components/inventory-client";
import { AmazonMetricsClient } from "@/modules/commerce/amazon/components/metrics-client";

const SECTIONS = [
  {
    id: "overview",
    label: "经营概览",
    description: "今天最值得处理的事与店况总览",
    eager: true,
    node: <AmazonOverviewClient />,
  },
  {
    id: "products",
    label: "商品诊断",
    description: "货号表现与问题清单，展开即可诊断，可随时收起",
    eager: true,
    node: <ProductsListClient />,
  },
  {
    id: "selection",
    label: "选品调研",
    description: "公开证据选品与货盘机会",
    node: <SelectionClient />,
  },
  {
    id: "compliance",
    label: "合规风险",
    description: "跨货号合规与侵权信号",
    node: <ComplianceClient />,
  },
  {
    id: "customer",
    label: "客户洞察",
    description: "评论与购买理由里的客户声音",
    eager: true,
    node: <AmazonCustomerClient />,
  },
  {
    id: "ads",
    label: "广告诊断",
    description: "广告效率与投放问题",
    eager: true,
    node: <AdsClient />,
  },
  {
    id: "profit",
    label: "利润",
    description: "成本结构与利润压力",
    eager: true,
    node: <ProfitClient />,
  },
  {
    id: "inventory",
    label: "库存风险",
    description: "断货与积压风险",
    eager: true,
    node: <InventoryClient />,
  },
  {
    id: "metrics",
    label: "指标定义",
    description: "本页指标口径说明",
    node: <AmazonMetricsClient />,
  },
] as const;

export function AmazonWorkspace() {
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
      <CommerceNextSectionFab platform="amazon" />
    </CommerceEmbeddedProvider>
  );
}
