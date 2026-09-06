"use client";

import { type as typeStyle } from "@/lib/ui-hierarchy";

export type GlossaryChannel = "amazon" | "tiktok" | "shared";

export interface MetricDefinition {
  term: string;
  alsoKnownAs?: string;
  definition: string;
  formula: string;
  note?: string;
  channels: GlossaryChannel[];
}

/** Canonical definitions — shown on /commerce/metrics only (not every page). */
export const COMMERCE_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    term: "访问量",
    alsoKnownAs: "Sessions",
    definition: "统计周期内商品详情页被访问的次数（演示店按日汇总）。",
    formula: "访问量 = Σ 每日访问次数",
    channels: ["amazon"],
  },
  {
    term: "订单",
    alsoKnownAs: "Orders",
    definition: "统计周期内完成的订单笔数。",
    formula: "订单 = Σ 每日订单数",
    channels: ["amazon", "tiktok"],
  },
  {
    term: "销售额 / 成交额",
    alsoKnownAs: "Sales / GMV",
    definition:
      "亚马逊侧为销售额；TikTok 小店侧为成交总额。均为周期内成交金额合计。",
    formula: "销售额或成交额 = Σ 每日成交额",
    note: "亚马逊可用「访问量 × 转化率 × 客单价」做分解校验。",
    channels: ["amazon", "tiktok"],
  },
  {
    term: "转化率",
    alsoKnownAs: "CVR",
    definition:
      "亚马逊：订单 ÷ 访问量；TikTok：订单 ÷ 商品点击（商品转化率）。",
    formula: "亚马逊：转化率 = 订单 / 访问量；TikTok：转化率 = 订单 / 点击",
    channels: ["amazon", "tiktok"],
  },
  {
    term: "客单价",
    alsoKnownAs: "AOV",
    definition: "平均每笔订单金额。",
    formula: "客单价 = 销售额 / 订单",
    channels: ["amazon"],
  },
  {
    term: "广告花费",
    alsoKnownAs: "Ad Spend",
    definition: "统计周期内广告投放消耗金额。",
    formula: "广告花费 = Σ 每日广告花费",
    channels: ["amazon"],
  },
  {
    term: "广告销售额",
    alsoKnownAs: "Ad Sales",
    definition: "归因到广告的销售额。",
    formula: "广告销售额 = Σ 每日广告归因销售额",
    channels: ["amazon"],
  },
  {
    term: "广告成本比",
    alsoKnownAs: "ACOS",
    definition: "广告销售成本占比：花多少广告费带来多少广告销售额。",
    formula: "广告成本比 = 广告花费 / 广告销售额",
    note: "越低通常表示广告效率越好（需结合利润一起看）。",
    channels: ["amazon"],
  },
  {
    term: "广告回报",
    alsoKnownAs: "ROAS",
    definition: "单位广告花费带来的广告销售额。",
    formula: "广告回报 = 广告销售额 / 广告花费",
    channels: ["amazon"],
  },
  {
    term: "点击",
    alsoKnownAs: "Clicks",
    definition: "亚马逊为广告点击；TikTok 为商品点击（含内容引导的点击）。",
    formula: "点击 = Σ 每日点击数",
    channels: ["amazon", "tiktok"],
  },
  {
    term: "曝光 / 播放",
    alsoKnownAs: "Exposure / Views",
    definition: "内容或商品被展示、播放的次数。",
    formula: "曝光 = Σ 每日曝光或播放量",
    channels: ["tiktok"],
  },
  {
    term: "视频归因成交额",
    alsoKnownAs: "Video-attributed GMV",
    definition: "可归因到短视频内容的成交额。",
    formula: "视频归因成交额 = Σ 视频带来的成交额",
    channels: ["tiktok"],
  },
  {
    term: "达人成交额",
    alsoKnownAs: "Creator GMV",
    definition: "达人 / 联盟内容贡献的成交额。",
    formula: "达人成交额 = Σ 达人内容带来的成交额",
    channels: ["tiktok"],
  },
  {
    term: "环比变化",
    alsoKnownAs: "Δ%",
    definition: "当前周期相对上一同等长度周期的变化百分比。",
    formula: "变化% = (本期 − 上期) / 上期 × 100%",
    channels: ["shared"],
  },
  {
    term: "预计利润",
    alsoKnownAs: "Estimated Profit",
    definition:
      "演示口径下的粗算利润，非真实财务结算。用于观察成本结构压力。",
    formula:
      "预计利润 = 营收 − 广告花费 − 平台费用 − 亚马逊物流 − 物流 − 退款 − 销货成本",
    note: "亚马逊物流 / 销货成本为行业常用说法；数值为演示估算。",
    channels: ["amazon"],
  },
  {
    term: "平台费用",
    definition: "平台佣金 / 类目相关费用估算。",
    formula: "演示数据按营收比例估算",
    channels: ["amazon"],
  },
  {
    term: "亚马逊物流",
    alsoKnownAs: "FBA",
    definition: "亚马逊物流（Fulfillment by Amazon）相关履约成本估算。",
    formula: "演示数据按订单规模估算",
    channels: ["amazon"],
  },
  {
    term: "销货成本",
    alsoKnownAs: "COGS",
    definition: "商品本身的进货 / 制造成本估算。",
    formula: "演示数据按营收比例估算",
    channels: ["amazon"],
  },
  {
    term: "库存覆盖天数",
    definition: "按近期日均出货节奏估算，当前库存大约还能卖多少天。",
    formula: "覆盖天数 ≈ 当前库存 / 近七日日均出货",
    channels: ["amazon"],
  },
  {
    term: "商品页",
    alsoKnownAs: "Listing",
    definition: "商品详情页的标题、主图、卖点与描述等内容载体。",
    formula: "—",
    channels: ["shared"],
  },
];

function forChannel(channel: "amazon" | "tiktok" | "all") {
  if (channel === "all") return COMMERCE_METRIC_DEFINITIONS;
  return COMMERCE_METRIC_DEFINITIONS.filter(
    (d) => d.channels.includes(channel) || d.channels.includes("shared")
  );
}

/** Full definitions page body (no per-page footer chrome). */
export function CommerceMetricDefinitionsPage({
  channel = "all",
}: {
  channel?: "amazon" | "tiktok" | "all";
}) {
  const rows = forChannel(channel);
  return (
    <section>
      <p className={`mb-6 ${typeStyle.bodyMuted}`}>
        跨境各页出现的名词与数字均按下列标准理解。演示店数据用于作品集说明，非真实店铺结算。
      </p>
      <dl className="space-y-5">
        {rows.map((row) => (
          <div
            key={row.term}
            className="border-b border-zinc-100 pb-5 last:border-0"
          >
            <dt className="text-[15px] font-medium text-zinc-900">
              {row.term}
              {row.alsoKnownAs && (
                <span className="ml-2 text-[12px] font-normal text-zinc-400">
                  {row.alsoKnownAs}
                </span>
              )}
            </dt>
            <dd className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-zinc-600">
              <p>{row.definition}</p>
              <p className="text-zinc-500">
                <span className="text-zinc-400">计算：</span>
                {row.formula}
              </p>
              {row.note && (
                <p className="text-[12px] text-zinc-400">{row.note}</p>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @deprecated Prefer dedicated /metrics page — kept for rare embedded use. */
export function CommerceMetricGlossary({
  channel,
  embedded = false,
}: {
  channel: "amazon" | "tiktok";
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "" : "mt-12 border-t border-zinc-100 pt-8"}>
      <CommerceMetricDefinitionsPage channel={channel} />
    </div>
  );
}
