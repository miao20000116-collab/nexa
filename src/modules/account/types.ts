export type AuthProvider = "email" | "google";

export type AccountUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: "guest" | "user" | string;
  authProvider: AuthProvider | null;
  createdAt: string;
};

export type SessionView = {
  authenticated: boolean;
  user: AccountUser | null;
  isGuest: boolean;
};

/** Features guests may use without login */
export const GUEST_ALLOWED = [
  "search",
  "view_results",
  "temp_workspace",
  "create",
  "publish_preview",
  "commerce_demo",
] as const;

/** Features that may require login / higher tier (commerce & optional OAuth only) */
export const LOGIN_REQUIRED = [
  "persist_workspace",
  "persist_assets",
  "high_cost_generation",
  "publish",
  "connect_platform",
  "commerce",
] as const;

export type LoginRequiredFeature = (typeof LOGIN_REQUIRED)[number];

export const LOGIN_REQUIRED_LABELS: Record<LoginRequiredFeature, string> = {
  persist_workspace: "长期保存工作区",
  persist_assets: "长期素材",
  high_cost_generation: "内容生成",
  publish: "发布到平台",
  connect_platform: "连接平台账号",
  commerce: "跨境商业",
};

export interface TierCapabilitiesView {
  tier: string;
  label: string;
  credits: number;
  features: Array<{ id: LoginRequiredFeature; allowed: boolean }>;
}

export type SessionWithTier = SessionView & {
  tier?: TierCapabilitiesView;
};

export type ConnectionUiStatus =
  | "connected"
  | "needs_reauth"
  | "insufficient_scope"
  | "disconnected"
  | "demo";

export type ConnectionCatalogItem = {
  id: string;
  category: "content" | "commerce";
  provider: string;
  label: string;
  status: ConnectionUiStatus;
  statusLabel: string;
  detail: string;
  canConnect: boolean;
  connectionId?: string | null;
  isDemo: boolean;
};

export type CreditLedgerEntry = {
  id: string;
  userId?: string | null;
  type: string;
  amount: number;
  balance: number | null;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  /** V2.8 job ledger */
  jobId?: string | null;
  capability?: string | null;
  jobStatus?: "reserved" | "success" | "failed" | "refunded" | null;
  createdAt: string;
};

export type CreditsAccountContext = {
  accountId: string;
  userId: string | null;
  isGuest: boolean;
  userRole?: string | null;
};

export type CreditsSummary = {
  label: "AI Credits";
  balance: number;
  isDemoGrant: boolean;
  note: string;
  entries: CreditLedgerEntry[];
  upcomingConsumers: string[];
};

export type CreditEstimate = {
  /** Exact estimate only when backend cost table is configured */
  available: boolean;
  estimatedCredits?: number;
  message: string;
};
