/**
 * TikTok Shop Demo intelligence — high-play/low-转化率 & low-play/high-转化率.
 */

import type {
  TikTokProductMetrics,
  TikTokVideoRow,
} from "@/modules/commerce/tiktok/types";
import { appendReturnNav } from "@/modules/commerce/lib/return-nav";
import {
  commerceCreateHref,
  commerceSearchHref,
  type CommerceIntelligenceReport,
  type IntelligenceAction,
  type IntelligenceFinding,
} from "./types";

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function cvrText(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function analyzeTikTokProduct(input: {
  product: TikTokProductMetrics;
  videos: TikTokVideoRow[];
  complianceFlags?: string[];
  claimRisks?: string[];
  listingWeaknesses?: string[];
  selection?: {
    demandScore: number;
    competitionLevel: string;
    marginEstimate: number;
    gapNotes: string;
  };
}): Omit<
  CommerceIntelligenceReport,
  "aiAssisted" | "blockedAi" | "createdAt"
> {
  const p = input.product;
  const videos = input.videos.filter((v) => v.productId === p.id);
  const findings: IntelligenceFinding[] = [];
  const shortTitleEarly = p.title.slice(0, 40);

  const sortedByViews = [...videos].sort((a, b) => b.views - a.views);
  const withCvr = videos.filter((v) => v.cvr != null && v.views > 0);
  const avgCvr =
    withCvr.length > 0
      ? withCvr.reduce((s, v) => s + (v.cvr ?? 0), 0) / withCvr.length
      : p.cvr.current;

  const highPlayLowCvr = sortedByViews
    .filter((v) => v.views >= 1000 && (v.cvr ?? 0) < avgCvr * 0.7)
    .slice(0, 3);
  const lowPlayHighCvr = [...videos]
    .filter((v) => v.views > 0 && v.views < 5000 && (v.cvr ?? 0) > avgCvr * 1.3)
    .sort((a, b) => (b.cvr ?? 0) - (a.cvr ?? 0))
    .slice(0, 3);

  // Traffic / exposure
  if ((p.exposure.deltaPct ?? 0) < -5) {
    findings.push({
      id: "tt_traffic_down",
      dimension: "traffic",
      problem: "曝光/播放走弱",
      evidence: [
        `曝光 ${Math.round(p.exposure.previous)} → ${Math.round(p.exposure.current)}（${pct(p.exposure.deltaPct)}）`,
        `点击 ${Math.round(p.clicks.previous)} → ${Math.round(p.clicks.current)}（${pct(p.clicks.deltaPct)}）`,
      ],
      suggestion: "补投内容曝光；搜索内容趋势与可复制主题后再创作。",
      severity: "high",
    });
  }

  // Conversion
  if ((p.cvr.deltaPct ?? 0) < -5) {
    findings.push({
      id: "tt_cvr_down",
      dimension: "conversion",
      problem: "商品转化率下降",
      evidence: [
        `转化率 ${cvrText(p.cvr.previous)} → ${cvrText(p.cvr.current)}（${pct(p.cvr.deltaPct)}）`,
        `订单 ${Math.round(p.orders.current)}（${pct(p.orders.deltaPct)}）`,
      ],
      suggestion: "检查落地页卖点、价格锚点与评论信任；优先优化高播放低转化视频。",
      severity: "high",
    });
  }

  if (highPlayLowCvr.length) {
    findings.push({
      id: "tt_high_play_low_cvr",
      dimension: "content",
      problem: "识别到「高播放低转化」内容",
      evidence: highPlayLowCvr.map(
        (v) =>
          `${v.title} · 播放 ${v.views} · 转化率 ${cvrText(v.cvr)} · 成交额 ${money(v.gmv)}`
      ),
      suggestion: "保留流量钩子，重做商品展示与 CTA；可搜索用户反馈改进脚本。",
      severity: "high",
    });
  }

  if (lowPlayHighCvr.length) {
    findings.push({
      id: "tt_low_play_high_cvr",
      dimension: "content",
      problem: "识别到「低播放高转化」内容",
      evidence: lowPlayHighCvr.map(
        (v) =>
          `${v.title} · 播放 ${v.views} · 转化率 ${cvrText(v.cvr)} · 成交额 ${money(v.gmv)}`
      ),
      suggestion: "放大该内容主题与投放；进入创作复制高转化脚本结构。",
      severity: "positive",
    });
  }

  // 成交额 / product
  if ((p.gmv.deltaPct ?? 0) < -3) {
    findings.push({
      id: "tt_gmv_down",
      dimension: "product",
      problem: "成交额 下降",
      evidence: [
        `成交额 ${money(p.gmv.previous)} → ${money(p.gmv.current)}（${pct(p.gmv.deltaPct)}）`,
        `视频归因 成交额 ${money(p.videoGmv.current)} · 达人 成交额 ${money(p.creatorGmv.current)}`,
      ],
      suggestion: "按曝光与转化拆解；对高转化主题加大内容供给。",
      severity: "high",
    });
  }

  if ((p.creatorGmv.current / Math.max(p.gmv.current, 1)) > 0.35) {
    findings.push({
      id: "tt_creator_heavy",
      dimension: "creator",
      problem: "达人贡献占比较高",
      evidence: [
        `达人 成交额 ${money(p.creatorGmv.current)} / 总 成交额 ${money(p.gmv.current)}`,
      ],
      suggestion: "沉淀达人 Brief 与可复制主题，进入创作生成合作脚本。",
      severity: "medium",
    });
  }

  // Compliance
  if (input.complianceFlags?.length || input.claimRisks?.length) {
    findings.push({
      id: "tt_compliance",
      dimension: "compliance",
      problem: "存在内容合规 / 披露风险信号",
      evidence: [
        ...(input.claimRisks ?? []).slice(0, 2),
        `标记：${(input.complianceFlags ?? []).join("、") || "—"}`,
      ],
      suggestion: "优先改写口播与披露话术，避免审核拦截。",
      severity: "high",
      actions: [
        {
          label: "搜索平台规则",
          kind: "search",
          intent: "compliance",
          href: commerceSearchHref(
            `TikTok Shop ${shortTitleEarly} 合规 披露 限制声明`
          ),
        },
        {
          label: "生成合规改写",
          kind: "create",
          intent: "compliance",
          href: commerceCreateHref({
            goal: `合规改写「${shortTitleEarly}」口播与披露`,
            context: `【演示店】TikTok 合规｜${p.title}\n标记：${(input.complianceFlags ?? []).join("、")}\n风险：${(input.claimRisks ?? []).join("；")}`,
            platform: "TikTok Shop",
          }),
        },
      ],
    });
  }

  // 商品页 / content copy weaknesses
  if (input.listingWeaknesses?.length) {
    findings.push({
      id: "tt_listing",
      dimension: "listing",
      problem: "商品页 / 内容卖点承接偏弱",
      evidence: input.listingWeaknesses.slice(0, 3),
      suggestion: "补强前 3 秒钩子与购买理由，对齐高转化内容结构。",
      severity: "medium",
      actions: [
        {
          label: "生成商品页 / 脚本承接",
          kind: "create",
          intent: "listing",
          href: commerceCreateHref({
            goal: `为「${shortTitleEarly}」改写商品卖点与短视频承接`,
            context: `【演示店】TikTok 商品页｜${p.title}\n弱点：${input.listingWeaknesses.join("；")}`,
            platform: "TikTok Shop",
          }),
        },
      ],
    });
  }

  // Selection opportunity
  if (input.selection && input.selection.demandScore >= 65) {
    findings.push({
      id: "tt_selection",
      dimension: "selection",
      problem: "选品需求分偏强，可加大内容验证",
      evidence: [
        `需求分 ${input.selection.demandScore} · 竞争 ${input.selection.competitionLevel}`,
        `预估毛利 ${(input.selection.marginEstimate * 100).toFixed(0)}%`,
        input.selection.gapNotes,
      ],
      suggestion: "打开选品调研页，或生成选品简报后再排期内容。",
      severity: "positive",
      actions: [
        {
          label: "打开选品调研",
          kind: "link",
          intent: "selection",
          href: "/commerce/tiktok/selection",
        },
        {
          label: "生成选品简报",
          kind: "create",
          intent: "selection",
          href: commerceCreateHref({
            goal: `写 TikTok「${shortTitleEarly}」选品简报`,
            context: `【演示店】TikTok 选品｜${p.title}\n需求分 ${input.selection.demandScore}\n竞争 ${input.selection.competitionLevel}\n缺口：${input.selection.gapNotes}`,
            platform: "TikTok Shop",
          }),
        },
      ],
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "tt_stable",
      dimension: "product",
      problem: "内容与转化表现相对平稳",
      evidence: [
        `成交额 ${pct(p.gmv.deltaPct)}`,
        `转化率 ${pct(p.cvr.deltaPct)}`,
        `曝光 ${pct(p.exposure.deltaPct)}`,
      ],
      suggestion: "主动搜索内容趋势，准备下一轮主题测试。",
      severity: "low",
    });
  }

  const diagnosis =
    findings.find((f) => f.severity === "high")?.problem ||
    findings.find((f) => f.severity === "positive")?.problem ||
    findings[0]?.problem ||
    "表现平稳";

  const shortTitle = p.title.slice(0, 40);
  const contextBase = `【演示店】TikTok Shop 诊断｜${p.title}｜结论：${diagnosis}`;

  const actions: IntelligenceAction[] = [
    {
      label: "搜索竞品带货内容",
      kind: "search",
      intent: "competitor",
      href: commerceSearchHref(`TikTok Shop ${shortTitle} 竞品 带货 内容`),
    },
    {
      label: "搜索市场需求",
      kind: "search",
      intent: "market",
      href: commerceSearchHref(`${shortTitle} TikTok 市场需求 趋势`),
    },
    {
      label: "搜索用户反馈",
      kind: "search",
      intent: "feedback",
      href: commerceSearchHref(`${shortTitle} 用户评价 痛点 反馈`),
    },
    {
      label: "搜索内容趋势",
      kind: "search",
      intent: "trend",
      href: commerceSearchHref(`TikTok ${shortTitle} 内容趋势 脚本`),
    },
    {
      label: "基于诊断进入创作",
      kind: "create",
      intent: "create",
      href: commerceCreateHref({
        goal: `基于 TikTok 诊断为「${shortTitle}」创作短视频脚本`,
        context: `${contextBase}\n高播放低转化：${highPlayLowCvr.map((v) => v.title).join("、") || "无"}\n低播放高转化：${lowPlayHighCvr.map((v) => v.title).join("、") || "无"}\n建议：${findings.map((f) => f.suggestion).join("；")}`,
        platform: "TikTok Shop",
      }),
    },
    {
      label: "打开工作区继续研究",
      kind: "workspace",
      href: appendReturnNav("/workspace", "TikTok Shop"),
    },
  ];

  return {
    channel: "tiktok",
    isDemo: true,
    demoStoreLabel: "演示数据",
    productTitle: p.title,
    productKey: p.productId,
    diagnosis,
    findings,
    actions,
  };
}
