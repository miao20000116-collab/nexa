/**
 * V2.9 smoke: Publishing Integration — flow, tokens, records, no fake success.
 */
import { promises as fs } from "fs";
import path from "path";
import {
  encryptTokenBundle,
  decryptTokenBundle,
} from "../src/lib/publish/token-vault";
import {
  saveConnectionTokens,
  loadConnectionTokens,
  clearConnectionTokens,
} from "../src/modules/publish/oauth/token-store";
import { getPlatformCapability } from "../src/modules/publish/capabilities";
import {
  buildPublishPreview,
  confirmAndPublish,
  retryPublish,
} from "../src/modules/publish/services/publish-service";
import { userFacingPublishError } from "../src/modules/publish/providers";
import { fileStoreCreateProject } from "../src/lib/creation/file-store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  const blob = encryptTokenBundle({
    accessToken: "test_access_token_smoke",
    refreshToken: "test_refresh",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const roundtrip = decryptTokenBundle(blob);
  assert(roundtrip?.accessToken === "test_access_token_smoke", "token vault");

  const connId = "conn_smoke_v29";
  await saveConnectionTokens(connId, {
    accessToken: "stored_token",
    refreshToken: null,
    expiresAt: null,
  });
  const loaded = await loadConnectionTokens(connId);
  assert(loaded?.accessToken === "stored_token", "token store");
  await clearConnectionTokens(connId);
  assert((await loadConnectionTokens(connId)) === null, "token cleared");

  const xhs = getPlatformCapability("xiaohongshu");
  assert(!xhs.publishApiAvailable, "xhs unsupported");
  assert(
    userFacingPublishError("PUBLISH_UNSUPPORTED") ===
      "当前平台暂不支持直接发布",
    "unsupported message"
  );

  const project = await fileStoreCreateProject(
    {
      goal: "smoke publish",
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: "idea",
      title: "质检通过文案",
      sources: [
        {
          id: "s1",
          kind: "link",
          title: "来源",
          url: "https://example.com",
          snippet: "demo",
        },
      ],
    },
    null
  );
  await import("../src/lib/creation/file-store").then((m) =>
    m.fileStoreUpdateProject(project.id, {
      content: {
        title: "体验分享",
        hook: "出差第三天",
        body: "个人体验，不构成投资建议。",
        structure: "场景-体验",
        cta: "欢迎交流",
        hashtags: ["旅行"],
        coverSuggestion: "机场特写",
      },
    })
  );

  const previewXhs = await buildPublishPreview({
    projectId: project.id,
    platform: "xiaohongshu",
  });
  assert(!previewXhs.canPublish, "xhs blocked");
  assert(
    previewXhs.blockReason?.includes("暂不支持直接发布"),
    "xhs block reason"
  );

  const noConfirm = await confirmAndPublish({
    projectId: project.id,
    platform: "x",
    confirmed: false,
  });
  assert(!noConfirm.ok, "must confirm");

  const blocked = await confirmAndPublish({
    projectId: project.id,
    platform: "x",
    connectionId: "missing_conn",
    confirmed: true,
  });
  assert(!blocked.ok, "no connection blocked");
  assert(blocked.record?.status === "failed", "failed record created");

  const retryBlocked = await retryPublish({
    recordId: blocked.record!.id,
    confirmed: true,
  });
  assert(!retryBlocked.ok || retryBlocked.record !== null, "retry path");

  const result = {
    at: new Date().toISOString(),
    tokenVault: true,
    tokenStore: true,
    unsupportedMessage: userFacingPublishError("PUBLISH_UNSUPPORTED"),
    xhsPublishApi: xhs.publishApiAvailable,
    previewCanPublish: previewXhs.canPublish,
    confirmRequired: !noConfirm.ok,
    failedRecord: {
      id: blocked.record?.id,
      status: blocked.record?.status,
      platform: blocked.record?.platform,
    },
    flow: "Creation → QA → Preview → Confirm → Publish → PublishRecord",
    ok: true,
  };

  const outPath = path.join(outDir, "v2.9-publishing-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
