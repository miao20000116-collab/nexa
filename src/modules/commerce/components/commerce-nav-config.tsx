"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

/** When true, CommerceShell / TikTokShell hide page titles (section headers own them). */
const CommerceEmbeddedContext = createContext(false);

export function CommerceEmbeddedProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CommerceEmbeddedContext.Provider value={true}>
      {children}
    </CommerceEmbeddedContext.Provider>
  );
}

export function useCommerceEmbedded() {
  return useContext(CommerceEmbeddedContext);
}

export type CommerceNavItem = {
  id: string;
  label: string;
  /** Path prefix that should highlight this item (e.g. product detail). */
  pathMatch?: string;
};

export const AMAZON_NAV: CommerceNavItem[] = [
  { id: "overview", label: "经营概览" },
  { id: "products", label: "商品诊断", pathMatch: "/commerce/amazon/products" },
  { id: "selection", label: "选品调研" },
  { id: "compliance", label: "合规风险" },
  { id: "customer", label: "客户洞察" },
  { id: "ads", label: "广告诊断" },
  { id: "profit", label: "利润" },
  { id: "inventory", label: "库存风险" },
  { id: "metrics", label: "指标定义" },
];

export const TIKTOK_NAV: CommerceNavItem[] = [
  { id: "overview", label: "经营概览" },
  { id: "products", label: "商品诊断", pathMatch: "/commerce/tiktok/products" },
  { id: "selection", label: "选品调研" },
  { id: "compliance", label: "合规风险" },
  { id: "customer", label: "客户洞察" },
  { id: "content", label: "内容经营" },
  { id: "creators", label: "达人 / 联盟" },
  { id: "metrics", label: "指标定义" },
];
