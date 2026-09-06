/**
 * Compliance Intelligence types (V4.5-E).
 * Risk screening — never a legal guarantee.
 */

import type { CommerceCapabilityInsight } from "./listing-types";

export type ComplianceVerdict = "PASS" | "NEEDS_REVIEW" | "HIGH_RISK";

export type ComplianceRiskType =
  | "Trademark Risk"
  | "Copyright Risk"
  | "Potential Infringement"
  | "Platform Policy Risk"
  | "Restricted Product Risk"
  | "Advertising Risk"
  | "Localization Risk";

export type ComplianceCheckTarget =
  | "Product"
  | "Listing"
  | "商品页"
  | "Title"
  | "Description"
  | "Keywords"
  | "Ads"
  | "Image"
  | "Video";

export type ComplianceEvidence = {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  snippet?: string | null;
};

export type ComplianceRiskItem = {
  risk: ComplianceRiskType;
  target: ComplianceCheckTarget;
  verdict: ComplianceVerdict | "INSUFFICIENT_EVIDENCE";
  evidence: ComplianceEvidence[];
  reason: string;
  recommendation: string;
};

export type ComplianceIntelligenceInput = {
  channel: "amazon" | "tiktok";
  platform?: "Amazon" | "TikTok Shop";
  marketplace?: string;
  country?: string;
  productTitle?: string;
  productId?: string;
  title?: string;
  description?: string;
  keywords?: string;
  adsNotes?: string;
  imageNotes?: string;
  videoNotes?: string;
  listingText?: string;
  /** Seed from demo store flags */
  demoFlags?: string[];
  demoClaimRisks?: string[];
  /** Force scenario for acceptance: low | mid | high | insufficient */
  scenario?: "low" | "mid" | "high" | "insufficient" | "auto";
  confirm?: boolean;
  jobId?: string;
  workspaceId?: string | null;
};

export type ComplianceIntelligenceResult =
  | {
      ok: true;
      overallVerdict: ComplianceVerdict | "INSUFFICIENT_EVIDENCE";
      insight: CommerceCapabilityInsight;
      risks: ComplianceRiskItem[];
      researchHref: string | null;
      createHref: string;
      qaHref: string;
      publishHref: string;
      searchHref: string;
      dataLabel:
        | "演示数据"
        | "用户输入"
        | "SEARCH EVIDENCE"
        | "INSUFFICIENT EVIDENCE";
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
        | "invalid_input"
        | "search_unavailable";
      message: string;
      estimate?: {
        available: boolean;
        estimatedCredits: number | null;
        message?: string;
      };
      jobId?: string;
    };

export type { CommerceCapabilityInsight };

/** Display labels for compliance enums shown in UI. */
export const COMPLIANCE_VERDICT_LABEL: Record<string, string> = {
  PASS: "通过",
  NEEDS_REVIEW: "需复核",
  HIGH_RISK: "高风险",
  INSUFFICIENT_EVIDENCE: "证据不足",
};

export const COMPLIANCE_RISK_LABEL: Record<string, string> = {
  "Trademark Risk": "商标风险",
  "Copyright Risk": "版权风险",
  "Potential Infringement": "潜在侵权",
  "Platform Policy Risk": "平台政策风险",
  "Restricted Product Risk": "限制商品风险",
  "Advertising Risk": "广告风险",
  "Localization Risk": "本土化风险",
};

export const COMPLIANCE_TARGET_LABEL: Record<string, string> = {
  Product: "商品",
  Listing: "商品页",
  商品页: "商品页",
  Title: "标题",
  Description: "描述",
  Keywords: "关键词",
  Ads: "广告",
  Image: "图片",
  Video: "视频",
};

export const COMPLIANCE_DATA_LABEL: Record<string, string> = {
  演示数据: "演示数据",
  用户输入: "用户输入",
  "SEARCH EVIDENCE": "检索证据",
  "INSUFFICIENT EVIDENCE": "证据不足",
  "DEMO DATA": "演示数据",
  "USER INPUT": "用户输入",
};
