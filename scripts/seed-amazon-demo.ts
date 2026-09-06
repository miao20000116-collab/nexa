/**
 * Regenerate Amazon Demo Store into .nexa-data/commerce/demo-store.json
 * Usage: npx tsx scripts/seed-amazon-demo.ts
 */
import { generateDemoStore } from "../src/modules/commerce/amazon/demo-seed";
import { writeDemoStoreFile } from "../src/modules/commerce/amazon/file-store";

async function main() {
  const store = generateDemoStore();
  await writeDemoStoreFile(store);
  console.log(
    `Seeded ${store.products.length} products × ${store.products[0]?.metrics.length} days → .nexa-data/commerce/demo-store.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
