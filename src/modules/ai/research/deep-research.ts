/**
 * Deep Research pipeline:
 * Query → Planning → Multi Search → Dedup → Relevance → Evidence → Synthesis → Report
 * Never dump massive corpora into the LLM. Never show chain-of-thought to users.
 */

import { AIGateway, CapabilityNotConfiguredError } from "@/modules/ai/gateway/ai-gateway";
import { retrieveForQuery } from "@/modules/ai/rag/retrieve";
import {
  normalizeResearchReport,
  researchReportToJson,
} from "@/modules/ai/research/normalize-report";
import { scoreQueryRelevance } from "@/modules/search/services/relevance-validator";
import {
  buildResearchActions,
  buildResearchPlan,
  detectContradictions,
  planSummary,
  scoreSourceQuality,
  type EvidenceRecord,
} from "@/modules/research/services/intelligent-research";

export type DeepResearchInput = {
  goal: string;
  reportType?: string;
  userId?: string | null;
  jobId?: string;
  workspaceId?: string;
  seedSources?: Array<{ title?: string; url: string; snippet?: string }>;
  search: (query: string) => Promise<
    Array<{ title?: string; url: string; snippet?: string; content?: string }>
  >;
};

export type DeepResearchReport = Record<string, unknown>;

function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.url.replace(/#.*$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function scoreRelevance(
  item: { title?: string; snippet?: string; url: string },
  goal: string
): number {
  const text = `${item.title ?? ""} ${item.snippet ?? ""} ${item.url}`;
  return scoreQueryRelevance(text, goal);
}

export async function runDeepResearchPipeline(
  input: DeepResearchInput
): Promise<{ status: string; report?: DeepResearchReport; error?: string }> {
  if (!AIGateway.isAvailable("research") && !AIGateway.isAvailable("generateText")) {
    return { status: "blocked_ai_unavailable" };
  }

  const callOpts = {
    userId: input.userId,
    referenceId: input.jobId ?? "deep_research",
  };

  try {
    // V3.2 — Research Plan (dimension split)
    const plan = buildResearchPlan(input.goal);

    let memoryPrefix = "";
    if (input.userId) {
      try {
        const { getActiveMemoryForPrompt } = await import(
          "@/modules/memory/services/memory-service"
        );
        const mem = await getActiveMemoryForPrompt(input.userId);
        if (mem) memoryPrefix = `${mem}\n\n`;
      } catch {
        /* memory optional */
      }
    }

    // 1) Search Planning (LLM refine + plan subqueries)
    const decomp = await AIGateway.generateText(
      {
        system:
          "你是研究规划助手。将研究目标拆成 3～5 个短搜索子问题。只输出 JSON 数组，例如 [\"q1\",\"q2\"]。用简体中文。不要输出推理过程。",
        prompt: `${memoryPrefix}${input.goal}\n\n参考维度计划：\n${planSummary(plan)}`,
        temperature: 0.2,
        maxTokens: 400,
      },
      callOpts
    );
    let subqueries: string[] = [];
    try {
      const m = decomp.text.match(/\[[\s\S]*\]/);
      subqueries = m ? (JSON.parse(m[0]) as string[]) : [];
    } catch {
      subqueries = [];
    }
    if (!subqueries.length) {
      subqueries = plan.map((p) => p.subquery).slice(0, 5);
    }
    subqueries = subqueries.slice(0, 5);

    // 2) Multi Search
    const collected: Array<{
      title?: string;
      url: string;
      snippet?: string;
      content?: string;
    }> = [...(input.seedSources ?? [])];

    for (const q of subqueries) {
      const hits = await input.search(q);
      collected.push(...hits.slice(0, 8));
    }

    // 3) Dedup
    let unique = dedupeByUrl(collected);

    // 4) Relevance filter
    unique = unique
      .map((u) => ({ u, score: scoreRelevance(u, input.goal) }))
      .filter((x) => x.score > 0 || (input.seedSources ?? []).some((s) => s.url === x.u.url))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.u)
      .slice(0, 40);

    if (!unique.length) {
      return { status: "failed", error: "NO_RELEVANT_SOURCES" };
    }

    // 5) Evidence clustering (compact titles only)
    const titleList = unique
      .map((u, i) => `${i + 1}. ${u.title || u.url}`)
      .join("\n");
    const clusterOut = await AIGateway.generateText(
      {
        system:
          "根据标题把资料分成 3～6 个主题簇。只输出 JSON：{\"clusters\":[{\"name\":\"...\",\"indices\":[1,2]}]}。不要输出推理过程。",
        prompt: titleList,
        temperature: 0.2,
        maxTokens: 800,
      },
      callOpts
    );
    let clusters: Array<{ name: string; indices: number[] }> = [];
    try {
      const m = clusterOut.text.match(/\{[\s\S]*\}/);
      const parsed = m
        ? (JSON.parse(m[0]) as {
            clusters?: Array<{ name: string; indices: number[] }>;
          })
        : null;
      clusters = parsed?.clusters ?? [];
    } catch {
      clusters = [{ name: "综合", indices: unique.map((_, i) => i + 1) }];
    }

    // 6) Evidence notes per cluster
    const clusterNotes: string[] = [];
    for (const cluster of clusters.slice(0, 6)) {
      const members = (cluster.indices || [])
        .map((idx) => unique[idx - 1])
        .filter(Boolean)
        .slice(0, 6);
      const pack = members
        .map(
          (s) =>
            `- ${s.title || ""} | ${s.url}\n  ${(s.snippet || s.content || "").slice(0, 220)}`
        )
        .join("\n");
      const note = await AIGateway.summarize(
        pack,
        `簇「${cluster.name}」关键发现（只根据给定摘要，不要编造）`,
        callOpts
      );
      clusterNotes.push(`## ${cluster.name}\n${note}`);
    }

    // Optional RAG for long docs
    const longDocs = unique
      .filter((u) => (u.content?.length ?? 0) > 4000)
      .map((u, i) => ({
        id: `doc_${i}`,
        title: u.title,
        text: u.content || "",
      }));
    let retrieved = "";
    if (longDocs.length) {
      const chunks = await retrieveForQuery(input.goal, longDocs, 4);
      retrieved = chunks.join("\n\n---\n\n");
    }

    const reportSources = unique.slice(0, 15).map((u) => ({
      title: u.title,
      url: u.url,
      snippet: (u.snippet || u.content || "").slice(0, 300),
    }));

    // 7) Synthesis → Report (Chinese structured sections; no CoT)
    const research = await AIGateway.research(
      {
        goal: input.goal,
        reportType: input.reportType,
        sources: [
          ...reportSources,
          ...(retrieved
            ? [
                {
                  title: "长文检索片段",
                  url: "rag://retrieved",
                  snippet: retrieved.slice(0, 2000),
                },
              ]
            : []),
        ],
      },
      callOpts
    );

    const normalized = normalizeResearchReport(
      (research.report as Record<string, unknown>) ?? {
        conclusion: clusterNotes.join("\n\n").slice(0, 2000),
        findings: [],
        evidence: [],
        sources: reportSources,
      },
      { goal: input.goal, sources: reportSources }
    );

    // V3.2 — Evidence with timestamp + internal quality; contradictions; actions
    const now = new Date().toISOString();
    const evidenceRecords: EvidenceRecord[] = normalized.evidence.map((e, i) => {
      const src =
        normalized.sources.find((s) => e.sourceIds.includes(s.id)) ||
        normalized.sources[i % Math.max(normalized.sources.length, 1)];
      const quality = scoreSourceQuality({
        url: src?.url || "",
        title: src?.title,
        snippet: e.text,
        goal: input.goal,
      });
      return {
        text: e.text,
        sourceId: src?.id || `S${i + 1}`,
        sourceUrl: src?.url || "",
        sourceTitle: src?.title || "",
        timestamp: now,
        quality,
      };
    });

    const contradictions = detectContradictions(evidenceRecords);
    const disagreements = [
      ...normalized.disagreements,
      ...contradictions.map(
        (c) =>
          `${c.message} ${c.sides.map((s) => `「${s.sourceTitle}」：${s.claim}`).join(" / ")}`
      ),
    ];

    const actions = buildResearchActions({
      goal: input.goal,
      workspaceId: input.workspaceId || "",
      researchId: input.jobId,
      opportunities: normalized.opportunities,
    });

    const reportJson = researchReportToJson({
      ...normalized,
      disagreements,
      evidence: evidenceRecords.map((e) => ({
        text: e.text,
        sourceIds: [e.sourceId],
        timestamp: e.timestamp,
        sourceUrl: e.sourceUrl,
        sourceTitle: e.sourceTitle,
      })),
      contradictions: contradictions.map((c) => ({
        topic: c.topic,
        summary: c.message,
        sides: c.sides.map((s) => ({
          claim: s.claim,
          sourceIds: [s.sourceId],
          evidence: s.claim,
        })),
      })),
      plan: {
        goal: input.goal,
        dimensions: plan.map((p) => ({
          dimension: (p.dimension === "technology" ? "tech" : p.dimension) as
            | "market"
            | "user"
            | "competitor"
            | "tech"
            | "business"
            | "trend"
            | "risk",
          label: p.dimension,
          question: p.question,
          status: "done" as const,
        })),
        createdAt: now,
      },
      actions,
    });
    // Keep actions on serialized JSON for UI
    (reportJson as Record<string, unknown>).actions = actions;

    return {
      status: "completed",
      report: reportJson,
    };
  } catch (err) {
    if (err instanceof CapabilityNotConfiguredError) {
      return { status: "blocked_ai_unavailable" };
    }
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "research_failed",
    };
  }
}
