/**
 * Versioned Skill packs (V4.5-H).
 * Append-only versions — never mutate historical packs in place.
 */

import type { CommerceSkillDefinition, SkillEvidence, SkillRule } from "./types";

function ev(
  source: string,
  opts: Partial<SkillEvidence> & { platform: string; region: string }
): SkillEvidence {
  return {
    source,
    url: opts.url ?? null,
    timestamp: opts.timestamp ?? "2026-09-01T00:00:00.000Z",
    region: opts.region,
    platform: opts.platform,
  };
}

function rule(
  id: string,
  kind: SkillRule["kind"],
  statement: string,
  evidence?: SkillEvidence[]
): SkillRule {
  return { id, kind, statement, evidence };
}

const AMZ_US = ev("Amazon Seller Central · Listing quality guidance (public)", {
  platform: "Amazon",
  region: "US",
  url: "https://sellercentral.amazon.com/",
  timestamp: "2026-08-15T00:00:00.000Z",
});

const AMZ_ADS = ev("Amazon Ads · Sponsored Products concepts (public)", {
  platform: "Amazon",
  region: "US",
  url: "https://advertising.amazon.com/",
  timestamp: "2026-08-20T00:00:00.000Z",
});

const TT_US = ev("TikTok Shop Seller Academy · content & product (public)", {
  platform: "TikTok Shop",
  region: "US",
  url: "https://seller.tiktok.com/",
  timestamp: "2026-08-18T00:00:00.000Z",
});

/** Initial system skills — extensible for enterprise_private later */
export const COMMERCE_SKILL_PACKS: CommerceSkillDefinition[] = [
  {
    skillId: "amazon_listing_optimization",
    name: "Amazon Listing Optimization",
    domain: "listing",
    platform: "Amazon",
    marketplace: ["Amazon US", "Amazon UK", "Amazon DE"],
    country: ["US", "UK", "DE"],
    latestVersion: "1.1.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-07-01T00:00:00.000Z",
        changelog: "Initial listing structure rules (title / bullets / A+ risk).",
        inputs: ["productTitle", "features", "marketplace", "category", "researchNotes"],
        outputs: ["title", "bullets", "description", "localizationNotes", "risks"],
        applicableScenarios: ["generate listing", "rewrite weak listing"],
        evidenceIndex: [AMZ_US],
        decisionLogic: [
          "Prefer searchable benefit-led titles over keyword stuffing.",
          "If compliance risks present → flag Requires Review before publish.",
        ],
        rules: [
          rule("amz_list_v1_title", "platform", "Title should lead with primary product type + key differentiator; avoid promotional claims in title.", [AMZ_US]),
          rule("amz_list_v1_bullets", "business", "Bullets: one benefit per line; evidence-backed claims only.", [AMZ_US]),
        ],
      },
      {
        version: "1.1.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "Add localization ≠ translation; marketplace-specific length & language cues.",
        inputs: [
          "productTitle",
          "features",
          "marketplace",
          "country",
          "category",
          "researchNotes",
          "listingWeaknesses",
        ],
        outputs: [
          "title",
          "bullets",
          "description",
          "localizedCopy",
          "localizationNotes",
          "searchKeywords",
          "complianceNotes",
        ],
        applicableScenarios: [
          "Amazon US/UK/DE listing generate",
          "partial field rewrite",
          "listing review",
        ],
        evidenceIndex: [
          AMZ_US,
          ev("Amazon EU marketplace language norms (operator knowledge)", {
            platform: "Amazon",
            region: "EU",
            timestamp: "2026-09-01T00:00:00.000Z",
          }),
        ],
        decisionLogic: [
          "Localization ≠ translation: adapt units, seasonality, and shopping language per marketplace.",
          "If DEMO seed listingWeaknesses exist → prioritize fixing those before new keywords.",
          "Never invent review volume / BSR / search volume.",
          "Keyword suggestions must be labeled hypothesis unless backed by Search evidence.",
        ],
        rules: [
          rule(
            "amz_list_title",
            "platform",
            "Title: product type first; include 1–2 high-intent attributes; no ALL CAPS spam or unsubstantiated #1 claims.",
            [AMZ_US]
          ),
          rule(
            "amz_list_bullets",
            "business",
            "Bullets: scannable benefits → proof → use-case; keep claims verifiable.",
            [AMZ_US]
          ),
          rule(
            "amz_list_kw",
            "keyword",
            "Primary keywords belong in title/bullets naturally; do not keyword-stuff backend terms into visible copy.",
            [AMZ_US]
          ),
          rule(
            "amz_list_loc_uk",
            "localization",
            "Amazon UK: prefer British spelling/units where relevant; avoid US-only cultural references.",
            [
              ev("Amazon UK listing localization practice", {
                platform: "Amazon",
                region: "UK",
                timestamp: "2026-09-01T00:00:00.000Z",
              }),
            ]
          ),
          rule(
            "amz_list_loc_de",
            "localization",
            "Amazon DE: German-market phrasing; formal clarity; do not paste English machine translation as final copy.",
            [
              ev("Amazon DE listing localization practice", {
                platform: "Amazon",
                region: "DE",
                timestamp: "2026-09-01T00:00:00.000Z",
              }),
            ]
          ),
          rule(
            "amz_list_comp",
            "compliance",
            "Medical / absolute / guarantee claims → Potential Risk / Requires Review; never imply platform approval.",
            [AMZ_US]
          ),
          rule(
            "amz_list_cat_kitchen",
            "category",
            "Kitchen/small appliance: emphasize capacity, materials, cleaning, safety certifications when user-provided.",
            [AMZ_US]
          ),
        ],
      },
    ],
  },
  {
    skillId: "amazon_advertising_analysis",
    name: "Amazon Advertising Analysis",
    domain: "advertising",
    platform: "Amazon",
    marketplace: ["Amazon US", "Amazon UK", "Amazon DE"],
    country: ["US", "UK", "DE"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "ACOS/CTR structure + inventory gate + keyword classes from DEMO terms.",
        inputs: ["adSpend", "adSales", "searchTerms", "inventory", "range"],
        outputs: ["diagnosis", "keywordClasses", "actions", "inventoryGate"],
        applicableScenarios: ["ads diagnosis", "increase-budget decision"],
        evidenceIndex: [AMZ_ADS],
        decisionLogic: [
          "If inventory thin → block 'increase ads' recommendations.",
          "Classify terms: efficient / scale / waste / potential_negative — only from available term data.",
          "Do not invent impression share or competitor bids.",
        ],
        rules: [
          rule("amz_ads_acos", "business", "High ACOS with stable CVR → check term waste & landing page first, not blind budget cut.", [AMZ_ADS]),
          rule("amz_ads_inv", "decision", "Stockout / low days-of-cover → pause scale recommendations.", [AMZ_ADS]),
          rule("amz_ads_neg", "keyword", "Zero-converting high-spend terms are potential_negative candidates (hypothesis until confirmed).", [AMZ_ADS]),
          rule("amz_ads_plat", "platform", "Sponsored Products diagnosis must separate traffic quality vs listing conversion.", [AMZ_ADS]),
        ],
      },
    ],
  },
  {
    skillId: "amazon_product_research",
    name: "Amazon Product Research",
    domain: "product_research",
    platform: "Amazon",
    marketplace: ["Amazon US", "Amazon UK", "Amazon DE"],
    country: ["US", "UK", "DE"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "Opportunity shape + Search evidence + Incomplete profit honesty.",
        inputs: ["query", "marketplace", "country", "category", "profitInputs"],
        outputs: ["opportunity", "audience", "competition", "evidence", "recommendation"],
        applicableScenarios: ["selection analysis", "A/B/C compare"],
        evidenceIndex: [
          ev("Nexa Search evidence pipeline", {
            platform: "Amazon",
            region: "Global",
            timestamp: "2026-09-04T00:00:00.000Z",
          }),
        ],
        decisionLogic: [
          "Every claim that needs market proof must cite Search evidence Source/URL/Timestamp.",
          "Missing COGS/fees → Profit Incomplete Data — never invent margins.",
          "Recommend Proceed / Caution / Avoid with explicit uncertainty.",
        ],
        rules: [
          rule("amz_pr_ev", "business", "Opportunity statements require linked evidence; no fake demand scores.", []),
          rule("amz_pr_profit", "decision", "If cost inputs incomplete → estimatedMargin = Incomplete Data.", []),
          rule("amz_pr_comp", "platform", "Competition notes must not invent BSR or seller counts.", [AMZ_US]),
          rule("amz_pr_cat", "category", "Category fit uses user category + evidence themes only.", []),
        ],
      },
    ],
  },
  {
    skillId: "amazon_compliance_check",
    name: "Amazon Compliance Check",
    domain: "compliance",
    platform: "Amazon",
    marketplace: ["Amazon US", "Amazon UK", "Amazon DE"],
    country: ["US", "UK", "DE"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "PASS / NEEDS_REVIEW / HIGH_RISK / INSUFFICIENT_EVIDENCE — no legal guarantee.",
        inputs: ["title", "description", "keywords", "adsNotes", "imageNotes", "demoFlags"],
        outputs: ["overallVerdict", "risks", "recommendations"],
        applicableScenarios: ["listing compliance", "ads copy review"],
        evidenceIndex: [
          ev("Amazon prohibited seller activities (public help)", {
            platform: "Amazon",
            region: "US",
            url: "https://sellercentral.amazon.com/help/hub/reference/G200333160",
            timestamp: "2026-08-10T00:00:00.000Z",
          }),
        ],
        decisionLogic: [
          "No Search evidence for a claim area → INSUFFICIENT_EVIDENCE for that item.",
          "Absolute health claims / guarantees → HIGH_RISK or NEEDS_REVIEW.",
          "Never state 'legal' or 'will pass Amazon review'.",
        ],
        rules: [
          rule("amz_cmp_verdict", "compliance", "Verdicts are operational risk signals, not legal advice.", []),
          rule("amz_cmp_claims", "compliance", "Cure / medical / #1 / guaranteed results → elevate risk.", []),
          rule("amz_cmp_ev", "platform", "Prefer official/policy Search hits; cite Source/URL/Timestamp.", []),
        ],
      },
    ],
  },
  {
    skillId: "tiktok_content_analysis",
    name: "TikTok Content Analysis",
    domain: "content",
    platform: "TikTok Shop",
    marketplace: ["TikTok US"],
    country: ["US"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "Views → product clicks → orders funnel diagnosis.",
        inputs: ["videoMetrics", "productId", "range"],
        outputs: ["situation", "diagnosis", "contentGaps", "actions"],
        applicableScenarios: ["content page diagnosis", "creator video review"],
        evidenceIndex: [TT_US],
        decisionLogic: [
          "Separate awareness (views) vs commerce intent (product clicks) vs conversion (orders).",
          "Do not invent trending sounds or competitor view counts.",
        ],
        rules: [
          rule("tt_ca_funnel", "business", "High views + low product clicks → hook/product reveal problem first.", [TT_US]),
          rule("tt_ca_ctr", "content", "Low click-through after mid-video product mention → CTA timing/clarity.", [TT_US]),
          rule("tt_ca_plat", "platform", "TikTok Shop content should map video themes to SKU benefits without hard-sell spam.", [TT_US]),
        ],
      },
    ],
  },
  {
    skillId: "tiktok_product_analysis",
    name: "TikTok Product Analysis",
    domain: "product_research",
    platform: "TikTok Shop",
    marketplace: ["TikTok US"],
    country: ["US"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "GMV mix: video vs creator attribution honesty.",
        inputs: ["gmv", "videoGmv", "creatorGmv", "exposure", "orders"],
        outputs: ["diagnosis", "opportunity", "recommendation"],
        applicableScenarios: ["TikTok product diagnosis", "selection on TikTok"],
        evidenceIndex: [TT_US],
        decisionLogic: [
          "Attribute declines to exposure vs CVR vs content mix using available metrics only.",
          "Creator GMV without creator data → mark incomplete.",
        ],
        rules: [
          rule("tt_pa_mix", "business", "Diagnose video-led vs creator-led GMV separately when both exist.", [TT_US]),
          rule("tt_pa_exp", "platform", "Exposure down + CVR flat → distribution/content supply issue.", [TT_US]),
          rule("tt_pa_cat", "category", "Category hooks must match DEMO/user product category language.", [TT_US]),
        ],
      },
    ],
  },
  {
    skillId: "tiktok_content_optimization",
    name: "TikTok Content Optimization",
    domain: "content",
    platform: "TikTok Shop",
    marketplace: ["TikTok US"],
    country: ["US"],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "Script / hook / CTA optimization rules for Shop videos.",
        inputs: ["productTitle", "painPoints", "currentScript", "marketplace"],
        outputs: ["hooks", "scriptBeats", "cta", "localizationNotes"],
        applicableScenarios: ["content rewrite", "listing→video handoff"],
        evidenceIndex: [TT_US],
        decisionLogic: [
          "Open with pattern interrupt or concrete outcome in first 3 seconds (guidance, not guarantee).",
          "CTA must match Shop product benefit; avoid banned absolute claims.",
        ],
        rules: [
          rule("tt_co_hook", "content", "Lead with outcome or tension; delay hard sell until product proof.", [TT_US]),
          rule("tt_co_loc", "localization", "US TikTok: conversational tone; avoid corporate brochure language.", [TT_US]),
          rule("tt_co_cmp", "compliance", "No medical cure / guaranteed income claims in scripts.", [TT_US]),
        ],
      },
    ],
  },
  {
    skillId: "customer_review_analysis",
    name: "Customer Review Analysis",
    domain: "customer",
    platform: "Cross-border",
    marketplace: [],
    country: [],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "Pain themes + localized replies; product-problem → diagnosis handoff.",
        inputs: ["reviewsText", "messagesText", "replyLanguage", "productTitle"],
        outputs: ["painPoints", "replies", "productProblemFlags"],
        applicableScenarios: ["Amazon/TikTok customer intelligence", "review reply"],
        evidenceIndex: [
          ev("Cross-border CS reply localization practice", {
            platform: "Cross-border",
            region: "Global",
            timestamp: "2026-09-01T00:00:00.000Z",
          }),
        ],
        decisionLogic: [
          "Cluster themes by frequency; mark likelyProductProblem separately from logistics.",
          "Localized reply ≠ raw translation; keep empathy + next step.",
          "Do not invent review counts.",
        ],
        rules: [
          rule("csr_theme", "business", "Pain points need supporting snippets from input text.", []),
          rule("csr_loc", "localization", "Reply language follows requested locale (EN/DE/FR/ES/ZH).", []),
          rule("csr_prod", "decision", "Recurring defect themes → link to product diagnosis, not only canned apology.", []),
        ],
      },
    ],
  },
  {
    skillId: "cross_border_profit_analysis",
    name: "Cross-border Profit Analysis",
    domain: "profit",
    platform: "Cross-border",
    marketplace: [],
    country: [],
    latestVersion: "1.0.0",
    lastUpdated: "2026-09-04T00:00:00.000Z",
    ownership: "nexa_system",
    versions: [
      {
        version: "1.0.0",
        releasedAt: "2026-09-04T00:00:00.000Z",
        changelog: "FX honesty + inventory-gated ads + joint business diagnosis.",
        inputs: ["sales", "cogs", "fees", "adSpend", "inventory", "displayCurrency"],
        outputs: ["profitBreakdown", "inventoryRisk", "adsGate", "diagnosis"],
        applicableScenarios: ["financial analysis", "inventory intelligence", "joint diagnosis"],
        evidenceIndex: [
          ev("Nexa FX policy — Rate Unavailable when no feed", {
            platform: "Cross-border",
            region: "Global",
            timestamp: "2026-09-04T00:00:00.000Z",
          }),
        ],
        decisionLogic: [
          "No FX feed → Rate Unavailable; never invent exchange rates.",
          "Low sales + high stock → clearance/content before ad scale.",
          "Incomplete fee inputs → Incomplete Data on margin.",
        ],
        rules: [
          rule("cb_fx", "business", "Currency conversion requires a real rate source; else Rate Unavailable.", []),
          rule("cb_inv", "decision", "Inventory risk blocks increase-ads recommendations.", []),
          rule("cb_fee", "platform", "Platform fee / FBA / logistics only from provided or DEMO known fields.", []),
        ],
      },
    ],
  },
];
