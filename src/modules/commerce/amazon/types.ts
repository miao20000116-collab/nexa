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
  /** ((current - previous) / previous) * 100; null if previous is 0 */
  deltaPct: number | null;
}

export interface ProductPeriodMetrics {
  productId: string;
  asin: string;
  sku: string;
  title: string;
  category: string | null;
  problemProfile: string;
  price: number;
  sessions: MetricValue;
  orders: MetricValue;
  units: MetricValue;
  sales: MetricValue;
  cvr: MetricValue;
  aov: MetricValue;
  adSpend: MetricValue;
  adSales: MetricValue;
  acos: MetricValue;
  roas: MetricValue;
  /** Identity check: sessions * cvr * aov ≈ sales */
  salesDecomposition: {
    current: number;
    previous: number;
  };
}

export interface DiagnosisEvidenceItem {
  label: string;
  current?: string;
  previous?: string;
  deltaPct?: number | null;
  detail?: string;
}

export interface NextAction {
  label: string;
  kind: "search" | "workspace" | "create" | "link";
  href: string;
}

/** Daily points for charts (current period only). */
export interface CommerceDailyPoint {
  date: string;
  sales: number;
  sessions: number;
  orders: number;
  /** orders / sessions when sessions > 0 */
  cvr: number;
  adSpend: number;
}

export interface ProductDiagnosis {
  productId: string;
  asin: string;
  title: string;
  isDemo: true;
  /** Explicit demo store marker — never implies live account */
  demoStoreLabel: string;
  period: PeriodWindow;
  metrics: ProductPeriodMetrics;
  conclusion: string;
  evidence: DiagnosisEvidenceItem[];
  nextActions: NextAction[];
  /** Daily series for traffic vs conversion chart */
  series: CommerceDailyPoint[];
  /** Diagnosis → Evidence → Action intelligence layer */
  intelligence?: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
  /** DEMO seed — for Listing Intelligence panel */
  listingWeaknesses?: string[];
  listingChecklist?: string[];
  category?: string;
}

export interface StoreOverview {
  isDemo: true;
  storeId: string;
  storeName: string;
  marketplace: string;
  currency: string;
  connectionStatus: string;
  period: PeriodWindow;
  totals: {
    sales: MetricValue;
    sessions: MetricValue;
    orders: MetricValue;
    cvr: MetricValue;
    aov: MetricValue;
    adSpend: MetricValue;
    acos: MetricValue;
    estimatedProfit: MetricValue;
  };
  products: ProductPeriodMetrics[];
  alerts: Array<{ productId: string; title: string; message: string }>;
  /** Store-level daily sales / traffic for trend chart */
  series: CommerceDailyPoint[];
}

export interface AdTermRow {
  term: string;
  campaignId: string;
  campaignName: string;
  productId: string;
  spend: number;
  clicks: number;
  orders: number;
  sales: number;
  cvr: number | null;
  acos: number | null;
  roas: number | null;
}

export interface AdCampaignRow {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  spend: number;
  clicks: number;
  impressions: number;
  orders: number;
  sales: number;
  cvr: number | null;
  acos: number | null;
  roas: number | null;
}

export interface AdPlacementRow {
  placement: string;
  spend: number;
  sharePct: number;
}

export interface AdsDiagnosis {
  isDemo: true;
  period: PeriodWindow;
  overview: {
    spend: MetricValue;
    sales: MetricValue;
    clicks: MetricValue;
    orders: MetricValue;
    acos: MetricValue;
    roas: MetricValue;
  };
  campaigns: AdCampaignRow[];
  searchTerms: AdTermRow[];
  products: Array<{
    productId: string;
    title: string;
    spend: number;
    sales: number;
    acos: number | null;
    roas: number | null;
  }>;
  placements: AdPlacementRow[];
  /** @deprecated prefer actions — kept for backward UI */
  suggestions: string[];
  /** Structured actionable CTAs */
  actions: import("@/modules/commerce/intelligence/types").IntelligenceAction[];
}

export interface SelectionOpportunityRow {
  productId: string;
  asin: string;
  title: string;
  category: string;
  demandScore: number;
  competitionLevel: string;
  marginEstimate: number;
  gapNotes: string;
  comparableAsins: string[];
}

export interface SelectionResearchView {
  isDemo: true;
  demoStoreLabel: string;
  period: PeriodWindow;
  opportunities: SelectionOpportunityRow[];
  intelligence: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
}

export interface ComplianceRiskRow {
  productId: string;
  asin: string;
  title: string;
  flags: string[];
  claimRisks: string[];
  checklist: string[];
  severity: "high" | "medium" | "low";
}

export interface ComplianceOverview {
  isDemo: true;
  demoStoreLabel: string;
  rows: ComplianceRiskRow[];
  intelligence: import("@/modules/commerce/intelligence/types").CommerceIntelligenceReport;
}

export interface ProfitBreakdown {
  isDemo: true;
  period: PeriodWindow;
  note: string;
  revenue: number;
  adSpend: number;
  platformFee: number;
  fba: number;
  logistics: number;
  refund: number;
  cogs: number;
  estimatedProfit: number;
  byProduct: Array<{
    productId: string;
    title: string;
    revenue: number;
    costs: number;
    estimatedProfit: number;
  }>;
  previousEstimatedProfit: number;
  deltaPct: number | null;
}

export interface InventoryRow {
  productId: string;
  asin: string;
  title: string;
  unitsOnHand: number;
  inboundUnits: number;
  avgDailyUnits: number;
  daysOfCover: number | null;
  risk: "low" | "medium" | "high";
  riskLabel: string;
}

export interface InventoryView {
  isDemo: true;
  periodDays: number;
  rows: InventoryRow[];
}
