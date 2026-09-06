import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import {
  getAdsDiagnosis,
  getComplianceOverview,
  getInventoryView,
  getProductDiagnosis,
  getProfitBreakdown,
  getSelectionResearch,
  getStoreOverview,
  listProductMetrics,
} from "@/modules/commerce/amazon/service";
import {
  demoMetricsForPeriod,
  detectAnomalies,
  enrichIntelligenceWithTrends,
  type CommercePeriod,
} from "@/modules/commerce/intelligence/trends";
import type { CommerceIntelligenceReport } from "@/modules/commerce/intelligence/types";
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
      platform: "Amazon",
    });

    switch (view) {
      case "overview":
        return NextResponse.json({
          ...(await getStoreOverview(range)),
          storeContext,
        });
      case "products":
        return NextResponse.json({
          ...(await listProductMetrics(range)),
          storeContext,
        });
      case "product": {
        if (!productId) {
          return NextResponse.json(
            { error: "缺少 productId" },
            { status: 400 }
          );
        }
        const diagnosis = await getProductDiagnosis(productId, range);
        if (!diagnosis) {
          return NextResponse.json({ error: "商品不存在" }, { status: 404 });
        }
        if (
          diagnosis &&
          typeof diagnosis === "object" &&
          "findings" in diagnosis &&
          "isDemo" in diagnosis
        ) {
          const period = (searchParams.get("period") || "7d") as CommercePeriod;
          return NextResponse.json({
            ...enrichIntelligenceWithTrends(
              diagnosis as unknown as CommerceIntelligenceReport,
              period === "today" || period === "30d" ? period : "7d"
            ),
            storeContext,
          });
        }
        return NextResponse.json({ ...diagnosis, storeContext });
      }
      case "ads":
        return NextResponse.json({
          ...(await getAdsDiagnosis(range)),
          storeContext,
        });
      case "selection":
        return NextResponse.json({
          ...(await getSelectionResearch(range)),
          storeContext,
        });
      case "compliance":
        return NextResponse.json({
          ...(await getComplianceOverview()),
          storeContext,
        });
      case "profit":
        return NextResponse.json({
          ...(await getProfitBreakdown(range)),
          storeContext,
        });
      case "inventory":
        return NextResponse.json({
          ...(await getInventoryView()),
          storeContext,
        });
      case "trends": {
        const period = (searchParams.get("period") || "7d") as CommercePeriod;
        const cmp = demoMetricsForPeriod(
          period === "today" || period === "30d" ? period : "7d"
        );
        return NextResponse.json({
          isDemo: true,
          periodComparison: cmp,
          anomalies: detectAnomalies(cmp),
          message: "演示数据周期对比",
          storeContext,
        });
      }
      default:
        return NextResponse.json({ error: "未知 view" }, { status: 400 });
    }
  } catch (err) {
    console.error("[commerce/amazon]", err);
    return NextResponse.json(
      { error: "加载演示数据失败" },
      { status: 500 }
    );
  }
}
