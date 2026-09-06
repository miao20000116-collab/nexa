/**
 * Deterministic Amazon Demo Store generator.
 * All figures are demonstration data — metrics are derived, never hand-labeled deltas.
 */

export const DEMO_STORE_ID = "demo_store_us_01";
export const DEMO_DAYS = 90;

export type DemoProblemProfile = "cvr_decline" | "traffic_inventory_risk";

export interface SeedDailyMetric {
  date: string; // YYYY-MM-DD
  sessions: number;
  orders: number;
  units: number;
  sales: number;
  adSpend: number;
  adSales: number;
  adClicks: number;
  refunds: number;
  refundUnits: number;
}

export interface SeedAdDaily {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  placementTop: number;
  placementProduct: number;
  placementRest: number;
}

export interface SeedSearchTermDaily {
  term: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

export interface SeedCampaign {
  id: string;
  name: string;
  type: string;
  status: string;
  dailies: SeedAdDaily[];
  terms: SeedSearchTermDaily[];
}

export interface SeedProduct {
  id: string;
  asin: string;
  sku: string;
  title: string;
  category: string;
  price: number;
  cogs: number;
  platformFeeRate: number;
  fbaFeePerUnit: number;
  logisticsFeePerUnit: number;
  problemProfile: DemoProblemProfile;
  metrics: SeedDailyMetric[];
  campaigns: SeedCampaign[];
  inventory: {
    unitsOnHand: number;
    inboundUnits: number;
  };
  /** 选品调研（Demo 专家能力） */
  selection: {
    demandScore: number;
    competitionLevel: "low" | "medium" | "high";
    marginEstimate: number;
    gapNotes: string;
    comparableAsins: string[];
  };
  /** 合规风险 */
  complianceFlags: string[];
  claimRisks: string[];
  listingChecklist: string[];
  /** Listing 弱点 → 行动化 */
  listingWeaknesses: string[];
  bulletGaps: string[];
  mainImageIssues: string[];
}

export interface SeedStore {
  id: string;
  name: string;
  marketplace: string;
  currency: string;
  isDemo: true;
  generatedAt: string;
  anchorDate: string;
  products: SeedProduct[];
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly(d);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function roundInt(n: number) {
  return Math.max(0, Math.round(n));
}

/**
 * Build 90 days ending on anchorDate (inclusive).
 * Portable Blender: sessions up, CVR down → sales down in recent window.
 * Pet Fountain: sessions down + thin inventory → traffic + stockout risk.
 */
export function generateDemoStore(anchorDate?: string): SeedStore {
  const anchor = anchorDate ?? dateOnly(new Date());
  const start = addDays(anchor, -(DEMO_DAYS - 1));

  const blender = buildBlender(start, anchor);
  const fountain = buildFountain(start, anchor);

  return {
    id: DEMO_STORE_ID,
    name: "Nexa 演示店（美国）",
    marketplace: "Amazon US",
    currency: "USD",
    isDemo: true,
    generatedAt: new Date().toISOString(),
    anchorDate: anchor,
    products: [blender, fountain],
  };
}

type DemoStoreProfile = {
  dataKey: string;
  name: string;
  marketplace: string;
  currency: string;
  /** Prefix product / campaign ids so stores never share ids */
  idPrefix: string;
  priceMul: number;
};

const DEMO_STORE_PROFILES: Record<string, DemoStoreProfile> = {
  demo_store_us_01: {
    dataKey: "demo_store_us_01",
    name: "Nexa 演示店（美国）",
    marketplace: "Amazon US",
    currency: "USD",
    idPrefix: "us",
    priceMul: 1,
  },
  demo_store_uk_01: {
    dataKey: "demo_store_uk_01",
    name: "Nexa 演示店（英国）",
    marketplace: "Amazon UK",
    currency: "GBP",
    idPrefix: "uk",
    priceMul: 0.79,
  },
  demo_store_de_01: {
    dataKey: "demo_store_de_01",
    name: "Nexa 演示店（德国）",
    marketplace: "Amazon DE",
    currency: "EUR",
    idPrefix: "de",
    priceMul: 0.92,
  },
};

/**
 * Per-marketplace demo seed. Product ids are prefixed — Store A ≠ Store B.
 */
export function generateDemoStoreForDataKey(
  dataKey: string,
  anchorDate?: string
): SeedStore {
  const profile =
    DEMO_STORE_PROFILES[dataKey] ?? DEMO_STORE_PROFILES[DEMO_STORE_ID];
  const base = generateDemoStore(anchorDate);

  if (profile.dataKey === DEMO_STORE_ID) {
    return {
      ...base,
      id: profile.dataKey,
      name: profile.name,
      marketplace: profile.marketplace,
      currency: profile.currency,
    };
  }

  return {
    ...base,
    id: profile.dataKey,
    name: profile.name,
    marketplace: profile.marketplace,
    currency: profile.currency,
    products: base.products.map((p) => ({
      ...p,
      id: `${profile.idPrefix}_${p.id}`,
      asin: `${profile.idPrefix.toUpperCase()}${p.asin}`.slice(0, 10),
      sku: `${profile.idPrefix.toUpperCase()}-${p.sku}`,
      title: `[${
        profile.marketplace === "Amazon US"
          ? "亚马逊美国"
          : profile.marketplace === "Amazon UK"
            ? "亚马逊英国"
            : profile.marketplace === "Amazon DE"
              ? "亚马逊德国"
              : profile.marketplace
      }] ${p.title}`,
      price: round2(p.price * profile.priceMul),
      cogs: round2(p.cogs * profile.priceMul),
      fbaFeePerUnit: round2(p.fbaFeePerUnit * profile.priceMul),
      logisticsFeePerUnit: round2(p.logisticsFeePerUnit * profile.priceMul),
      metrics: p.metrics.map((m) => ({
        ...m,
        sales: round2(m.sales * profile.priceMul),
        adSpend: round2(m.adSpend * profile.priceMul),
        adSales: round2(m.adSales * profile.priceMul),
      })),
      campaigns: p.campaigns.map((c) => ({
        ...c,
        id: `${profile.idPrefix}_${c.id}`,
        dailies: c.dailies.map((d) => ({
          ...d,
          spend: round2(d.spend * profile.priceMul),
          sales: round2(d.sales * profile.priceMul),
        })),
        terms: c.terms.map((t) => ({
          ...t,
          spend: round2(t.spend * profile.priceMul),
          sales: round2(t.sales * profile.priceMul),
        })),
      })),
    })),
  };
}

function buildBlender(start: string, _anchor: string): SeedProduct {
  const rng = mulberry32(hashSeed("portable-blender-v1"));
  const price = 39.99;
  const metrics: SeedDailyMetric[] = [];

  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = addDays(start, i);
    const dayIndex = i;
    const daysFromEnd = DEMO_DAYS - 1 - i;
    // Early: healthy CVR ~4.8%; late: CVR drifts to ~3.5% while sessions rise
    const phase = dayIndex / (DEMO_DAYS - 1);
    // Last 14 days: sharper CVR drop + mild session lift (conversion story)
    const recent14 =
      daysFromEnd < 14 ? (14 - daysFromEnd) / 14 : 0;
    const recent7 =
      daysFromEnd < 7 ? (7 - daysFromEnd) / 7 : 0;
    const swing = daysFromEnd < 14 ? (rng() - 0.5) * (0.12 + recent7 * 0.18) : 0;

    let baseSessions = 420 + phase * 80 + (rng() - 0.5) * 40;
    baseSessions *= 1 + recent14 * 0.14 + swing * 0.35;
    const sessions = roundInt(baseSessions);

    let baseCvr = 0.048 - phase * 0.013 + (rng() - 0.5) * 0.003;
    // Amplify CVR decline in recent window (down to ~2.6–3.0% near end)
    baseCvr *= 1 - recent14 * 0.28 - recent7 * 0.12;
    baseCvr *= 1 + swing * -0.5;
    const cvr = clamp(baseCvr, 0.022, 0.055);
    const orders = roundInt(sessions * cvr);
    const units = orders + (rng() > 0.85 ? 1 : 0);
    const sales = round2(units * price);
    const adClicks = roundInt(sessions * (0.12 + phase * 0.02 + recent14 * 0.03));
    const adSpend = round2(adClicks * (0.55 + phase * 0.15 + recent14 * 0.08 + rng() * 0.08));
    const adOrders = roundInt(orders * (0.35 + rng() * 0.1));
    const adSales = round2(adOrders * price);
    const refundUnits = rng() > 0.92 ? 1 : 0;
    const refunds = round2(refundUnits * price);

    metrics.push({
      date,
      sessions,
      orders,
      units,
      sales,
      adSpend,
      adSales,
      adClicks,
      refunds,
      refundUnits,
    });
  }

  const autoCampaign = buildCampaign({
    id: "camp_blender_auto",
    name: "榨汁杯 — 自动广告",
    productKey: "blender-auto",
    start,
    metrics,
    terms: [
      "portable blender",
      "travel blender",
      "personal blender usb",
      "smoothie maker portable",
      "blender for travel",
    ],
    efficiencyDrift: 0.35, // ACOS worsens late
  });

  const manualCampaign = buildCampaign({
    id: "camp_blender_manual",
    name: "榨汁杯 — 手动精确匹配",
    productKey: "blender-manual",
    start,
    metrics,
    terms: [
      "portable blender for travel",
      "usb rechargeable blender",
      "mini blender bottle",
    ],
    efficiencyDrift: 0.12,
  });

  // Inventory healthy relative to sales
  const recentUnits = metrics.slice(-14).reduce((s, m) => s + m.units, 0);
  const avgDaily = recentUnits / 14;

  return {
    id: "prod_portable_blender",
    asin: "B0NEXABLND1",
    sku: "NEXA-BLEND-01",
    title:
      "Portable Blender — USB Rechargeable Travel Cup（便携榨汁杯 — USB 充电旅行杯）",
    category: "厨房小电",
    price,
    cogs: 11.5,
    platformFeeRate: 0.15,
    fbaFeePerUnit: 5.4,
    logisticsFeePerUnit: 1.2,
    problemProfile: "cvr_decline",
    metrics,
    campaigns: [autoCampaign, manualCampaign],
    inventory: {
      unitsOnHand: roundInt(avgDaily * 45),
      inboundUnits: roundInt(avgDaily * 10),
    },
    selection: {
      demandScore: 78,
      competitionLevel: "high",
      marginEstimate: 0.22,
      gapNotes: "旅行场景细分词（USB / TSA）搜索上升，但头部商品页主图同质化严重。",
      comparableAsins: ["B0COMPBLEND1", "B0COMPBLEND2", "B0COMPBLEND3"],
    },
    complianceFlags: ["restricted_claim", "image_policy"],
    claimRisks: [
      "标题含「医疗级榨汁」类绝对化功效表述风险",
      "A+ 文案暗示「替代营养补充」可能触发健康声明审核",
    ],
    listingChecklist: [
      "去掉绝对化健康功效词",
      "主图白底占比符合类目规范",
      "Bullet 避免未验证检测证书编号",
    ],
    listingWeaknesses: [
      "前三张图缺少使用场景对比",
      "Bullet 未覆盖续航/清洗痛点",
      "标题关键词堆砌影响移动端可读性",
    ],
    bulletGaps: ["续航时长", "易清洗说明", "旅行收纳尺寸"],
    mainImageIssues: ["背景杂物", "对比度不足", "缺少尺寸参照物"],
  };
}

function buildFountain(start: string, _anchor: string): SeedProduct {
  const rng = mulberry32(hashSeed("pet-fountain-v1"));
  const price = 32.99;
  const metrics: SeedDailyMetric[] = [];

  for (let i = 0; i < DEMO_DAYS; i++) {
    const date = addDays(start, i);
    const dayIndex = i;
    const daysFromEnd = DEMO_DAYS - 1 - i;
    const phase = dayIndex / (DEMO_DAYS - 1);
    // Last 14 days: sharper traffic drop (inventory + ranking story)
    const recent14 =
      daysFromEnd < 14 ? (14 - daysFromEnd) / 14 : 0;
    const recent7 =
      daysFromEnd < 7 ? (7 - daysFromEnd) / 7 : 0;
    const swing = daysFromEnd < 14 ? (rng() - 0.5) * (0.14 + recent7 * 0.2) : 0;

    // Traffic declines over time; CVR stays relatively stable
    let baseSessions = 380 - phase * 120 + (rng() - 0.5) * 35;
    baseSessions *= 1 - recent14 * 0.38 - recent7 * 0.12 + swing;
    const sessions = roundInt(Math.max(80, baseSessions));
    const baseCvr = 0.041 + (rng() - 0.5) * 0.004;
    const cvr = clamp(baseCvr, 0.032, 0.05);
    const orders = roundInt(sessions * cvr);
    const units = orders;
    const sales = round2(units * price);
    const adClicks = roundInt(sessions * (0.14 - recent14 * 0.02));
    const adSpend = round2(adClicks * (0.48 + phase * 0.05));
    const adOrders = roundInt(orders * 0.4);
    const adSales = round2(adOrders * price);
    const refundUnits = rng() > 0.9 ? 1 : 0;

    metrics.push({
      date,
      sessions,
      orders,
      units,
      sales,
      adSpend,
      adSales,
      adClicks,
      refunds: round2(refundUnits * price),
      refundUnits,
    });
  }

  const campaign = buildCampaign({
    id: "camp_fountain_sp",
    name: "宠物饮水机 — 商品推广",
    productKey: "fountain-sp",
    start,
    metrics,
    terms: [
      "cat water fountain",
      "pet fountain",
      "automatic cat fountain",
      "dog water fountain",
      "quiet pet fountain",
    ],
    efficiencyDrift: 0.2,
  });

  // Thin inventory → coverage risk
  const recentUnits = metrics.slice(-14).reduce((s, m) => s + m.units, 0);
  const avgDaily = Math.max(1, recentUnits / 14);

  return {
    id: "prod_pet_fountain",
    asin: "B0NEXAPET01",
    sku: "NEXA-PET-FTN-01",
    title:
      "Pet Fountain — Quiet Automatic Water Dispenser（宠物饮水机 — 静音自动饮水机）",
    category: "宠物用品",
    price,
    cogs: 9.8,
    platformFeeRate: 0.15,
    fbaFeePerUnit: 4.9,
    logisticsFeePerUnit: 1.1,
    problemProfile: "traffic_inventory_risk",
    metrics,
    campaigns: [campaign],
    inventory: {
      unitsOnHand: roundInt(avgDaily * 9), // ~9 days cover
      inboundUnits: 0,
    },
    selection: {
      demandScore: 64,
      competitionLevel: "medium",
      marginEstimate: 0.28,
      gapNotes: "「静音」细分词竞争中等，可做差异化选品组合（滤芯订阅）。",
      comparableAsins: ["B0COMPPET1", "B0COMPPET2"],
    },
    complianceFlags: ["ip_risk"],
    claimRisks: ["产品图含品牌 Logo 近似元素，需排查外观专利/商标冲突"],
    listingChecklist: [
      "替换可能侵权的造型参考图",
      "滤芯耗材说明需标注更换周期（避免误导）",
    ],
    listingWeaknesses: [
      "缺少静音分贝对比图",
      "库存紧张时商品页仍推高广告，浪费曝光",
    ],
    bulletGaps: ["运行噪音", "滤芯兼容", "适用宠物体型"],
    mainImageIssues: ["场景图宠物出镜比例过大", "缺白底合规主图备份"],
  };
}

function buildCampaign(opts: {
  id: string;
  name: string;
  productKey: string;
  start: string;
  metrics: SeedDailyMetric[];
  terms: string[];
  efficiencyDrift: number;
}): SeedCampaign {
  const rng = mulberry32(hashSeed(opts.productKey));
  const dailies: SeedAdDaily[] = [];
  const terms: SeedSearchTermDaily[] = [];

  opts.metrics.forEach((m, i) => {
    const phase = i / Math.max(1, opts.metrics.length - 1);
    const share = 0.55 + rng() * 0.2;
    const spend = round2(m.adSpend * share);
    const clicks = roundInt(m.adClicks * share);
    const orders = roundInt(m.orders * (0.3 + rng() * 0.08) * (1 - phase * opts.efficiencyDrift * 0.4));
    const sales = round2(orders * (m.units > 0 ? m.sales / m.units : 30));
    const impressions = roundInt(clicks * (8 + rng() * 6));
    const top = round2(spend * (0.45 + rng() * 0.1));
    const product = round2(spend * (0.25 + rng() * 0.08));
    const rest = round2(Math.max(0, spend - top - product));

    dailies.push({
      date: m.date,
      impressions,
      clicks,
      spend,
      orders,
      sales,
      placementTop: top,
      placementProduct: product,
      placementRest: rest,
    });

    const remainingSpend = spend;
    const weights = opts.terms.map(() => 0.5 + rng());
    const weightSum = weights.reduce((a, b) => a + b, 0);
    opts.terms.forEach((term, ti) => {
      const w = weights[ti] / weightSum;
      const tClicks = roundInt(clicks * w);
      const tSpend = round2(remainingSpend * w);
      // Later days: some wasteful terms get clicks without orders
      const waste =
        ti >= opts.terms.length - 2 ? phase * opts.efficiencyDrift : 0;
      const tOrders = roundInt(orders * w * (1 - waste));
      const tSales = round2(sales * w * (1 - waste));
      terms.push({
        term,
        date: m.date,
        impressions: roundInt(impressions * w),
        clicks: tClicks,
        spend: tSpend,
        orders: tOrders,
        sales: tSales,
      });
    });
  });

  return {
    id: opts.id,
    name: opts.name,
    type: "sponsored_products",
    status: "enabled",
    dailies,
    terms,
  };
}
