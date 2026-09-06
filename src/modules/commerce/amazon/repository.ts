import { prisma, isDatabaseAvailable } from "@/lib/db";
import { getActiveStoreContext } from "@/modules/commerce/store/active-store";
import { DEMO_STORE_ID, type SeedProduct, type SeedStore } from "./demo-seed";
import { ensureDemoStoreFile } from "./file-store";

/** Prisma client may lag until `prisma generate` after schema add. */
function demoDb() {
  return prisma as unknown as {
    demoStore: {
      findUnique: (args: unknown) => Promise<{ id: string; products: { id: string }[] } | null>;
      upsert: (args: unknown) => Promise<unknown>;
    };
    demoProduct: {
      upsert: (args: unknown) => Promise<unknown>;
    };
    demoDailyMetric: {
      count: (args: unknown) => Promise<number>;
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
    demoInventory: {
      upsert: (args: unknown) => Promise<unknown>;
    };
    demoAdCampaign: {
      upsert: (args: unknown) => Promise<unknown>;
    };
    demoAdDaily: {
      count: (args: unknown) => Promise<number>;
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
    demoSearchTerm: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
  };
}

/**
 * Load Amazon demo store for the active Commerce Store (or explicit dataKey).
 * Store A / Store B use different dataKeys → product ids never cross.
 */
export async function loadDemoStore(dataKey?: string): Promise<SeedStore> {
  const key =
    dataKey ??
    (await getActiveStoreContext("Amazon")).dataKey ??
    DEMO_STORE_ID;
  const fileStore = await ensureDemoStoreFile(key);

  if (await isDatabaseAvailable()) {
    try {
      await syncStoreToDatabase(fileStore);
    } catch {
      /* keep serving file store */
    }
  }

  return fileStore;
}

async function syncStoreToDatabase(store: SeedStore) {
  const db = demoDb();
  const existing = await db.demoStore.findUnique({
    where: { id: store.id },
    include: { products: { select: { id: true } } },
  });
  if (existing && existing.products.length > 0) return;

  await db.demoStore.upsert({
    where: { id: store.id },
    create: {
      id: store.id,
      name: store.name,
      marketplace: store.marketplace,
      currency: store.currency,
      isDemo: true,
    },
    update: {
      name: store.name,
      marketplace: store.marketplace,
      currency: store.currency,
      isDemo: true,
    },
  });

  for (const product of store.products) {
    await upsertProduct(store.id, product);
  }
}

async function upsertProduct(storeId: string, product: SeedProduct) {
  const db = demoDb();
  await db.demoProduct.upsert({
    where: { id: product.id },
    create: {
      id: product.id,
      storeId,
      asin: product.asin,
      sku: product.sku,
      title: product.title,
      category: product.category,
      price: product.price,
      cogs: product.cogs,
      platformFeeRate: product.platformFeeRate,
      fbaFeePerUnit: product.fbaFeePerUnit,
      logisticsFeePerUnit: product.logisticsFeePerUnit,
      problemProfile: product.problemProfile,
    },
    update: {
      title: product.title,
      price: product.price,
      cogs: product.cogs,
      problemProfile: product.problemProfile,
    },
  });

  const metricCount = await db.demoDailyMetric.count({
    where: { productId: product.id },
  });
  if (metricCount < 90) {
    await db.demoDailyMetric.deleteMany({ where: { productId: product.id } });
    await db.demoDailyMetric.createMany({
      data: product.metrics.map((m) => ({
        productId: product.id,
        date: new Date(`${m.date}T12:00:00.000Z`),
        sessions: m.sessions,
        orders: m.orders,
        units: m.units,
        sales: m.sales,
        adSpend: m.adSpend,
        adSales: m.adSales,
        adClicks: m.adClicks,
        refunds: m.refunds,
        refundUnits: m.refundUnits,
      })),
    });
  }

  await db.demoInventory.upsert({
    where: { productId: product.id },
    create: {
      productId: product.id,
      unitsOnHand: product.inventory.unitsOnHand,
      inboundUnits: product.inventory.inboundUnits,
    },
    update: {
      unitsOnHand: product.inventory.unitsOnHand,
      inboundUnits: product.inventory.inboundUnits,
    },
  });

  for (const campaign of product.campaigns) {
    await db.demoAdCampaign.upsert({
      where: { id: campaign.id },
      create: {
        id: campaign.id,
        productId: product.id,
        name: campaign.name,
        type: campaign.type,
        status: campaign.status,
      },
      update: {
        name: campaign.name,
        status: campaign.status,
      },
    });

    const dailyCount = await db.demoAdDaily.count({
      where: { campaignId: campaign.id },
    });
    if (dailyCount < 90) {
      await db.demoAdDaily.deleteMany({ where: { campaignId: campaign.id } });
      await db.demoSearchTerm.deleteMany({ where: { campaignId: campaign.id } });
      await db.demoAdDaily.createMany({
        data: campaign.dailies.map((d) => ({
          campaignId: campaign.id,
          date: new Date(`${d.date}T12:00:00.000Z`),
          impressions: d.impressions,
          clicks: d.clicks,
          spend: d.spend,
          orders: d.orders,
          sales: d.sales,
          placementTop: d.placementTop,
          placementProduct: d.placementProduct,
          placementRest: d.placementRest,
        })),
      });
      await db.demoSearchTerm.createMany({
        data: campaign.terms.map((t) => ({
          campaignId: campaign.id,
          term: t.term,
          date: new Date(`${t.date}T12:00:00.000Z`),
          impressions: t.impressions,
          clicks: t.clicks,
          spend: t.spend,
          orders: t.orders,
          sales: t.sales,
        })),
      });
    }
  }
}
