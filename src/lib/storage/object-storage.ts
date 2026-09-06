/**
 * S3-compatible object storage (AWS S3 / Tencent COS).
 * Uses Signature V4 over fetch — no extra SDK dependency.
 * When unset, callers must fall back to local FS (dev only) or fail clearly.
 */

import { createHash, createHmac } from "crypto";
import { allowLocalDataDir } from "@/lib/runtime";

export type ObjectStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL for objects (CDN / bucket domain). Optional. */
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
};

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

export function getObjectStorageConfig(): ObjectStorageConfig | null {
  const endpoint =
    env("S3_ENDPOINT") ||
    env("COS_ENDPOINT") ||
    // Tencent COS style: https://cos.{region}.myqcloud.com
    (env("COS_REGION")
      ? `https://cos.${env("COS_REGION")}.myqcloud.com`
      : "");
  const region = env("S3_REGION") || env("COS_REGION") || "ap-guangzhou";
  const bucket = env("S3_BUCKET") || env("COS_BUCKET");
  const accessKeyId =
    env("S3_ACCESS_KEY_ID") || env("COS_SECRET_ID") || env("COS_ACCESS_KEY_ID");
  const secretAccessKey =
    env("S3_SECRET_ACCESS_KEY") ||
    env("COS_SECRET_KEY") ||
    env("COS_ACCESS_KEY_SECRET");
  const publicBaseUrl =
    env("S3_PUBLIC_BASE_URL") || env("COS_PUBLIC_BASE_URL") || "";

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/$/, ""),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, "") || undefined,
    forcePathStyle: env("S3_FORCE_PATH_STYLE") === "1",
  };
}

export function isObjectStorageConfigured(): boolean {
  return getObjectStorageConfig() !== null;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function hashHex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function amzDate(d = new Date()): { amz: string; date: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

function encodePath(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, escape))
    .join("/");
}

function buildObjectUrl(cfg: ObjectStorageConfig, key: string): string {
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  const ep = new URL(cfg.endpoint);
  if (cfg.forcePathStyle) {
    return `${ep.origin}/${cfg.bucket}/${encodePath(key)}`;
  }
  // virtual-hosted-style
  return `${ep.protocol}//${cfg.bucket}.${ep.host}/${encodePath(key)}`;
}

function signingKey(
  secret: string,
  date: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

async function signedRequest(opts: {
  method: string;
  key: string;
  body?: Buffer;
  contentType?: string;
}): Promise<Response> {
  const cfg = getObjectStorageConfig();
  if (!cfg) throw new Error("object_storage_not_configured");

  const { amz, date } = amzDate();
  const url = new URL(buildObjectUrl(cfg, opts.key));
  // Prefer path-style request URL for signing consistency when forced
  const host = url.host;
  const canonicalUri = url.pathname || "/";
  const payloadHash = hashHex(opts.body ?? Buffer.alloc(0));
  const contentType = opts.contentType || "application/octet-stream";

  const headers: Record<string, string> = {
    host,
    "content-type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  if (opts.body) {
    headers["content-length"] = String(opts.body.length);
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[k].trim()}\n`)
    .join("");

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${date}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    signingKey(cfg.secretAccessKey, date, cfg.region, "s3"),
    stringToSign
  ).toString("hex");

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url.toString(), {
    method: opts.method,
    headers,
    body: opts.body ? new Uint8Array(opts.body) : undefined,
  });
}

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<{ key: string; url: string }> {
  const cfg = getObjectStorageConfig();
  if (!cfg) throw new Error("object_storage_not_configured");

  const res = await signedRequest({
    method: "PUT",
    key: input.key,
    body: input.body,
    contentType: input.contentType,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `object_storage_put_failed:${res.status}:${text.slice(0, 200)}`
    );
  }
  return { key: input.key, url: buildObjectUrl(cfg, input.key) };
}

export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType?: string } | null> {
  if (!getObjectStorageConfig()) return null;
  const res = await signedRequest({ method: "GET", key });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`object_storage_get_failed:${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return {
    body: Buffer.from(ab),
    contentType: res.headers.get("content-type") || undefined,
  };
}

export function objectPublicUrl(key: string): string | null {
  const cfg = getObjectStorageConfig();
  if (!cfg) return null;
  return buildObjectUrl(cfg, key);
}

export function storageUnavailableMessage(): string {
  if (allowLocalDataDir()) {
    return "本地存储可用；未配置对象存储。";
  }
  return "生产环境未配置对象存储（S3/COS）。请设置 S3_* 或 COS_* 环境变量。";
}
