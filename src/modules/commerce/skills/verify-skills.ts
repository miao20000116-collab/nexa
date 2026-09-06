/**
 * Smoke check: Skills catalog + routing + version immutability.
 * Run: npx tsx src/modules/commerce/skills/verify-skills.ts
 */

import { assertVersionNotOverwrite, getSkillById } from "./registry";
import { selectCommerceSkills } from "./router";
import { COMMERCE_SKILL_PACKS } from "./packs";

const REQUIRED = [
  "amazon_listing_optimization",
  "amazon_advertising_analysis",
  "amazon_product_research",
  "amazon_compliance_check",
  "tiktok_content_analysis",
  "tiktok_product_analysis",
  "tiktok_content_optimization",
  "customer_review_analysis",
  "cross_border_profit_analysis",
];

function main() {
  for (const id of REQUIRED) {
    if (!getSkillById(id)) throw new Error(`Missing skill: ${id}`);
  }

  const listing = selectCommerceSkills({
    task: "listing_optimization",
    platform: "Amazon",
    marketplace: "Amazon US",
    country: "US",
    category: "Kitchen",
  });
  if (!listing.items.length) throw new Error("No skills routed for listing");
  if (!listing.summaryLine.includes("Listing")) {
    throw new Error(`Bad summary: ${listing.summaryLine}`);
  }
  if (/Agent\s*\d|Skill\s*\d/i.test(listing.summaryLine)) {
    throw new Error("UX leak: ordinal Agent/Skill labels");
  }

  const amzList = getSkillById("amazon_listing_optimization")!;
  if (amzList.versions.length < 2) {
    throw new Error("Expected version history for amazon_listing_optimization");
  }
  try {
    assertVersionNotOverwrite(amzList, amzList.latestVersion);
    throw new Error("Expected overwrite guard to throw");
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("already exists")) {
      throw e;
    }
  }

  // TikTok routing should not pick Amazon listing as primary when platform TikTok
  const tt = selectCommerceSkills({
    task: "content_analysis",
    platform: "TikTok Shop",
    marketplace: "TikTok US",
    country: "US",
  });
  if (!tt.skillIds.some((id) => id.startsWith("tiktok_"))) {
    throw new Error(`Expected TikTok skill, got ${tt.skillIds.join(",")}`);
  }

  console.log("PASS: Skills infrastructure OK");
  console.log(`  packs=${COMMERCE_SKILL_PACKS.length}`);
  console.log(`  listing summary: ${listing.summaryLine}`);
  console.log(`  listing skills: ${listing.skillIds.join(", ")}`);
  console.log(`  tiktok skills: ${tt.skillIds.join(", ")}`);
}

main();
