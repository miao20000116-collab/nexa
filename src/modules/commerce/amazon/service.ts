import type { SeedDailyMetric, SeedProduct, SeedStore } from "./demo-seed";
import {
  buildPeriodWindow,
  decomposeSales,
  inRange,
  metricValue,
  parseRangeDays,
  safeRate,
  sumBy,
} from "./metrics";
import type {
  AdsDiagnosis,
  CommerceDailyPoint,
  CommerceRangeDays,
  ComplianceOverview,
  InventoryView,
  ProductDiagnosis,
  ProductPeriodMetrics,
  ProfitBreakdown,
  SelectionResearchView,
  StoreOverview,
} from "./types";
import { competitionLevelLabel } from "@/modules/commerce/lib/metric-labels";
import { loadDemoStore } from "./repository";
import { getActiveStoreContext } from "@/modules/commerce/store/active-store";
import { commerceProductExpandHref } from "@/modules/commerce/lib/expand-product";

function filterMetrics(metrics: SeedDailyMetric[], start: string, end: string) {
  return metrics.filter((m) => inRange(m.date, start, end));
}

function buildProductSeries(
  product: SeedProduct,
  start: string,
  end: string
): CommerceDailyPoint[] {
  return filterMetrics(product.metrics, start, end)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      date: m.date,
      sales: m.sales,
      sessions: m.sessions,
      orders: m.orders,
      cvr: m.sessions > 0 ? m.orders / m.sessions : 0,
      adSpend: m.adSpend,
    }));
}

function buildStoreSeries(
  store: SeedStore,
  start: string,
  end: string
): CommerceDailyPoint[] {
  const byDate = new Map<
    string,
    { sales: number; sessions: number; orders: number; adSpend: number }
  >();
  for (const product of store.products) {
    for (const m of filterMetrics(product.metrics, start, end)) {
      const row = byDate.get(m.date) ?? {
        sales: 0,
        sessions: 0,
        orders: 0,
        adSpend: 0,
      };
      row.sales += m.sales;
      row.sessions += m.sessions;
      row.orders += m.orders;
      row.adSpend += m.adSpend;
      byDate.set(m.date, row);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      sales: row.sales,
      sessions: row.sessions,
      orders: row.orders,
      cvr: row.sessions > 0 ? row.orders / row.sessions : 0,
      adSpend: row.adSpend,
    }));
}

function aggregateProduct(
  product: SeedProduct,
  days: CommerceRangeDays,
  anchorDate: string
): ProductPeriodMetrics {
  const period = buildPeriodWindow(anchorDate, days);
  const cur = filterMetrics(
    product.metrics,
    period.currentStart,
    period.currentEnd
  );
  const prev = filterMetrics(
    product.metrics,
    period.previousStart,
    period.previousEnd
  );

  const curSessions = sumBy(cur, (m) => m.sessions);
  const prevSessions = sumBy(prev, (m) => m.sessions);
  const curOrders = sumBy(cur, (m) => m.orders);
  const prevOrders = sumBy(prev, (m) => m.orders);
  const curUnits = sumBy(cur, (m) => m.units);
  const prevUnits = sumBy(prev, (m) => m.units);
  const curSales = sumBy(cur, (m) => m.sales);
  const prevSales = sumBy(prev, (m) => m.sales);
  const curAdSpend = sumBy(cur, (m) => m.adSpend);
  const prevAdSpend = sumBy(prev, (m) => m.adSpend);
  const curAdSales = sumBy(cur, (m) => m.adSales);
  const prevAdSales = sumBy(prev, (m) => m.adSales);

  const curCvr = safeRate(curOrders, curSessions) ?? 0;
  const prevCvr = safeRate(prevOrders, prevSessions) ?? 0;
  const curAov = safeRate(curSales, curOrders) ?? 0;
  const prevAov = safeRate(prevSales, prevOrders) ?? 0;
  const curAcos = safeRate(curAdSpend, curAdSales);
  const prevAcos = safeRate(prevAdSpend, prevAdSales);
  const curRoas = safeRate(curAdSales, curAdSpend);
  const prevRoas = safeRate(prevAdSales, prevAdSpend);

  return {
    productId: product.id,
    asin: product.asin,
    sku: product.sku,
    title: product.title,
    category: product.category,
    problemProfile: product.problemProfile,
    price: product.price,
    sessions: metricValue(curSessions, prevSessions),
    orders: metricValue(curOrders, prevOrders),
    units: metricValue(curUnits, prevUnits),
    sales: metricValue(curSales, prevSales),
    cvr: metricValue(curCvr, prevCvr),
    aov: metricValue(curAov, prevAov),
    adSpend: metricValue(curAdSpend, prevAdSpend),
    adSales: metricValue(curAdSales, prevAdSales),
    acos: metricValue(curAcos ?? 0, prevAcos ?? 0),
    roas: metricValue(curRoas ?? 0, prevRoas ?? 0),
    salesDecomposition: {
      current: decomposeSales(curSessions, curOrders, curSales),
      previous: decomposeSales(prevSessions, prevOrders, prevSales),
    },
  };
}

function estimateProfitForPeriod(
  product: SeedProduct,
  start: string,
  end: string
) {
  const rows = filterMetrics(product.metrics, start, end);
  const revenue = sumBy(rows, (m) => m.sales);
  const adSpend = sumBy(rows, (m) => m.adSpend);
  const units = sumBy(rows, (m) => m.units);
  const refund = sumBy(rows, (m) => m.refunds);
  const platformFee = revenue * product.platformFeeRate;
  const fba = units * product.fbaFeePerUnit;
  const logistics = units * product.logisticsFeePerUnit;
  const cogs = units * product.cogs;
  const estimatedProfit =
    revenue - adSpend - platformFee - fba - logistics - refund - cogs;
  return {
    revenue,
    adSpend,
    platformFee,
    fba,
    logistics,
    refund,
    cogs,
    estimatedProfit,
  };
}

export async function getStoreOverview(
  rangeRaw?: string | null
): Promise<StoreOverview> {
  const ctx = await getActiveStoreContext("Amazon");
  const store = await loadDemoStore(ctx.dataKey);
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const products = store.products.map((p) =>
    aggregateProduct(p, days, store.anchorDate)
  );

  const totalsSales = metricValue(
    sumBy(products, (p) => p.sales.current),
    sumBy(products, (p) => p.sales.previous)
  );
  const totalsSessions = metricValue(
    sumBy(products, (p) => p.sessions.current),
    sumBy(products, (p) => p.sessions.previous)
  );
  const totalsOrders = metricValue(
    sumBy(products, (p) => p.orders.current),
    sumBy(products, (p) => p.orders.previous)
  );
  const cvr = metricValue(
    safeRate(totalsOrders.current, totalsSessions.current) ?? 0,
    safeRate(totalsOrders.previous, totalsSessions.previous) ?? 0
  );
  const aov = metricValue(
    safeRate(totalsSales.current, totalsOrders.current) ?? 0,
    safeRate(totalsSales.previous, totalsOrders.previous) ?? 0
  );
  const adSpend = metricValue(
    sumBy(products, (p) => p.adSpend.current),
    sumBy(products, (p) => p.adSpend.previous)
  );
  const adSalesCur = sumBy(products, (p) => p.adSales.current);
  const adSalesPrev = sumBy(products, (p) => p.adSales.previous);
  const acos = metricValue(
    safeRate(adSpend.current, adSalesCur) ?? 0,
    safeRate(adSpend.previous, adSalesPrev) ?? 0
  );

  const profitCur = store.products.map((p) =>
    estimateProfitForPeriod(p, period.currentStart, period.currentEnd)
  );
  const profitPrev = store.products.map((p) =>
    estimateProfitForPeriod(p, period.previousStart, period.previousEnd)
  );
  const estimatedProfit = metricValue(
    sumBy(profitCur, (p) => p.estimatedProfit),
    sumBy(profitPrev, (p) => p.estimatedProfit)
  );

  const alerts = products
    .filter((p) => (p.sales.deltaPct ?? 0) < -5)
    .map((p) => ({
      productId: p.productId,
      title: p.title,
      message:
        (p.sessions.deltaPct ?? 0) >= 0 && (p.cvr.deltaPct ?? 0) < 0
          ? "销售额下降，转化率走弱"
          : (p.sessions.deltaPct ?? 0) < 0
            ? "销售额下降，流量走弱"
            : "销售额下降",
    }));

  return {
    isDemo: true,
    storeId: ctx.storeId,
    storeName: store.name,
    marketplace: store.marketplace,
    currency: store.currency,
    connectionStatus: ctx.connectionStatus,
    period,
    totals: {
      sales: totalsSales,
      sessions: totalsSessions,
      orders: totalsOrders,
      cvr,
      aov,
      adSpend,
      acos,
      estimatedProfit,
    },
    products,
    alerts,
    series: buildStoreSeries(store, period.currentStart, period.currentEnd),
  };
}

export async function listProductMetrics(rangeRaw?: string | null) {
  const overview = await getStoreOverview(rangeRaw);
  return {
    isDemo: true as const,
    period: overview.period,
    products: overview.products,
  };
}

export async function getProductDiagnosis(
  productId: string,
  rangeRaw?: string | null
): Promise<ProductDiagnosis | null> {
  const store = await loadDemoStore();
  const product = store.products.find(
    (p) => p.id === productId || p.asin === productId
  );
  if (!product) return null;

  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const metrics = aggregateProduct(product, days, store.anchorDate);
  return buildDiagnosis(product, metrics, period);
}

async function buildDiagnosis(
  product: SeedProduct,
  metrics: ProductPeriodMetrics,
  period: ReturnType<typeof buildPeriodWindow>
): Promise<ProductDiagnosis> {
  const { analyzeAmazonProduct } = await import(
    "@/modules/commerce/intelligence/amazon-analyzer"
  );

  // Rule engine only on the critical path — AI enrich used to block
  // "查看分析" for seconds while awaiting the LLM.
  const baseIntel = analyzeAmazonProduct({
    title: product.title,
    asin: product.asin,
    productId: product.id,
    problemProfile: product.problemProfile,
    metrics,
    complianceFlags: product.complianceFlags,
    claimRisks: product.claimRisks,
    listingChecklist: product.listingChecklist,
    listingWeaknesses: product.listingWeaknesses,
    bulletGaps: product.bulletGaps,
    mainImageIssues: product.mainImageIssues,
    selection: product.selection,
  });
  const intelligence = {
    ...baseIntel,
    aiAssisted: false as const,
    blockedAi: false as const,
    createdAt: new Date().toISOString(),
  };

  const evidence = [
    {
      label: "访问量",
      current: String(Math.round(metrics.sessions.current)),
      previous: String(Math.round(metrics.sessions.previous)),
      deltaPct: metrics.sessions.deltaPct,
    },
    {
      label: "转化率",
      current: `${(metrics.cvr.current * 100).toFixed(1)}%`,
      previous: `${(metrics.cvr.previous * 100).toFixed(1)}%`,
      deltaPct: metrics.cvr.deltaPct,
    },
    {
      label: "订单",
      current: String(Math.round(metrics.orders.current)),
      previous: String(Math.round(metrics.orders.previous)),
      deltaPct: metrics.orders.deltaPct,
    },
    {
      label: "客单价",
      current: metrics.aov.current.toFixed(2),
      previous: metrics.aov.previous.toFixed(2),
      deltaPct: metrics.aov.deltaPct,
    },
    {
      label: "广告花费",
      current: metrics.adSpend.current.toFixed(2),
      previous: metrics.adSpend.previous.toFixed(2),
      deltaPct: metrics.adSpend.deltaPct,
    },
    {
      label: "广告成本比",
      current: `${(metrics.acos.current * 100).toFixed(1)}%`,
      previous: `${(metrics.acos.previous * 100).toFixed(1)}%`,
      deltaPct: metrics.acos.deltaPct,
    },
    {
      label: "销售额",
      current: metrics.sales.current.toFixed(2),
      previous: metrics.sales.previous.toFixed(2),
      deltaPct: metrics.sales.deltaPct,
      detail: `校验：访问量×转化率×客单价 ≈ ${metrics.salesDecomposition.current.toFixed(2)}`,
    },
  ];

  const nextActions = intelligence.actions.map((a) => ({
    label: a.label,
    kind: a.kind,
    href: a.href,
  }));

  return {
    productId: product.id,
    asin: product.asin,
    title: product.title,
    isDemo: true,
    demoStoreLabel: intelligence.demoStoreLabel,
    period,
    metrics,
    conclusion: intelligence.diagnosis,
    evidence,
    nextActions,
    series: buildProductSeries(product, period.currentStart, period.currentEnd),
    intelligence,
    listingWeaknesses: product.listingWeaknesses,
    listingChecklist: product.listingChecklist,
    category: product.category,
  };
}

export async function getAdsDiagnosis(
  rangeRaw?: string | null
): Promise<AdsDiagnosis> {
  const store = await loadDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);

  const campaignRows = [];
  const termMap = new Map<
    string,
    {
      term: string;
      campaignId: string;
      campaignName: string;
      productId: string;
      spend: number;
      clicks: number;
      orders: number;
      sales: number;
    }
  >();
  const placement = { top: 0, product: 0, rest: 0 };

  let curSpend = 0;
  let prevSpend = 0;
  let curSales = 0;
  let prevSales = 0;
  let curClicks = 0;
  let prevClicks = 0;
  let curOrders = 0;
  let prevOrders = 0;

  for (const product of store.products) {
    for (const campaign of product.campaigns) {
      const curD = campaign.dailies.filter((d) =>
        inRange(d.date, period.currentStart, period.currentEnd)
      );
      const prevD = campaign.dailies.filter((d) =>
        inRange(d.date, period.previousStart, period.previousEnd)
      );

      const spend = sumBy(curD, (d) => d.spend);
      const clicks = sumBy(curD, (d) => d.clicks);
      const impressions = sumBy(curD, (d) => d.impressions);
      const orders = sumBy(curD, (d) => d.orders);
      const sales = sumBy(curD, (d) => d.sales);

      curSpend += spend;
      curSales += sales;
      curClicks += clicks;
      curOrders += orders;
      prevSpend += sumBy(prevD, (d) => d.spend);
      prevSales += sumBy(prevD, (d) => d.sales);
      prevClicks += sumBy(prevD, (d) => d.clicks);
      prevOrders += sumBy(prevD, (d) => d.orders);

      placement.top += sumBy(curD, (d) => d.placementTop);
      placement.product += sumBy(curD, (d) => d.placementProduct);
      placement.rest += sumBy(curD, (d) => d.placementRest);

      campaignRows.push({
        id: campaign.id,
        name: campaign.name,
        productId: product.id,
        productTitle: product.title,
        spend,
        clicks,
        impressions,
        orders,
        sales,
        cvr: safeRate(orders, clicks),
        acos: safeRate(spend, sales),
        roas: safeRate(sales, spend),
      });

      const curTerms = campaign.terms.filter((t) =>
        inRange(t.date, period.currentStart, period.currentEnd)
      );
      for (const t of curTerms) {
        const key = `${campaign.id}::${t.term}`;
        const prev = termMap.get(key) ?? {
          term: t.term,
          campaignId: campaign.id,
          campaignName: campaign.name,
          productId: product.id,
          spend: 0,
          clicks: 0,
          orders: 0,
          sales: 0,
        };
        prev.spend += t.spend;
        prev.clicks += t.clicks;
        prev.orders += t.orders;
        prev.sales += t.sales;
        termMap.set(key, prev);
      }
    }
  }

  const searchTerms = [...termMap.values()]
    .map((t) => ({
      ...t,
      cvr: safeRate(t.orders, t.clicks),
      acos: safeRate(t.spend, t.sales),
      roas: safeRate(t.sales, t.spend),
    }))
    .sort((a, b) => b.spend - a.spend);

  const productAgg = new Map<
    string,
    { productId: string; title: string; spend: number; sales: number }
  >();
  for (const c of campaignRows) {
    const row = productAgg.get(c.productId) ?? {
      productId: c.productId,
      title: c.productTitle,
      spend: 0,
      sales: 0,
    };
    row.spend += c.spend;
    row.sales += c.sales;
    productAgg.set(c.productId, row);
  }

  const placementTotal = placement.top + placement.product + placement.rest;
  const suggestions: string[] = [];
  const waste = searchTerms.filter(
    (t) => t.spend > 20 && (t.orders === 0 || (t.acos ?? 0) > 0.6)
  );
  if (waste.length) {
    suggestions.push(
      `发现 ${waste.length} 个高花费、低转化的搜索词，建议优先排查并收紧投放范围。`
    );
  }
  if ((safeRate(curSpend, curSales) ?? 0) > (safeRate(prevSpend, prevSales) ?? 0)) {
    suggestions.push("整体广告成本比 走高，优先检查自动广告与宽泛词。");
  }
  if (!suggestions.length) {
    suggestions.push("当前区间广告效率相对平稳，可继续观察高花费词与版位结构。");
  }

  const { commerceCreateHref, commerceSearchHref } = await import(
    "@/modules/commerce/intelligence/types"
  );
  const topWaste = waste[0];
  const listingProduct = store.products.find(
    (p) => p.listingWeaknesses?.length
  );
  const actions = [
    ...(waste.length
      ? [
          {
            label: `排查 ${waste.length} 个低效搜索词`,
            kind: "link" as const,
            intent: "ads" as const,
            href: "#terms",
          },
          {
            label: "搜索低效词优化方法",
            kind: "search" as const,
            intent: "ads" as const,
            href: commerceSearchHref(
              topWaste
                ? `亚马逊广告 否定 "${topWaste.term}" 广告成本比 优化`
                : "亚马逊广告 低效词优化 广告成本比"
            ),
          },
        ]
      : []),
    {
      label: "生成广告词 / 商品页承接",
      kind: "create" as const,
      intent: "listing" as const,
      href: commerceCreateHref({
        goal: "根据广告诊断写 商品页承接与购买理由内容",
        context: [
          "【演示店】Amazon 广告行动",
          ...suggestions,
          listingProduct
            ? `商品页弱点：${listingProduct.listingWeaknesses.join("；")}`
            : "",
          topWaste
            ? `高花费低效词示例：${topWaste.term}（花费 $${topWaste.spend.toFixed(2)}）`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        platform: "Amazon",
      }),
    },
    {
      label: "打开选品调研",
      kind: "link" as const,
      intent: "selection" as const,
      href: "/commerce/amazon/selection",
    },
  ];

  return {
    isDemo: true,
    period,
    overview: {
      spend: metricValue(curSpend, prevSpend),
      sales: metricValue(curSales, prevSales),
      clicks: metricValue(curClicks, prevClicks),
      orders: metricValue(curOrders, prevOrders),
      acos: metricValue(
        safeRate(curSpend, curSales) ?? 0,
        safeRate(prevSpend, prevSales) ?? 0
      ),
      roas: metricValue(
        safeRate(curSales, curSpend) ?? 0,
        safeRate(prevSales, prevSpend) ?? 0
      ),
    },
    campaigns: campaignRows.sort((a, b) => b.spend - a.spend),
    searchTerms,
    products: [...productAgg.values()].map((p) => ({
      ...p,
      acos: safeRate(p.spend, p.sales),
      roas: safeRate(p.sales, p.spend),
    })),
    placements: [
      {
        placement: "搜索顶部",
        spend: placement.top,
        sharePct: placementTotal
          ? (placement.top / placementTotal) * 100
          : 0,
      },
      {
        placement: "商品页面",
        spend: placement.product,
        sharePct: placementTotal
          ? (placement.product / placementTotal) * 100
          : 0,
      },
      {
        placement: "其余搜索",
        spend: placement.rest,
        sharePct: placementTotal
          ? (placement.rest / placementTotal) * 100
          : 0,
      },
    ],
    suggestions,
    actions,
  };
}

export async function getProfitBreakdown(
  rangeRaw?: string | null
): Promise<ProfitBreakdown> {
  const store = await loadDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);

  const byProduct = store.products.map((p) => {
    const cur = estimateProfitForPeriod(
      p,
      period.currentStart,
      period.currentEnd
    );
    return {
      productId: p.id,
      title: p.title,
      revenue: cur.revenue,
      costs:
        cur.adSpend +
        cur.platformFee +
        cur.fba +
        cur.logistics +
        cur.refund +
        cur.cogs,
      estimatedProfit: cur.estimatedProfit,
      detail: cur,
    };
  });

  const totals = byProduct.reduce(
    (acc, p) => {
      acc.revenue += p.detail.revenue;
      acc.adSpend += p.detail.adSpend;
      acc.platformFee += p.detail.platformFee;
      acc.fba += p.detail.fba;
      acc.logistics += p.detail.logistics;
      acc.refund += p.detail.refund;
      acc.cogs += p.detail.cogs;
      acc.estimatedProfit += p.detail.estimatedProfit;
      return acc;
    },
    {
      revenue: 0,
      adSpend: 0,
      platformFee: 0,
      fba: 0,
      logistics: 0,
      refund: 0,
      cogs: 0,
      estimatedProfit: 0,
    }
  );

  const prevProfit = sumBy(store.products, (p) =>
    estimateProfitForPeriod(p, period.previousStart, period.previousEnd)
      .estimatedProfit
  );

  return {
    isDemo: true,
    period,
    note: "演示数据 · 预计利润（非财务审计结果）",
    revenue: totals.revenue,
    adSpend: totals.adSpend,
    platformFee: totals.platformFee,
    fba: totals.fba,
    logistics: totals.logistics,
    refund: totals.refund,
    cogs: totals.cogs,
    estimatedProfit: totals.estimatedProfit,
    byProduct: byProduct.map(({ productId, title, revenue, costs, estimatedProfit }) => ({
      productId,
      title,
      revenue,
      costs,
      estimatedProfit,
    })),
    previousEstimatedProfit: prevProfit,
    deltaPct: metricValue(totals.estimatedProfit, prevProfit).deltaPct,
  };
}

export async function getInventoryView(): Promise<InventoryView> {
  const store = await loadDemoStore();
  const days = 14;
  const fromDate = (() => {
    const d = new Date(`${store.anchorDate}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return d.toISOString().slice(0, 10);
  })();

  const rows = store.products.map((p) => {
    const recent = filterMetrics(p.metrics, fromDate, store.anchorDate);
    const unitsSold = sumBy(recent, (m) => m.units);
    const avgDailyUnits = unitsSold / days;
    const unitsOnHand = p.inventory.unitsOnHand;
    const daysOfCover =
      avgDailyUnits > 0 ? unitsOnHand / avgDailyUnits : null;
    let risk: "low" | "medium" | "high" = "low";
    let riskLabel = "健康";
    if (daysOfCover === null) {
      risk = "medium";
      riskLabel = "无法计算（无销量）";
    } else if (daysOfCover < 14) {
      risk = "high";
      riskLabel = "库存覆盖不足";
    } else if (daysOfCover < 30) {
      risk = "medium";
      riskLabel = "需关注补货";
    }

    return {
      productId: p.id,
      asin: p.asin,
      title: p.title,
      unitsOnHand,
      inboundUnits: p.inventory.inboundUnits,
      avgDailyUnits,
      daysOfCover,
      risk,
      riskLabel,
    };
  });

  return { isDemo: true, periodDays: days, rows };
}

export async function getDemoStoreMeta(): Promise<SeedStore> {
  return loadDemoStore();
}

export async function getSelectionResearch(
  rangeRaw?: string | null
): Promise<SelectionResearchView> {
  const store = await loadDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const {
    commerceCreateHref,
    commerceSearchHref,
  } = await import("@/modules/commerce/intelligence/types");
  type IntelligenceFinding =
    import("@/modules/commerce/intelligence/types").IntelligenceFinding;

  const opportunities = store.products.map((p) => ({
    productId: p.id,
    asin: p.asin,
    title: p.title,
    category: p.category,
    demandScore: p.selection.demandScore,
    competitionLevel: p.selection.competitionLevel,
    marginEstimate: p.selection.marginEstimate,
    gapNotes: p.selection.gapNotes,
    comparableAsins: p.selection.comparableAsins,
  }));

  const findings: IntelligenceFinding[] = opportunities.map((o, i) => ({
    id: `sel_${o.productId}`,
    dimension: "selection" as const,
    problem:
      o.demandScore >= 70
        ? `「${o.title.slice(0, 28)}」需求偏强，可验证切入`
        : `「${o.title.slice(0, 28)}」可做差异化细分`,
    evidence: [
      `需求分 ${o.demandScore} · 竞争 ${competitionLevelLabel(o.competitionLevel)}`,
      `预估毛利 ${(o.marginEstimate * 100).toFixed(0)}%`,
      o.gapNotes,
    ],
    suggestion: "用搜索验证细分词与竞品带，再生成选品/商品页 简报。",
    severity:
      o.demandScore >= 70
        ? ("positive" as const)
        : o.competitionLevel === "high"
          ? ("medium" as const)
          : ("low" as const),
    actions: [
      {
        label: "搜索市场机会",
        kind: "search" as const,
        intent: "selection" as const,
        href: commerceSearchHref(
          `${o.title.slice(0, 36)} 市场需求 竞争 价格带 ${o.gapNotes.slice(0, 30)}`
        ),
      },
      {
        label: "生成选品简报",
        kind: "create" as const,
        intent: "selection" as const,
        href: commerceCreateHref({
          goal: `写「${o.title.slice(0, 36)}」选品调研简报`,
          context: `【演示店】Amazon 选品｜${o.title}\nASIN ${o.asin}\n需求分 ${o.demandScore}\n竞争 ${o.competitionLevel}\n毛利 ${(o.marginEstimate * 100).toFixed(0)}%\n缺口：${o.gapNotes}\n可比：${o.comparableAsins.join(", ")}`,
          platform: "Amazon",
        }),
      },
      {
        label: "商品诊断",
        kind: "link" as const,
        href: commerceProductExpandHref("amazon", o.productId),
      },
    ],
  }));

  const top = opportunities.sort((a, b) => b.demandScore - a.demandScore)[0];
  return {
    isDemo: true,
    demoStoreLabel: "演示数据 · 选品调研专家",
    period,
    opportunities: opportunities.sort((a, b) => b.demandScore - a.demandScore),
    intelligence: {
      channel: "amazon",
      isDemo: true,
      demoStoreLabel: "演示数据 · 选品调研专家",
      productTitle: top?.title ?? "选品组合",
      productKey: top?.asin ?? "selection",
      diagnosis: top
        ? `优先验证「${top.title.slice(0, 32)}」：需求分 ${top.demandScore}`
        : "暂无选品机会",
      findings,
      actions: findings.flatMap((f) => f.actions ?? []).slice(0, 4),
      aiAssisted: false,
      blockedAi: false,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function getComplianceOverview(): Promise<ComplianceOverview> {
  const store = await loadDemoStore();
  const {
    commerceCreateHref,
    commerceSearchHref,
  } = await import("@/modules/commerce/intelligence/types");
  type IntelligenceFinding =
    import("@/modules/commerce/intelligence/types").IntelligenceFinding;

  const rows = store.products.map((p) => {
    const severity =
      p.complianceFlags.includes("restricted_claim") ||
      p.complianceFlags.includes("ip_risk")
        ? ("high" as const)
        : p.claimRisks.length
          ? ("medium" as const)
          : ("low" as const);
    return {
      productId: p.id,
      asin: p.asin,
      title: p.title,
      flags: p.complianceFlags,
      claimRisks: p.claimRisks,
      checklist: p.listingChecklist,
      severity,
    };
  });

  const findings: IntelligenceFinding[] = rows.map((r) => ({
    id: `comp_${r.productId}`,
    dimension: "compliance" as const,
    problem: `「${r.title.slice(0, 28)}」合规风险`,
    evidence: r.claimRisks.slice(0, 2),
    suggestion: r.checklist.slice(0, 2).join("；") || "完善合规检查清单",
    severity: r.severity,
    actions: [
      {
        label: "搜索平台规则",
        kind: "search" as const,
        intent: "compliance" as const,
        href: commerceSearchHref(
          `Amazon ${r.title.slice(0, 30)} 合规 ${r.flags.join(" ")}`
        ),
      },
      {
        label: "生成合规改写",
        kind: "create" as const,
        intent: "compliance" as const,
        href: commerceCreateHref({
          goal: `合规改写「${r.title.slice(0, 36)}」`,
          context: `【演示店】Amazon 合规｜${r.title}\n标记：${r.flags.join("、")}\n风险：${r.claimRisks.join("；")}\n清单：${r.checklist.join("；")}`,
          platform: "Amazon",
        }),
      },
      {
        label: "商品诊断",
        kind: "link" as const,
        href: commerceProductExpandHref("amazon", r.productId),
      },
    ],
  }));

  const high = rows.filter((r) => r.severity === "high").length;
  return {
    isDemo: true,
    demoStoreLabel: "演示数据 · 合规风险专家",
    rows: rows.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1
    ),
    intelligence: {
      channel: "amazon",
      isDemo: true,
      demoStoreLabel: "演示数据 · 合规风险专家",
      productTitle: "店铺合规总览",
      productKey: "compliance",
      diagnosis:
        high > 0
          ? `${high} 个 SKU 存在高优合规风险，建议先改写话术与图文`
          : "当前演示店合规风险可控，仍建议定期复查",
      findings,
      actions: findings.flatMap((f) => f.actions ?? []).slice(0, 4),
      aiAssisted: false,
      blockedAi: false,
      createdAt: new Date().toISOString(),
    },
  };
}
