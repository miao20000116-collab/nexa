export type CommerceRangeDays = 7 | 30 | 90;

export interface PeriodWindow {
  days: CommerceRangeDays;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

export interface MetricValue {
  current: number;
  previous: number;
  deltaPct: number | null;
}

export interface TikTokProductMetrics {
  id: string;
  productId: string;
  sku: string;
  title: string;
  category: string | null;
  problemProfile: string;
  price: number;
  gmv: MetricValue;
  orders: MetricValue;
  exposure: MetricValue;
  clicks: MetricValue;
  cvr: MetricValue;
  videoGmv: MetricValue;
  creatorGmv: MetricValue;
}

export interface DiagnosisBlock {
  opportunity: string;
  confidence: "high" | "medium" | "low";
  confidenceLabel: string;
  evidence: Array<{
    label: string;
    detail: string;
    deltaPct?: number | null;
  }>;
  nextActions: Array<{
    label: string;
    kind: "search" | "workspace" | "create" | "ai";
    href?: string;
    blockedAi?: boolean;
  }>;
}

export interface TikTokDailyPoint {
  date: string;
  gmv: number;
  orders: number;
  exposure: number;
  clicks: number;
  cvr: number;
  videoGmv: number;
  creatorGmv: number;
}

export interface TikTokOverview {
  isDemo: true;
  storeContext?: {
    storeId: string;
    marketplace: string;
    country: string;
    currency: string;
    connectionStatus: string;
  };
  storeName: string;
  marketplace: string;
  currency: string;
  period: PeriodWindow;
  totals: {
    gmv: MetricValue;
    orders: MetricValue;
    exposure: MetricValue;
    clicks: MetricValue;
    cvr: MetricValue;
    videoGmv: MetricValue;
    creatorGmv: MetricValue;
  };
  products: TikTokProductMetrics[];
  contentInsight: {
    title: string;
    detail: string;
    videoId: string;
    productId: string;
  } | null;
  /** Store-level daily GMV for trend chart */
  series: TikTokDailyPoint[];
}

export interface TikTokVideoRow {
  id: string;
  title: string;
  theme: string;
  productId: string;
  productTitle: string;
  creatorHandle: string | null;
  views: number;
  productClicks: number;
  orders: number;
  gmv: number;
  cvr: number | null;
  viewsRank: number;
  cvrRank: number;
}

export interface TikTokContentView {
  isDemo: true;
  period: PeriodWindow;
  videos: TikTokVideoRow[];
  insight: {
    title: string;
    detail: string;
    videoId: string;
  } | null;
  aiActions: Array<{
    label: string;
    blocked: true;
    message: string;
  }>;
  nextActions: Array<{ label: string; href: string; kind: string }>;
}

export interface TikTokCreatorRow {
  id: string;
  handle: string;
  displayName: string;
  niche: string | null;
  videos: number;
  gmv: number;
  orders: number;
  cvr: number | null;
  topTheme: string | null;
}

export interface TikTokCreatorsView {
  isDemo: true;
  period: PeriodWindow;
  creators: TikTokCreatorRow[];
  aiActions: Array<{
    label: string;
    blocked: true;
    message: string;
  }>;
}

export interface TikTokProductDiagnosis {
  isDemo: true;
  demoStoreLabel: string;
  product: TikTokProductMetrics;
  period: PeriodWindow;
  diagnosis: DiagnosisBlock;
  /** Daily series for exposure vs CVR chart */
  series: TikTokDailyPoint[];
  intelligence?: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
  /** DEMO listing weaknesses for Listing Intelligence context */
  listingWeaknesses?: string[];
  category?: string | null;
}
