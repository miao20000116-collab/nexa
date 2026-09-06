/**
 * Volcengine Visual (CV) signed HTTP client for 即梦 Jimeng video APIs.
 * Docs: https://www.volcengine.com/docs/85621/1777001
 * Flow: CVSync2AsyncSubmitTask → poll CVSync2AsyncGetResult → video_url
 */

import { createHash, createHmac } from "crypto";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function isJimengConfigured() {
  return Boolean(
    (env("JIMENG_ACCESS_KEY") || env("VOLC_ACCESS_KEY")) &&
      (env("JIMENG_SECRET_KEY") || env("VOLC_SECRET_KEY"))
  );
}

function ak() {
  return env("JIMENG_ACCESS_KEY") || env("VOLC_ACCESS_KEY");
}

function sk() {
  return env("JIMENG_SECRET_KEY") || env("VOLC_SECRET_KEY");
}

const HOST = "visual.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "cv";
const VERSION = "2022-08-31";

function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hmacHex(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** Volcengine Signature V4 for visual.volcengineapi.com */
export async function jimengCvRequest(options: {
  action: string;
  body: Record<string, unknown>;
}): Promise<unknown> {
  const accessKey = ak();
  const secretKey = sk();
  if (!accessKey || !secretKey) {
    throw new Error("即梦未配置：需要 JIMENG_ACCESS_KEY / JIMENG_SECRET_KEY");
  }

  const bodyStr = JSON.stringify(options.body);
  const now = new Date();
  const xDate =
    now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const shortDate = xDate.slice(0, 8);
  const contentSha = sha256Hex(bodyStr);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${HOST}\n` +
    `x-content-sha256:${contentSha}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalQuery = `Action=${options.action}&Version=${VERSION}`;
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

  const kDate = hmac(secretKey, shortDate);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = hmacHex(kSigning, stringToSign);

  const authorization =
    `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${HOST}/?${canonicalQuery}`;
  const res = await fetch(url, {
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
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`即梦响应非 JSON HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

/** Free-trial product: 即梦AI-视频生成3.0 1080P */
const DEFAULT_T2V_KEY = "jimeng_t2v_v30_1080p";
const DEFAULT_I2V_KEY = "jimeng_i2v_first_v30_1080";

export function defaultJimengReqKey(hasImage: boolean) {
  if (hasImage) {
    return env("JIMENG_I2V_REQ_KEY") || DEFAULT_I2V_KEY;
  }
  return env("JIMENG_REQ_KEY") || DEFAULT_T2V_KEY;
}

/** Map duration to Jimeng frames: 121 ≈ 5s, 241 ≈ 10s */
export function durationToJimengFrames(durationSec?: number) {
  if (!durationSec || durationSec <= 6) return 121;
  return 241;
}

export type JimengVideoSubmitInput = {
  prompt: string;
  /** JPEG/PNG bytes as base64 (no data: prefix) */
  imageBase64?: string;
  /** public image url */
  imageUrl?: string;
  /** 121 ≈ 5s, 241 ≈ 10s */
  frames?: number;
  aspectRatio?: string;
  /** default jimeng_t2v_v30_1080p / jimeng_i2v_first_v30_1080 */
  reqKey?: string;
  seed?: number;
};

export async function jimengSubmitVideoTask(
  input: JimengVideoSubmitInput
): Promise<{ taskId: string; raw: unknown }> {
  const hasImage = Boolean(input.imageBase64 || input.imageUrl);
  const reqKey = input.reqKey || defaultJimengReqKey(hasImage);
  const body: Record<string, unknown> = {
    req_key: reqKey,
    prompt: input.prompt,
    frames: input.frames ?? 121,
    seed: input.seed ?? -1,
  };
  if (input.imageBase64) {
    body.binary_data_base64 = [input.imageBase64];
  } else if (input.imageUrl) {
    body.image_urls = [input.imageUrl];
  } else {
    body.aspect_ratio = input.aspectRatio || "9:16";
  }

  const raw = (await jimengCvRequest({
    action: "CVSync2AsyncSubmitTask",
    body,
  })) as {
    code?: number;
    message?: string;
    data?: { task_id?: string };
    ResponseMetadata?: { Error?: { Message?: string } };
  };

  const taskId = raw.data?.task_id;
  if (!taskId) {
    const msg =
      raw.message ||
      raw.ResponseMetadata?.Error?.Message ||
      JSON.stringify(raw).slice(0, 400);
    throw new Error(`即梦提交失败: ${msg}`);
  }
  return { taskId, raw };
}

export async function jimengGetVideoResult(taskId: string, reqKey?: string) {
  const key = reqKey || env("JIMENG_REQ_KEY") || DEFAULT_T2V_KEY;
  return jimengCvRequest({
    action: "CVSync2AsyncGetResult",
    body: { req_key: key, task_id: taskId },
  });
}

export async function jimengPollVideo(options: {
  taskId: string;
  reqKey?: string;
  intervalMs?: number;
  maxTries?: number;
}): Promise<{ videoUrl: string; raw: unknown }> {
  const interval = options.intervalMs ?? 5000;
  const maxTries = options.maxTries ?? 120;
  for (let i = 0; i < maxTries; i++) {
    const raw = (await jimengGetVideoResult(
      options.taskId,
      options.reqKey
    )) as {
      code?: number;
      message?: string;
      data?: {
        status?: string;
        video_url?: string;
        aigc_video_url?: string;
      };
    };
    const status = raw.data?.status || "";
    const videoUrl = raw.data?.video_url || raw.data?.aigc_video_url;
    if (status === "done" || status === "success" || videoUrl) {
      if (!videoUrl) {
        throw new Error(
          `即梦完成但无 video_url: ${JSON.stringify(raw).slice(0, 500)}`
        );
      }
      return { videoUrl, raw };
    }
    if (
      status === "not_found" ||
      status === "expired" ||
      status === "failed" ||
      (typeof raw.code === "number" && raw.code !== 10000 && raw.code !== 0)
    ) {
      // some APIs use code 10000 for success while still generating
      if (status === "failed" || status === "expired" || status === "not_found") {
        throw new Error(
          `即梦任务失败 status=${status}: ${JSON.stringify(raw).slice(0, 400)}`
        );
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("即梦任务超时");
}

/** Text-to-video using 即梦 3.0 1080P. */
export async function jimengTextToVideo(input: {
  prompt: string;
  frames?: number;
  aspectRatio?: string;
}): Promise<{ videoUrl: string; taskId: string }> {
  const reqKey = defaultJimengReqKey(false);
  const { taskId } = await jimengSubmitVideoTask({
    prompt: input.prompt,
    frames: input.frames ?? 121,
    aspectRatio: input.aspectRatio || "9:16",
    reqKey,
  });
  const { videoUrl } = await jimengPollVideo({ taskId, reqKey });
  return { videoUrl, taskId };
}

/** Image-to-video (first frame) using 即梦 3.0 1080P. */
export async function jimengImageToVideo(input: {
  prompt: string;
  imageBase64: string;
  frames?: number;
}): Promise<{ videoUrl: string; taskId: string }> {
  const reqKey = defaultJimengReqKey(true);
  const { taskId } = await jimengSubmitVideoTask({
    prompt: input.prompt,
    imageBase64: input.imageBase64,
    frames: input.frames ?? 121,
    reqKey,
  });
  const { videoUrl } = await jimengPollVideo({ taskId, reqKey });
  return { videoUrl, taskId };
}
