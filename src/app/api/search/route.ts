import type { SearchResponse } from "@/modules/search/types";
import { getSearchOrchestrator } from "@/modules/search/services/search-orchestrator";
import { sanitizeSearchResponse } from "@/modules/search/services/response-sanitizer";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import { trackEvent } from "@/lib/analytics";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: "请输入搜索内容" }, { status: 400 });
    }

    const orchestrator = getSearchOrchestrator();
    // Results first — AI overview is loaded separately via /api/search/overview
    // so the page is not blocked on the LLM round-trip.
    const response = await orchestrator.search(query, {
      includeOverview: false,
    });

    const dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      try {
        const session = await prisma.searchSession.create({
          data: {
            id: response.sessionId,
            query: response.query,
            normalizedQuery: response.normalizedQuery,
            intent: response.intent,
            results: {
              create: response.results.map((r) => ({
                id: r.id,
                platform: r.platform,
                sourceType: r.sourceType,
                title: r.title,
                snippet: r.snippet,
                content: r.content,
                url: r.url,
                thumbnail: r.thumbnail,
                author: r.author,
                publishedAt: r.publishedAt
                  ? new Date(r.publishedAt)
                  : undefined,
                retrievalMethod: r.retrievalMethod,
                rankScore: r.rankScore,
                rawMetadata: r.rawSource
                  ? JSON.parse(JSON.stringify(r.rawSource))
                  : undefined,
              })),
            },
          },
        });
        response.sessionId = session.id;
      } catch (dbErr) {
        console.error("Failed to persist search session:", dbErr);
      }
    }

    return NextResponse.json(sanitizeSearchResponse(response));
  } catch (err) {
    trackEvent("search_failed", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return NextResponse.json(
      { error: "搜索暂时不可用，请稍后再试" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "缺少搜索会话 ID" }, { status: 400 });
  }

  const dbAvailable = await isDatabaseAvailable();
  if (!dbAvailable) {
    return NextResponse.json(
      { error: "搜索历史暂不可用，请重新搜索" },
      { status: 503 }
    );
  }

  const session = await prisma.searchSession.findUnique({
    where: { id: sessionId },
    include: { results: { orderBy: { rankScore: "desc" } } },
  });

  if (!session) {
    return NextResponse.json({ error: "搜索会话不存在" }, { status: 404 });
  }

  const response: SearchResponse = {
    sessionId: session.id,
    query: session.query,
    normalizedQuery: session.normalizedQuery,
    intent: session.intent as SearchResponse["intent"],
    status: "ok",
    results: session.results.map((r) => ({
      id: r.id,
      type: r.platform,
      platform: r.platform as SearchResponse["results"][0]["platform"],
      sourceType: r.sourceType as SearchResponse["results"][0]["sourceType"],
      title: r.title ?? undefined,
      snippet: r.snippet ?? undefined,
      content: r.content ?? undefined,
      url: r.url,
      thumbnail: r.thumbnail ?? undefined,
      author: r.author ?? undefined,
      publishedAt: r.publishedAt?.toISOString(),
      retrievalMethod: r.retrievalMethod ?? undefined,
      rankScore: r.rankScore ?? undefined,
    })),
    overview: null,
  };

  return NextResponse.json(sanitizeSearchResponse(response));
}
