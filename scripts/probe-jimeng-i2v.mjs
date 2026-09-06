/**
 * Probe 即梦 I2V with local face image.
 * Usage: node --env-file=.env --import tsx scripts/probe-jimeng-i2v.mjs
 * (or plain mjs duplicate of signer)
 */
import fs from "fs";
import path from "path";
import { createHash, createHmac } from "crypto";

const AK = process.env.JIMENG_ACCESS_KEY;
const SK = process.env.JIMENG_SECRET_KEY;
const REQ_KEY = process.env.JIMENG_REQ_KEY || "jimeng_ti2v_v30_pro";
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

async function cvRequest(action, body) {
  const bodyStr = JSON.stringify(body);
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const contentSha = sha256Hex(bodyStr);
  const canonicalHeaders =
    `content-type:application/json\nhost:${HOST}\nx-content-sha256:${contentSha}\nx-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalQuery = `Action=${action}&Version=${VERSION}`;
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
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return json;
}

const face =
  [
    path.join(
      process.env.USERPROFILE || "",
      ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
    ),
    path.resolve(
      ".nexa-data/recreate/7673183599574666530/keyframes/kf_03.jpg"
    ),
  ].find((p) => fs.existsSync(p));

if (!face) {
  console.error("no input image");
  process.exit(1);
}

const b64 = fs.readFileSync(face).toString("base64");
const prompt = [
  "电影感竖屏短视频，东亚年轻女性，暗红黑汉服，蓝白花海背景，",
  "时尚人像构图，圆形小窗特写，FASHION SELF-PORTRAIT 叠字风格氛围，",
  "微风吹动发丝，轻微转头看向镜头，光影高级，动作自然流畅，高清。",
].join("");

console.log("image", face);
console.log("req_key", REQ_KEY);
console.log("ak_prefix", AK.slice(0, 4) + "***");

const submit = await cvRequest("CVSync2AsyncSubmitTask", {
  req_key: REQ_KEY,
  prompt,
  frames: 121,
  seed: -1,
  binary_data_base64: [b64],
});
console.log("submit", JSON.stringify(submit).slice(0, 500));

const taskId = submit?.data?.task_id;
if (!taskId) {
  console.error("no task_id — check AK/SK or开通即梦视频");
  process.exit(1);
}
console.log("task_id", taskId);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const got = await cvRequest("CVSync2AsyncGetResult", {
    req_key: REQ_KEY,
    task_id: taskId,
  });
  const status = got?.data?.status;
  const url = got?.data?.video_url || got?.data?.aigc_video_url;
  console.log(`[${i + 1}] status=${status} url=${url ? "yes" : "no"}`);
  if (url) {
    const out = path.resolve(
      ".nexa-data/recreate/7673183599574666530/jimeng_i2v.mp4"
    );
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(out, buf);
    const project = "jimeng_i2v_demo";
    const dir = path.resolve(".nexa-data/renders", project);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(out, path.join(dir, "export.mp4"));
    console.log("saved", out, buf.length);
    console.log("preview http://localhost:3000/api/video/render/file/" + project);
    process.exit(0);
  }
  if (["failed", "expired", "not_found"].includes(status)) {
    console.error("failed", JSON.stringify(got).slice(0, 600));
    process.exit(1);
  }
}
console.error("timeout");
process.exit(1);
