/**
 * Smoke: expand short links + report field checklist (no fake meta).
 */
import { ingestSocialLink } from "../src/modules/create/services/social-recreate";

async function run(label: string, paste: string) {
  console.log("\n====", label, "====");
  try {
    const r = await ingestSocialLink({ urlOrText: paste });
    console.log({
      parseStatus: r.parseStatus,
      parseMethod: r.parseMethod,
      awemeId: r.awemeId,
      canonicalUrl: r.canonicalUrl,
      title: r.title,
      coverUrl: r.coverUrl ? "(yes)" : null,
      obtained: r.obtainedLabels,
      missing: r.missingLabels,
      reason: r.reason.slice(0, 160),
    });
  } catch (e) {
    console.log("ERROR", e instanceof Error ? e.message : e);
  }
}

async function main() {
  await run(
    "douyin_short",
    "7.23 复制打开抖音，看看【测试作者】的作品 https://v.douyin.com/iRABCDxy/ 这是一段口令文案 #护肤"
  );
  await run(
    "douyin_long",
    "https://www.iesdouyin.com/share/video/7673183599574666530/"
  );
  await run("xhs_short", "http://xhslink.com/a/AbCdEfGh");
  await run(
    "tiktok_short",
    "https://vm.tiktok.com/ZMabcdef/"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
