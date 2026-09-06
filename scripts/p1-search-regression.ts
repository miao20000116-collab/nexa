/**
 * Search quality regression (live providers when available).
 * Run: npx tsx scripts/p1-search-regression.ts
 *
 * Also run offline: npx tsx scripts/relevance-compound-unit.ts
 */
import { getSearchOrchestrator } from "../src/modules/search/services/search-orchestrator";
import { analyzeRelevance } from "../src/modules/search/services/relevance-validator";
import { rewriteQuery } from "../src/modules/search/services/query-rewriter";
import { classifyIntent } from "../src/modules/search/services/intent-classifier";

process.env.SEARCH_DEBUG = "true";

const QUERIES = [
  "西红柿",
  "西红柿炒蛋",
  "西红柿炒鸡蛋",
  "番茄炒蛋",
  "AI眼镜",
  "端到端加密",
  "量子纠缠",
  "RAG 检索增强生成",
  "零基础学摄影",
  "成都三日游攻略",
  "光刻机",
  "Amazon Listing 优化",
  "TikTok Shop 广告投放",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "?";
  }
}

async function main() {
  const orch = getSearchOrchestrator();
  let softFails = 0;

  for (const query of QUERIES) {
    console.log("\n" + "=".repeat(64));
    console.log(`原始查询: ${query}`);
    console.log(`意图: ${classifyIntent(query)}`);
    console.log(`改写: ${rewriteQuery(query).slice(0, 5).join(" | ")}`);
    const start = Date.now();
    const res = await orch.search(query);
    const ms = Date.now() - start;

    console.log(
      `status=${res.status} n=${res.results.length} filtered≈${res.debug?.resultsFiltered ?? "?"} ${ms}ms`
    );
    if (res.debug?.providerErrors && Object.keys(res.debug.providerErrors).length) {
      console.log("providerErrors=", res.debug.providerErrors);
    }

    for (const r of res.results.slice(0, 5)) {
      const a = analyzeRelevance(r, query);
      console.log(
        `  ${hostOf(r.url)} | score=${a.score.toFixed(2)} full=${a.fullConceptHit} partial=${a.partialOnly} | ${(r.title ?? "").slice(0, 52)}`
      );
    }

    if (query === "西红柿炒鸡蛋" || query === "西红柿炒蛋" || query === "番茄炒蛋") {
      const top = res.results.slice(0, 5);
      const junk = top.filter((r) =>
        /功效|禁忌|中药|营养价值|医学科普/.test(r.title ?? "")
      );
      const good = top.filter((r) =>
        /炒蛋|炒鸡蛋|做法|菜谱|步骤|番茄炒/.test(`${r.title ?? ""}${r.snippet ?? ""}`)
      );
      if (junk.length >= 3 || (top.length >= 3 && good.length === 0)) {
        softFails++;
        console.log("CHECK dish: FAIL (ingredient junk dominates top5)");
      } else {
        console.log(`CHECK dish: OK (good=${good.length} junk=${junk.length})`);
      }
    }

    if (query === "AI眼镜") {
      const top = res.results.slice(0, 5);
      const glasses = top.filter((r) =>
        /眼镜|glasses/i.test(`${r.title ?? ""}${r.snippet ?? ""}`)
      );
      console.log(
        glasses.length >= Math.min(2, top.length)
          ? "CHECK AI眼镜: OK"
          : ((softFails++, "CHECK AI眼镜: weak glasses coverage"))
      );
    }

    if (query === "端到端加密") {
      const top = res.results.slice(0, 3);
      const ok = top.some((r) =>
        /端到端|E2EE|end-to-end/i.test(`${r.title ?? ""}${r.snippet ?? ""}`)
      );
      console.log(ok ? "CHECK E2EE: OK" : ((softFails++, "CHECK E2EE: FAIL")));
    }

    if (query === "量子纠缠") {
      const top = res.results.slice(0, 3);
      const ok = top.some((r) => /纠缠|entanglement/i.test(r.title ?? ""));
      console.log(ok ? "CHECK 量子纠缠: OK" : ((softFails++, "CHECK 量子纠缠: FAIL")));
    }
  }

  console.log("\n" + "=".repeat(64));
  console.log(
    softFails
      ? `Live regression soft-fails: ${softFails} (providers may be flaky; unit tests are authoritative for scoring)`
      : "Live regression soft checks passed."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
