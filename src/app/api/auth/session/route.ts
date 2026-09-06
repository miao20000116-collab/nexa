import { NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import { getTierCapabilities, getUserTier } from "@/modules/account/permissions/tier-policy";

export async function GET() {
  const session = await getSession();
  const tier = getUserTier(session.user);
  return NextResponse.json({
    ...session,
    tier: getTierCapabilities(tier),
  });
}
