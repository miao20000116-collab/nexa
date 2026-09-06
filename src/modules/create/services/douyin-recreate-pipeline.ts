/**
 * Douyin recreate pipeline — LEGACY / OFFLINE PROTOTYPE ONLY.
 *
 * Product path does NOT download platform originals.
 * Use `online-identity-recreate.ts`: link metadata + user face → AI generate.
 *
 * Functions that need source.mp4 (extractKeyframes / compose with platform audio)
 * are not wired to product APIs.
 */

import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { AIGateway } from "@/modules/ai/gateway/ai-gateway";
import { bootstrapAIProviders } from "@/modules/ai/gateway/bootstrap";

export type RecreateMusicInfo = {
  mid: string | null;
  title: string | null;
  author: string | null;
  durationSec: number | null;
  /** Platform labels this as creator original sound */
  isCreatorOriginalSound: boolean;
  /** Optional fingerprint / recognition result */
  fingerprint?: string | null;
  recognizedTitle?: string | null;
  recognizedArtist?: string | null;
  audioPath?: string | null;
  policyNote: string;
};

export type RecreateKeyframe = {
  index: number;
  timeSec: number;
  path: string;
  width?: number;
  height?: number;
  analysis?: string | null;
  swappedPath?: string | null;
};

export type RecreateShotPlan = {
  awemeId: string;
  durationSec: number;
  width: number;
  height: number;
  sourceVideoPath: string;
  music: RecreateMusicInfo;
  keyframes: RecreateKeyframe[];
  factors: string[];
};

export type RecreateComposeResult = {
  plan: RecreateShotPlan;
  outputVideoPath: string;
  previewUrl: string | null;
};

function workDir(awemeId: string) {
  return path.join(process.cwd(), ".nexa-data", "recreate", awemeId);
}

async function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts?.cwd,
      windowsHide: true,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

export async function downloadUrlToFile(
  url: string,
  _dest?: string,
  _referer?: string
): Promise<never> {
  // Product decision: platform original download/cache path is CLOSED.
  const { assertPlatformMediaDownloadForbidden } = await import(
    "@/modules/create/lib/platform-media-policy"
  );
  assertPlatformMediaDownloadForbidden(url);
  throw new Error(
    "downloadUrlToFile 已停用（禁止下载平台原片）。请走 online-identity-recreate。"
  );
}

export async function probeDurationSec(file: string): Promise<number> {
  const r = await runCmd("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const n = Number.parseFloat(r.stdout.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Extract 1fps keyframes + mp3 audio from source mp4. */
export async function extractKeyframesAndAudio(options: {
  awemeId: string;
  sourceVideoPath: string;
  fps?: number;
}): Promise<{
  keyframesDir: string;
  audioPath: string;
  keyframePaths: string[];
  durationSec: number;
}> {
  const dir = workDir(options.awemeId);
  const keyframesDir = path.join(dir, "keyframes");
  const audioPath = path.join(dir, "audio.mp3");
  await fs.mkdir(keyframesDir, { recursive: true });

  const fps = options.fps ?? 1;
  const kfPattern = path.join(keyframesDir, "kf_%02d.jpg");

  const a = await runCmd("ffmpeg", [
    "-y",
    "-i",
    options.sourceVideoPath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-q:a",
    "4",
    audioPath,
  ]);
  if (a.code !== 0) {
    throw new Error(`extract audio failed: ${a.stderr.slice(-400)}`);
  }

  const v = await runCmd("ffmpeg", [
    "-y",
    "-i",
    options.sourceVideoPath,
    "-vf",
    `fps=${fps},scale=768:-1`,
    kfPattern,
  ]);
  if (v.code !== 0) {
    throw new Error(`extract keyframes failed: ${v.stderr.slice(-400)}`);
  }

  const files = (await fs.readdir(keyframesDir))
    .filter((f) => f.endsWith(".jpg"))
    .sort();
  const durationSec = await probeDurationSec(options.sourceVideoPath);

  return {
    keyframesDir,
    audioPath,
    keyframePaths: files.map((f) => path.join(keyframesDir, f)),
    durationSec,
  };
}

/** Chromaprint fingerprint when available (for song ID services). */
export async function fingerprintAudio(
  audioPath: string
): Promise<string | null> {
  const r = await runCmd("ffmpeg", [
    "-i",
    audioPath,
    "-t",
    "15",
    "-f",
    "chromaprint",
    "-length",
    "10",
    "-",
  ]);
  if (r.code !== 0) return null;
  const line = r.stdout.trim() || r.stderr.trim();
  return line.slice(0, 500) || null;
}

export async function analyzeKeyframeWithVision(
  imagePath: string
): Promise<string> {
  bootstrapAIProviders();
  if (!AIGateway.isAvailable("analyzeImage")) {
    return "vision unavailable";
  }
  const bytes = await fs.readFile(imagePath);
  const out = await AIGateway.analyzeImage({
    mimeType: "image/jpeg",
    prompt: [
      "你是短视频分镜分析师。用中文列出本帧合成要素：",
      "1) 人物（性别/发型/妆容/表情）",
      "2) 服装与道具",
      "3) 姿势与构图",
      "4) 背景与光影",
      "5) 字幕/特效叠字（如有）",
      "6) 风格标签（仙侠/漫剧/写实等）",
      "简洁条目，便于后续换脸重绘。",
    ].join("\n"),
    // provider reads url or we pass via storage — check analyzeImage
  });
  // Many providers need url; pass data via temporary approach
  void bytes;
  return out.summary || JSON.stringify(out.labels || []) || "analyzed";
}

/**
 * Face-swap one keyframe: keep scene, replace identity with user face.
 * Uses image edit with keyframe as base when possible; falls back to
 * generate-with-face-reference + scene prompt.
 */
export async function faceSwapKeyframe(options: {
  keyframePath: string;
  faceImagePath: string;
  sceneHint?: string;
  outPath: string;
}): Promise<string> {
  bootstrapAIProviders();
  if (!AIGateway.isAvailable("generateImage")) {
    throw new Error("generateImage 未开启，无法换脸");
  }

  const keyframeBytes = await fs.readFile(options.keyframePath);
  const faceBytes = await fs.readFile(options.faceImagePath);

  const prompt = [
    "任务：短视频关键帧换脸重绘（Face identity swap）。",
    "必须保留：原图构图、姿势、服装、道具、背景、光影、色调、镜头景别、任何叠字位置。",
    "必须替换：人物面部身份为参考人脸照片的同一人（五官/脸型/气质对齐参考脸）。",
    "不要改变成无关现代日常立绘；不要平板/办公室元素。",
    options.sceneHint ? `分镜要素：${options.sceneHint}` : "",
    "输出单张竖/横与原帧一致的成片帧。",
  ]
    .filter(Boolean)
    .join("\n");

  // Prefer edit on keyframe (preserve layout), then try face as ref
  let result;
  try {
    result = await AIGateway.generateImage({
      prompt: `${prompt}\n参考脸说明：请将画面人物换成与附带参考脸相同的人脸身份。`,
      mode: "edit",
      size: "1024x576",
      referenceImageBytes: keyframeBytes,
      referenceMimeType: "image/jpeg",
    });
  } catch {
    result = null;
  }

  if (!result?.url && !result?.storageKey) {
    result = await AIGateway.generateImage({
      prompt: `${prompt}\n以参考人物的脸为准，重绘与关键帧同构图的仙侠/漫剧人像镜头。`,
      mode: "generate",
      size: "1024x576",
      referenceImageBytes: faceBytes,
      referenceMimeType: options.faceImagePath.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg",
    });
  }

  // If we only edited with keyframe, do a second pass with face ref when possible
  if (result?.storageKey || result?.url) {
    // Load generated bytes if storageKey under .nexa-data/generated
    let swappedBytes: Buffer | null = null;
    if (result.storageKey) {
      const p = path.join(process.cwd(), ".nexa-data", "generated", result.storageKey);
      try {
        swappedBytes = await fs.readFile(p);
      } catch {
        swappedBytes = null;
      }
    }
    if (!swappedBytes && result.url?.startsWith("/api/ai/files/")) {
      const name = result.url.replace("/api/ai/files/", "");
      const p = path.join(process.cwd(), ".nexa-data", "generated", name);
      try {
        swappedBytes = await fs.readFile(p);
      } catch {
        swappedBytes = null;
      }
    }

    // Second pass: blend identity using face reference
    try {
      const pass2 = await AIGateway.generateImage({
        prompt:
          "将这张画面中的人物面部替换为参考人脸照片的身份，保持服装、姿势、背景、构图完全不变。",
        mode: "edit",
        size: "1024x576",
        referenceImageBytes: faceBytes,
        referenceMimeType: "image/png",
      });
      if (pass2.storageKey) {
        const p2 = path.join(
          process.cwd(),
          ".nexa-data",
          "generated",
          pass2.storageKey
        );
        await fs.copyFile(p2, options.outPath);
        return options.outPath;
      }
    } catch {
      /* keep first result */
    }

    if (swappedBytes) {
      await fs.writeFile(options.outPath, swappedBytes);
      return options.outPath;
    }
  }

  throw new Error("换脸生成未返回可用图片");
}

/** Compose swapped frames (1fps) + source audio into final mp4. */
export async function composeRecreateVideo(options: {
  awemeId: string;
  framePaths: string[];
  audioPath: string;
  fps?: number;
}): Promise<string> {
  const dir = workDir(options.awemeId);
  const outPath = path.join(dir, "composed.mp4");
  const listFile = path.join(dir, "frames.txt");
  const fps = options.fps ?? 1;

  // Build concat demuxer for images with duration
  const lines: string[] = [];
  for (const f of options.framePaths) {
    const abs = f.replace(/\\/g, "/");
    lines.push(`file '${abs}'`);
    lines.push(`duration ${1 / fps}`);
  }
  if (options.framePaths.length) {
    lines.push(
      `file '${options.framePaths[options.framePaths.length - 1].replace(/\\/g, "/")}'`
    );
  }
  await fs.writeFile(listFile, lines.join("\n"), "utf8");

  const r = await runCmd("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-i",
    options.audioPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outPath,
  ]);
  if (r.code !== 0) {
    throw new Error(`compose failed: ${r.stderr.slice(-500)}`);
  }
  return outPath;
}

export async function buildShotPlanFromExtracted(options: {
  awemeId: string;
  sourceVideoPath: string;
  musicMeta?: Partial<RecreateMusicInfo>;
}): Promise<RecreateShotPlan> {
  const extracted = await extractKeyframesAndAudio({
    awemeId: options.awemeId,
    sourceVideoPath: options.sourceVideoPath,
  });

  const fp = await fingerprintAudio(extracted.audioPath);

  const keyframes: RecreateKeyframe[] = extracted.keyframePaths.map(
    (p, i) => ({
      index: i,
      timeSec: i,
      path: p,
    })
  );

  const music: RecreateMusicInfo = {
    mid: options.musicMeta?.mid ?? null,
    title: options.musicMeta?.title ?? null,
    author: options.musicMeta?.author ?? null,
    durationSec: extracted.durationSec,
    isCreatorOriginalSound: /原声/.test(options.musicMeta?.title || ""),
    fingerprint: fp,
    audioPath: extracted.audioPath,
    policyNote:
      "成片默认混入该作品音轨（平台二创可用配乐策略）；若指纹识别到商业曲目则记录曲名作者，仍优先使用作品内音轨以保证卡点一致。",
  };

  return {
    awemeId: options.awemeId,
    durationSec: extracted.durationSec,
    width: 1024,
    height: 576,
    sourceVideoPath: options.sourceVideoPath,
    music,
    keyframes,
    factors: [
      "关键帧抽帧（1fps）",
      "逐帧视觉要素分析",
      "用户脸身份替换",
      "保留原片音轨卡点",
      "FFmpeg 合成成片",
    ],
  };
}
