import type { AIOverview, SearchIntent, SearchResult } from "@/modules/search/types";
import { classifyIntentByRules } from "@/modules/search/services/intent-classifier";
import { AIGateway, CapabilityNotConfiguredError } from "@/modules/ai/gateway/ai-gateway";
import {
  buildOverviewContext,
  groundOverviewPoints,
  selectRelevantSources,
} from "@/modules/ai/overview/context-builder";

export async function classifyIntentWithFallback(
  query: string
): Promise<SearchIntent> {
  const ruleResult = classifyIntentByRules(query);
  if (ruleResult) return ruleResult;

  if (!AIGateway.isAvailable("classify")) return "general";
  try {
    const label = await AIGateway.classify(query, [
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
  } catch {
    return "general";
  }
}

/**
 * AI Overview: Query → Search results → Context Builder → LLM → grounded Answer.
 * Never answers without citing real search result ids.
 */
export async function generateOverview(
  query: string,
  results: SearchResult[],
  opts?: {
    userId?: string | null;
    accountId?: string | null;
    jobId?: string;
  }
): Promise<AIOverview | null> {
  if (results.length === 0) return null;
  if (!AIGateway.isAvailable("generateText")) return null;

  const sources = selectRelevantSources(results, 12);
  if (!sources.length) return null;

  const { system, prompt } = buildOverviewContext(query, sources);
  const validIds = new Set(sources.map((s) => s.id));

  try {
    const accountId = opts?.accountId ?? opts?.userId ?? null;
    const out = await AIGateway.generateText(
      {
        system,
        prompt,
        temperature: 0.2,
        maxTokens: 1200,
      },
      {
        userId: opts?.userId,
        accountId,
        referenceId: "ai_overview",
        jobId: opts?.jobId,
        billingCapability: "aiOverview",
      }
    );

    const match = out.text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as AIOverview;
    parsed.points = groundOverviewPoints(parsed.points, validIds);
    if (!parsed.points.length) return null;
    if (!parsed.summary?.trim()) {
      parsed.summary = parsed.points[0]?.text ?? "";
    }
    return parsed;
  } catch (err) {
    if (err instanceof CapabilityNotConfiguredError) return null;
    return null;
  }
}
