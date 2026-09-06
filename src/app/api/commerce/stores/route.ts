import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import {
  getActiveStoreContext,
  listCommerceStoresResolved,
  setActiveStoreId,
} from "@/modules/commerce/store";
import { getStoreById } from "@/modules/commerce/store/catalog";
import type { CommercePlatform } from "@/modules/commerce/store/types";

export const runtime = "nodejs";

/**
 * GET /api/commerce/stores?platform=Amazon|TikTok Shop
 * Lists stores + active store. Never Fake Connected.
 */
export async function GET(req: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  const platformParam = req.nextUrl.searchParams.get("platform");
  const platform =
    platformParam === "Amazon" || platformParam === "TikTok Shop"
      ? (platformParam as CommercePlatform)
      : undefined;

  const stores = listCommerceStoresResolved().filter((s) =>
    platform ? s.platform === platform : true
  );
  const active = await getActiveStoreContext(platform);

  return NextResponse.json({
    stores,
    active,
    note: "Live OAuth/API secrets are server-side only. No NEXT_PUBLIC_* tokens. Without live API → Not Connected (never Fake Connected).",
  });
}

/**
 * POST /api/commerce/stores { action: "select", storeId }
 */
export async function POST(req: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  try {
    const body = (await req.json()) as {
      action?: string;
      storeId?: string;
    };
    if (body.action !== "select" || !body.storeId) {
      return NextResponse.json(
        { error: "Expected { action: \"select\", storeId }" },
        { status: 400 }
      );
    }
    if (!getStoreById(body.storeId)) {
      return NextResponse.json({ error: "Unknown storeId" }, { status: 404 });
    }
    await setActiveStoreId(body.storeId);
    const active = await getActiveStoreContext();
    return NextResponse.json({ ok: true, active });
  } catch (err) {
    console.error("[commerce/stores]", err);
    return NextResponse.json({ error: "Failed to select store" }, { status: 500 });
  }
}
