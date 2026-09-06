import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { UI } from "@/lib/ui-copy";
import { fileStoreReadBytes } from "@/lib/assets/file-store";
import { estimateCredits } from "@/modules/account/credits/service";
import { getSession } from "@/modules/account/auth/service";
import {
  createGeneratedImageAsset,
  getOwnedAsset,
  listOwnedAssets,
} from "@/modules/assets/asset-service";
import { PURPOSE_PROMPT_PREFIX, rankAssetForImageRef } from "@/modules/image/constants";
import type {
  GenerateImageInput,
  ImageGenerationJob,
  ImageGenerationJobView,
  ImagePurpose,
} from "@/modules/image/types";
import {
  getImageJob,
  listImageJobs,
  saveImageJob,
  toJobView,
} from "@/modules/image/services/history-store";

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildFinalPrompt(purpose: ImagePurpose, prompt: string) {
  return `${PURPOSE_PROMPT_PREFIX[purpose]}\n\n用户需求：${prompt.trim()}\n\n要求：画面清晰、主体可辨、不要添加水印或乱码文字。`;
}

export function estimateImageCredits() {
  return estimateCredits("generateImage");
}

export async function listPreferredReferenceAssets() {
  const assets = await listOwnedAssets();
  const images = assets.filter(
    (a) => a.assetType === "image" && a.status === "ready"
  );
  return images
    .map((a) => ({
      asset: a,
      score: rankAssetForImageRef({
        subject: a.metadata?.subject,
        scene: a.metadata?.scene,
        visual_tags: a.metadata?.visual_tags,
        usage_suggestion: a.metadata?.usage_suggestion,
        fileName: a.fileName,
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.asset);
}

export async function listImageHistory(
  limit = 40
): Promise<ImageGenerationJobView[]> {
  const session = await getSession();
  const userId = session.user?.id ?? null;
  const jobs = await listImageJobs(userId, limit);
  return jobs.map(toJobView);
}

export async function getImageHistoryItem(
  id: string
): Promise<ImageGenerationJobView | null> {
  const job = await getImageJob(id);
  return job ? toJobView(job) : null;
}

async function loadReferenceBytes(assetIds: string[]) {
  for (const id of assetIds) {
    const asset = await getOwnedAsset(id);
    if (!asset || asset.assetType !== "image") continue;
    const bytes = await fileStoreReadBytes(asset.storageKey);
    if (bytes?.length) {
      return {
        asset,
        bytes,
        mimeType: asset.mimeType || "image/png",
      };
    }
  }
  return null;
}

async function materializeResultBytes(result: {
  url?: string;
  storageKey?: string;
}): Promise<{ bytes: Buffer; mimeType: string; sourceUrl: string | null }> {
  if (result.storageKey) {
    const genPath = path.join(
      process.cwd(),
      ".nexa-data",
      "generated",
      path.basename(result.storageKey)
    );
    try {
      const bytes = await fs.readFile(genPath);
      return {
        bytes,
        mimeType: "image/png",
        sourceUrl: result.url ?? `/api/ai/files/${result.storageKey}`,
      };
    } catch {
      /* fall through */
    }
  }

  if (result.url?.startsWith("/api/ai/files/")) {
    const name = result.url.replace("/api/ai/files/", "");
    const genPath = path.join(
      process.cwd(),
      ".nexa-data",
      "generated",
      path.basename(name)
    );
    const bytes = await fs.readFile(genPath);
    return { bytes, mimeType: "image/png", sourceUrl: result.url };
  }

  if (result.url?.startsWith("http://") || result.url?.startsWith("https://")) {
    const res = await fetch(result.url);
    if (!res.ok) throw new Error(`下载生成图失败 ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/png";
    return { bytes: buf, mimeType: mime, sourceUrl: result.url };
  }

  throw new Error("无法落盘生成结果");
}

export async function generateImageProduction(input: GenerateImageInput): Promise<
  | { ok: true; job: ImageGenerationJobView; assetId: string }
  | {
      ok: false;
      code:
        | "blocked_ai_unavailable"
        | "login_required"
        | "confirm_required"
        | "insufficient_credits"
        | "pricing_unavailable"
        | "invalid_capability"
        | "invalid"
        | "ai_error";
      message: string;
      estimate?: import("@/modules/account/types").CreditEstimate;
      jobId?: string;
      job?: ImageGenerationJobView;
    }
> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, code: "invalid", message: "请描述你想生成的图片" };
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
    capability: "generateImage",
    confirm: input.confirm,
    jobId: input.jobId,
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

  const session = await getSession();
  const userId = session.user?.id ?? null;
  const estimate = estimateImageCredits();
  const creditsEstimated =
    estimate.available && estimate.estimatedCredits != null
      ? estimate.estimatedCredits
      : null;

  const referenceAssetIds = input.referenceAssetIds?.filter(Boolean) ?? [];
  const finalPrompt = buildFinalPrompt(input.purpose, prompt);
  const now = new Date().toISOString();

  let job: ImageGenerationJob = {
    id: uid("imgjob"),
    userId,
    purpose: input.purpose,
    prompt,
    finalPrompt,
    referenceAssetIds,
    status: "queued",
    creditsEstimated,
    creditsCharged: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveImageJob(job);

  try {
    const { AIGateway } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );

    if (!AIGateway.isAvailable("generateImage")) {
      job = {
        ...job,
        status: "blocked_ai_unavailable",
        errorMessage: UI.common.aiUnavailable,
        updatedAt: new Date().toISOString(),
      };
      await saveImageJob(job);
      return {
        ok: false,
        code: "blocked_ai_unavailable",
        message: UI.common.aiUnavailable,
        job: toJobView(job),
      };
    }

    job = {
      ...job,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    await saveImageJob(job);

    const ref = await loadReferenceBytes(referenceAssetIds);
    const size =
      input.size ||
      (input.purpose === "social_cover" ? "1024x1536" : "1024x1024");

    const meta = await AIGateway.generateImageWithMeta(
      {
        prompt: finalPrompt,
        size,
        mode: ref ? "edit" : "generate",
        referenceImageBytes: ref?.bytes,
        referenceMimeType: ref?.mimeType,
      },
      { userId, accountId: account.accountId, referenceId: job.id, jobId: gate.jobId }
    );

    const result = meta.data;
    const materialized = await materializeResultBytes(result);
    const asset = await createGeneratedImageAsset({
      userId,
      bytes: materialized.bytes,
      fileName: `AI生成_${input.purpose}_${Date.now()}.${
        materialized.mimeType.includes("jpeg") ? "jpg" : "png"
      }`,
      mimeType: materialized.mimeType,
      sourceUrl: materialized.sourceUrl,
      metadata: {
        usage_suggestion: PURPOSE_PROMPT_PREFIX[input.purpose],
        visual_tags: ["ai_generated", input.purpose],
        subject: ref?.asset.metadata?.subject ?? null,
      },
    });

    job = {
      ...job,
      status: "completed",
      resultAssetId: asset.id,
      resultUrl: asset.url,
      modelInternal: meta.usage.model,
      providerInternal: meta.usage.provider,
      latencyMs: meta.usage.latencyMs,
      creditsCharged: meta.usage.creditsUsed,
      usage: {
        requestId: meta.requestId,
        creditsUsed: meta.usage.creditsUsed,
        latencyMs: meta.usage.latencyMs,
      },
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    };
    await saveImageJob(job);

    return { ok: true, job: toJobView(job), assetId: asset.id };
  } catch (err) {
    const { CapabilityNotConfiguredError } = await import(
      "@/modules/ai/gateway/ai-gateway"
    );
    const blocked = err instanceof CapabilityNotConfiguredError;
    job = {
      ...job,
      status: blocked ? "blocked_ai_unavailable" : "failed",
      // Failure must not charge full generateImage credits (orchestrator only charges on success)
      creditsCharged: null,
      errorMessage: blocked
        ? UI.common.aiUnavailable
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "生成失败",
      updatedAt: new Date().toISOString(),
    };
    await saveImageJob(job);
    return {
      ok: false,
      code: blocked ? "blocked_ai_unavailable" : "ai_error",
      message: job.errorMessage || UI.common.aiUnavailable,
      job: toJobView(job),
    };
  }
}

/** Server-side batch helper for smoke / acceptance (same pipeline, no mock). */
export async function generateImageBatch(
  items: GenerateImageInput[]
): Promise<
  Array<
    | { ok: true; job: ImageGenerationJobView; assetId: string }
    | {
        ok: false;
        code: string;
        message: string;
        job?: ImageGenerationJobView;
      }
  >
> {
  const out = [];
  for (const item of items) {
    out.push(await generateImageProduction(item));
  }
  return out;
}

export function newJobIdPreview() {
  return randomUUID();
}
