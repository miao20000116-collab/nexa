/**
 * V2.7 smoke: Commerce Intelligence — Diagnosis → Evidence → Action
 * Demo Store only; no fake live account connections.
 */
import { promises as fs } from "fs";
import path from "path";
import { getProductDiagnosis } from "../src/modules/commerce/amazon/service";
import { getTikTokProductDiagnosis } from "../src/modules/commerce/tiktok/service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  const amazon = await getProductDiagnosis("prod_portable_blender", "7");
  assert(amazon, "Amazon diagnosis missing");
  assert(amazon.isDemo === true, "Amazon must be Demo");
  assert(
    amazon.demoStoreLabel.includes("Demo Store"),
    "Amazon demoStoreLabel required"
  );
  assert(amazon.intelligence, "Amazon intelligence missing");
  assert(amazon.intelligence.findings.length > 0, "Amazon findings empty");
  assert(
    amazon.intelligence.findings.every(
      (f) => f.problem && f.evidence.length && f.suggestion
    ),
    "Amazon findings must have 问题/证据/建议"
  );
  const amzIntents = new Set(
    amazon.intelligence.actions.map((a) => a.intent).filter(Boolean)
  );
  for (const intent of ["competitor", "market", "feedback", "trend", "create"]) {
    assert(amzIntents.has(intent as never), `Amazon missing action intent ${intent}`);
  }
  assert(
    amazon.nextActions.some((a) => a.kind === "search"),
    "Amazon search action"
  );
  assert(
    amazon.nextActions.some((a) => a.kind === "create" && a.href.includes("commerceContext")),
    "Amazon create deep link with commerceContext"
  );
  assert(
    !JSON.stringify(amazon).match(/reasoning|chain.of.thought|思考过程/i),
    "Amazon CoT leak"
  );

  const tiktok = await getTikTokProductDiagnosis("tt_prod_blender", "7");
  assert(tiktok, "TikTok diagnosis missing");
  assert(tiktok.isDemo === true, "TikTok must be Demo");
  assert(
    tiktok.demoStoreLabel.includes("Demo Store"),
    "TikTok demoStoreLabel required"
  );
  assert(tiktok.intelligence, "TikTok intelligence missing");
  assert(tiktok.intelligence.findings.length > 0, "TikTok findings empty");
  const contentFindings = tiktok.intelligence.findings.filter((f) =>
    /高播放低转化|低播放高转化/.test(f.problem)
  );
  const ttIntents = new Set(
    tiktok.intelligence.actions.map((a) => a.intent).filter(Boolean)
  );
  for (const intent of ["competitor", "market", "feedback", "trend", "create"]) {
    assert(ttIntents.has(intent as never), `TikTok missing action intent ${intent}`);
  }
  assert(
    tiktok.diagnosis.nextActions.some(
      (a) => a.kind === "create" && a.href?.includes("commerceContext")
    ),
    "TikTok create deep link"
  );
  assert(
    !JSON.stringify(tiktok).match(/reasoning|chain.of.thought|思考过程/i),
    "TikTok CoT leak"
  );

  const result = {
    at: new Date().toISOString(),
    amazon: {
      productId: amazon.productId,
      asin: amazon.asin,
      demoStoreLabel: amazon.demoStoreLabel,
      diagnosis: amazon.conclusion,
      findingCount: amazon.intelligence.findings.length,
      dimensions: [
        ...new Set(amazon.intelligence.findings.map((f) => f.dimension)),
      ],
      actionIntents: [...amzIntents],
      blockedAi: amazon.intelligence.blockedAi,
      aiAssisted: amazon.intelligence.aiAssisted,
      sampleFinding: amazon.intelligence.findings[0],
    },
    tiktok: {
      productId: tiktok.product.productId,
      demoStoreLabel: tiktok.demoStoreLabel,
      diagnosis: tiktok.diagnosis.opportunity,
      findingCount: tiktok.intelligence.findings.length,
      highLowPlayFindings: contentFindings.map((f) => f.problem),
      actionIntents: [...ttIntents],
      blockedAi: tiktok.intelligence.blockedAi,
      aiAssisted: tiktok.intelligence.aiAssisted,
      sampleFinding: tiktok.intelligence.findings[0],
    },
    ok: true,
  };

  const outPath = path.join(outDir, "v2.7-commerce-intelligence-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
