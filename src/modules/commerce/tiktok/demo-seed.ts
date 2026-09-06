/**
 * Deterministic TikTok Shop Demo Store.
 * Metrics are generated raw; period deltas are always computed — never hard-coded.
 */

export const TIKTOK_DEMO_STORE_ID = "tiktok_demo_store_us_01";
export const TIKTOK_DEMO_DAYS = 90;

export type TikTokProblemProfile =
  | "content_cvr_opportunity"
  | "creator_dependent";

export interface TikTokSeedDaily {
  date: string;
  exposure: number;
  clicks: number;
  orders: number;
  gmv: number;
  videoGmv: number;
  creatorGmv: number;
}

export interface TikTokSeedVideoDaily {
  date: string;
  views: number;
  productClicks: number;
  orders: number;
  gmv: number;
}

export interface TikTokSeedVideo {
  id: string;
  title: string;
  theme: string;
  creatorId: string | null;
  publishedAt: string;
  /** Relative CVR bias: higher = better product CVR even with fewer views */
  cvrBias: number;
  viewBias: number;
  dailies: TikTokSeedVideoDaily[];
}

export interface TikTokSeedCreator {
  id: string;
  handle: string;
  displayName: string;
  niche: string;
}

export interface TikTokSeedProduct {
  id: string;
  productId: string;
  sku: string;
  title: string;
  category: string;
  price: number;
  problemProfile: TikTokProblemProfile;
  metrics: TikTokSeedDaily[];
  videoIds: string[];
  selection: {
    demandScore: number;
    competitionLevel: "low" | "medium" | "high";
    marginEstimate: number;
    gapNotes: string;
  };
  complianceFlags: string[];
  claimRisks: string[];
  listingWeaknesses: string[];
}

export interface TikTokSeedStore {
  id: string;
  name: string;
  marketplace: string;
  currency: string;
  isDemo: true;
  generatedAt: string;
  anchorDate: string;
  products: TikTokSeedProduct[];
  creators: TikTokSeedCreator[];
  videos: TikTokSeedVideo[];
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

export function generateTikTokDemoStore(anchorDate?: string): TikTokSeedStore {
  const anchor = anchorDate ?? dateOnly(new Date());
  const start = addDays(anchor, -(TIKTOK_DEMO_DAYS - 1));

  const creators: TikTokSeedCreator[] = [
    {
      id: "tt_creator_maya",
      handle: "@maya.travels",
      displayName: "Maya 旅行",
      niche: "旅行",
    },
    {
      id: "tt_creator_leo",
      handle: "@leo.unbox",
      displayName: "Leo 开箱",
      niche: "开箱",
    },
    {
      id: "tt_creator_nina",
      handle: "@nina.petlife",
      displayName: "Nina 宠物生活",
      niche: "宠物",
    },
  ];

  const blenderVideos = buildBlenderVideos(start, anchor);
  const fountainVideos = buildFountainVideos(start, anchor);
  const videos = [...blenderVideos, ...fountainVideos];

  const blender = buildProductFromVideos({
    id: "tt_prod_blender",
    productId: "TTS-BLEND-01",
    sku: "TT-BLEND-USB",
    title:
      "Portable Blender — Travel Charging Cup（便携榨汁杯 — 旅行充电杯）",
    category: "厨房小电",
    price: 29.99,
    problemProfile: "content_cvr_opportunity",
    start,
    videos: blenderVideos,
  });

  const fountain = buildProductFromVideos({
    id: "tt_prod_fountain",
    productId: "TTS-PET-FTN-01",
    sku: "TT-PET-FOUNTAIN",
    title:
      "Pet Fountain — Quiet Auto Water（宠物饮水机 — 静音自动饮水）",
    category: "宠物",
    price: 24.99,
    problemProfile: "creator_dependent",
    start,
    videos: fountainVideos,
  });

  return {
    id: TIKTOK_DEMO_STORE_ID,
    name: "Nexa TikTok 演示店（美国）",
    marketplace: "US",
    currency: "USD",
    isDemo: true,
    generatedAt: new Date().toISOString(),
    anchorDate: anchor,
    products: [blender, fountain],
    creators,
    videos,
  };
}

function buildBlenderVideos(start: string, anchor: string): TikTokSeedVideo[] {
  return [
    buildVideoSeries({
      id: "tt_vid_airport_travel",
      title: "机场旅行随身杯：登机前 30 秒搞定早餐",
      theme: "机场旅行",
      creatorId: "tt_creator_maya",
      publishedAt: addDays(anchor, -40),
      start,
      // Insight target: not highest views, but highest product CVR
      viewBias: 0.72,
      cvrBias: 1.55,
      seedKey: "airport-travel",
    }),
    buildVideoSeries({
      id: "tt_vid_unbox_blender",
      title: "开箱：USB 便携榨汁杯值不值",
      theme: "开箱测评",
      creatorId: "tt_creator_leo",
      publishedAt: addDays(anchor, -55),
      start,
      viewBias: 1.35,
      cvrBias: 0.75,
      seedKey: "unbox-blender",
    }),
    buildVideoSeries({
      id: "tt_vid_gym_smoothie",
      title: "健身后 1 分钟蛋白奶昔",
      theme: "健身场景",
      creatorId: null,
      publishedAt: addDays(anchor, -28),
      start,
      viewBias: 1.0,
      cvrBias: 1.05,
      seedKey: "gym-smoothie",
    }),
  ];
}

function buildFountainVideos(start: string, anchor: string): TikTokSeedVideo[] {
  return [
    buildVideoSeries({
      id: "tt_vid_pet_quiet",
      title: "猫咪终于肯喝水了（静音喷泉）",
      theme: "宠物日常",
      creatorId: "tt_creator_nina",
      publishedAt: addDays(anchor, -35),
      start,
      viewBias: 1.1,
      cvrBias: 1.2,
      seedKey: "pet-quiet",
    }),
    buildVideoSeries({
      id: "tt_vid_pet_clean",
      title: "一周清洗一次？真实维护成本",
      theme: "清洁维护",
      creatorId: "tt_creator_nina",
      publishedAt: addDays(anchor, -18),
      start,
      viewBias: 0.85,
      cvrBias: 0.9,
      seedKey: "pet-clean",
    }),
    buildVideoSeries({
      id: "tt_vid_pet_affiliate",
      title: "达人同款宠物饮水机",
      theme: "达人带货",
      creatorId: "tt_creator_leo",
      publishedAt: addDays(anchor, -50),
      start,
      viewBias: 1.25,
      cvrBias: 0.7,
      seedKey: "pet-affiliate",
    }),
  ];
}

function buildVideoSeries(opts: {
  id: string;
  title: string;
  theme: string;
  creatorId: string | null;
  publishedAt: string;
  start: string;
  viewBias: number;
  cvrBias: number;
  seedKey: string;
}): TikTokSeedVideo {
  const rng = mulberry32(hashSeed(opts.seedKey));
  const dailies: TikTokSeedVideoDaily[] = [];
  const pub = opts.publishedAt;

  for (let i = 0; i < TIKTOK_DEMO_DAYS; i++) {
    const date = addDays(opts.start, i);
    if (date < pub) {
      dailies.push({
        date,
        views: 0,
        productClicks: 0,
        orders: 0,
        gmv: 0,
      });
      continue;
    }
    const age = Math.max(0, (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${pub}T12:00:00Z`)) / 86400000);
    const decay = Math.exp(-age / 18);
    const views = roundInt(
      (800 + rng() * 600) * opts.viewBias * (0.35 + decay) * (0.85 + rng() * 0.3)
    );
    const clickRate = clamp(0.018 * opts.cvrBias + (rng() - 0.5) * 0.004, 0.008, 0.06);
    const productClicks = roundInt(views * clickRate);
    const orderRate = clamp(0.04 * opts.cvrBias + (rng() - 0.5) * 0.01, 0.01, 0.12);
    const orders = roundInt(productClicks * orderRate);
    const aov = 24 + rng() * 12;
    const gmv = round2(orders * aov);

    dailies.push({ date, views, productClicks, orders, gmv });
  }

  return {
    id: opts.id,
    title: opts.title,
    theme: opts.theme,
    creatorId: opts.creatorId,
    publishedAt: opts.publishedAt,
    cvrBias: opts.cvrBias,
    viewBias: opts.viewBias,
    dailies,
  };
}

function buildProductFromVideos(opts: {
  id: string;
  productId: string;
  sku: string;
  title: string;
  category: string;
  price: number;
  problemProfile: TikTokProblemProfile;
  start: string;
  videos: TikTokSeedVideo[];
}): TikTokSeedProduct {
  const rng = mulberry32(hashSeed(`${opts.id}-recent-swing`));
  const metrics: TikTokSeedDaily[] = [];
  for (let i = 0; i < TIKTOK_DEMO_DAYS; i++) {
    const date = addDays(opts.start, i);
    let views = 0;
    let clicks = 0;
    let orders = 0;
    let gmv = 0;
    let creatorGmv = 0;

    for (const video of opts.videos) {
      const day = video.dailies[i];
      if (!day || day.date !== date) continue;
      views += day.views;
      clicks += day.productClicks;
      orders += day.orders;
      gmv += day.gmv;
      if (video.creatorId) creatorGmv += day.gmv;
    }

    // Product card exposure slightly above video-attributed clicks funnel
    let exposure = roundInt(views * 0.55 + clicks * 2.2 + 40);
    let videoGmv = round2(gmv);
    const organicBoost = round2(gmv * 0.12);
    let totalGmv = round2(videoGmv + organicBoost);
    let totalOrders =
      orders + (organicBoost > 0 ? Math.round(organicBoost / opts.price) : 0);

    // Last 7–14 days: clearer GMV / exposure swings (deterministic)
    const daysFromEnd = TIKTOK_DEMO_DAYS - 1 - i;
    if (daysFromEnd < 14) {
      const recent14 = (14 - daysFromEnd) / 14;
      const recent7 = daysFromEnd < 7 ? (7 - daysFromEnd) / 7 : 0;
      const swing = (rng() - 0.5) * (0.16 + recent7 * 0.22);

      if (opts.problemProfile === "content_cvr_opportunity") {
        // Exposure holds / rises; orders & GMV drop → conversion story
        exposure = roundInt(exposure * (1 + recent14 * 0.18 + swing * 0.25));
        totalOrders = roundInt(
          totalOrders * (1 - recent14 * 0.32 - recent7 * 0.14 + swing * -0.4)
        );
        totalGmv = round2(
          totalGmv * (1 - recent14 * 0.34 - recent7 * 0.12 + swing * -0.35)
        );
        videoGmv = round2(videoGmv * (1 - recent14 * 0.3));
        clicks = roundInt(clicks * (1 + recent14 * 0.08));
      } else {
        // Creator-dependent: exposure & GMV both swing down
        exposure = roundInt(
          exposure * (1 - recent14 * 0.42 - recent7 * 0.15 + swing)
        );
        totalOrders = roundInt(
          totalOrders * (1 - recent14 * 0.36 - recent7 * 0.12 + swing * 0.5)
        );
        totalGmv = round2(
          totalGmv * (1 - recent14 * 0.4 - recent7 * 0.14 + swing * 0.45)
        );
        videoGmv = round2(videoGmv * (1 - recent14 * 0.38));
        creatorGmv = round2(creatorGmv * (1 - recent14 * 0.45));
        clicks = roundInt(clicks * (1 - recent14 * 0.3));
      }
    }

    metrics.push({
      date,
      exposure: Math.max(20, exposure),
      clicks: Math.max(0, clicks),
      orders: Math.max(0, totalOrders),
      gmv: Math.max(0, totalGmv),
      videoGmv: Math.max(0, videoGmv),
      creatorGmv: Math.max(0, round2(creatorGmv)),
    });
  }

  return {
    id: opts.id,
    productId: opts.productId,
    sku: opts.sku,
    title: opts.title,
    category: opts.category,
    price: opts.price,
    problemProfile: opts.problemProfile,
    metrics,
    videoIds: opts.videos.map((v) => v.id),
    selection:
      opts.problemProfile === "content_cvr_opportunity"
        ? {
            demandScore: 72,
            competitionLevel: "high" as const,
            marginEstimate: 0.24,
            gapNotes: "高播放内容多，但同款货盘扎堆；可切「场景解法」细分选品。",
          }
        : {
            demandScore: 58,
            competitionLevel: "medium" as const,
            marginEstimate: 0.3,
            gapNotes: "达人依赖度高，选品需评估可替代创作者池深度。",
          },
    complianceFlags:
      opts.problemProfile === "content_cvr_opportunity"
        ? ["content_claim"]
        : ["affiliate_disclosure"],
    claimRisks:
      opts.problemProfile === "content_cvr_opportunity"
        ? ["短视频口播含「根治/医疗」风险词"]
        : ["达人带货未稳定露出联盟披露话术"],
    listingWeaknesses:
      opts.problemProfile === "content_cvr_opportunity"
        ? ["商详首屏卖点与爆款视频钩子不一致", "缺信任背书模块"]
        : ["货盘说明依赖达人脚本，店铺页信息稀疏"],
  };
}
