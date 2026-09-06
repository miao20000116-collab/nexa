/**
 * V1 P1 search quality regression.
 * Run: npx tsx scripts/p1-search-regression.ts
 */
import { getSearchOrchestrator } from "../src/modules/search/services/search-orchestrator";

process.env.SEARCH_DEBUG = "true";

const QUERIES = [
  "什么是 RAG？",
  "OpenAI 最近有什么新闻？",
  "AI眼镜",
  "X 上最近大家怎么看 AI Agent？",
  "AI眼镜图片",
  "人工智能最近有什么新闻？",
];

async function main() {
  const orch = getSearchOrchestrator();

  for (const query of QUERIES) {
    console.log("\n" + "=".repeat(64));
    console.log(`Query: ${query}`);
    const start = Date.now();
    const res = await orch.search(query);
    const ms = Date.now() - start;

    console.log(
      `status=${res.status} intent=${res.intent} count=${res.results.length} ${ms}ms`
    );
    if (res.debug) {
      console.log(
        `returned=${JSON.stringify(res.debug.resultsReturned)} filtered=${res.debug.resultsFiltered}`
      );
      if (Object.keys(res.debug.providerErrors ?? {}).length) {
        console.log("errors=", res.debug.providerErrors);
      }
    }

    for (const r of res.results.slice(0, 5)) {
      const host = (() => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return "?";
        }
      })();
      console.log(
        `  [${r.platform}/${r.sourceType}] ${host} | ${(r.title ?? "").slice(0, 60)} | thumb=${Boolean(r.thumbnail)}`
      );
    }

    // Soft assertions for reporting
    const hosts = res.results.map((r) => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return "";
      }
    });

    if (query.includes("RAG")) {
      const wiki = res.results.find((r) => r.platform === "wikipedia");
      console.log(
        wiki
          ? `CHECK wiki: ${wiki.title}`
          : "CHECK wiki: MISSING (web-only ok if relevant)"
      );
    }
    if (query.includes("X 上")) {
      const bad = hosts.filter(
        (h) => h && !/x\.com|twitter\.com|reddit\.com|xiaohongshu|tiktok/.test(h)
      );
      console.log(
        bad.length
          ? `CHECK social host FAIL: ${bad.slice(0, 3).join(",")}`
          : "CHECK social hosts: OK (or empty)"
      );
    }
    if (query.includes("图片")) {
      const imgs = res.results.filter((r) => r.sourceType === "image");
      const withThumb = imgs.filter((r) => r.thumbnail);
      console.log(
        `CHECK images: ${imgs.length} image-typed, ${withThumb.length} with thumbnail`
      );
    }
    if (query.includes("新闻")) {
      const githubHeavy = res.results
        .slice(0, 3)
        .filter((r) => r.url.includes("github.com"));
      console.log(
        githubHeavy.length
          ? `CHECK news: github in top3 (${githubHeavy.length})`
          : "CHECK news: top3 not github-dominated"
      );
    }
    if (query === "AI眼镜") {
      const relevant = res.results.filter((r) =>
        /眼镜|glasses|智能眼镜/i.test(
          `${r.title ?? ""} ${r.snippet ?? ""} ${r.url}`
        )
      );
      console.log(
        `CHECK AI眼镜 relevance: ${relevant.length}/${res.results.length} mention glasses`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
