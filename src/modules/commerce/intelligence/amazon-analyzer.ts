/**
 * Amazon Demo Store intelligence — rule engine + optional AI enrichment.
 * Never fabricates live account connections.
 */

import type { ProductPeriodMetrics } from "@/modules/commerce/amazon/types";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import {
  commerceCreateHref,
  commerceSearchHref,
  type CommerceIntelligenceReport,
  type IntelligenceAction,
  type IntelligenceFinding,
} from "./types";

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export function analyzeAmazonProduct(input: {
  title: string;
  asin: string;
  productId: string;
  problemProfile: string;
  metrics: ProductPeriodMetrics;
  complianceFlags?: string[];
  claimRisks?: string[];
  listingChecklist?: string[];
  listingWeaknesses?: string[];
  bulletGaps?: string[];
  mainImageIssues?: string[];
  selection?: {
    demandScore: number;
    competitionLevel: string;
    marginEstimate: number;
    gapNotes: string;
    comparableAsins: string[];
  };
}): Omit<
  CommerceIntelligenceReport,
  "aiAssisted" | "blockedAi" | "createdAt"
> {
  const m = input.metrics;
  const findings: IntelligenceFinding[] = [];

  // Traffic (Sessions)
  if ((m.sessions.deltaPct ?? 0) < -5) {
    findings.push({
      id: "amz_traffic_down",
      dimension: "traffic",
      problem: "流量走弱",
      evidence: [
        `访问量 ${Math.round(m.sessions.previous)} → ${Math.round(m.sessions.current)}（${pct(m.sessions.deltaPct)}）`,
        `订单 ${Math.round(m.orders.previous)} → ${Math.round(m.orders.current)}（${pct(m.orders.deltaPct)}）`,
      ],
      suggestion: "优先排查关键词排名、库存覆盖与广告曝光；必要时用搜索研究竞品流量来源。",
      severity: "high",
    });
  } else if ((m.sessions.deltaPct ?? 0) > 5) {
    findings.push({
      id: "amz_traffic_up",
      dimension: "traffic",
      problem: "流量上升",
      evidence: [
        `访问量 ${pct(m.sessions.deltaPct)}`,
        `销售额 ${money(m.sales.current)}（${pct(m.sales.deltaPct)}）`,
      ],
      suggestion: "流量改善时重点盯紧转化与 广告成本比，避免无效点击吞噬利润。",
      severity: "positive",
    });
  }

  // Conversion (转化率)
  if ((m.cvr.deltaPct ?? 0) < -5) {
    findings.push({
      id: "amz_cvr_down",
      dimension: "conversion",
      problem: "转化率下降",
      evidence: [
        `转化率 ${(m.cvr.previous * 100).toFixed(1)}% → ${(m.cvr.current * 100).toFixed(1)}%（${pct(m.cvr.deltaPct)}）`,
        `访问量×转化率×客单价 ≈ ${m.salesDecomposition.current.toFixed(2)}（销售分解校验）`,
      ],
      suggestion: "优化 商品页主图/卖点/评价痛点；搜索用户反馈与竞品差异后再进入创作。",
      severity: "high",
    });
  }

  // 客单价
  if ((m.aov.deltaPct ?? 0) < -3) {
    findings.push({
      id: "amz_aov_down",
      dimension: "aov",
      problem: "客单价（客单价）下行",
      evidence: [
        `客单价 ${money(m.aov.previous)} → ${money(m.aov.current)}（${pct(m.aov.deltaPct)}）`,
        `销售额 ${money(m.sales.current)}`,
      ],
      suggestion: "检查折扣/Bundles/凑单策略是否压低客单；评估是否可做配件组合提升 客单价。",
      severity: "medium",
    });
  } else if ((m.aov.deltaPct ?? 0) > 3) {
    findings.push({
      id: "amz_aov_up",
      dimension: "aov",
      problem: "客单价提升",
      evidence: [`客单价 ${pct(m.aov.deltaPct)}`],
      suggestion: "保持高客单结构的同时验证转化是否被价格拖累。",
      severity: "positive",
    });
  }

  // Ads (广告成本比 / Spend)
  if ((m.acos.deltaPct ?? 0) > 8 || m.acos.current > 0.4) {
    findings.push({
      id: "amz_ads_acos",
      dimension: "ads",
      problem: "广告效率承压（广告成本比）",
      evidence: [
        `广告花费 ${money(m.adSpend.current)}（${pct(m.adSpend.deltaPct)}）`,
        `广告成本比 ${(m.acos.current * 100).toFixed(1)}%（${pct(m.acos.deltaPct)}）`,
        `广告销售额 ${money(m.adSales.current)}`,
      ],
      suggestion: "收紧低效词、提高高转化词出价；结合搜索研究竞品出价与 商品页承接。",
      severity: "high",
      actions: [
        {
          label: "查看广告诊断",
          kind: "link",
          intent: "ads",
          href: "/commerce/amazon/ads",
        },
        {
          label: "生成广告词/商品页简报",
          kind: "create",
          intent: "ads",
          href: commerceCreateHref({
            goal: `基于广告成本比压力优化「${input.title.slice(0, 40)}」广告词与商品页`,
            context: `【演示店】亚马逊广告｜${input.title}\n广告成本比 ${(m.acos.current * 100).toFixed(1)}%\n商品页弱点：${(input.listingWeaknesses ?? []).join("；")}`,
            platform: "Amazon",
          }),
        },
      ],
    });
  } else if ((m.adSpend.deltaPct ?? 0) > 10 && (m.sales.deltaPct ?? 0) < 0) {
    findings.push({
      id: "amz_ads_spend_up_sales_down",
      dimension: "ads",
      problem: "广告花费上升但销售额未同步改善",
      evidence: [
        `广告花费 ${pct(m.adSpend.deltaPct)}`,
        `销售额 ${pct(m.sales.deltaPct)}`,
      ],
      suggestion: "暂停烧钱词，优先复盘投放与落地页一致性。",
      severity: "medium",
    });
  }

  // Product overall sales
  if ((m.sales.deltaPct ?? 0) < -3) {
    findings.push({
      id: "amz_product_sales",
      dimension: "product",
      problem: "商品销售额下降",
      evidence: [
        `销售额 ${money(m.sales.previous)} → ${money(m.sales.current)}（${pct(m.sales.deltaPct)}）`,
        `问题画像：${input.problemProfile}`,
      ],
      suggestion: "按「流量 / 转化 / 客单 / 广告」拆解主因，再决定搜索研究或内容创作动作。",
      severity: "high",
    });
  }

  const shortTitleEarly = input.title.slice(0, 40);

  // Compliance
  if (input.complianceFlags?.length || input.claimRisks?.length) {
    findings.push({
      id: "amz_compliance",
      dimension: "compliance",
      problem: "存在合规 / 侵权风险信号",
      evidence: [
        ...(input.claimRisks ?? []).slice(0, 2),
        `标记：${(input.complianceFlags ?? []).join("、") || "—"}`,
      ],
      suggestion:
        (input.listingChecklist ?? []).slice(0, 2).join("；") ||
        "优先改写高风险话术与图文，避免审核与跟卖投诉。",
      severity: "high",
      actions: [
        {
          label: "搜索平台合规规则",
          kind: "search",
          intent: "compliance",
          href: commerceSearchHref(
            `Amazon ${shortTitleEarly} listing 合规 限制声明 图片政策`
          ),
        },
        {
          label: "生成合规改写",
          kind: "create",
          intent: "compliance",
          href: commerceCreateHref({
            goal: `合规改写「${shortTitleEarly}」商品页话术与图文说明`,
            context: `【演示店】Amazon 合规｜${input.title}\n风险：${(input.claimRisks ?? []).join("；")}\n清单：${(input.listingChecklist ?? []).join("；")}`,
            platform: "Amazon",
          }),
        },
      ],
    });
  }

  // Listing weaknesses
  if (input.listingWeaknesses?.length) {
    findings.push({
      id: "amz_listing",
      dimension: "listing",
      problem: "商品页承接不足，拖累转化/广告效率",
      evidence: [
        ...input.listingWeaknesses.slice(0, 2),
        input.bulletGaps?.length
          ? `Bullet 缺口：${input.bulletGaps.join("、")}`
          : "卖点结构可优化",
      ],
      suggestion: "先修主图与 Bullet，再加广告预算；把弱点写成创作简报。",
      severity: "medium",
      actions: [
        {
          label: "生成商品页优化稿",
          kind: "create",
          intent: "listing",
          href: commerceCreateHref({
            goal: `优化「${shortTitleEarly}」亚马逊商品页 主图与卖点`,
            context: `【演示店】亚马逊商品页｜${input.title}\n弱点：${input.listingWeaknesses.join("；")}\nBullet缺口：${(input.bulletGaps ?? []).join("、")}\n主图问题：${(input.mainImageIssues ?? []).join("、")}`,
            platform: "Amazon",
          }),
        },
        {
          label: "搜索竞品商品页",
          kind: "search",
          intent: "competitor",
          href: commerceSearchHref(`${shortTitleEarly} Amazon 竞品 listing 主图 卖点`),
        },
      ],
    });
  }

  // Selection opportunity (light signal on diagnosis)
  if (input.selection && input.selection.demandScore >= 60) {
    findings.push({
      id: "amz_selection_hint",
      dimension: "selection",
      problem: "类目仍有选品机会可验证",
      evidence: [
        `需求分 ${input.selection.demandScore}`,
        `竞争 ${input.selection.competitionLevel} · 预估毛利 ${(input.selection.marginEstimate * 100).toFixed(0)}%`,
        input.selection.gapNotes,
      ],
      suggestion: "到「选品调研」页做机会对比，或用搜索验证细分词。",
      severity: "positive",
      actions: [
        {
          label: "打开选品调研",
          kind: "link",
          intent: "selection",
          href: "/commerce/amazon/selection",
        },
        {
          label: "搜索细分需求",
          kind: "search",
          intent: "market",
          href: commerceSearchHref(
            `${shortTitleEarly} 细分市场 需求 竞争 ${input.selection.gapNotes.slice(0, 40)}`
          ),
        },
      ],
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "amz_stable",
      dimension: "product",
      problem: "经营表现相对平稳",
      evidence: [
        `销售额 ${pct(m.sales.deltaPct)}`,
        `访问量 ${pct(m.sessions.deltaPct)}`,
        `转化率 ${pct(m.cvr.deltaPct)}`,
      ],
      suggestion: "可主动搜索市场与内容趋势，沉淀可复制的增长实验。",
      severity: "low",
    });
  }

  const diagnosis =
    findings.find((f) => f.severity === "high")?.problem ||
    findings[0]?.problem ||
    "经营表现相对平稳";

  const shortTitle = input.title.slice(0, 40);
  const contextBase = `【演示店】Amazon 诊断｜${input.title}（${input.asin}）｜结论：${diagnosis}`;

  const actions: IntelligenceAction[] = [
    {
      label: "搜索竞品商品页与价格带",
      kind: "search",
      intent: "competitor",
      href: commerceSearchHref(`${shortTitle} Amazon 竞品 listing 价格 评价`),
    },
    {
      label: "搜索市场需求与使用场景",
      kind: "search",
      intent: "market",
      href: commerceSearchHref(`${shortTitle} 市场需求 使用场景 趋势`),
    },
    {
      label: "搜索用户反馈与差评痛点",
      kind: "search",
      intent: "feedback",
      href: commerceSearchHref(`${shortTitle} Amazon 评价 痛点 差评`),
    },
    {
      label: "搜索内容/种草趋势",
      kind: "search",
      intent: "trend",
      href: commerceSearchHref(`${shortTitle} 内容趋势 种草 短视频`),
    },
    {
      label: "基于诊断进入创作",
      kind: "create",
      intent: "create",
      href: commerceCreateHref({
        goal: `基于亚马逊诊断优化「${shortTitle}」内容与商品页卖点`,
        context: `${contextBase}\n证据：${findings
          .flatMap((f) => f.evidence)
          .slice(0, 6)
          .join("；")}\n建议：${findings.map((f) => f.suggestion).join("；")}`,
        platform: "Amazon",
      }),
    },
    {
      label: "打开工作区继续研究",
      kind: "workspace",
      href: appendReturnNav("/workspace", "Amazon"),
    },
  ];

  return {
    channel: "amazon",
    isDemo: true,
    demoStoreLabel: "演示数据",
    productTitle: input.title,
    productKey: input.asin,
    diagnosis,
    findings,
    actions,
  };
}
