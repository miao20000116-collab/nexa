/**
 * Server-only cover vision for reference storyboard packages.
 * Keep out of client bundles — pulls AIGateway → credits → fs.
 */

/** Optional cover vision — best-effort, never blocks package build. */
export async function enrichCoverVision(
  coverUrl: string | null | undefined,
  context: { title?: string | null; caption?: string | null }
): Promise<string | null> {
  if (!coverUrl?.trim()) return null;
  try {
    const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
    const { bootstrapAIProviders } = await import(
      "@/modules/ai/gateway/bootstrap"
    );
    bootstrapAIProviders();
    if (!AIGateway.isAvailable("analyzeImage")) return null;
    const hint = [
      context.title ? `标题：${context.title}` : null,
      context.caption
        ? `文案线索：${context.caption.slice(0, 240)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    const prompt = `你是短视频二创分镜分析师。根据封面图用中文写：主体与场景、构图镜头感、可迁移风格、3-6 标签。100–160 字。不要臆造口播全文。${
      hint ? `\n已知：\n${hint}` : ""
    }`;
    const result = await AIGateway.analyzeImage({
      url: coverUrl,
      prompt,
    });
    const summary =
      typeof result === "object" && result && "summary" in result
        ? String((result as { summary?: string }).summary || "").trim()
        : "";
    return summary ? summary.slice(0, 500) : null;
  } catch {
    return null;
  }
}
