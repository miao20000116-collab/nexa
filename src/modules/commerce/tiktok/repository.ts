import { prisma, isDatabaseAvailable } from "@/lib/db";
import { getActiveStoreContext } from "@/modules/commerce/store/active-store";
import {
  TIKTOK_DEMO_STORE_ID,
  type TikTokSeedStore,
} from "./demo-seed";
import { ensureTikTokDemoStoreFile } from "./file-store";

function tiktokDb() {
  return prisma as unknown as {
    tikTokDemoStore: {
      findUnique: (args: unknown) => Promise<{ id: string; products: { id: string }[] } | null>;
      upsert: (args: unknown) => Promise<unknown>;
    };
    tikTokDemoProduct: { upsert: (args: unknown) => Promise<unknown> };
    tikTokDemoDailyMetric: {
      count: (args: unknown) => Promise<number>;
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
    tikTokDemoCreator: { upsert: (args: unknown) => Promise<unknown> };
    tikTokDemoVideo: { upsert: (args: unknown) => Promise<unknown> };
    tikTokDemoVideoDaily: {
      count: (args: unknown) => Promise<number>;
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
  };
}

export async function loadTikTokDemoStore(
  dataKey?: string
): Promise<TikTokSeedStore> {
  const key =
    dataKey ??
    (await getActiveStoreContext("TikTok Shop")).dataKey ??
    TIKTOK_DEMO_STORE_ID;
  const fileStore = await ensureTikTokDemoStoreFile(key);
  if (await isDatabaseAvailable()) {
    try {
      await syncToDatabase(fileStore);
    } catch {
      /* file store remains source of truth */
    }
  }
  return fileStore;
}

async function syncToDatabase(store: TikTokSeedStore) {
  const db = tiktokDb();
  const existing = await db.tikTokDemoStore.findUnique({
    where: { id: store.id },
    include: { products: { select: { id: true } } },
  });
  if (existing && existing.products.length > 0) return;

  await db.tikTokDemoStore.upsert({
    where: { id: store.id },
    create: {
      id: store.id,
      name: store.name,
      marketplace: store.marketplace,
      currency: store.currency,
      isDemo: true,
    },
    update: { name: store.name, isDemo: true },
  });

  for (const creator of store.creators) {
    await db.tikTokDemoCreator.upsert({
      where: { id: creator.id },
      create: {
        id: creator.id,
        storeId: store.id,
        handle: creator.handle,
        displayName: creator.displayName,
        niche: creator.niche,
      },
      update: {
        displayName: creator.displayName,
        niche: creator.niche,
      },
    });
  }

  for (const product of store.products) {
    await db.tikTokDemoProduct.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        storeId: store.id,
        productId: product.productId,
        sku: product.sku,
        title: product.title,
        category: product.category,
        price: product.price,
        problemProfile: product.problemProfile,
      },
      update: {
        title: product.title,
        problemProfile: product.problemProfile,
      },
    });

    const count = await db.tikTokDemoDailyMetric.count({
      where: { productId: product.id },
    });
    if (count < 90) {
      await db.tikTokDemoDailyMetric.deleteMany({
        where: { productId: product.id },
      });
      await db.tikTokDemoDailyMetric.createMany({
        data: product.metrics.map((m) => ({
          productId: product.id,
          date: new Date(`${m.date}T12:00:00.000Z`),
          exposure: m.exposure,
          clicks: m.clicks,
          orders: m.orders,
          gmv: m.gmv,
          videoGmv: m.videoGmv,
          creatorGmv: m.creatorGmv,
        })),
      });
    }
  }

  for (const video of store.videos) {
    await db.tikTokDemoVideo.upsert({
      where: { id: video.id },
      create: {
        id: video.id,
        productId:
          store.products.find((p) => p.videoIds.includes(video.id))?.id ??
          store.products[0].id,
        creatorId: video.creatorId,
        title: video.title,
        theme: video.theme,
        publishedAt: new Date(`${video.publishedAt}T12:00:00.000Z`),
      },
      update: {
        title: video.title,
        theme: video.theme,
        creatorId: video.creatorId,
      },
    });

    const vCount = await db.tikTokDemoVideoDaily.count({
      where: { videoId: video.id },
    });
    if (vCount < 90) {
      await db.tikTokDemoVideoDaily.deleteMany({
        where: { videoId: video.id },
      });
      await db.tikTokDemoVideoDaily.createMany({
        data: video.dailies.map((d) => ({
          videoId: video.id,
          date: new Date(`${d.date}T12:00:00.000Z`),
          views: d.views,
          productClicks: d.productClicks,
          orders: d.orders,
          gmv: d.gmv,
        })),
      });
    }
  }
}
