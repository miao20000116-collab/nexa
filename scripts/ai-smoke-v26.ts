/**
 * V2.6 smoke: Content QA — PASS / NEEDS_REVISION without exposing CoT.
 * Uses file-store projects to avoid Next.js request cookies scope.
 */
import { promises as fs } from "fs";
import path from "path";
import { fileStoreCreateProject, fileStoreUpdateProject } from "../src/lib/creation/file-store";
import { runContentQA } from "../src/modules/qa/services/content-qa-service";
import type { QAIssue } from "../src/modules/qa/types";

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  const bad = await fileStoreCreateProject(
    {
      goal: "推广便携榨汁杯",
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: "idea",
      title: "稳赚不赔的榨汁杯",
    },
    null
  );
  await fileStoreUpdateProject(bad.id, {
    content: {
      title: "100%保证瘦身，稳赚不赔",
      hook: "绝对有效",
      body: "研究表明增长率达300%，保证赚。下载正版电影同款滤镜。",
      structure: "",
      cta: "立刻下单",
      hashtags: ["赚钱"],
      coverSuggestion: "",
    },
  });

  const badReport = await runContentQA({
    projectId: bad.id,
    platform: "xiaohongshu",
  });

  const okish = await fileStoreCreateProject(
    {
      goal: "分享便携榨汁杯旅行体验",
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: "idea",
      title: "机场也能喝上鲜榨",
      sources: [
        {
          id: "src_demo",
          kind: "link",
          title: "产品说明书",
          url: "https://example.com/manual",
          snippet: "便携榨汁杯使用说明",
        },
      ],
    },
    null
  );
  await fileStoreUpdateProject(okish.id, {
    content: {
      title: "机场也能喝上鲜榨",
      hook: "出差第三天，还是想喝口果汁",
      body: "把便携榨汁杯放进行李，过安检后在休息区用瓶装水试试。口感清爽，适合短途旅行场景。以上为个人体验，不构成医疗或投资建议。",
      structure: "场景-体验-建议",
      cta: "欢迎分享你的旅行小物件",
      hashtags: ["旅行", "榨汁杯"],
      coverSuggestion: "机场休息区特写",
    },
  });
  const okReport = await runContentQA({
    projectId: okish.id,
    platform: "xiaohongshu",
  });

  const result = {
    at: new Date().toISOString(),
    bad: {
      projectId: bad.id,
      verdict: badReport.verdict,
      issueCount: badReport.issues.length,
      categories: [
        ...new Set(badReport.issues.map((i: QAIssue) => i.category)),
      ],
      hasWhereWhyHow: badReport.issues.every(
        (i: QAIssue) => Boolean(i.where && i.why && i.how)
      ),
      sampleIssues: badReport.issues.slice(0, 3).map((i: QAIssue) => ({
        where: i.where,
        why: i.why,
        how: i.how,
      })),
      hasCotLeak: Boolean(
        JSON.stringify(badReport).match(/reasoning|chain.of.thought|思考过程/i)
      ),
    },
    okish: {
      projectId: okish.id,
      verdict: okReport.verdict,
      errorCount: okReport.issues.filter((i: QAIssue) => i.severity === "error")
        .length,
      summary: okReport.summary,
    },
    flow: "Creation → QA → Preview → Publish",
  };

  const outPath = path.join(outDir, "v2.6-qa-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);

  if (
    result.bad.verdict !== "NEEDS_REVISION" ||
    !result.bad.hasWhereWhyHow ||
    result.bad.hasCotLeak
  ) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
