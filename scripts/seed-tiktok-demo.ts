/**
 * Regenerate TikTok Shop Demo Store
 * Usage: npx tsx scripts/seed-tiktok-demo.ts
 */
import { generateTikTokDemoStore } from "../src/modules/commerce/tiktok/demo-seed";
import { writeTikTokDemoStoreFile } from "../src/modules/commerce/tiktok/file-store";

async function main() {
  const store = generateTikTokDemoStore();
  await writeTikTokDemoStoreFile(store);
  console.log(
    `Seeded TikTok demo: ${store.products.length} products, ${store.videos.length} videos, ${store.creators.length} creators × ${store.products[0]?.metrics.length} days`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
