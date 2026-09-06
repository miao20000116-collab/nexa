/**
 * Try alternate Jimeng/Volc auth modes with provided credentials.
 */
import fs from "fs";
import path from "path";
import { createHash, createHmac } from "crypto";

const ID = process.env.JIMENG_ACCESS_KEY || "";
const SECRET = process.env.JIMENG_SECRET_KEY || "";
const HOST = "visual.volcengineapi.com";
const VERSION = "2022-08-31";

const face = [
  path.join(
    process.env.USERPROFILE || "",
    ".cursor/projects/d-AI-Nexa/assets/c__Users_____AppData_Roaming_Cursor_User_workspaceStorage_cd0d1f08a79cfc99270336c340ec1db9_images_left-main-avatar-6c163c76-37c3-41e6-9faa-02d292446821.png"
  ),
].find((p) => fs.existsSync(p));
const b64 = face ? fs.readFileSync(face).toString("base64") : null;

const body = {
  req_key: "jimeng_ti2v_v30_pro",
  prompt: "女孩微笑看向镜头，发丝微动",
  frames: 121,
  seed: -1,
  ...(b64 ? { binary_data_base64: [b64] } : {}),
};
const bodyStr = JSON.stringify(body);

async function tryBearer(label, token, url) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: bodyStr,
    });
    const text = await res.text();
    console.log(`\n[${label}] ${res.status}`, text.slice(0, 280));
  } catch (e) {
    console.log(`\n[${label}] err`, e.message);
  }
}

async function tryHmac(label, ak, sk) {
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const contentSha = createHash("sha256").update(bodyStr).digest("hex");
  const canonicalHeaders = `content-type:application/json\nhost:${HOST}\nx-content-sha256:${contentSha}\nx-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalQuery = `Action=CVSync2AsyncSubmitTask&Version=${VERSION}`;
  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    contentSha,
  ].join("\n");
  const credentialScope = `${shortDate}/cn-north-1/cv/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const hmac = (k, d) => createHmac("sha256", k).update(d, "utf8").digest();
  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, "cn-north-1");
  const kService = hmac(kRegion, "cv");
  const kSigning = hmac(kService, "request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");
  const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
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
  console.log(`\n[${label}] ${res.status}`, text.slice(0, 320));
}

console.log("ID len", ID.length, "SECRET len", SECRET.length);

// 1) HMAC: id as AK, secret as SK (already failed, confirm)
await tryHmac("hmac id+secret", ID, SECRET);

// 2) HMAC swapped
await tryHmac("hmac secret+id", SECRET, ID);

// 3) Bearer secret on visual query URL
await tryBearer(
  "bearer secret visual",
  SECRET,
  `https://${HOST}/?Action=CVSync2AsyncSubmitTask&Version=${VERSION}`
);

// 4) Bearer on Ark
await tryBearer(
  "bearer secret ark",
  SECRET,
  "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
);

// 5) Bearer ID
await tryBearer(
  "bearer id visual",
  ID,
  `https://${HOST}/?Action=CVSync2AsyncSubmitTask&Version=${VERSION}`
);
