import { promises as fs } from "fs";
import path from "path";
import {
  generateTikTokDemoStore,
  TIKTOK_DEMO_STORE_ID,
  type TikTokSeedStore,
} from "./demo-seed";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "commerce");

function storePath(dataKey: string) {
  return path.join(DATA_DIR, `tiktok-demo-store-${dataKey}.json`);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readTikTokDemoStoreFile(
  dataKey: string = TIKTOK_DEMO_STORE_ID
): Promise<TikTokSeedStore | null> {
  try {
    const raw = await fs.readFile(storePath(dataKey), "utf8");
    return JSON.parse(raw) as TikTokSeedStore;
  } catch {
    if (dataKey === TIKTOK_DEMO_STORE_ID) {
      try {
        const legacy = path.join(DATA_DIR, "tiktok-demo-store.json");
        const raw = await fs.readFile(legacy, "utf8");
        return JSON.parse(raw) as TikTokSeedStore;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function writeTikTokDemoStoreFile(
  store: TikTokSeedStore
): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    storePath(store.id),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

export async function ensureTikTokDemoStoreFile(
  dataKey: string = TIKTOK_DEMO_STORE_ID
): Promise<TikTokSeedStore> {
  const existing = await readTikTokDemoStoreFile(dataKey);
  const first = existing?.products?.[0];
  const hasExpertFields = Boolean(
    first && "selection" in first && first.selection
  );
  const hasBilingualTitle = Boolean(
    first?.title && /（.+）/.test(first.title)
  );
  if (
    existing?.products?.length &&
    existing.videos?.length &&
    first?.metrics?.length &&
    first.metrics.length >= 90 &&
    hasExpertFields &&
    existing.id === dataKey &&
    hasBilingualTitle
  ) {
    return existing;
  }
  const store = generateTikTokDemoStore();
  // Ensure id matches dataKey for isolation registry
  const scoped: TikTokSeedStore = { ...store, id: dataKey };
  await writeTikTokDemoStoreFile(scoped);
  return scoped;
}
