/**
 * SearXNG integration acceptance tests for Nexa V0.1.2
 * Run: npx tsx scripts/searxng-acceptance-test.ts
 */
import { getSearchOrchestrator } from "../src/modules/search/services/search-orchestrator";
import { createSearXNGProvider } from "../src/modules/search/providers/searxng-provider";

process.env.SEARCH_DEBUG = "true";

interface TestResult {
  query: string;
  status: string;
  count: number;
  latencyMs: number;
  topResults: string[];
  platforms: string[];
  errors?: Record<string, string>;
}

async function testOrchestrator(query: string): Promise<TestResult> {
  const start = Date.now();
  const orchestrator = getSearchOrchestrator();
  const response = await orchestrator.search(query);
  return {
    query,
    status: response.status,
    count: response.results.length,
    latencyMs: Date.now() - start,
    topResults: response.results.slice(0, 5).map((r) => `[${r.platform}] ${r.title?.slice(0, 60)}`),
    platforms: [...new Set(response.results.map((r) => r.platform))],
    errors: response.debug?.providerErrors,
  };
}

async function testSiteSearch(site: string, query: string) {
  const provider = createSearXNGProvider();
  const start = Date.now();
  try {
    const results = await provider.searchSite(query, site, 10);
    return {
      site,
      query,
      count: results.length,
      latencyMs: Date.now() - start,
      top: results.slice(0, 3).map((r) => r.title?.slice(0, 50)),
    };
  } catch (err) {
    return {
      site,
      query,
      count: 0,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log("=== SearXNG Direct API Test ===");
  const provider = createSearXNGProvider();
  console.log("Configured:", provider.isConfigured());

  const directStart = Date.now();
  const direct = await provider.search({ query: "OpenAI", maxResults: 5 });
  console.log(`Direct OpenAI: ${direct.length} results in ${Date.now() - directStart}ms`);
  direct.slice(0, 3).forEach((r) => console.log(`  ${r.title}`));

  console.log("\n=== Nexa Orchestrator Tests ===");
  const queries = [
    "什么是 RAG？",
    "OpenAI 最近有什么新闻？",
    "AI眼镜",
    "X 上最近大家怎么看 AI Agent？",
    "AI眼镜图片",
    "OpenAI",
    "什么是 RAG",
    "AI glasses",
    "人工智能最近有什么新闻？",
  ];

  for (const q of queries) {
    const r = await testOrchestrator(q);
    console.log(`\n--- ${q} ---`);
    console.log(`Status: ${r.status} | Results: ${r.count} | ${r.latencyMs}ms`);
    console.log(`Platforms: ${r.platforms.join(", ")}`);
    r.topResults.forEach((t) => console.log(`  ${t}`));
    if (r.errors && Object.keys(r.errors).length) {
      console.log(`Errors (server only): ${JSON.stringify(r.errors)}`);
    }
  }

  console.log("\n=== Social Site Search Tests ===");
  const socialTests = [
    { site: "x.com", query: "AI Agent" },
    { site: "reddit.com", query: "AI Agent" },
    { site: "xiaohongshu.com", query: "AI眼镜" },
    { site: "tiktok.com", query: "AI glasses" },
  ];
  for (const t of socialTests) {
    const r = await testSiteSearch(t.site, t.query);
    console.log(`\nsite:${t.site} "${t.query}" => ${r.count} results (${r.latencyMs}ms)`);
    if ("error" in r) console.log(`  Error: ${r.error}`);
    else r.top?.forEach((t) => console.log(`  ${t}`));
  }

  console.log("\n=== Image Search Test ===");
  const imgStart = Date.now();
  const images = await provider.search({
    query: "AI glasses",
    categories: ["images"],
    maxResults: 10,
  });
  console.log(`Image results: ${images.length} in ${Date.now() - imgStart}ms`);
  images.slice(0, 3).forEach((r) => {
    console.log(`  ${r.title?.slice(0, 40)} | thumb: ${r.thumbnail ? "yes" : "no"}`);
  });
}

main().catch(console.error);
