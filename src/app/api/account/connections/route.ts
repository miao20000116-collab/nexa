import { NextResponse } from "next/server";
import { getConnectionCatalog } from "@/modules/account/connections/catalog";
import { getSession } from "@/modules/account/auth/service";

export async function GET() {
  const session = await getSession();
  const items = await getConnectionCatalog();
  return NextResponse.json({
    authenticated: session.authenticated,
    items,
  });
}
