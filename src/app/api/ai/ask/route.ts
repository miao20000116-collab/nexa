import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/account/auth/service";
import { AIOrchestrator } from "@/modules/ai/orchestrator/ai-orchestrator";
import {
  AIError,
  AIUnavailableError,
} from "@/modules/ai/gateway/errors";

/**
 * POST /api/ai/ask
 * Server-side text generation. Never returns API keys or model names to client.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body.prompt?.trim();
    const mode = body.mode === "reason" ? "reason" : "generateText";

    if (!prompt) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }

    const session = await getSession();
    const userId = session.user?.id ?? null;

    const system =
      "你是 Nexa AI 助手。用简体中文回答，简洁准确。若不确定请说明。";

    const result =
      mode === "reason"
        ? await AIOrchestrator.reason(
            { prompt, system, temperature: 0.3 },
            { userId, referenceType: "ai_ask", referenceId: "ask" }
          )
        : await AIOrchestrator.generateText(
            { prompt, system, temperature: 0.4 },
            { userId, referenceType: "ai_ask", referenceId: "ask" }
          );

    return NextResponse.json({
      answer: result.text,
      status: "ok",
    });
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      return NextResponse.json(
        { error: "AI 服务暂未接入", code: err.code },
        { status: 503 }
      );
    }
    if (err instanceof AIError) {
      const status =
        err.code === "ai_rate_limit"
          ? 429
          : err.code === "ai_timeout"
            ? 504
            : 502;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      );
    }
    console.error("[AI Ask]", err);
    return NextResponse.json(
      { error: "AI 服务暂时不可用", code: "ai_error" },
      { status: 502 }
    );
  }
}
