/**
 * User-facing Chinese labels for commerce metrics & status.
 * Keep code enums / API keys in English; display via these helpers.
 */

export const METRIC_LABEL = {
  sessions: "访问量",
  orders: "订单",
  sales: "销售额",
  gmv: "成交额",
  cvr: "转化率",
  aov: "客单价",
  acos: "广告成本比",
  roas: "广告回报",
  adSpend: "广告花费",
  adSales: "广告销售额",
  clicks: "点击",
  views: "播放",
  listing: "商品页",
  fba: "亚马逊物流",
  cogs: "销货成本",
  videoGmv: "视频归因成交额",
  creatorGmv: "达人成交额",
  sku: "货号",
  asin: "商品编号",
} as const;

export function connectionStatusLabel(status: string): string {
  switch (status) {
    case "Connected":
      return "已接入";
    case "Not Connected":
      return "未接入";
    default:
      return status;
  }
}

export function marketplaceLabel(marketplace: string): string {
  const map: Record<string, string> = {
    "Amazon US": "亚马逊美国",
    "Amazon UK": "亚马逊英国",
    "Amazon DE": "亚马逊德国",
    "TikTok US": "TikTok 美国",
    US: "美国",
    UK: "英国",
    DE: "德国",
  };
  return map[marketplace] || marketplace;
}

export function competitionLevelLabel(level: string): string {
  const key = level.trim().toLowerCase();
  if (key === "high") return "高";
  if (key === "medium") return "中";
  if (key === "low") return "低";
  return level;
}
