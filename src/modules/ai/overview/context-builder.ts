/**
 * Context Builder for AI Overview.
 * Builds grounded context only from real search results — no free-form knowledge injection.
 */

import type { SearchResult } from "@/modules/search/types";

export interface OverviewSourceContext {
  id: string;
  index: number;
  title: string;
  url: string;
  snippet: string;
  platform: string;
}

export function selectRelevantSources(
  results: SearchResult[],
  max = 12
): OverviewSourceContext[] {
  // Prefer encyclopedia / official / web with content; keep order from ranker
  const scored = [...results].map((r, i) => {
    let score = (r.rankScore ?? 0) + (results.length - i) * 0.001;
    if (r.platform === "wikipedia") score += 2;
    if (r.sourceType === "encyclopedia" || r.sourceType === "official") score += 1;
    if (r.snippet || r.content) score += 0.5;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map(({ r }, index) => ({
    id: r.id,
    index: index + 1,
    title: r.title ?? "未命名来源",
    url: r.url,
    snippet: (r.snippet ?? r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 320),
    platform: r.platform,
  }));
}

export function buildOverviewContext(
  query: string,
  sources: OverviewSourceContext[]
): { system: string; prompt: string } {
  const sourcesText = sources
    .map(
      (s) =>
        `[${s.index}] id=${s.id}\n标题：${s.title}\nURL：${s.url}\n摘要：${s.snippet || "（无摘要）"}`
    )
    .join("\n\n");

  const system = `你是 Nexa AI 搜索助手，负责生成「AI Overview」（类似百度 AI+ 的结构化概览）。

硬性规则（必须遵守）：
1. 只能依据下方「搜索结果」作答，禁止使用训练知识补充未出现在结果中的事实。
2. 每个结论必须引用至少一个真实来源 id（sourceIds 使用结果的 id 字段）。
3. 禁止编造 URL、标题或来源。
4. 不要输出思维链、推理步骤或「根据我的知识」类表述。
5. 只输出最终结论 JSON，不要 Markdown。

输出格式（严格 JSON）：
{"summary":"2～4句总览，含关键事实与数字","points":[{"text":"短标题：详细说明","sourceIds":["结果id"]}]}

生成 3～5 个 points。每个 point.text 必须用「短标题：详细说明」格式（中文用全角冒号），便于编号展示。语言与用户查询一致（中文查询用简体中文）。`;

  const prompt = `用户查询：${query}

搜索结果（仅可引用这些来源）：
${sourcesText}`;

  return { system, prompt };
}

/** Post-process: keep only points with valid source ids from the context set. */
export function groundOverviewPoints(
  points: Array<{ text?: string; sourceIds?: string[] }> | undefined,
  validIds: Set<string>
): Array<{ text: string; sourceIds: string[] }> {
  return (points ?? [])
    .map((p) => ({
      text: (p.text ?? "").trim(),
      sourceIds: (p.sourceIds ?? []).filter((id) => validIds.has(id)),
    }))
    .filter((p) => p.text.length > 0 && p.sourceIds.length > 0)
    .slice(0, 5);
}
