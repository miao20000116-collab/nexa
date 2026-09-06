import { NextResponse } from "next/server";
import { listPlatformCapabilities } from "@/modules/publish/capabilities";

export async function GET() {
  return NextResponse.json({
    platforms: listPlatformCapabilities(),
  });
}
