/**
 * V4.2 — AI Decision Engine types
 * Never invent market/sales/user/competition data.
 */

export type DecisionDomain = "commerce" | "content" | "product" | "general";

export interface DecisionEvidence {
  id: string;
  sourceKind: "search" | "research" | "commerce" | "performance" | "memory" | "assets" | "creation";
  sourceId?: string | null;
  text: string;
  /** true only when backed by persisted user data */
  verified: boolean;
}

export interface DecisionOption {
  id: "A" | "B" | "C";
  title: string;
  pros: string[];
  risks: string[];
  costNote: string;
  expectedEffect: string;
}

export interface DecisionResult {
  id: string;
  userId: string;
  domain: DecisionDomain;
  goal: string;
  situation: string;
  evidence: DecisionEvidence[];
  options: DecisionOption[];
  recommendation: string;
  expectedImpact: string;
  risk: string;
  nextAction: string;
  dataGaps: string[];
  createdAt: string;
}
