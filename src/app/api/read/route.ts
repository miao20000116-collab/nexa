import { NextRequest, NextResponse } from "next/server";
import {
  assertPublicHttpUrl,
  extractReadableContent,
  fetchThroughEgress,
  hasFetchProxy,
} from "@/lib/read/fetch-page";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "缺少 url" }, { status: 400 });
  }

  try {
    await assertPublicHttpUrl(url);
  } catch {
    return NextResponse.json(
      { error: "链接无效或不允许访问该主机" },
      { status: 400 }
    );
  }
  const parsed = new URL(url);

  try {
    const response = await fetchThroughEgress(parsed.toString());
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `无法打开该页面（${response.status}）`,
          sourceUrl: parsed.toString(),
          proxyConfigured: hasFetchProxy(),
        },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/pdf") ||
      contentType.includes("image/") ||
      contentType.includes("video/") ||
      contentType.includes("audio/")
    ) {
      return NextResponse.json({
        sourceUrl: parsed.toString(),
        title: parsed.hostname,
        text: "",
        binary: true,
        contentType,
        proxyConfigured: hasFetchProxy(),
        message:
          "该来源是媒体或文件，Nexa 不在此播放或下载原文件。可将搜索结果加入工作区，基于已获取的元数据继续研究与创作。",
      });
    }

    const html = await response.text();
    const { title, text } = extractReadableContent(html, parsed.toString());

    if (!text || text.length < 40) {
      return NextResponse.json({
        sourceUrl: parsed.toString(),
        title: title || parsed.hostname,
        text: text || "",
        thin: true,
        proxyConfigured: hasFetchProxy(),
        message:
          "页面内容较少，或需要登录/脚本渲染。Nexa 仅展示已获取的公开文本，不保证可打开原站。",
      });
    }

    return NextResponse.json({
      sourceUrl: parsed.toString(),
      title,
      text,
      proxyConfigured: hasFetchProxy(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[read API]", message);
    return NextResponse.json(
      {
        error: hasFetchProxy()
          ? "抓取失败，请稍后重试"
          : "该来源当前无法形成 Nexa 可预览内容。",
        sourceUrl: parsed.toString(),
        proxyConfigured: hasFetchProxy(),
      },
      { status: 502 }
    );
  }
}
