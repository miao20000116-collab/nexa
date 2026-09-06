/**
 * Probe 即梦AI-视频生成3.0 1080P after free-trial activation.
 * Tries CVSync2AsyncSubmitTask + dedicated JimengT2VV301080PSubmitTask.
 */
import fs from "fs";
import path from "path";
import { createHash, createHmac } from "crypto";

const AK = process.env.JIMENG_ACCESS_KEY;
const SK = process.env.JIMENG_SECRET_KEY;
const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";

if (!AK || !SK) {
  console.error("missing JIMENG_ACCESS_KEY / JIMENG_SECRET_KEY");
  process.exit(1);
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}
function hmacHex(key, data) {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

async function cvRequest(action, body, version = VERSION) {
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const xDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const contentSha = sha256Hex(bodyStr);
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${contentSha}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalQuery = `Action=${action}&Version=${version}`;
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    contentSha,
  ].join("\n");
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = hmac(SK, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`https://${HOST}/?${canonicalQuery}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: HOST,
      "X-Date": xDate,
      "X-Content-Sha256": contentSha,
      Authorization: authorization,
    },
    body: bodyStr,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { http: res.status, text: text.slice(0, 400) };
  }
}

const face = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
);
const b64 = fs.existsSync(face)
  ? fs.readFileSync(face).toString("base64")
  : null;

const prompt =
  "电影感竖屏短视频，东亚年轻女性，暗红黑汉服，蓝白花海背景，微风吹动发丝，轻微转头看向镜头，光影高级";

console.log("AK", AK.slice(0, 8) + "***", "face", !!b64);

const cases = [
  {
    label: "CVSync t2v 1080p",
    action: "CVSync2AsyncSubmitTask",
    body: {
      req_key: "jimeng_t2v_v30_1080p",
      prompt,
      frames: 121,
      seed: -1,
      aspect_ratio: "9:16",
    },
  },
  {
    label: "CVSync t2v 720p",
    action: "CVSync2AsyncSubmitTask",
    body: {
      req_key: "jimeng_t2v_v30",
      prompt,
      frames: 121,
      seed: -1,
      aspect_ratio: "9:16",
    },
  },
  {
    label: "CVSync i2v first 1080",
    action: "CVSync2AsyncSubmitTask",
    body: {
      req_key: "jimeng_i2v_first_v30_1080",
      prompt,
      frames: 121,
      seed: -1,
      ...(b64 ? { binary_data_base64: [b64] } : {}),
    },
  },
  {
    label: "CVSync i2v first 720",
    action: "CVSync2AsyncSubmitTask",
    body: {
      req_key: "jimeng_i2v_first_v30",
      prompt,
      frames: 121,
      seed: -1,
      ...(b64 ? { binary_data_base64: [b64] } : {}),
    },
  },
  {
    label: "dedicated JimengT2VV301080PSubmitTask",
    action: "JimengT2VV301080PSubmitTask",
    body: {
      req_key: "jimeng_t2v_v30_1080p",
      prompt,
      frames: 121,
      seed: -1,
      aspect_ratio: "9:16",
    },
  },
  {
    label: "dedicated I2VFirstV301080SubmitTask",
    action: "I2VFirstV301080SubmitTask",
    body: {
      req_key: "jimeng_i2v_first_v30_1080",
      prompt,
      frames: 121,
      seed: -1,
      ...(b64 ? { binary_data_base64: [b64] } : {}),
    },
  },
];

let winner = null;
for (const c of cases) {
  const got = await cvRequest(c.action, c.body);
  const taskId = got?.data?.task_id || got?.Result?.task_id;
  const code = got?.code ?? got?.ResponseMetadata?.Error?.Code;
  const msg = String(
    got?.message || got?.ResponseMetadata?.Error?.Message || ""
  ).slice(0, 160);
  console.log(`\n[${c.label}]`, code, msg, "task=", taskId || "-");
  if (taskId && !winner) winner = { ...c, taskId, got };
}

if (!winner) {
  console.error("\nNo task accepted — free trial may not be active yet, or wrong product.");
  process.exit(1);
}

console.log("\nPolling", winner.label, winner.taskId);
const reqKey = winner.body.req_key;
const getAction =
  winner.action === "JimengT2VV301080PSubmitTask"
    ? "JimengT2VV301080PGetResult"
    : winner.action === "I2VFirstV301080SubmitTask"
      ? "I2VFirstV301080GetResult"
      : "CVSync2AsyncGetResult";

for (let i = 0; i < 72; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const got = await cvRequest(getAction, {
    req_key: reqKey,
    task_id: winner.taskId,
  });
  const status = got?.data?.status || got?.Result?.status || "";
  const url =
    got?.data?.video_url ||
    got?.data?.aigc_video_url ||
    got?.Result?.video_url ||
    "";
  console.log(`[${i + 1}] status=${status || got?.code} url=${url ? "yes" : "no"}`);
  if (url) {
    const outDir = path.resolve(".nexa-data/renders/jimeng_1080_demo");
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, "export.mp4");
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(out, buf);
    console.log("saved", out, buf.length);
    console.log("preview /api/video/render/file/jimeng_1080_demo");
    process.exit(0);
  }
  if (["failed", "expired", "not_found"].includes(status)) {
    console.error("failed", JSON.stringify(got).slice(0, 600));
    process.exit(1);
  }
}
console.error("timeout");
process.exit(1);
