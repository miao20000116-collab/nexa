/**
 * Skill routing — CapabilityRouter selects Skills by Platform / Market / Category / Task.
 * Users do not pick Skills.
 */

import { getLatestSkillPack, listCommerceSkills } from "./registry";
import type {
  AppliedKnowledgeItem,
  AppliedKnowledgeSummary,
  CommerceSkillDefinition,
  CommerceSkillTask,
  SkillRouteContext,
  SkillVersionPack,
} from "./types";

const TASK_SKILL_MAP: Record<string, string[]> = {
  listing_optimization: ["amazon_listing_optimization", "tiktok_content_optimization"],
  listing_review: ["amazon_listing_optimization", "tiktok_content_optimization"],
  advertising_analysis: ["amazon_advertising_analysis", "tiktok_content_analysis"],
  product_research: ["amazon_product_research", "tiktok_product_analysis"],
  product_analysis: ["tiktok_product_analysis", "amazon_product_research"],
  compliance_check: ["amazon_compliance_check"],
  content_analysis: ["tiktok_content_analysis"],
  content_optimization: ["tiktok_content_optimization"],
  customer_review_analysis: ["customer_review_analysis"],
  profit_analysis: ["cross_border_profit_analysis"],
  inventory_analysis: ["cross_border_profit_analysis"],
};

function normalizePlatform(
  platform?: string | null
): "Amazon" | "TikTok Shop" | "Cross-border" | null {
  if (!platform) return null;
  const p = platform.toLowerCase();
  if (p.includes("tiktok")) return "TikTok Shop";
  if (p.includes("amazon")) return "Amazon";
  if (p.includes("cross")) return "Cross-border";
  return null;
}

function marketplaceMatches(
  skill: CommerceSkillDefinition,
  marketplace?: string | null,
  country?: string | null
): boolean {
  if (skill.platform === "Cross-border") return true;
  if (!skill.marketplace.length && !skill.country.length) return true;
  const m = (marketplace || "").toLowerCase();
  const c = (country || "").toUpperCase();
  if (m) {
    if (skill.marketplace.some((x) => x.toLowerCase() === m || m.includes(x.toLowerCase().replace("amazon ", "").replace("tiktok ", "")))) {
      return true;
    }
    if (skill.marketplace.some((x) => m.includes(x.toLowerCase()))) return true;
  }
  if (c && skill.country.includes(c)) return true;
  // If no market hint, allow platform-level match
  if (!marketplace && !country) return true;
  // Soft match: still allow if platform matches and market list is non-empty
  return !marketplace && !country;
}

function categoryBoost(
  pack: SkillVersionPack,
  category?: string | null
): number {
  if (!category) return 0;
  const cat = category.toLowerCase();
  return pack.rules.some(
    (r) =>
      r.kind === "category" &&
      (r.statement.toLowerCase().includes(cat) ||
        (cat.includes("kitchen") && r.id.includes("kitchen")))
  )
    ? 2
    : 0;
}

function humanLabel(
  skill: CommerceSkillDefinition,
  marketplace?: string | null,
  country?: string | null
): string {
  const market =
    marketplace?.trim() ||
    (country ? `${skill.platform} ${country}` : skill.platform);
  if (skill.domain === "listing") return `已应用 ${market} Listing 相关知识`;
  if (skill.domain === "advertising") return `已应用 ${market} 广告分析相关知识`;
  if (skill.domain === "product_research")
    return `已应用 ${market} 选品 / 商品分析相关知识`;
  if (skill.domain === "compliance") return `已应用 ${market} 合规相关知识`;
  if (skill.domain === "content") return `已应用 ${market} 内容相关知识`;
  if (skill.domain === "customer") return "已应用跨境客户评价分析相关知识";
  if (skill.domain === "profit") return "已应用跨境利润 / 库存分析相关知识";
  return `已应用 ${skill.name} 相关知识`;
}

/**
 * Select Skill packs for a commerce task. User never chooses Skill ordinals.
 */
export function selectCommerceSkills(
  ctx: SkillRouteContext
): AppliedKnowledgeSummary {
  const platform = normalizePlatform(ctx.platform);
  const task = String(ctx.task || "");
  const candidates = ctx.preferSkillIds?.length
    ? ctx.preferSkillIds
    : TASK_SKILL_MAP[task] || [];

  const scored: Array<{
    skill: CommerceSkillDefinition;
    pack: SkillVersionPack;
    score: number;
  }> = [];

  for (const id of candidates) {
    const resolved = getLatestSkillPack(id);
    if (!resolved) continue;
    const { skill, pack } = resolved;
    if (platform && skill.platform !== "Cross-border" && skill.platform !== platform) {
      continue;
    }
    if (!marketplaceMatches(skill, ctx.marketplace, ctx.country)) {
      // still allow Cross-border
      if (skill.platform !== "Cross-border") continue;
    }
    let score = 10;
    if (platform && skill.platform === platform) score += 5;
    if (marketplaceMatches(skill, ctx.marketplace, ctx.country)) score += 3;
    score += categoryBoost(pack, ctx.category);
    scored.push({ skill, pack, score });
  }

  // Fallback: scan all skills for task domain keywords
  if (!scored.length) {
    for (const skill of listCommerceSkills()) {
      if (platform && skill.platform !== "Cross-border" && skill.platform !== platform) {
        continue;
      }
      const resolved = getLatestSkillPack(skill.skillId);
      if (!resolved) continue;
      scored.push({ skill, pack: resolved.pack, score: 1 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 2);

  const items: AppliedKnowledgeItem[] = top.map(({ skill, pack }) => {
    const highlights = [
      ...pack.decisionLogic.slice(0, 2),
      ...pack.rules.slice(0, 3).map((r) => r.statement),
    ].slice(0, 5);
    const evidence = [
      ...pack.evidenceIndex,
      ...pack.rules.flatMap((r) => r.evidence || []),
    ].slice(0, 6);
    return {
      label: humanLabel(skill, ctx.marketplace, ctx.country),
      skillName: skill.name,
      version: pack.version,
      domain: skill.domain,
      platform: skill.platform,
      marketplaceHint: ctx.marketplace || null,
      ruleHighlights: highlights,
      evidence,
      scenarios: pack.applicableScenarios,
    };
  });

  const summaryLine =
    items[0]?.label ||
    (platform
      ? `已应用 ${platform} 跨境经营相关知识`
      : "已应用跨境经营相关知识");

  return {
    summaryLine,
    items,
    skillIds: top.map((t) => t.skill.skillId),
    routedAt: new Date().toISOString(),
  };
}

/** Map billing / capability job names → skill task */
export function taskFromCommerceCapability(
  capabilityKey: string
): CommerceSkillTask {
  switch (capabilityKey) {
    case "listing_intelligence":
    case "keyword_intelligence":
      return "listing_optimization";
    case "advertising_analysis":
      return "advertising_analysis";
    case "selection_analysis":
    case "product_research":
      return "product_research";
    case "compliance_check":
      return "compliance_check";
    case "customer_intelligence":
      return "customer_review_analysis";
    case "financial_analysis":
    case "inventory_intelligence":
      return "profit_analysis";
    default:
      return "product_research";
  }
}
