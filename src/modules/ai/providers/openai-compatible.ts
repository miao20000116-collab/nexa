/**
 * Legacy search LLM adapter — delegates to domestic OpenAI-compatible text provider.
 * Prefer AIGateway for new code.
 */

import type { AIOverview, SearchIntent, SearchResult } from "@/modules/search/types";
import { getDomesticTextProvider } from "./domestic-text";

export interface LLMProvider {
  classifyIntent(query: string): Promise<SearchIntent>;
  rewriteQuery(query: string, intent: SearchIntent): Promise<string>;
  generateSearchOverview(
    query: string,
    results: SearchResult[]
  ): Promise<AIOverview>;
}

class LegacySearchLLMAdapter implements LLMProvider {
  private text = getDomesticTextProvider();

  isConfigured() {
    return this.text.isConfigured();
  }

  async classifyIntent(query: string): Promise<SearchIntent> {
    const label = await this.text.classify(query, [
      "knowledge",
      "news",
      "opinion",
      "product",
      "research",
      "social",
      "video",
      "image",
      "general",
    ]);
    return (label as SearchIntent) || "general";
  }

  async rewriteQuery(query: string, intent: SearchIntent): Promise<string> {
    return this.text.rewrite(query, `改写为更适合 ${intent} 搜索的查询，只输出查询本身`);
  }

  async generateSearchOverview(
    query: string,
    results: SearchResult[]
  ): Promise<AIOverview> {
    const sourcesText = results
      .slice(0, 15)
      .map(
        (r) =>
          `[${r.id}] ${r.title ?? "Untitled"} (${r.platform}): ${r.snippet ?? r.content ?? ""}`
      )
      .join("\n");

    const out = await this.text.generateText({
      system: `Based ONLY on sources, return JSON {"summary":"...","points":[{"text":"...","sourceIds":["id"]}]}. Each point must cite sourceIds. No unsourced facts.`,
      prompt: `Query: ${query}\n\nResults:\n${sourcesText}`,
      temperature: 0.2,
    });
    const match = out.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return valid JSON overview");
    const parsed = JSON.parse(match[0]) as AIOverview;
    const validIds = new Set(results.map((r) => r.id));
    parsed.points = (parsed.points ?? []).map((point) => ({
      ...point,
      sourceIds: (point.sourceIds ?? []).filter((id) => validIds.has(id)),
    }));
    return parsed;
  }
}

let llmInstance: LegacySearchLLMAdapter | null = null;

export function getLLMProvider(): LLMProvider & { isConfigured(): boolean } {
  if (!llmInstance) llmInstance = new LegacySearchLLMAdapter();
  return llmInstance;
}

export { getDomesticTextProvider as OpenAICompatibleProvider };
