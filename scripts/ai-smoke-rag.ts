/**
 * V2.1 smoke test: real generateText for「什么是 RAG？」
 * Usage: npx tsx scripts/ai-smoke-rag.ts
 * Requires server env: AI_BASE_URL + AI_API_KEY (never NEXT_PUBLIC_*)
 */

import { promises as fs } from "fs";
import path from "path";

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

  const { bootstrapAIProviders } = await import(
    "../src/modules/ai/gateway/bootstrap"
  );
  const { AIOrchestrator } = await import(
    "../src/modules/ai/orchestrator/ai-orchestrator"
  );
  const { getPrimaryTextProvider } = await import(
    "../src/modules/ai/providers/provider-factory"
  );

  bootstrapAIProviders();

  const prompt = "什么是 RAG？";
  const configured = getPrimaryTextProvider().isConfigured();
  const available = AIOrchestrator.isAvailable("generateText");

  const report: Record<string, unknown> = {
    test: "V2.1 AI smoke — 什么是 RAG？",
    timestamp: new Date().toISOString(),
    prompt,
    configured,
    available,
    hardCoded: false,
  };

  if (!configured || !available) {
    report.status = "blocked_ai_unavailable";
    report.error = "AI 服务暂未接入：请在服务端 .env 配置 AI_BASE_URL 与 AI_API_KEY";
    report.note =
      "未伪造回答。配置后重新运行：npx tsx scripts/ai-smoke-rag.ts";
  } else {
    try {
      const out = await AIOrchestrator.generateTextWithMeta(
        {
          system:
            "你是 Nexa AI 助手。用简体中文准确解释概念，简洁清晰，不要编造。",
          prompt,
          temperature: 0.3,
          maxTokens: 800,
        },
        { referenceType: "smoke_test", referenceId: "rag_v21" }
      );

      report.status = "ok";
      report.answer = out.data.text;
      report.requestId = out.requestId;
      report.usage = {
        // Keep provider/model in server-side report only (not client API)
        provider: out.usage.provider,
        model: out.usage.model,
        inputTokens: out.usage.inputTokens,
        outputTokens: out.usage.outputTokens,
        latencyMs: out.usage.latencyMs,
        creditsUsed: out.usage.creditsUsed,
      };
    } catch (err) {
      report.status = "failed";
      report.errorCode =
        err instanceof Error && "code" in err
          ? (err as { code: string }).code
          : "ai_error";
      report.error = err instanceof Error ? err.message : String(err);
    }
  }

  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "v2.1-rag-smoke.json");
  await fs.writeFile(outFile, JSON.stringify(report, null, 2), "utf8");

  // Also write a markdown summary for acceptance (no secrets)
  const mdPath = path.join(process.cwd(), "Nexa_V2.1_AI_Smoke_Test_Result.md");
  const md = `# Nexa V2.1 AI Smoke Test Result

> 测试时间：${report.timestamp}
> 输入：\`${prompt}\`
> hardcode：否

## 结果

- **status**: \`${report.status}\`
- **configured**: ${configured}
- **available**: ${available}

${
  report.status === "ok"
    ? `### 真实 AI 回答

\`\`\`
${String(report.answer).slice(0, 4000)}
\`\`\`

### Usage（服务端记录）

- requestId: \`${report.requestId}\`
- inputTokens: ${(report.usage as { inputTokens?: number })?.inputTokens ?? "—"}
- outputTokens: ${(report.usage as { outputTokens?: number })?.outputTokens ?? "—"}
- latencyMs: ${(report.usage as { latencyMs?: number })?.latencyMs ?? "—"}

完整 JSON：\`.nexa-data/ai-tests/v2.1-rag-smoke.json\`
`
    : `### 未获得真实回答

\`\`\`
${report.error ?? report.errorCode}
\`\`\`

请在服务端 \`.env\` 配置：

\`\`\`
AI_BASE_URL=https://your-domestic-endpoint/v1
AI_API_KEY=server_side_key_only
AI_MODEL_MAIN=your-model-id
\`\`\`

然后重新运行：\`npx tsx scripts/ai-smoke-rag.ts\`
`
}
`;

  await fs.writeFile(mdPath, md, "utf8");
  console.log(JSON.stringify({ status: report.status, file: outFile, md: mdPath }, null, 2));
  if (report.status !== "ok") process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
