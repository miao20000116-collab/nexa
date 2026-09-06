import { UI } from "@/lib/ui-copy";
import { commerceCreateHref } from "@/modules/commerce/intelligence/types";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import {
  buildPeriodWindow,
  formatCvr,
  formatMoney,
  formatNumber,
  inRange,
  metricValue,
  parseRangeDays,
  safeRate,
  sumBy,
} from "./metrics";
import { loadTikTokDemoStore } from "./repository";
import type {
  DiagnosisBlock,
  TikTokContentView,
  TikTokCreatorsView,
  TikTokDailyPoint,
  TikTokOverview,
  TikTokProductDiagnosis,
  TikTokProductMetrics,
  TikTokVideoRow,
} from "./types";
import type { TikTokSeedDaily, TikTokSeedProduct, TikTokSeedStore } from "./demo-seed";

function filterDaily(metrics: TikTokSeedDaily[], start: string, end: string) {
  return metrics.filter((m) => inRange(m.date, start, end));
}

function buildProductSeries(
  product: TikTokSeedProduct,
  start: string,
  end: string
): TikTokDailyPoint[] {
  return filterDaily(product.metrics, start, end)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({
      date: m.date,
      gmv: m.gmv,
      orders: m.orders,
      exposure: m.exposure,
      clicks: m.clicks,
      cvr: m.clicks > 0 ? m.orders / m.clicks : 0,
      videoGmv: m.videoGmv,
      creatorGmv: m.creatorGmv,
    }));
}

function buildStoreSeries(
  store: TikTokSeedStore,
  start: string,
  end: string
): TikTokDailyPoint[] {
  const byDate = new Map<
    string,
    {
      gmv: number;
      orders: number;
      exposure: number;
      clicks: number;
      videoGmv: number;
      creatorGmv: number;
    }
  >();
  for (const product of store.products) {
    for (const m of filterDaily(product.metrics, start, end)) {
      const row = byDate.get(m.date) ?? {
        gmv: 0,
        orders: 0,
        exposure: 0,
        clicks: 0,
        videoGmv: 0,
        creatorGmv: 0,
      };
      row.gmv += m.gmv;
      row.orders += m.orders;
      row.exposure += m.exposure;
      row.clicks += m.clicks;
      row.videoGmv += m.videoGmv;
      row.creatorGmv += m.creatorGmv;
      byDate.set(m.date, row);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      gmv: row.gmv,
      orders: row.orders,
      exposure: row.exposure,
      clicks: row.clicks,
      cvr: row.clicks > 0 ? row.orders / row.clicks : 0,
      videoGmv: row.videoGmv,
      creatorGmv: row.creatorGmv,
    }));
}

function aggregateProduct(
  product: TikTokSeedProduct,
  days: 7 | 30 | 90,
  anchor: string
): TikTokProductMetrics {
  const period = buildPeriodWindow(anchor, days);
  const cur = filterDaily(product.metrics, period.currentStart, period.currentEnd);
  const prev = filterDaily(
    product.metrics,
    period.previousStart,
    period.previousEnd
  );

  const curGmv = sumBy(cur, (m) => m.gmv);
  const prevGmv = sumBy(prev, (m) => m.gmv);
  const curOrders = sumBy(cur, (m) => m.orders);
  const prevOrders = sumBy(prev, (m) => m.orders);
  const curExposure = sumBy(cur, (m) => m.exposure);
  const prevExposure = sumBy(prev, (m) => m.exposure);
  const curClicks = sumBy(cur, (m) => m.clicks);
  const prevClicks = sumBy(prev, (m) => m.clicks);
  const curVideoGmv = sumBy(cur, (m) => m.videoGmv);
  const prevVideoGmv = sumBy(prev, (m) => m.videoGmv);
  const curCreatorGmv = sumBy(cur, (m) => m.creatorGmv);
  const prevCreatorGmv = sumBy(prev, (m) => m.creatorGmv);

  return {
    id: product.id,
    productId: product.productId,
    sku: product.sku,
    title: product.title,
    category: product.category,
    problemProfile: product.problemProfile,
    price: product.price,
    gmv: metricValue(curGmv, prevGmv),
    orders: metricValue(curOrders, prevOrders),
    exposure: metricValue(curExposure, prevExposure),
    clicks: metricValue(curClicks, prevClicks),
    cvr: metricValue(
      safeRate(curOrders, curClicks) ?? 0,
      safeRate(prevOrders, prevClicks) ?? 0
    ),
    videoGmv: metricValue(curVideoGmv, prevVideoGmv),
    creatorGmv: metricValue(curCreatorGmv, prevCreatorGmv),
  };
}

function videoRowsForPeriod(
  store: TikTokSeedStore,
  start: string,
  end: string
): TikTokVideoRow[] {
  const rows: TikTokVideoRow[] = [];
  for (const video of store.videos) {
    const product = store.products.find((p) => p.videoIds.includes(video.id));
    if (!product) continue;
    const days = video.dailies.filter((d) => inRange(d.date, start, end));
    const views = sumBy(days, (d) => d.views);
    const productClicks = sumBy(days, (d) => d.productClicks);
    const orders = sumBy(days, (d) => d.orders);
    const gmv = sumBy(days, (d) => d.gmv);
    const creator = store.creators.find((c) => c.id === video.creatorId);
    rows.push({
      id: video.id,
      title: video.title,
      theme: video.theme,
      productId: product.id,
      productTitle: product.title,
      creatorHandle: creator?.handle ?? null,
      views,
      productClicks,
      orders,
      gmv,
      cvr: safeRate(orders, productClicks),
      viewsRank: 0,
      cvrRank: 0,
    });
  }

  const byViews = [...rows].sort((a, b) => b.views - a.views);
  const byCvr = [...rows].sort(
    (a, b) => (b.cvr ?? -1) - (a.cvr ?? -1)
  );
  for (const row of rows) {
    row.viewsRank = byViews.findIndex((r) => r.id === row.id) + 1;
    row.cvrRank = byCvr.findIndex((r) => r.id === row.id) + 1;
  }
  return rows.sort((a, b) => b.gmv - a.gmv);
}

function findContentInsight(videos: TikTokVideoRow[]) {
  if (videos.length < 2) return null;
  // Opportunity: not #1 by views, but #1 by product 转化率
  const bestCvr = [...videos].sort((a, b) => (b.cvr ?? -1) - (a.cvr ?? -1))[0];
  if (!bestCvr || bestCvr.viewsRank === 1) {
    // fallback: theme 机场旅行 if present
    const travel = videos.find((v) => v.theme.includes("旅行") || v.theme.includes("机场"));
    if (!travel) return null;
    return {
      title: `${travel.theme}主题视频`,
      detail: `播放量排名第 ${travel.viewsRank}，但商品转化率 为 ${formatCvr(travel.cvr)}（排名第 ${travel.cvrRank}）。这是内容增长机会。`,
      videoId: travel.id,
      productId: travel.productId,
    };
  }
  return {
    title: `${bestCvr.theme}主题视频`,
    detail: `播放量不是最高（第 ${bestCvr.viewsRank}），但商品转化率 最高（${formatCvr(bestCvr.cvr)}）。这是内容增长机会。`,
    videoId: bestCvr.id,
    productId: bestCvr.productId,
  };
}

export async function getTikTokOverview(
  rangeRaw?: string | null
): Promise<TikTokOverview> {
  const store = await loadTikTokDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const products = store.products.map((p) =>
    aggregateProduct(p, days, store.anchorDate)
  );

  const totals = {
    gmv: metricValue(
      sumBy(products, (p) => p.gmv.current),
      sumBy(products, (p) => p.gmv.previous)
    ),
    orders: metricValue(
      sumBy(products, (p) => p.orders.current),
      sumBy(products, (p) => p.orders.previous)
    ),
    exposure: metricValue(
      sumBy(products, (p) => p.exposure.current),
      sumBy(products, (p) => p.exposure.previous)
    ),
    clicks: metricValue(
      sumBy(products, (p) => p.clicks.current),
      sumBy(products, (p) => p.clicks.previous)
    ),
    cvr: metricValue(
      safeRate(
        sumBy(products, (p) => p.orders.current),
        sumBy(products, (p) => p.clicks.current)
      ) ?? 0,
      safeRate(
        sumBy(products, (p) => p.orders.previous),
        sumBy(products, (p) => p.clicks.previous)
      ) ?? 0
    ),
    videoGmv: metricValue(
      sumBy(products, (p) => p.videoGmv.current),
      sumBy(products, (p) => p.videoGmv.previous)
    ),
    creatorGmv: metricValue(
      sumBy(products, (p) => p.creatorGmv.current),
      sumBy(products, (p) => p.creatorGmv.previous)
    ),
  };

  const videos = videoRowsForPeriod(
    store,
    period.currentStart,
    period.currentEnd
  );

  return {
    isDemo: true,
    storeName: store.name,
    marketplace: store.marketplace,
    currency: store.currency,
    period,
    totals,
    products,
    contentInsight: findContentInsight(videos),
    series: buildStoreSeries(store, period.currentStart, period.currentEnd),
  };
}

export async function listTikTokProducts(rangeRaw?: string | null) {
  const overview = await getTikTokOverview(rangeRaw);
  return {
    isDemo: true as const,
    period: overview.period,
    products: overview.products,
  };
}

async function buildDiagnosis(
  product: TikTokSeedProduct,
  metrics: TikTokProductMetrics,
  videos: TikTokVideoRow[]
): Promise<{
  diagnosis: DiagnosisBlock;
  intelligence: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
  demoStoreLabel: string;
}> {
  const { analyzeTikTokProduct } = await import(
    "@/modules/commerce/intelligence/tiktok-analyzer"
  );

  // Instant rule diagnosis — do not await LLM on page open.
  const baseIntel = analyzeTikTokProduct({
    product: metrics,
    videos,
    complianceFlags: product.complianceFlags,
    claimRisks: product.claimRisks,
    listingWeaknesses: product.listingWeaknesses,
    selection: product.selection,
  });
  const intelligence = {
    ...baseIntel,
    aiAssisted: false as const,
    blockedAi: false as const,
    createdAt: new Date().toISOString(),
  };

  const highCount = intelligence.findings.filter(
    (f) => f.severity === "high"
  ).length;
  const confidence =
    highCount >= 2 ? "high" : highCount === 1 ? "medium" : "low";
  const confidenceLabel =
    confidence === "high" ? "高" : confidence === "medium" ? "中" : "低";

  const productVideos = videos.filter((v) => v.productId === product.id);
  const insight = findContentInsight(productVideos);
  const topCreatorVideo = [...productVideos].sort((a, b) => b.gmv - a.gmv)[0];

  const evidence: DiagnosisBlock["evidence"] = [
    {
      label: "成交额",
      detail: `${formatMoney(metrics.gmv.current)}（上期 ${formatMoney(metrics.gmv.previous)}）`,
      deltaPct: metrics.gmv.deltaPct,
    },
    {
      label: "曝光 / 播放",
      detail: `${formatNumber(metrics.exposure.current)}（上期 ${formatNumber(metrics.exposure.previous)}）`,
      deltaPct: metrics.exposure.deltaPct,
    },
    {
      label: "点击",
      detail: `${formatNumber(metrics.clicks.current)}（上期 ${formatNumber(metrics.clicks.previous)}）`,
      deltaPct: metrics.clicks.deltaPct,
    },
    {
      label: "商品转化率",
      detail: `${formatCvr(metrics.cvr.current)} → 上期 ${formatCvr(metrics.cvr.previous)}`,
      deltaPct: metrics.cvr.deltaPct,
    },
    {
      label: "订单",
      detail: `${formatNumber(metrics.orders.current)}（上期 ${formatNumber(metrics.orders.previous)}）`,
      deltaPct: metrics.orders.deltaPct,
    },
  ];
  if (insight) {
    evidence.push({ label: "内容洞察", detail: insight.detail });
  }
  if (topCreatorVideo) {
    evidence.push({
      label: "表现最好的内容",
      detail: `${topCreatorVideo.title} · 成交额 ${formatMoney(topCreatorVideo.gmv)} · 转化率 ${formatCvr(topCreatorVideo.cvr)}`,
    });
  }

  const nextActions: DiagnosisBlock["nextActions"] = intelligence.actions.map(
    (a) => ({
      label: a.label,
      kind: a.kind === "link" ? "workspace" : a.kind,
      href: a.href,
    })
  );

  if (intelligence.blockedAi) {
    nextActions.push({
      label: "AI 深度解读诊断（增强）",
      kind: "ai",
      blockedAi: true,
    });
  }

  return {
    demoStoreLabel: intelligence.demoStoreLabel,
    intelligence,
    diagnosis: {
      opportunity: intelligence.diagnosis,
      confidence,
      confidenceLabel,
      evidence,
      nextActions,
    },
  };
}

export async function getTikTokProductDiagnosis(
  productKey: string,
  rangeRaw?: string | null
): Promise<TikTokProductDiagnosis | null> {
  const store = await loadTikTokDemoStore();
  const product = store.products.find(
    (p) => p.id === productKey || p.productId === productKey
  );
  if (!product) return null;

  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const metrics = aggregateProduct(product, days, store.anchorDate);
  const videos = videoRowsForPeriod(
    store,
    period.currentStart,
    period.currentEnd
  );

  const built = await buildDiagnosis(product, metrics, videos);

  return {
    isDemo: true,
    demoStoreLabel: built.demoStoreLabel,
    product: metrics,
    period,
    diagnosis: built.diagnosis,
    series: buildProductSeries(product, period.currentStart, period.currentEnd),
    intelligence: built.intelligence,
    listingWeaknesses: product.listingWeaknesses,
    category: product.category,
  };
}

export async function getTikTokContentView(
  rangeRaw?: string | null
): Promise<TikTokContentView> {
  const store = await loadTikTokDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const videos = videoRowsForPeriod(
    store,
    period.currentStart,
    period.currentEnd
  );
  const insight = findContentInsight(videos);

  return {
    isDemo: true,
    period,
    videos,
    insight: insight
      ? {
          title: insight.title,
          detail: insight.detail,
          videoId: insight.videoId,
        }
      : null,
    aiActions: [
      {
        label: "研究 旅行内容趋势并生成洞察",
        blocked: true,
        message: UI.common.aiUnavailable,
      },
      {
        label: "生成 3 条 旅行视频脚本",
        blocked: true,
        message: UI.common.aiUnavailable,
      },
    ],
    nextActions: [
      {
        label: "去搜索：旅行内容趋势",
        kind: "search",
        href: `/search?q=${encodeURIComponent("TikTok 旅行内容趋势 带货")}`,
      },
      {
        label: "去创作：手动写旅行视频",
        kind: "create",
        href: commerceCreateHref({
          goal: "旅行场景短视频：机场 / 通勤便携榨汁",
          context:
            "TikTok 诊断：旅行场景短视频机会；机场/通勤便携榨汁。",
          platform: "TikTok Shop",
        }),
      },
      {
        label: "打开工作区",
        kind: "workspace",
        href: appendReturnNav("/workspace", "TikTok Shop"),
      },
    ],
  };
}

export async function getTikTokCreatorsView(
  rangeRaw?: string | null
): Promise<TikTokCreatorsView> {
  const store = await loadTikTokDemoStore();
  const days = parseRangeDays(rangeRaw);
  const period = buildPeriodWindow(store.anchorDate, days);
  const videos = videoRowsForPeriod(
    store,
    period.currentStart,
    period.currentEnd
  );

  const creators = store.creators.map((c) => {
    const mine = videos.filter((v) => v.creatorHandle === c.handle);
    const gmv = sumBy(mine, (v) => v.gmv);
    const orders = sumBy(mine, (v) => v.orders);
    const clicks = sumBy(mine, (v) => v.productClicks);
    const themeCount = new Map<string, number>();
    for (const v of mine) {
      themeCount.set(v.theme, (themeCount.get(v.theme) ?? 0) + v.gmv);
    }
    const topTheme =
      [...themeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      id: c.id,
      handle: c.handle,
      displayName: c.displayName,
      niche: c.niche,
      videos: mine.length,
      gmv,
      orders,
      cvr: safeRate(orders, clicks),
      topTheme,
    };
  }).sort((a, b) => b.gmv - a.gmv);

  return {
    isDemo: true,
    period,
    creators,
    aiActions: [
      {
        label: "分析哪些内容表现最好、哪些主题值得复制",
        blocked: true,
        message: UI.common.aiUnavailable,
      },
      {
        label: "生成合作 Brief",
        blocked: true,
        message: UI.common.aiUnavailable,
      },
    ],
  };
}

export async function getTikTokSelectionResearch(
  rangeRaw?: string | null
): Promise<{
  isDemo: true;
  demoStoreLabel: string;
  opportunities: Array<{
    productId: string;
    title: string;
    category: string;
    demandScore: number;
    competitionLevel: string;
    marginEstimate: number;
    gapNotes: string;
  }>;
  intelligence: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
}> {
  const store = await loadTikTokDemoStore();
  void rangeRaw;
  const {
    commerceCreateHref,
    commerceSearchHref,
  } = await import("@/modules/commerce/intelligence/types");

  const opportunities = store.products.map((p) => ({
    productId: p.id,
    title: p.title,
    category: p.category,
    demandScore: p.selection.demandScore,
    competitionLevel: p.selection.competitionLevel,
    marginEstimate: p.selection.marginEstimate,
    gapNotes: p.selection.gapNotes,
  }));

  const findings = opportunities.map((o) => ({
    id: `tt_sel_${o.productId}`,
    dimension: "selection" as const,
    problem:
      o.demandScore >= 70
        ? `「${o.title.slice(0, 28)}」内容货盘需求偏强`
        : `「${o.title.slice(0, 28)}」可做达人池差异化`,
    evidence: [
      `需求分 ${o.demandScore} · 竞争 ${o.competitionLevel}`,
      `预估毛利 ${(o.marginEstimate * 100).toFixed(0)}%`,
      o.gapNotes,
    ],
    suggestion: "搜索内容趋势或生成选品/脚本简报。",
    severity:
      o.demandScore >= 70 ? ("positive" as const) : ("medium" as const),
    actions: [
      {
        label: "搜索内容趋势",
        kind: "search" as const,
        intent: "selection" as const,
        href: commerceSearchHref(
          `TikTok Shop ${o.title.slice(0, 30)} 选品 内容趋势`
        ),
      },
      {
        label: "生成选品简报",
        kind: "create" as const,
        intent: "selection" as const,
        href: commerceCreateHref({
          goal: `写 TikTok「${o.title.slice(0, 32)}」选品简报`,
          context: `【演示店】TikTok 选品｜${o.title}\n需求分 ${o.demandScore}\n竞争 ${o.competitionLevel}\n缺口：${o.gapNotes}`,
          platform: "TikTok Shop",
        }),
      },
    ],
  }));

  const top = [...opportunities].sort(
    (a, b) => b.demandScore - a.demandScore
  )[0];

  return {
    isDemo: true,
    demoStoreLabel: "演示数据 · 选品调研",
    opportunities: [...opportunities].sort(
      (a, b) => b.demandScore - a.demandScore
    ),
    intelligence: {
      channel: "tiktok",
      isDemo: true,
      demoStoreLabel: "演示数据 · 选品调研",
      productTitle: top?.title ?? "选品",
      productKey: top?.productId ?? "selection",
      diagnosis: top
        ? `优先验证「${top.title.slice(0, 28)}」需求分 ${top.demandScore}`
        : "暂无机会",
      findings,
      actions: findings.flatMap((f) => f.actions ?? []).slice(0, 4),
      aiAssisted: false,
      blockedAi: false,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function getTikTokComplianceOverview(): Promise<{
  isDemo: true;
  demoStoreLabel: string;
  rows: Array<{
    productId: string;
    title: string;
    flags: string[];
    claimRisks: string[];
    severity: "high" | "medium" | "low";
  }>;
  intelligence: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
}> {
  const store = await loadTikTokDemoStore();
  const {
    commerceCreateHref,
    commerceSearchHref,
  } = await import("@/modules/commerce/intelligence/types");

  const rows = store.products.map((p) => ({
    productId: p.id,
    title: p.title,
    flags: p.complianceFlags,
    claimRisks: p.claimRisks,
    severity: (p.complianceFlags.length
      ? "high"
      : p.claimRisks.length
        ? "medium"
        : "low") as "high" | "medium" | "low",
  }));

  const findings = rows.map((r) => ({
    id: `tt_comp_${r.productId}`,
    dimension: "compliance" as const,
    problem: `「${r.title.slice(0, 28)}」内容合规风险`,
    evidence: r.claimRisks.slice(0, 2),
    suggestion: "改写口播/披露话术，避免平台审核拦截。",
    severity: r.severity,
    actions: [
      {
        label: "搜索平台规则",
        kind: "search" as const,
        intent: "compliance" as const,
        href: commerceSearchHref(
          `TikTok Shop ${r.title.slice(0, 24)} 合规 ${r.flags.join(" ")}`
        ),
      },
      {
        label: "生成合规改写",
        kind: "create" as const,
        intent: "compliance" as const,
        href: commerceCreateHref({
          goal: `合规改写「${r.title.slice(0, 32)}」口播与披露`,
          context: `【演示店】TikTok 合规｜${r.title}\n标记：${r.flags.join("、")}\n风险：${r.claimRisks.join("；")}`,
          platform: "TikTok Shop",
        }),
      },
    ],
  }));

  const high = rows.filter((r) => r.severity === "high").length;
  return {
    isDemo: true,
    demoStoreLabel: "演示数据 · 合规风险",
    rows,
    intelligence: {
      channel: "tiktok",
      isDemo: true,
      demoStoreLabel: "演示数据 · 合规风险",
      productTitle: "内容合规总览",
      productKey: "compliance",
      diagnosis:
        high > 0
          ? `${high} 个货盘存在高优合规风险`
          : "演示店合规风险可控",
      findings,
      actions: findings.flatMap((f) => f.actions ?? []).slice(0, 4),
      aiAssisted: false,
      blockedAi: false,
      createdAt: new Date().toISOString(),
    },
  };
}
