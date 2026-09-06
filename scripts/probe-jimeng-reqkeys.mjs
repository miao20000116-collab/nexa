/**
 * Probe which Jimeng req_keys are entitled for this AK/SK.
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
  return res.json();
}

const face = path.join(
  process.env.USERPROFILE || "",
  ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
);
const b64 = fs.existsSync(face)
  ? fs.readFileSync(face).toString("base64")
  : null;

const keys = [
  ["jimeng_t2v_v30", false],
  ["jimeng_t2v_v30_pro", false],
  ["jimeng_ti2v_v30", true],
  ["jimeng_ti2v_v30_pro", true],
  ["jimeng_i2v_first_v30", true],
  ["jimeng_t2i_v40", false],
  ["jimeng_t2i_v31", false],
];

for (const [req_key, needImage] of keys) {
  const body = {
    req_key,
    prompt: "女孩微笑看向镜头，电影感竖屏",
    seed: -1,
  };
  if (req_key.includes("t2v") || req_key.includes("ti2v") || req_key.includes("i2v")) {
    body.frames = 121;
  }
  if (needImage && b64) body.binary_data_base64 = [b64];
  const got = await cvRequest("CVSync2AsyncSubmitTask", body);
  console.log(
    req_key,
    "=>",
    got.code,
    String(got.message || "").slice(0, 100),
    "task=",
    got?.data?.task_id || "-"
  );
}
