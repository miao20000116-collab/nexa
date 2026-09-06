/**
 * V2.2 smoke tests: AI Overview grounding + Deep Research job.
 * npm run ai:smoke:v22
 */

import { promises as fs } from "fs";
import path from "path";

async function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

async function main() {
  await loadEnvFile();

  const { bootstrapAIProviders } = await import(
    "../src/modules/ai/gateway/bootstrap"
  );
  const { AIOrchestrator } = await import(
    "../src/modules/ai/orchestrator/ai-orchestrator"
  );
  const { generateOverview } = await import(
    "../src/modules/ai/router/ai-gateway"
  );
  const { runDeepResearchPipeline } = await import(
    "../src/modules/ai/research/deep-research"
  );
  const { getSearchOrchestrator } = await import(
    "../src/modules/search/services/search-orchestrator"
  );

  bootstrapAIProviders();
  const aiReady = AIOrchestrator.isAvailable("generateText");

  const report: Record<string, unknown> = {
    test: "V2.2 AI Search Intelligence",
    timestamp: new Date().toISOString(),
    aiReady,
  };

  // --- A) Search + Overview for 什么是 RAG？ ---
  const ragQuery = "什么是 RAG？";
  const orchestrator = getSearchOrchestrator();
  let searchResp;
  try {
    searchResp = await orchestrator.search(ragQuery);
  } catch (err) {
    searchResp = null;
    report.searchError = err instanceof Error ? err.message : String(err);
  }

  const wikiCount =
    searchResp?.results?.filter((r) => r.platform === "wikipedia").length ?? 0;
  const overview = searchResp
    ? await generateOverview(ragQuery, searchResp.results)
    : null;

  report.ragSearch = {
    query: ragQuery,
    status: searchResp?.status,
    resultCount: searchResp?.results?.length ?? 0,
    wikipedia: wikiCount,
    overviewStatus: searchResp?.overviewStatus,
    overviewReady: Boolean(overview?.points?.length),
    overviewSummary: overview?.summary?.slice(0, 300) ?? null,
    overviewPoints: overview?.points?.slice(0, 5).map((p) => ({
      text: p.text.slice(0, 160),
      sourceIds: p.sourceIds,
    })),
    grounded:
      Boolean(overview?.points?.every((p) => p.sourceIds.length > 0)) &&
      Boolean(overview?.points?.length),
  };

  // --- B) Deep Research: 研究美国 AI 眼镜市场 ---
  const researchGoal = "研究美国 AI 眼镜市场";
  if (!aiReady) {
    report.deepResearch = {
      goal: researchGoal,
      status: "blocked_ai_unavailable",
      note: "请配置 AI_BASE_URL + AI_API_KEY 后复测",
    };
  } else {
    const orchestrator = getSearchOrchestrator();
    const result = await runDeepResearchPipeline({
      goal: researchGoal,
      reportType: "full",
      userId: null,
      jobId: "smoke_v22_glasses",
      seedSources: [
        {
          title: "Smartglasses",
          url: "https://en.wikipedia.org/wiki/Smartglasses",
          snippet: "Smart glasses wearable computing market",
        },
      ],
      search: async (query) => {
        try {
          const resp = await orchestrator.search(query);
          return resp.results.map((h) => ({
            title: h.title,
            url: h.url,
            snippet: h.snippet,
            content: h.content,
          }));
        } catch {
          return [];
        }
      },
    });

    const rep = result.report as Record<string, unknown> | undefined;
    report.deepResearch = {
      goal: researchGoal,
      status: result.status,
      error: result.error,
      hasConclusion: Boolean(rep?.executiveSummary),
      findingsCount: Array.isArray(rep?.keyFindings)
        ? rep.keyFindings.length
        : 0,
      evidenceCount: Array.isArray(rep?.evidence) ? rep.evidence.length : 0,
      sourcesCount: Array.isArray(rep?.sources) ? rep.sources.length : 0,
      sampleConclusion:
        typeof rep?.executiveSummary === "string"
          ? rep.executiveSummary.slice(0, 400)
          : null,
      sampleSources: Array.isArray(rep?.sources)
        ? (rep.sources as Array<{ url?: string }>).slice(0, 5).map((s) => s.url)
        : [],
    };
  }

  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "v2.2-search-intelligence.json");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const mdPath = path.join(
    process.cwd(),
    "Nexa_V2.2_AI_Search_Intelligence_Test_Result.md"
  );
  const rag = report.ragSearch as Record<string, unknown>;
  const dr = report.deepResearch as Record<string, unknown>;
  const md = `# Nexa V2.2 AI Search Intelligence — Test Result

> 时间：${report.timestamp}
> AI Ready：${aiReady}

## 1. RAG 搜索：「什么是 RAG？」

| 项 | 结果 |
|---|---|
| Search status | \`${rag.status}\` |
| 结果数 | ${rag.resultCount} |
| Wikipedia | ${rag.wikipedia} |
| Overview ready | ${rag.overviewReady} |
| Grounded (每条有 sourceIds) | ${rag.grounded} |

### Overview 摘要

\`\`\`
${rag.overviewSummary ?? "（未生成 — AI 未接入或 grounding 失败）"}
\`\`\`

## 2. Deep Research：「研究美国 AI 眼镜市场」

| 项 | 结果 |
|---|---|
| status | \`${dr.status}\` |
| 研究结论 | ${dr.hasConclusion ? "有" : "无"} |
| 核心发现数 | ${dr.findingsCount ?? 0} |
| 证据数 | ${dr.evidenceCount ?? 0} |
| 来源数 | ${dr.sourcesCount ?? 0} |

### 结论摘录

\`\`\`
${dr.sampleConclusion ?? dr.note ?? dr.error ?? "—"}
\`\`\`

### 来源 URL 样本

${
  Array.isArray(dr.sampleSources) && (dr.sampleSources as string[]).length
    ? (dr.sampleSources as string[]).map((u) => `- ${u}`).join("\n")
    : "- （无）"
}

完整 JSON：\`.nexa-data/ai-tests/v2.2-search-intelligence.json\`
`;

  await fs.writeFile(mdPath, md, "utf8");
  console.log(
    JSON.stringify(
      {
        aiReady,
        ragGrounded: rag.grounded,
        researchStatus: dr.status,
        jsonPath,
        mdPath,
      },
      null,
      2
    )
  );

  if (!aiReady) process.exitCode = 2;
  else if (dr.status !== "completed" || !rag.grounded) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
