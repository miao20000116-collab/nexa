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
};

const PHRASE_EXPANSIONS: Array<{ pattern: RegExp; expansions: string[] }> = [
  { pattern: /AI\s*眼镜|人工智能眼镜|智能眼镜/i, expansions: ["AI glasses", "smart glasses", "AI眼镜", "智能眼镜"] },
  { pattern: /人工智能/, expansions: ["AI", "artificial intelligence", "人工智能"] },
  { pattern: /AI\s*Agent/i, expansions: ["AI Agent", "AI agents"] },
];

export function rewriteQuery(query: string): string[] {
  const cleaned = cleanQuery(query)
    .replace(/图片|照片|图像/g, " ")
    .replace(/新闻|消息|动态/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const queries = new Set<string>();

  if (cleaned) queries.add(cleaned);

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

  // Prefer keeping compact Chinese compounds like 眼镜
  if (/眼镜/.test(query)) queries.add("眼镜");

  return [...queries].sort((a, b) => {
    const aIsAcronym = /^[A-Z]{2,}$/.test(a);
    const bIsAcronym = /^[A-Z]{2,}$/.test(b);
    if (aIsAcronym && !bIsAcronym) return -1;
    if (!aIsAcronym && bIsAcronym) return 1;
    const aIsEn = /^[A-Za-z]/.test(a);
    const bIsEn = /^[A-Za-z]/.test(b);
    if (aIsEn && !bIsEn) return -1;
    if (!aIsEn && bIsEn) return 1;
    return a.length - b.length;
  });
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
