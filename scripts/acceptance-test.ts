/**
 * Acceptance test script for Nexa V0.1.1 search pipeline.
 * Run: npx tsx scripts/acceptance-test.ts
 */
import { getSearchOrchestrator } from "../src/modules/search/services/search-orchestrator";

const TEST_QUERIES = [
  "什么是 RAG？",
  "OpenAI 最近有什么新闻？",
  "X 上最近大家怎么看 AI Agent？",
  "AI 眼镜评测视频",
  "AI 眼镜图片",
];

async function runTests() {
  process.env.SEARCH_DEBUG = "true";
  const orchestrator = getSearchOrchestrator();

  for (const query of TEST_QUERIES) {
    console.log("\n" + "=".repeat(60));
    console.log(`Query: ${query}`);
    console.log("=".repeat(60));

    try {
      const response = await orchestrator.search(query);
      console.log(`Status: ${response.status}`);
      console.log(`Intent: ${response.intent}`);
      console.log(`Results: ${response.results.length}`);
      console.log(`Overview: ${response.overview ? "yes" : "no"}`);

      if (response.debug) {
        console.log(`Rewritten: ${response.debug.rewrittenQueries.join(", ")}`);
        console.log(`Providers: ${response.debug.providersCalled.join(", ")}`);
        console.log(`Errors: ${JSON.stringify(response.debug.providerErrors)}`);
        console.log(`Filtered: ${response.debug.resultsFiltered}`);
      }

      for (const r of response.results.slice(0, 5)) {
        console.log(`  [${r.platform}] ${r.title?.slice(0, 80)}`);
      }

      if (query.includes("RAG")) {
        const hasPresident = response.results.some((r) =>
          r.title?.toLowerCase().includes("president of china")
        );
        const hasRAG = response.results.some(
          (r) =>
            r.title?.toLowerCase().includes("retrieval") ||
            r.title?.toLowerCase().includes("rag") ||
            (r.content?.toLowerCase().includes("retrieval") ?? false)
        );
        console.log(`  ✗ President of China: ${hasPresident ? "FAIL" : "PASS"}`);
        console.log(`  ✓ RAG relevant: ${hasRAG ? "PASS" : "FAIL"}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }
}

runTests();
