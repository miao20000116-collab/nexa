/**
 * Normalize provider research JSON → ResearchReport (Chinese UI fields).
 * Never expose chain-of-thought / meta reasoning in the user-facing report.
 */

import type { ResearchReport } from "@/modules/workspace/types";

type RawSource = {
  id?: string;
  url?: string;
  title?: string;
};

type RawEvidence = {
  claim?: string;
  text?: string;
  source?: string;
  sourceIds?: string[];
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      if (typeof x === "string") return x.trim();
      if (x && typeof x === "object" && "text" in x) {
        return String((x as { text: unknown }).text ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeSources(
  raw: unknown,
  fallback: Array<{ title?: string; url: string; snippet?: string }>
): ResearchReport["sources"] {
  const fromRaw: ResearchReport["sources"] = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i] as RawSource;
      const url = typeof s?.url === "string" ? s.url : "";
      if (!url || url.startsWith("rag://")) continue;
      fromRaw.push({
        id: s.id || `S${i + 1}`,
        title: s.title || url,
        url,
      });
    }
  }

  if (fromRaw.length) return fromRaw;

  return fallback
    .filter((s) => s.url && !s.url.startsWith("rag://"))
    .slice(0, 20)
    .map((s, i) => ({
      id: `S${i + 1}`,
      title: s.title || s.url,
      url: s.url,
    }));
}

function mapEvidence(
  raw: unknown,
  sources: ResearchReport["sources"]
): ResearchReport["evidence"] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const byIndex = sources;

  return raw
    .map((item) => {
      const e = item as RawEvidence;
      const text = (e.text || e.claim || "").trim();
      if (!text) return null;

      let sourceIds = (e.sourceIds ?? []).filter(Boolean);
      if (!sourceIds.length && e.source) {
        const ref = e.source.trim();
        if (byId.has(ref)) sourceIds = [ref];
        else {
          const m = ref.match(/S?(\d+)/i);
          if (m) {
            const idx = Number(m[1]) - 1;
            if (byIndex[idx]) sourceIds = [byIndex[idx].id];
          }
        }
      }

      return { text, sourceIds };
    })
    .filter((x): x is { text: string; sourceIds: string[] } => Boolean(x));
}

export function normalizeResearchReport(
  raw: Record<string, unknown> | null | undefined,
  opts: {
    goal: string;
    sources: Array<{ title?: string; url: string; snippet?: string }>;
  }
): ResearchReport {
  const data = raw ?? {};
  // Strip internal meta / CoT — never show to user
  const rest = { ...data };
  delete rest.meta;
  delete rest.reasoning;
  delete rest.chainOfThought;
  delete rest.thoughts;

  const sources = normalizeSources(rest.sources, opts.sources);

  const executiveSummary =
    (typeof rest.executiveSummary === "string" && rest.executiveSummary) ||
    (typeof rest.conclusion === "string" && rest.conclusion) ||
    (typeof rest.summary === "string" && rest.summary) ||
    "";

  const keyFindings =
    asStringArray(rest.keyFindings).length > 0
      ? asStringArray(rest.keyFindings)
      : asStringArray(rest.findings);

  return {
    title: `研究报告：${opts.goal.slice(0, 48)}`,
    executiveSummary: executiveSummary || undefined,
    keyFindings,
    evidence: mapEvidence(rest.evidence, sources),
    disagreements: asStringArray(rest.disagreements),
    trends: asStringArray(rest.trends).length
      ? asStringArray(rest.trends)
      : asStringArray(rest.marketTrends),
    risks: asStringArray(rest.risks),
    opportunities: asStringArray(rest.opportunities),
    sources,
    generatedAt: new Date().toISOString(),
  };
}

/** Serialize for DB / API — only user-facing fields */
export function researchReportToJson(
  report: ResearchReport
): Record<string, unknown> {
  return {
    title: report.title,
    executiveSummary: report.executiveSummary,
    keyFindings: report.keyFindings,
    evidence: report.evidence,
    disagreements: report.disagreements,
    contradictions: report.contradictions,
    trends: report.trends,
    risks: report.risks,
    opportunities: report.opportunities,
    sources: report.sources,
    plan: report.plan,
    actions: report.actions,
    generatedAt: report.generatedAt,
  };
}

export function parseStoredResearchReport(
  raw: Record<string, unknown> | null | undefined
): ResearchReport | null {
  if (!raw) return null;
  if (typeof raw.title === "string" && Array.isArray(raw.keyFindings)) {
    return {
      title: raw.title,
      executiveSummary:
        typeof raw.executiveSummary === "string"
          ? raw.executiveSummary
          : undefined,
      keyFindings: asStringArray(raw.keyFindings),
      evidence: mapEvidence(raw.evidence, normalizeSources(raw.sources, [])),
      disagreements: asStringArray(raw.disagreements),
      trends: asStringArray(raw.trends),
      risks: asStringArray(raw.risks),
      opportunities: asStringArray(raw.opportunities),
      sources: normalizeSources(raw.sources, []),
      generatedAt:
        typeof raw.generatedAt === "string" ? raw.generatedAt : undefined,
    };
  }
  // Legacy provider shape
  return normalizeResearchReport(raw, {
    goal: typeof raw.conclusion === "string" ? "研究报告" : "研究报告",
    sources: [],
  });
}
