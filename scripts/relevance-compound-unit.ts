/**
 * Offline compound-relevance unit tests (no Bing / SearXNG required).
 * Run: npx tsx scripts/relevance-compound-unit.ts
 */
import {
  analyzeRelevance,
  computeRelevanceScore,
} from "../src/modules/search/services/relevance-validator";
import { rewriteQuery, pickRecallQuery } from "../src/modules/search/services/query-rewriter";
import type { SearchResult } from "../src/modules/search/types";

function hit(
  title: string,
  snippet = "",
  url = "https://example.com/a"
): SearchResult {
  return {
    id: title,
    type: "web",
    platform: "web",
    sourceType: "web",
    title,
    snippet,
    content: snippet,
    url,
  };
}

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

function expectOrder(query: string, better: SearchResult, worse: SearchResult) {
  const a = computeRelevanceScore(better, query);
  const b = computeRelevanceScore(worse, query);
  assert(
    a > b,
    `"${query}" score(${better.title!.slice(0, 24)})=${a.toFixed(3)} > score(${worse.title!.slice(0, 24)})=${b.toFixed(3)}`
  );
}

// --- Dish compound ---
expectOrder(
  "西红柿炒鸡蛋",
  hit("西红柿炒鸡蛋的做法", "家常菜步骤"),
  hit("西红柿的功效与作用及禁忌", "营养价值", "https://health.baidu.com/x")
);
expectOrder(
  "西红柿炒蛋",
  hit("番茄炒蛋家常做法", "两菜一蛋"),
  hit("西红柿（中药）_百度百科", "茄科", "https://baike.baidu.com/item/x")
);
assert(
  analyzeRelevance(hit("西红柿的功效"), "西红柿").score >= 0.4,
  "single-concept 西红柿 may match ingredient pages"
);
assert(
  analyzeRelevance(hit("西红柿的功效"), "西红柿炒鸡蛋").weakOnlyMatch === true ||
    analyzeRelevance(hit("西红柿的功效"), "西红柿炒鸡蛋").score < 0.12,
  "西红柿功效 is weak/partial for 西红柿炒鸡蛋"
);

// --- AI glasses ---
expectOrder(
  "AI眼镜",
  hit("智能眼镜评测：AI glasses 新品", "meta rayban"),
  hit("OpenAI 发布新一代 AI 模型", "大模型新闻")
);

// --- E2EE ---
expectOrder(
  "端到端加密",
  hit("什么是端到端加密（E2EE）", "end-to-end encryption"),
  hit("常见对称加密算法介绍", "AES DES")
);

// --- Quantum ---
expectOrder(
  "量子纠缠",
  hit("量子纠缠是什么？通俗解释", "量子力学"),
  hit("量子计算公司融资新闻", "量子概念股")
);

// --- Photography beginner rewrite is recall-only ---
const photoRecall = pickRecallQuery("零基础学摄影");
assert(
  /摄影/.test(photoRecall) && !photoRecall.startsWith("零"),
  `recall for 零基础学摄影 prefers 摄影… got "${photoRecall}"`
);
assert(
  rewriteQuery("西红柿炒鸡蛋").some((q) => /做法|番茄/.test(q)),
  "dish recall expansions present"
);

// --- Coverage flags ---
const full = analyzeRelevance(
  hit("成都三日游攻略：经典行程", "宽窄巷子"),
  "成都三日游攻略"
);
assert(full.fullConceptHit || full.score >= 0.55, "travel full concept scores well");

assert(
  computeRelevanceScore(
    hit("Amazon.com. Spend less. Smile more.", "", "https://www.amazon.com/"),
    "Amazon Listing 优化"
  ) < 0.2,
  "Amazon homepage alone is not strong for Amazon Listing 优化"
);
expectOrder(
  "Amazon Listing 优化",
  hit("Amazon Listing 优化完整指南", "标题转化率 A+页面"),
  hit("Amazon.com. Spend less. Smile more.", "", "https://www.amazon.com/")
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll compound relevance unit checks passed.");
