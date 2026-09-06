import { NextRequest, NextResponse } from "next/server";
import {
  createJob,
  getJob,
  markJobBlockedAi,
  type JobType,
} from "@/modules/jobs/job-service";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import type { AICapability } from "@/modules/ai/gateway/types";

function requiredCapability(type: string): AICapability | null {
  switch (type as JobType) {
    case "deep_research":
    case "summarize":
      return "generateText";
    case "image_generate":
      return "generateImage";
    case "video_generate":
      return "generateVideo";
    case "music_generate":
      return "generateMusic";
    case "music_analyze":
      return "analyzeMusic";
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json(job);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, payload, blockIfNoAi } = body;

    if (!type) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const job = await createJob({
      type,
      payload,
      status: "queued",
    });

    if (blockIfNoAi !== false) {
      const cap = requiredCapability(String(type));
      if (cap && !AIGateway.isAvailable(cap)) {
        const blocked = await markJobBlockedAi(job.id);
        return NextResponse.json(blocked ?? job);
      }
    }

    return NextResponse.json(job);
  } catch (err) {
    console.error("[Job API]", err);
    return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
  }
}
