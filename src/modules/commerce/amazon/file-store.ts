import { promises as fs } from "fs";
import path from "path";
import {
  DEMO_STORE_ID,
  generateDemoStoreForDataKey,
  type SeedStore,
} from "./demo-seed";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "commerce");

function storePath(dataKey: string) {
  return path.join(DATA_DIR, `demo-store-${dataKey}.json`);
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readDemoStoreFile(
  dataKey: string
): Promise<SeedStore | null> {
  try {
    const raw = await fs.readFile(storePath(dataKey), "utf8");
    return JSON.parse(raw) as SeedStore;
  } catch {
    // Legacy single-file US store (pre multi-store)
    if (dataKey === DEMO_STORE_ID) {
      try {
        const legacy = path.join(DATA_DIR, "demo-store.json");
        const raw = await fs.readFile(legacy, "utf8");
        return JSON.parse(raw) as SeedStore;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function writeDemoStoreFile(store: SeedStore): Promise<void> {
  await ensureDir();
  await fs.writeFile(
    storePath(store.id),
    JSON.stringify(store, null, 2),
    "utf8"
  );
}

/** Ensure demo store exists on disk for a given dataKey (isolated per store). */
export async function ensureDemoStoreFile(
  dataKey: string = DEMO_STORE_ID
): Promise<SeedStore> {
  const existing = await readDemoStoreFile(dataKey);
  const first = existing?.products?.[0];
  const hasExpertFields = Boolean(
    first &&
      "selection" in first &&
      first.selection &&
      Array.isArray((first as { complianceFlags?: unknown }).complianceFlags)
  );
  const idMatches = existing?.id === dataKey;
  const productsScoped = (() => {
    if (!existing?.products?.length) return false;
    if (dataKey === DEMO_STORE_ID) {
      return !existing.products.some(
        (p) => p.id.startsWith("uk_") || p.id.startsWith("de_")
      );
    }
    if (dataKey === "demo_store_uk_01") {
      return existing.products.every((p) => p.id.startsWith("uk_"));
    }
    if (dataKey === "demo_store_de_01") {
      return existing.products.every((p) => p.id.startsWith("de_"));
    }
    return true;
  })();

  const hasBilingualTitle = Boolean(
    first?.title && /（.+）/.test(first.title)
  );

  if (
    existing?.products?.length &&
    first?.metrics?.length &&
    first.metrics.length >= 90 &&
    hasExpertFields &&
    idMatches &&
    productsScoped &&
    hasBilingualTitle
  ) {
    return existing;
  }
  const store = generateDemoStoreForDataKey(dataKey);
  await writeDemoStoreFile(store);
  return store;
}
