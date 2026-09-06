/**
 * Query rewriting is for *provider recall only*.
 * Relevance must always be scored against the user's original query
 * (see relevance-validator.ts) — rewrite strings never prove relevance alone.
 */

const QUESTION_PREFIXES = [
  /^什么是\s*/,
  /^什么叫\s*/,
  /^何为\s*/,
  /^介绍一下?\s*/,
  /^请介绍\s*/,
  /^告诉我\s*/,
  /^了解\s*/,
  /^查询\s*/,
  /^搜索\s*/,
  /^what\s+is\s+/i,
  /^what\s+are\s+/i,
  /^who\s+is\s+/i,
  /^define\s+/i,
  /^explain\s+/i,
];

const QUESTION_SUFFIXES = /[？?！!。，,；;：:]+$/g;

const FILLER_WORDS = new Set([
  "什么",
  "如何",
  "怎么",
  "为什么",
  "最近",
  "最新",
  "大家",
  "关于",
  "一下",
  "介绍",
]);

export function cleanQuery(query: string): string {
  let cleaned = query.trim();
  for (const prefix of QUESTION_PREFIXES) {
    cleaned = cleaned.replace(prefix, "");
  }
  return cleaned.replace(QUESTION_SUFFIXES, "").trim();
}

function isValidChineseTerm(term: string): boolean {
  if (FILLER_WORDS.has(term)) return false;
  if (/^[上在的与和或是对把将被给]/.test(term)) return false;
  if (/^(最近|大家|怎么|如何|什么|有没有)/.test(term) && term.length < 8)
    return false;
  return term.length >= 2;
}

const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  RAG: ["Retrieval-augmented generation", "检索增强生成"],
  LLM: ["Large language model", "大语言模型"],
  GPT: ["Generative pre-trained transformer"],
  API: ["Application programming interface"],
  OCR: ["Optical character recognition"],
  E2EE: ["end-to-end encryption", "端到端加密"],
};

/**
 * Recall expansions — alternate SERP queries. Not relevance evidence.
 */
const PHRASE_EXPANSIONS: Array<{ pattern: RegExp; expansions: string[] }> = [
  {
    pattern: /AI\s*眼镜|人工智能眼镜|智能眼镜/i,
    expansions: ["AI glasses", "smart glasses", "AI眼镜", "智能眼镜"],
  },
  {
    pattern: /人工智能/,
    expansions: ["AI", "artificial intelligence", "人工智能"],
  },
  { pattern: /AI\s*Agent/i, expansions: ["AI Agent", "AI agents"] },
  {
    pattern: /端到端加密|E2EE/i,
    expansions: ["端到端加密", "E2EE", "end-to-end encryption"],
  },
  {
    pattern: /量子纠缠/,
    expansions: ["量子纠缠", "quantum entanglement"],
  },
  {
    pattern: /量子计算/,
    expansions: ["量子计算", "quantum computing"],
  },
  {
    pattern: /西红柿炒蛋|西红柿炒鸡蛋|番茄炒蛋/,
    expansions: ["西红柿炒鸡蛋 做法", "番茄炒蛋 做法", "西红柿炒鸡蛋"],
  },
  {
    pattern: /成都/,
    expansions: ["成都旅游攻略 行程", "成都三日游攻略"],
  },
  {
    pattern: /Amazon\s*Listing/i,
    expansions: ["Amazon Listing optimization", "Amazon Listing 优化"],
  },
  {
    pattern: /TikTok\s*Shop/i,
    expansions: ["TikTok Shop ads", "TikTok Shop 广告投放"],
  },
  {
    pattern: /光刻机/,
    expansions: ["光刻机", "EUV lithography", "半导体光刻机"],
  },
];

/**
 * Long chatty questions confuse Bing CN (e.g. 「第一次…」→「第」字典页).
 * Compress to place + trip + intent keywords for provider recall only.
 */
export function compressConversationalQuery(query: string): string | null {
  const q = query.trim();
  if (q.length < 12 && !/[？?，,]/.test(q)) return null;
  if (!/玩|游|路线|攻略|行程|安排|预约|怎么|如何|值得|第一次/.test(q)) {
    return null;
  }

  // Prefer「去成都」— capture 2-char city, do not swallow trailing 玩
  const placeMatch =
    q.match(/(?:去|到|在)([\u4e00-\u9fff]{2})(?:玩|旅游|旅行|游玩|自由行|逛|市)?/) ||
    q.match(/([\u4e00-\u9fff]{2,3})(?:旅游|旅行|游玩|自由行)/) ||
    q.match(/^([\u4e00-\u9fff]{2,4})(?=三日|一日|两日|旅游|攻略)/);
  if (!placeMatch) return null;
  const place = placeMatch[1];
  if (
    place.length < 2 ||
    /什么|怎么|如何|哪些|第一次|可以|值得|次去|第|安排|路线/.test(place)
  ) {
    return null;
  }

  const dayNum = q.match(/(\d+)\s*天/)?.[1];
  let trip = "旅游攻略";
  if (dayNum === "3" || /三\s*天|三日/.test(q)) trip = "三日游攻略";
  else if (dayNum === "2" || /两\s*天|二日/.test(q)) trip = "两日游攻略";
  else if (dayNum === "1" || /一\s*天|一日/.test(q)) trip = "一日游攻略";
  else if (dayNum) trip = `${dayNum}日游攻略`;

  const parts = [place, trip];
  if (/路线|安排|行程/.test(q)) parts.push("行程路线");
  if (/预约|订票|门票|提前/.test(q)) parts.push("提前预约");
  return parts.join(" ");
}

/**
 * Bing CN often treats leading「零」as a character-dictionary lookup.
 * Recall-only rewrite: 零基础学摄影 → 摄影入门教程.
 */
export function rewriteBeginnerPhrase(query: string): string | null {
  const q = query.trim();
  let m = q.match(/^零基础学([\u4e00-\u9fff]{2,8})$/);
  if (m) return `${m[1]}入门教程`;
  m = q.match(/^零基础([\u4e00-\u9fff]{2,8})$/);
  if (m) return `${m[1]}入门教程`;
  m = q.match(/^零基础学?([\u4e00-\u9fff]{2,8})(教程|入门|指南|攻略)?$/);
  if (m) return `${m[1]}${m[2] || "入门教程"}`;
  return null;
}

/**
 * Short dish names get better Bing recall with a how-to cue.
 * Recall-only — relevance still judged on the original dish name.
 */
export function rewriteDishPhrase(query: string): string | null {
  const q0 = query.trim();
  if (!/炒|煎|炸|炖|煮|蒸|拌|腌|烤|做法|菜谱|怎么做|食谱/.test(q0)) {
    return null;
  }
  // User already asking about nutrition / medicine — do not force recipe recall
  if (/功效|禁忌|营养|中药/.test(q0) && !/炒|做法|菜谱|怎么做/.test(q0)) {
    return null;
  }
  const q = q0.replace(/炒蛋(?!糕)/g, "炒鸡蛋");
  if (/做法|菜谱|步骤|怎么做|食谱/.test(q)) return q;
  return `${q} 做法`;
}

/** @deprecated Use rewriteDishPhrase; kept for callers during migration. */
export function isCookingQuery(query: string): boolean {
  return rewriteDishPhrase(query) !== null || /炒|做法|菜谱/.test(query);
}

/**
 * Ordered recall queries for providers. Prefer specific expansions first.
 * Relevance scoring must NOT prefer these over the original query.
 */
export function rewriteQuery(query: string): string[] {
  const cleaned = cleanQuery(query)
    .replace(/图片|照片|图像/g, " ")
    .replace(/新闻|消息|动态/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const queries = new Set<string>();

  const beginner = rewriteBeginnerPhrase(cleaned) || rewriteBeginnerPhrase(query);
  const dish = rewriteDishPhrase(cleaned) || rewriteDishPhrase(query);
  const conversational =
    compressConversationalQuery(cleaned) || compressConversationalQuery(query);
  if (conversational) queries.add(conversational);
  if (dish) {
    queries.add(dish);
    if (/西红柿/.test(dish)) queries.add(dish.replace(/西红柿/g, "番茄"));
  }
  if (beginner) queries.add(beginner);
  // Prefer compact recall; keep cleaned as fallback only if short enough for Bing
  if (cleaned && cleaned.length <= 24) queries.add(cleaned);
  else if (cleaned && !conversational) {
    // Strip leading 第/第一次 which Bing treats as character lookup
    const stripped = cleaned.replace(/^第一次/, "").replace(/^第/, "").trim();
    if (stripped) queries.add(stripped.slice(0, 40));
  }

  for (const { pattern, expansions } of PHRASE_EXPANSIONS) {
    if (pattern.test(query) || pattern.test(cleaned)) {
      for (const expansion of expansions) queries.add(expansion);
    }
  }

  const englishTerms = cleaned.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  for (const term of englishTerms) {
    if (term.length >= 2) {
      queries.add(term);
      const upper = term.toUpperCase();
      const expansions = ACRONYM_EXPANSIONS[upper];
      if (expansions) {
        for (const expansion of expansions) queries.add(expansion);
      }
    }
  }

  const chineseOnly = cleaned.replace(/[A-Za-z0-9\s-]+/g, " ").trim();
  const chineseTerms = chineseOnly.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const term of chineseTerms) {
    if (isValidChineseTerm(term)) queries.add(term);
  }

  return [...queries].sort((a, b) => {
    // Prefer compressed travel / how-to recall over long chatty originals
    const aTrap = /^(第|零|学)/.test(a) || a.length > 36;
    const bTrap = /^(第|零|学)/.test(b) || b.length > 36;
    if (aTrap && !bTrap) return 1;
    if (!aTrap && bTrap) return -1;
    const aBoost = /做法|教程|入门|攻略|行程|预约|encryption|glasses/i.test(a)
      ? 1
      : 0;
    const bBoost = /做法|教程|入门|攻略|行程|预约|encryption|glasses/i.test(b)
      ? 1
      : 0;
    if (aBoost !== bBoost) return bBoost - aBoost;
    // Prefer shorter precise recall strings
    return a.length - b.length;
  });
}

/** Primary provider query: best recall string, never used as relevance ground truth. */
export function pickRecallQuery(query: string): string {
  const compressed = compressConversationalQuery(query);
  if (compressed) return compressed;
  const dish = rewriteDishPhrase(query);
  if (dish) return dish;
  const beginner = rewriteBeginnerPhrase(query);
  if (beginner) return beginner;
  const rewritten = rewriteQuery(query);
  return rewritten[0] ?? cleanQuery(query) ?? query;
}

export function detectQueryLanguage(
  query: string
): "zh" | "en" | "mixed" {
  const hasChinese = /[\u4e00-\u9fff]/.test(query);
  const hasEnglish = /[A-Za-z]/.test(query);
  if (hasChinese && hasEnglish) return "mixed";
  if (hasChinese) return "zh";
  return "en";
}

export function getWikipediaLanguages(query: string): ("en" | "zh")[] {
  const lang = detectQueryLanguage(query);
  if (lang === "zh") return ["zh", "en"];
  if (lang === "mixed") return ["en", "zh"];
  return ["en"];
}
