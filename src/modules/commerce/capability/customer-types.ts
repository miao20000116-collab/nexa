/**
 * Customer Intelligence types (V4.5-D).
 * Cross-border customer ops AI — not a full CS / ticket system.
 */

import type { CommerceCapabilityInsight } from "./listing-types";

export type CustomerReplyLanguage =
  | "English"
  | "German"
  | "French"
  | "Spanish"
  | "Chinese";

export type CustomerReplyKind =
  | "customer_reply"
  | "review_reply"
  | "email"
  | "follow_up";

export type CustomerPainPoint = {
  theme: string;
  category: string;
  sentiment: "negative" | "mixed" | "neutral" | "positive";
  frequency: number;
  frequencyLabel: string;
  evidenceSnippets: string[];
  /** May be product-level, not only CS */
  likelyProductProblem: boolean;
  recommendation: string;
};

export type CustomerReplyDraft = {
  kind: CustomerReplyKind;
  language: CustomerReplyLanguage;
  subject?: string;
  body: string;
  localizationNotes: string;
};

export type CustomerIntelligenceInput = {
  channel: "amazon" | "tiktok";
  platform?: "Amazon" | "TikTok Shop";
  marketplace?: string;
  country?: string;
  productTitle?: string;
  productId?: string;
  /** Free-text: messages, reviews, emails (one per line or paragraphs) */
  reviewsText?: string;
  messagesText?: string;
  emailsText?: string;
  orderContext?: string;
  /** Use built-in DEMO samples when no text provided */
  useDemoSamples?: boolean;
  mode?: "analyze" | "reply";
  replyKind?: CustomerReplyKind;
  replyLanguage?: CustomerReplyLanguage;
  /** Pain theme to address in reply */
  focusTheme?: string;
  confirm?: boolean;
  jobId?: string;
  workspaceId?: string | null;
};

export type CustomerIntelligenceResult =
  | {
      ok: true;
      insight: CommerceCapabilityInsight;
      painPoints: CustomerPainPoint[];
      clusters: Array<{ label: string; count: number; examples: string[] }>;
      reply: CustomerReplyDraft | null;
      productDiagnosisHref: string | null;
      createHref: string;
      searchHref: string;
      dataLabel: "演示数据" | "用户输入" | "数据暂缺";
      jobId: string;
      estimatedCredits: number | null;
      appliedKnowledge?: import("@/modules/commerce/skills/types").AppliedKnowledgeSummary;
      workflowActions?: import("@/modules/commerce/workflow/types").WorkflowAction[];
      chainLabel?: string;
    }
  | {
      ok: false;
      code:
        | "confirm_required"
        | "login_required"
        | "insufficient_credits"
        | "ai_unavailable"
        | "invalid_input";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
    };

/** Labeled DEMO samples for acceptance — never pretend live seller inbox */
export const DEMO_CUSTOMER_SAMPLES = [
  "Battery dies after 2 hours of normal use. Very disappointed. (Amazon US review ★2)",
  "续航太差了，充满电用不了半天就没电。",
  "Product works but battery life is terrible compared to the listing claims.",
  "Shipping was fine. Battery drains overnight even when off.",
  "Customer service ignored my email about battery warranty.",
  "Love the design but battery is a joke — returning.",
  "Instructions unclear / manual is poorly translated.",
  "App pairing failed twice; finally worked after reset.",
];

export type { CommerceCapabilityInsight };
