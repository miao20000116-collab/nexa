import type { AiPageCapabilities } from "./types";

/**
 * Map current route → AI capabilities available on that page.
 * Honest: only list actions that the page actually implements (wired via events / href).
 */
export function resolvePageCapabilities(pathname: string): AiPageCapabilities {
  const path = pathname || "/";

  if (
    path.startsWith("/commerce/amazon/customer") ||
    path.startsWith("/commerce/tiktok/customer")
  ) {
    const tiktok = path.includes("tiktok");
    return {
      pageKey: tiktok
        ? "commerce.tiktok.customer"
        : "commerce.amazon.customer",
      pageLabel: "客户洞察",
      capabilities: [
        {
          id: "customer_analyze",
          label: "分析差评 / 痛点",
          description: "聚类差评与消息，输出高频痛点与建议",
        },
        {
          id: "customer_reply",
          label: "生成本土化回复",
          description: "按语言与回复类型起草客服 / Review 回复",
        },
        {
          id: "refine_analysis",
          label: "优化当前智能分析",
          description: "对话改写已有洞察结论",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "把客户痛点交给 Agent 规划内容",
        },
      ],
      tips: [
        "可直接点下方能力，或在本页点「分析差评 / 痛点」",
        "生成结果会记入本页「记录」，也可在工作台查看",
      ],
      agentIntro: "基于当前客户反馈，规划洞察、内容与回复任务。",
      agentExamples: [
        "把当前差评整理成 3 个高频痛点，并生成 FAQ",
        "根据当前痛点写一组自然的英文客户回复",
        "把这些消费者反馈改成一条短视频脚本",
      ],
    };
  }

  if (/\/commerce\/(amazon|tiktok)\/products\/[^/]+/.test(path)) {
    return {
      pageKey: path.includes("tiktok")
        ? "commerce.tiktok.product"
        : "commerce.amazon.product",
      pageLabel: "商品诊断",
      capabilities: [
        {
          id: "product_create_strategy",
          label: "生成策略与内容",
          description: "把诊断结论带入创作",
          href: "/create?mode=commerce",
        },
        {
          id: "product_search",
          label: "搜索竞品",
          description: "围绕本品打开搜索",
          href: "/search",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "意图识别后串联诊断 → 创作",
        },
      ],
      tips: ["诊断页主按钮在结论下方；工作台可快速跳转创作 / 搜索"],
      agentIntro: "围绕当前商品诊断，把问题推进到证据、策略和内容。",
      agentExamples: [
        "根据这款商品的诊断，生成一份可执行的优化策略",
        "搜索同类商品的消费者反馈，再提炼卖点",
        "把诊断结论做成一条种草短视频脚本",
      ],
    };
  }

  if (
    path === "/commerce/amazon" ||
    path === "/commerce/tiktok" ||
    path.startsWith("/commerce/amazon?") ||
    path.startsWith("/commerce/tiktok?")
  ) {
    const tiktok = path.includes("tiktok");
    return {
      pageKey: tiktok
        ? "commerce.tiktok.overview"
        : "commerce.amazon.overview",
      pageLabel: "经营工作台",
      capabilities: [
        {
          id: "refine_analysis",
          label: "优化当前智能分析",
          description: "按意愿改写诊断 / 建议（先滚到利润/库存/广告）",
        },
        {
          id: "deep_financial",
          label: "利润深度分析",
          description: "AI 深化利润与经营诊断（Credits）",
        },
        {
          id: "deep_inventory",
          label: "库存深度分析",
          description: "AI 深化库存风险诊断（Credits）",
        },
        {
          id: "deep_ads",
          label: "广告深度分析",
          description: "AI 深化广告诊断（Credits）",
        },
        {
          id: "customer_analyze",
          label: "分析差评 / 痛点",
          description: "滚动到客户洞察并聚类痛点",
        },
        {
          id: "customer_reply",
          label: "生成本土化回复",
          description: "起草客服 / Review 回复",
        },
        {
          id: "overview_to_create",
          label: "生成策略与内容",
          description: "针对优先事项进入创作",
          href: "/create?mode=commerce",
        },
        {
          id: "overview_products",
          label: "进入商品诊断",
          href: tiktok
            ? "/commerce/tiktok#products"
            : "/commerce/amazon#products",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "描述目标，自动选能力与链路",
        },
      ],
      tips: [
        "各模块打开即有今日基线分析；深度分析消耗 Credits",
        "有分析结果后，对话可直接说「改得更可执行」",
      ],
      agentIntro: "从当前经营信号出发，规划诊断、研究和后续内容动作。",
      agentExamples: [
        "根据当前异常，列出今天最该完成的三步",
        "分析这款商品销量下降可能由什么造成",
        "把经营诊断转成一组广告素材和商品卖点",
      ],
    };
  }

  if (path.startsWith("/create")) {
    return {
      pageKey: "create",
      pageLabel: "创作",
      capabilities: [
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "按已接入能力规划并执行创作链路",
        },
        {
          id: "create_script",
          label: "生成文案脚本",
          description: "在创作项目内生成字段内容",
        },
        {
          id: "create_from_link",
          label: "链接同款二创",
          description: "解析社交链接结构后二创",
          href: "/create?mode=link",
        },
      ],
      tips: [
        "点「创作 Agent」或切到对话描述目标",
        "在具体项目页点「生成文案脚本」会直接触发生成",
      ],
      agentIntro: "明确目标后，Agent 会选择合适的创作链路并执行已接入步骤。",
      agentExamples: [
        "把这篇长文改成一篇有观点的小红书笔记",
        "为一次成都旅行规划 30 秒短视频脚本和分镜",
        "根据参考视频的节奏做一条原创短视频",
      ],
      agentInputPlaceholder: "描述要做的内容，规划并执行…",
    };
  }

  if (path.startsWith("/workspace")) {
    return {
      pageKey: "workspace",
      pageLabel: "工作区",
      capabilities: [
        {
          id: "workspace_summarize",
          label: "快速分析 · 总结",
          description: "基于已抓取资料生成结论",
        },
        {
          id: "workspace_research",
          label: "深入研究报告",
          description: "发起结构化长报告",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "研究后创作链路",
        },
      ],
      tips: ["请先加入资料再点快速分析；深入研究会打开配置面板"],
      agentIntro: "基于已选资料，继续做总结、比较、深入研究或直接开始创作。",
      agentExamples: [
        "比较当前资料的主要观点，给出有证据的结论",
        "提取适合做短视频的画面、结构和表达角度",
        "根据当前资料生成一份原创内容创作方案",
      ],
    };
  }

  if (path.startsWith("/search") || path === "/") {
    return {
      pageKey: path.startsWith("/search") ? "search" : "home",
      pageLabel: path.startsWith("/search") ? "搜索结果" : "首页",
      capabilities: [
        {
          id: "search_overview",
          label: "AI 概览",
          description: "对当前查询生成概览（搜索页）",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "把搜索目标交给 Agent 规划创作",
        },
      ],
      tips: [
        path.startsWith("/search")
          ? "有搜索结果后可点「AI 概览」重新生成"
          : "先搜索，再在结果页使用 AI 概览",
      ],
      agentIntro: path.startsWith("/search")
        ? "围绕当前搜索主题，继续整理资料、研究判断或启动创作。"
        : "从一个日常问题开始，Agent 可以把搜索、研究和创作串成一条任务。",
      agentExamples: path.startsWith("/search")
        ? [
            "把当前结果整理成一份可信的结论和资料清单",
            "从当前结果中挑出最适合做视频参考的内容",
            "基于当前搜索主题，做一条原创短视频方案",
          ]
        : [
            "帮我规划成都 3 天游玩路线，并整理成行程",
            "预算 5000 元，帮我比较适合通勤的笔记本",
            "研究西红柿炒鸡蛋的画面结构，再做原创短视频",
          ],
      agentInputPlaceholder: path.startsWith("/search")
        ? "基于当前搜索继续做什么？"
        : "描述想了解或完成的事…",
    };
  }

  if (path.startsWith("/commerce")) {
    return {
      pageKey: path.includes("tiktok")
        ? "commerce.tiktok"
        : "commerce.amazon",
      pageLabel: path.includes("tiktok") ? "TikTok 经营" : "Amazon 经营",
      capabilities: [
        {
          id: "refine_analysis",
          label: "优化当前智能分析",
          description: "按你的意愿改写诊断 / 建议",
        },
        {
          id: "deep_analysis",
          label: "运行深度分析",
          description: "对当前模块做 AI 深化（Credits）",
        },
        {
          id: "creation_agent",
          label: "创作 Agent",
          description: "经营结论 → 内容链路",
        },
        {
          id: "commerce_amazon",
          label: "Amazon 经营",
          href: "/commerce/amazon",
        },
        {
          id: "commerce_tiktok",
          label: "TikTok Shop 经营",
          href: "/commerce/tiktok",
        },
      ],
      tips: [
        "打开利润 / 库存 / 广告后可用深度分析与对话改写",
      ],
      agentIntro: "围绕当前经营页面，规划诊断、研究与内容动作。",
      agentExamples: [
        "根据当前经营问题，列出下一步行动",
        "把诊断结论整理成内容优化方案",
      ],
    };
  }

  return {
    pageKey: "general",
    pageLabel: "当前页面",
    capabilities: [
      {
        id: "creation_agent",
        label: "创作 Agent",
        description: "描述目标，自动判断意图与所需能力",
      },
    ],
    tips: ["本页无专用能力时，可用 Agent 做意图识别与创作规划。"],
    agentIntro: "描述目标后，Agent 会在已接入能力范围内规划下一步。",
    agentExamples: [
      "帮我把一个问题拆成研究和创作任务",
      "为这个主题规划一条可执行的内容链路",
    ],
  };
}
