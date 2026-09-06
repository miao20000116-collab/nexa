/**
 * Acceptance helper: Store A product ids must not appear in Store B.
 * Run: npx tsx src/modules/commerce/store/verify-isolation.ts
 */

import { generateDemoStoreForDataKey } from "@/modules/commerce/amazon/demo-seed";

function main() {
  const us = generateDemoStoreForDataKey("demo_store_us_01");
  const uk = generateDemoStoreForDataKey("demo_store_uk_01");
  const de = generateDemoStoreForDataKey("demo_store_de_01");

  const usIds = new Set(us.products.map((p) => p.id));
  const ukIds = new Set(uk.products.map((p) => p.id));
  const deIds = new Set(de.products.map((p) => p.id));

  const overlapUsUk = [...usIds].filter((id) => ukIds.has(id));
  const overlapUsDe = [...usIds].filter((id) => deIds.has(id));
  const overlapUkDe = [...ukIds].filter((id) => deIds.has(id));

  if (us.id === uk.id || us.id === de.id || uk.id === de.id) {
    throw new Error("FAIL: store ids collide");
  }
  if (overlapUsUk.length || overlapUsDe.length || overlapUkDe.length) {
    throw new Error(
      `FAIL: product id overlap us∩uk=${overlapUsUk} us∩de=${overlapUsDe} uk∩de=${overlapUkDe}`
    );
  }
  if (us.marketplace === uk.marketplace || us.currency === uk.currency) {
    // US vs UK should differ
    if (us.marketplace === uk.marketplace) {
      throw new Error("FAIL: US/UK marketplace not isolated");
    }
  }

  console.log("PASS: Store isolation OK");
  console.log(`  US: ${us.id} products=[${[...usIds].join(", ")}]`);
  console.log(`  UK: ${uk.id} products=[${[...ukIds].join(", ")}]`);
  console.log(`  DE: ${de.id} products=[${[...deIds].join(", ")}]`);
}

main();
