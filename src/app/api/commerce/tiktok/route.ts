import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import {
  getTikTokComplianceOverview,
  getTikTokContentView,
  getTikTokCreatorsView,
  getTikTokOverview,
  getTikTokProductDiagnosis,
  getTikTokSelectionResearch,
  listTikTokProducts,
} from "@/modules/commerce/tiktok/service";
import { resolveCommerceStoreContext } from "@/modules/commerce/store";

export async function GET(req: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  const { searchParams } = req.nextUrl;
  const view = searchParams.get("view") || "overview";
  const range = searchParams.get("range");
  const productId = searchParams.get("productId");
  const storeId = searchParams.get("storeId");

  try {
    const storeContext = await resolveCommerceStoreContext({
      storeId,
      platform: "TikTok Shop",
    });

    switch (view) {
      case "overview":
        return NextResponse.json({
          ...(await getTikTokOverview(range)),
          storeContext,
        });
      case "products":
        return NextResponse.json({
          ...(await listTikTokProducts(range)),
          storeContext,
        });
      case "product": {
        if (!productId) {
          return NextResponse.json(
            { error: "缺少 productId" },
            { status: 400 }
          );
        }
        const diagnosis = await getTikTokProductDiagnosis(productId, range);
        if (!diagnosis) {
          return NextResponse.json({ error: "商品不存在" }, { status: 404 });
        }
        return NextResponse.json({ ...diagnosis, storeContext });
      }
      case "content":
        return NextResponse.json({
          ...(await getTikTokContentView(range)),
          storeContext,
        });
      case "creators":
        return NextResponse.json({
          ...(await getTikTokCreatorsView(range)),
          storeContext,
        });
      case "selection":
        return NextResponse.json({
          ...(await getTikTokSelectionResearch(range)),
          storeContext,
        });
      case "compliance":
        return NextResponse.json({
          ...(await getTikTokComplianceOverview()),
          storeContext,
        });
      default:
        return NextResponse.json({ error: "未知 view" }, { status: 400 });
    }
  } catch (err) {
    console.error("[commerce/tiktok]", err);
    return NextResponse.json(
      { error: "加载演示数据失败" },
      { status: 500 }
    );
  }
}
