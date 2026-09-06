/**
 * V2.4 smoke: generate 3 distinct images via real provider (no mock).
 * Uses AIGateway directly so the script does not depend on Next.js cookies().
 */
import { promises as fs } from "fs";
import path from "path";
import { AIGateway } from "../src/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "../src/modules/ai/gateway/bootstrap";

async function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

async function main() {
  await loadEnvFile();
  bootstrapAIProviders();
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  const available = AIGateway.isAvailable("generateImage");
  const prompts = [
    {
      purpose: "product_scene" as const,
      prompt: "便携榨汁杯放在纽约中央公园野餐垫上，阳光午后，真实摄影感",
      size: "1024x1024" as const,
    },
    {
      purpose: "social_cover" as const,
      prompt: "旅行好物小红书封面：机场登机口旁的迷你榨汁杯，竖版构图",
      size: "1024x1536" as const,
    },
    {
      purpose: "ecommerce_main" as const,
      prompt: "电商主图风格：白色背景上的宠物饮水机，干净明亮，突出产品外形",
      size: "1024x1024" as const,
    },
  ];

  const result: Record<string, unknown> = {
    at: new Date().toISOString(),
    available,
    imageEnabled: process.env.NEXA_IMAGE_ENABLED,
    hasBase: Boolean(
      process.env.AI_BASE_URL?.trim() || process.env.AI_MEDIA_BASE_URL?.trim()
    ),
    hasKey: Boolean(
      process.env.AI_API_KEY?.trim() || process.env.AI_MEDIA_API_KEY?.trim()
    ),
    jobs: [] as unknown[],
  };

  if (!available) {
    result.status = "blocked_ai_unavailable";
    result.message =
      "图片生成 Provider 未配置。请在 .env 设置 AI_BASE_URL、AI_API_KEY、AI_MODEL_IMAGE，并保持 NEXA_IMAGE_ENABLED=1。";
  } else {
    const jobs: unknown[] = [];
    for (const item of prompts) {
      try {
        const meta = await AIGateway.generateImageWithMeta(
          {
            prompt: item.prompt,
            size: item.size,
            mode: "generate",
          },
          { referenceId: `smoke_v24_${item.purpose}` }
        );
        jobs.push({
          ok: true,
          purpose: item.purpose,
          url: meta.data.url,
          model: meta.usage.model,
          latencyMs: meta.usage.latencyMs,
        });
      } catch (err) {
        jobs.push({
          ok: false,
          purpose: item.purpose,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    result.jobs = jobs;
    result.completedCount = jobs.filter(
      (j) => (j as { ok?: boolean }).ok === true
    ).length;
    result.status =
      result.completedCount === 3 ? "ok" : "partial_or_failed";
  }

  const outPath = path.join(outDir, "v2.4-image-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);

  if (!available || (result.completedCount as number) < 3) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
