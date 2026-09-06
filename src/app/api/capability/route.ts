import { NextResponse } from "next/server";
import { getAICapabilityInfo } from "@/modules/ai/capability/unavailable-provider";

export async function GET() {
  return NextResponse.json(getAICapabilityInfo());
}
