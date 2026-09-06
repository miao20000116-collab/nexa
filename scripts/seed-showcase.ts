/**
 * Seed shared showcase (西红柿炒鸡蛋) into .nexa-data and Postgres if available.
 * Usage: npx tsx scripts/seed-showcase.ts
 * Deploy: run after migrate so every environment lists the same 2 workspaces + 2 creations.
 */
import { ensureShowcaseSeeded } from "../src/lib/showcase/ensure-seeded";
import {
  SHARED_CREATION_IDS,
  SHARED_WORKSPACE_IDS,
} from "../src/lib/showcase/shared-catalog";

async function main() {
  await ensureShowcaseSeeded();
  console.log("Showcase seeded:");
  console.log("  creations:", SHARED_CREATION_IDS.join(", "));
  console.log("  workspaces:", SHARED_WORKSPACE_IDS.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
