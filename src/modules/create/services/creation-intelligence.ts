/**
 * V3.3 — Creation Intelligence: multi-version A/B/C generation
 */

import type { CreationProject, StructuredContent, UnifiedContent } from "@/modules/create/types";
import { getProject, updateProject } from "@/modules/create/services/creation-service";
import { UI } from "@/lib/ui-copy";
import { toUserErrorMessage } from "@/lib/user-errors";
import { getSession } from "@/modules/account/auth/service";

export type ContentVariantId = "A" | "B" | "C";

export interface ContentVariant {
  id: ContentVariantId;
  label: string;
  strategy: string;
  content: UnifiedContent;
  createdAt: string;
}

const VARIANT_STRATEGIES: Record<
  ContentVariantId,
  { label: string; strategy: string }
> = {
  A: {
    label: "A 版本 · 强 Hook",
    strategy: "用更有冲击力的开头钩子；结构紧凑；情绪更强。不要与其他版本同义改写。",
  },
  B: {
    label: "B 版本 · 专业结构",
    strategy: "用更专业、可信的表达；清晰分点结构；弱化营销感。差异化结构，不是同义改写。",
  },
  C: {
    label: "C 版本 · 故事叙事",
    strategy: "用故事化叙事与场景代入；结尾 CTA 更柔和。表达与结构须明显不同于 A/B。",
  },
};

function emptyUnified(): UnifiedContent {
  return {
    title: "",
    hook: "",
    body: "",
    structure: "",
    cta: "",
    hashtags: [],
    coverSuggestion: "",
  };
}

function parseVariantJson(text: string): UnifiedContent {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const brace = raw.match(/\{[\s\S]*\}/);
  if (!brace) return emptyUnified();
  try {
    const draft = JSON.parse(brace[0].replace(/,\s*([}\]])/g, "$1")) as Record<
      string,
      unknown
    >;
    return {
      title: String(draft.title ?? ""),
      hook: String(draft.hook ?? ""),
      body: String(draft.body ?? draft.script ?? ""),
      structure: String(draft.structure ?? ""),
      cta: String(draft.cta ?? ""),
      hashtags: Array.isArray(draft.hashtags)
        ? draft.hashtags.map(String)
        : [],
      coverSuggestion: String(draft.coverSuggestion ?? ""),
    };
  } catch {
    return emptyUnified();
  }
}

export async function requestVariantGeneration(
  projectId: string,
  opts?: { confirm?: boolean; jobId?: string }
): Promise<
  | {
      ok: true;
      project: CreationProject;
      variants: ContentVariant[];
      explainability?: { summary: string; sourceCount: number; assetCount: number };
    }
  | {
      ok: false;
      code: string;
      message: string;
      estimate?: import("@/modules/account/types").CreditEstimate;
      jobId?: string;
    }
> {
  const project = await getProject(projectId);
  if (!project) {
    return { ok: false, code: "not_found", message: "项目不存在" };
  }

  const { resolveCreditsAccount } = await import(
    "@/modules/account/credits/account"
  );
  const { gateAiUsage } = await import(
    "@/modules/account/credits/usage-guard"
  );
  const account = await resolveCreditsAccount();
  const gate = await gateAiUsage({
    account,
    capability: "generateText",
    confirm: opts?.confirm,
    jobId: opts?.jobId,
  });
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      message: gate.message,
      estimate: gate.estimate,
      jobId: gate.jobId,
    };
  }

  try {
    const { AIGateway } = await import("@/modules/ai/gateway/ai-gateway");
    if (!AIGateway.isAvailable("generateText")) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }

    const {
      assembleCreationContext,
      buildDefaultSystemPrompt,
    } = await import("@/modules/create/services/context-assembler");

    const ctx = await assembleCreationContext(project);
    const baseSystem = buildDefaultSystemPrompt(
      project.platform,
      project.contentType
    );
    const session = await getSession();
    const userId = session.user?.id ?? project.userId ?? null;
    const now = new Date().toISOString();
    const variants: ContentVariant[] = [];

    for (const id of ["A", "B", "C"] as ContentVariantId[]) {
      const meta = VARIANT_STRATEGIES[id];
      const out = await AIGateway.generateText(
        {
          system: `${baseSystem}\n\n本轮生成【${meta.label}】。策略：${meta.strategy}`,
          prompt: `请基于上下文生成差异化版本 ${id}。只输出 JSON。\n\n${ctx.text}`,
          temperature: id === "A" ? 0.7 : id === "B" ? 0.4 : 0.65,
          maxTokens: 2200,
        },
        {
          userId,
          accountId: account.accountId,
          referenceId: `${projectId}_var_${id}`,
          jobId: gate.jobId,
        }
      );
      variants.push({
        id,
        label: meta.label,
        strategy: meta.strategy,
        content: parseVariantJson(out.text),
        createdAt: now,
      });
    }

    // Default select A into main content; keep context sources
    const primary = variants[0]?.content ?? emptyUnified();
    const updated = await updateProject(projectId, {
      content: primary as StructuredContent,
      status: "ready",
      title: primary.title?.trim()?.slice(0, 60) || project.title,
      sources: ctx.sources.length ? ctx.sources : project.sources,
      // persist variants on project via brief metadata channel if needed
    });

    // Store variants in file by patching through update with extended field
    const { fileStoreUpdateProject } = await import(
      "@/lib/creation/file-store"
    );
    const withVariants = await fileStoreUpdateProject(projectId, {
      content: primary as StructuredContent,
      status: "ready",
      variants,
      contextExplainability: ctx.explainability,
    } as Parameters<typeof fileStoreUpdateProject>[1] & {
      variants: ContentVariant[];
      contextExplainability?: typeof ctx.explainability;
    });

    return {
      ok: true,
      project: (withVariants as CreationProject) ?? updated!,
      variants,
      explainability: ctx.explainability,
    };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    if (err instanceof CapabilityNotConfiguredError) {
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
      };
    }
    return {
      ok: false,
      code: "ai_error",
      message: toUserErrorMessage(err, "多版本生成失败"),
    };
  }
}
