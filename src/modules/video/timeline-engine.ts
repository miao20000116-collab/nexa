/**
 * Timeline Engine — AI outputs Timeline JSON; FFmpeg executes a real MP4.
 * Never returns a fake completed video file.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { assetStoragePath } from "@/lib/assets/file-store";
import type { AspectRatio, TimelineDocument, TimelineScene } from "./types";

export interface RenderPlan {
  timeline: TimelineDocument;
  commands: string[];
  outputPath: string;
  notes: string[];
}

export interface RenderResult {
  ok: boolean;
  status: "completed" | "failed" | "blocked_ffmpeg_unavailable";
  outputPath?: string;
  previewRelativeUrl?: string;
  errorMessage?: string;
  logs?: string[];
  /** How many clips used dark synthetic fallback (no media). */
  syntheticClipCount?: number;
  totalClipCount?: number;
}

export interface ResolvedMedia {
  sceneId: string;
  kind: "video" | "image" | "synthetic";
  filePath: string;
  durationSec: number;
  subtitle?: string;
}

function aspectSize(aspect: AspectRatio): { w: number; h: number } {
  if (aspect === "16:9") return { w: 1280, h: 720 };
  if (aspect === "1:1") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1920 };
}

async function writeAssSubtitle(
  filePath: string,
  text: string,
  durationSec: number,
  size: { w: number; h: number }
) {
  const safe = (text || "Nexa").replace(/\r?\n/g, " ").slice(0, 80);
  const end = formatAssTime(durationSec);
  const content = `[Script Info]
ScriptType: v4.00+
PlayResX: ${size.w}
PlayResY: ${size.h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${safe}
`;
  await fs.writeFile(filePath, content, "utf-8");
}

function formatAssTime(sec: number): string {
  const s = Math.max(0.1, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const whole = Math.floor(rest);
  const cs = Math.floor((rest - whole) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function subtitlesFilter(assPath: string): string {
  // FFmpeg subtitles filter on Windows prefers forward slashes + escaped colon
  const normalized = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  return `subtitles='${normalized}'`;
}

export async function isFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function runFfmpeg(args: string[], cwd?: string): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stderr?.on("data", (d) => {
      log += String(d);
    });
    child.stdout?.on("data", (d) => {
      log += String(d);
    });
    child.on("error", (err) => {
      resolve({ ok: false, log: err.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, log: log.slice(-4000) });
    });
  });
}

export function buildRenderPlan(
  timeline: TimelineDocument,
  workDir: string
): RenderPlan {
  const outputPath = path.join(workDir, "export.mp4");
  const notes = [
    "LLM 不直接生成成片，仅产出 Timeline JSON。",
    "剪切 / 拼接 / 字幕 / 音乐混合由 Timeline Engine + FFmpeg 执行。",
  ];
  const videoScenes = [
    ...timeline.videoTrack.scenes,
    ...timeline.imageTrack.scenes,
  ].sort((a, b) => a.start - b.start);

  const commands = videoScenes.map(
    (s) =>
      `# ${s.id} ${s.start}-${s.end}s ${s.sourceType} asset=${s.assetId ?? "-"}`
  );
  commands.push(`ffmpeg … → ${outputPath}`);

  return { timeline, commands, outputPath, notes };
}

async function resolveSceneFile(
  scene: TimelineScene,
  resolveAssetPath: (assetId: string) => Promise<string | null>
): Promise<{ kind: "video" | "image"; filePath: string } | null> {
  if (!scene.assetId) return null;

  // Local absolute / relative path already set by production service
  if (scene.assetId.includes("/") || scene.assetId.includes("\\") || scene.assetId.includes(".")) {
    const asPath = scene.assetId;
    try {
      await fs.access(asPath);
      const lower = asPath.toLowerCase();
      const kind =
        lower.endsWith(".mp4") ||
        lower.endsWith(".mov") ||
        lower.endsWith(".webm")
          ? "video"
          : "image";
      return { kind, filePath: asPath };
    } catch {
      /* fall through */
    }
  }

  const fromAssets = await resolveAssetPath(scene.assetId);
  if (fromAssets) {
    const lower = fromAssets.toLowerCase();
    const kind =
      lower.endsWith(".mp4") ||
      lower.endsWith(".mov") ||
      lower.endsWith(".webm")
        ? "video"
        : "image";
    return { kind, filePath: fromAssets };
  }
  return null;
}

async function makeSyntheticClip(
  workDir: string,
  index: number,
  durationSec: number,
  size: { w: number; h: number },
  label: string
): Promise<string> {
  const out = path.join(workDir, `synth_${index}.mp4`);
  const ass = path.join(workDir, `synth_${index}.ass`);
  await writeAssSubtitle(ass, label || "Nexa", durationSec, size);
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1a1a1a:s=${size.w}x${size.h}:d=${durationSec}`,
    "-vf",
    subtitlesFilter(ass),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(durationSec),
    out,
  ];
  const result = await runFfmpeg(args, workDir);
  if (!result.ok) {
    const args2 = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x222222:s=${size.w}x${size.h}:d=${durationSec}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(durationSec),
      out,
    ];
    const r2 = await runFfmpeg(args2, workDir);
    if (!r2.ok) throw new Error(`合成镜头失败: ${r2.log.slice(-300)}`);
  }
  return out;
}

async function makeImageClip(
  workDir: string,
  index: number,
  imagePath: string,
  durationSec: number,
  size: { w: number; h: number },
  subtitle?: string,
  opts?: { kenBurns?: boolean }
): Promise<string> {
  const out = path.join(workDir, `clip_${index}.mp4`);
  const d = Math.max(0.5, durationSec);
  const frames = Math.max(15, Math.round(d * 25));
  // Alternate zoom-in / zoom-out so consecutive stills don't look identical
  const zoomIn = index % 2 === 0;
  const zoompan = zoomIn
    ? `zoompan=z='min(zoom+0.0015,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${size.w}x${size.h}:fps=25`
    : `zoompan=z='if(eq(on,1),1.18,max(zoom-0.0015,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${size.w}x${size.h}:fps=25`;

  const useMotion = opts?.kenBurns !== false;
  const baseFilters = useMotion
    ? [
        `scale=${size.w * 2}:${size.h * 2}:force_original_aspect_ratio=increase`,
        `crop=${size.w * 2}:${size.h * 2}`,
        zoompan,
      ]
    : [
        `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease`,
        `pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
      ];

  const filters = [...baseFilters];
  if (subtitle?.trim()) {
    const ass = path.join(workDir, `clip_${index}.ass`);
    await writeAssSubtitle(ass, subtitle, durationSec, size);
    filters.push(subtitlesFilter(ass));
  }
  const args = [
    "-y",
    "-loop",
    "1",
    "-t",
    String(durationSec),
    "-i",
    imagePath,
    "-vf",
    filters.join(","),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(durationSec),
    out,
  ];
  const result = await runFfmpeg(args, workDir);
  if (!result.ok) {
    // Fallback: static scale without kenburns / subtitles
    const args2 = [
      "-y",
      "-loop",
      "1",
      "-t",
      String(durationSec),
      "-i",
      imagePath,
      "-vf",
      `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease,pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(durationSec),
      out,
    ];
    const r2 = await runFfmpeg(args2, workDir);
    if (!r2.ok) throw new Error(`图片镜头失败: ${result.log.slice(-300)}`);
  }
  return out;
}

async function makeVideoClip(
  workDir: string,
  index: number,
  videoPath: string,
  durationSec: number,
  size: { w: number; h: number },
  subtitle?: string
): Promise<string> {
  const out = path.join(workDir, `clip_${index}.mp4`);
  const filters = [
    `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease`,
    `pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
  ];
  if (subtitle?.trim()) {
    const ass = path.join(workDir, `vclip_${index}.ass`);
    await writeAssSubtitle(ass, subtitle, durationSec, size);
    filters.push(subtitlesFilter(ass));
  }
  const args = [
    "-y",
    "-i",
    videoPath,
    "-t",
    String(durationSec),
    "-vf",
    filters.join(","),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    out,
  ];
  const result = await runFfmpeg(args, workDir);
  if (!result.ok) {
    const args2 = [
      "-y",
      "-i",
      videoPath,
      "-t",
      String(durationSec),
      "-vf",
      `scale=${size.w}:${size.h}:force_original_aspect_ratio=decrease,pad=${size.w}:${size.h}:(ow-iw)/2:(oh-ih)/2`,
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      out,
    ];
    const r2 = await runFfmpeg(args2, workDir);
    if (!r2.ok) throw new Error(`视频镜头失败: ${result.log.slice(-300)}`);
  }
  return out;
}

async function resolveMusicPath(
  timeline: TimelineDocument
): Promise<string | null> {
  const url = timeline.musicTrack.url;
  if (url?.startsWith("/api/video/music/file/")) {
    const name = decodeURIComponent(url.replace("/api/video/music/file/", ""));
    const p = path.join(process.cwd(), ".nexa-data", "music", path.basename(name));
    try {
      await fs.access(p);
      return p;
    } catch {
      return null;
    }
  }
  if (timeline.musicTrack.assetId) {
    const asStorage = assetStoragePath(timeline.musicTrack.assetId);
    try {
      await fs.access(asStorage);
      return asStorage;
    } catch {
      /* ignore */
    }
    const musicGuess = path.join(
      process.cwd(),
      ".nexa-data",
      "music",
      path.basename(timeline.musicTrack.assetId)
    );
    try {
      await fs.access(musicGuess);
      return musicGuess;
    } catch {
      return null;
    }
  }
  return null;
}

async function resolveVoiceFile(assetId: string): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), ".nexa-data", "generated", path.basename(assetId)),
    assetStoragePath(assetId),
    path.join(process.cwd(), ".nexa-data", "music", path.basename(assetId)),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Build one continuous voice bed (silence + delayed TTS clips). */
async function buildVoiceBed(
  workDir: string,
  timeline: TimelineDocument
): Promise<string | null> {
  const scenes = (timeline.voiceTrack?.scenes || [])
    .filter((s) => s.assetId)
    .sort((a, b) => a.start - b.start);
  if (!scenes.length) return null;

  const parts: string[] = [];
  let idx = 0;
  for (const scene of scenes) {
    const file = await resolveVoiceFile(scene.assetId!);
    if (!file) continue;
    const delayed = path.join(workDir, `voice_delay_${idx}.mp3`);
    const delayMs = Math.max(0, Math.round(scene.start * 1000));
    const r = await runFfmpeg(
      [
        "-y",
        "-i",
        file,
        "-af",
        `adelay=${delayMs}|${delayMs}`,
        "-t",
        String(Math.max(timeline.durationSec, scene.end + 0.5)),
        delayed,
      ],
      workDir
    );
    if (r.ok) {
      parts.push(delayed);
      idx += 1;
    }
  }
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];

  const inputs = parts.flatMap((p) => ["-i", p]);
  const mixInputs = parts.map((_, i) => `[${i}:a]`).join("");
  const out = path.join(workDir, "voice_bed.mp3");
  const mix = await runFfmpeg(
    [
      "-y",
      ...inputs,
      "-filter_complex",
      `${mixInputs}amix=inputs=${parts.length}:dropout_transition=0:normalize=0[a]`,
      "-map",
      "[a]",
      out,
    ],
    workDir
  );
  return mix.ok ? out : parts[0];
}

/**
 * Render is blocked until ffmpeg is available.
 * Produces a real MP4 under workDir/export.mp4.
 */
export async function renderTimeline(
  timeline: TimelineDocument,
  workDir: string,
  options?: {
    projectId?: string;
    resolveAssetPath?: (assetId: string) => Promise<string | null>;
    allowSyntheticForMissing?: boolean;
  }
): Promise<RenderResult> {
  const plan = buildRenderPlan(timeline, workDir);
  const logs: string[] = [...plan.notes];
  const hasFfmpeg = await isFfmpegAvailable();
  if (!hasFfmpeg) {
    return {
      ok: false,
      status: "blocked_ffmpeg_unavailable",
      errorMessage: "本机未检测到 FFmpeg，无法渲染成片。",
      logs: plan.commands,
    };
  }

  await fs.mkdir(workDir, { recursive: true });
  const size = aspectSize(timeline.aspectRatio);
  const resolveAssetPath =
    options?.resolveAssetPath ??
    (async (assetId: string) => {
      try {
        const p = assetStoragePath(assetId);
        await fs.access(p);
        return p;
      } catch {
        return null;
      }
    });

  const visualScenes = [
    ...timeline.videoTrack.scenes,
    ...timeline.imageTrack.scenes,
  ].sort((a, b) => a.start - b.start);

  if (visualScenes.length === 0) {
    return {
      ok: false,
      status: "failed",
      errorMessage: "时间线暂无视频/图片镜头，无法渲染。",
      logs,
    };
  }

  const clipPaths: string[] = [];
  const syntheticClipCount = 0;
  try {
    for (let i = 0; i < visualScenes.length; i++) {
      const scene = visualScenes[i];
      const durationSec = Math.max(0.5, scene.end - scene.start);
      const subtitle =
        scene.text ||
        timeline.textTrack.scenes.find(
          (t) => t.start === scene.start || t.id.startsWith(scene.id)
        )?.text;

      const resolved = await resolveSceneFile(scene, resolveAssetPath);
      if (resolved?.kind === "image") {
        clipPaths.push(
          await makeImageClip(
            workDir,
            i,
            resolved.filePath,
            durationSec,
            size,
            subtitle,
            {
              kenBurns:
                scene.animation === "kenburns" ||
                scene.sourceType === "image_animation" ||
                scene.sourceType === "owned_image",
            }
          )
        );
      } else if (resolved?.kind === "video") {
        clipPaths.push(
          await makeVideoClip(
            workDir,
            i,
            resolved.filePath,
            durationSec,
            size,
            subtitle
          )
        );
      } else {
        return {
          ok: false,
          status: "failed",
          errorMessage: `镜头 ${scene.id} 缺少画面素材，请先生成 AI 画面或上传素材。`,
          logs,
          syntheticClipCount,
          totalClipCount: clipPaths.length,
        };
      }
    }

    const listFile = path.join(workDir, "concat.txt");
    const listBody = clipPaths
      .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listFile, listBody, "utf-8");

    const silentVideo = path.join(workDir, "video_silent.mp4");
    const concatResult = await runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-c",
        "copy",
        silentVideo,
      ],
      workDir
    );
    if (!concatResult.ok) {
      // Re-encode concat fallback
      const concat2 = await runFfmpeg(
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listFile,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          silentVideo,
        ],
        workDir
      );
      if (!concat2.ok) {
        return {
          ok: false,
          status: "failed",
          errorMessage: "拼接镜头失败",
          logs: [...logs, concatResult.log.slice(-500), concat2.log.slice(-500)],
        };
      }
    }

    const musicPath = await resolveMusicPath(timeline);
    const voicePath = await buildVoiceBed(workDir, timeline);
    const outputPath = plan.outputPath;

    if (voicePath && musicPath) {
      const mix = await runFfmpeg(
        [
          "-y",
          "-i",
          silentVideo,
          "-i",
          voicePath,
          "-i",
          musicPath,
          "-filter_complex",
          `[1:a]volume=1.0[v];[2:a]volume=0.22,afade=t=in:st=0:d=0.5[a];[v][a]amix=inputs=2:duration=first:dropout_transition=2[out]`,
          "-map",
          "0:v",
          "-map",
          "[out]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-shortest",
          outputPath,
        ],
        workDir
      );
      if (!mix.ok) {
        const voiceOnly = await runFfmpeg(
          [
            "-y",
            "-i",
            silentVideo,
            "-i",
            voicePath,
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            outputPath,
          ],
          workDir
        );
        if (!voiceOnly.ok) {
          await fs.copyFile(silentVideo, outputPath);
          logs.push("配音/配乐混音失败，已导出无声成片。", mix.log.slice(-400));
        } else {
          logs.push("配乐混音失败，已保留字幕配音。");
        }
      } else {
        logs.push("已混入字幕配音 + 背景音乐。");
      }
    } else if (voicePath) {
      const mix = await runFfmpeg(
        [
          "-y",
          "-i",
          silentVideo,
          "-i",
          voicePath,
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-shortest",
          outputPath,
        ],
        workDir
      );
      if (!mix.ok) {
        await fs.copyFile(silentVideo, outputPath);
        logs.push("配音混音失败，已导出无声成片。", mix.log.slice(-400));
      } else {
        logs.push("已混入字幕配音（朗读字幕）。");
      }
    } else if (musicPath) {
      const mix = await runFfmpeg(
        [
          "-y",
          "-i",
          silentVideo,
          "-i",
          musicPath,
          "-filter_complex",
          `[1:a]volume=0.35,afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, timeline.durationSec - 1)}:d=1[a]`,
          "-map",
          "0:v",
          "-map",
          "[a]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-shortest",
          outputPath,
        ],
        workDir
      );
      if (!mix.ok) {
        await fs.copyFile(silentVideo, outputPath);
        logs.push("音乐混音失败，已导出无配乐成片。", mix.log.slice(-400));
      }
    } else {
      const withTone = await runFfmpeg(
        [
          "-y",
          "-i",
          silentVideo,
          "-f",
          "lavfi",
          "-i",
          `anullsrc=r=44100:cl=stereo`,
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-shortest",
          outputPath,
        ],
        workDir
      );
      if (!withTone.ok) {
        await fs.copyFile(silentVideo, outputPath);
      }
      logs.push(
        "未绑定配音/音乐：画面可导出。可在步骤 03 用字幕生成配音，或上传 BGM。"
      );
    }

    const stat = await fs.stat(/* turbopackIgnore: true */ outputPath);
    if (stat.size < 1000) {
      return {
        ok: false,
        status: "failed",
        errorMessage: "成片文件异常过小，渲染可能失败。",
        logs,
      };
    }

    const previewRelativeUrl = options?.projectId
      ? `/api/video/render/file/${encodeURIComponent(options.projectId)}`
      : undefined;

    logs.push(`成片大小 ${stat.size} bytes`);
    return {
      ok: true,
      status: "completed",
      outputPath,
      previewRelativeUrl,
      logs,
      syntheticClipCount,
      totalClipCount: clipPaths.length,
    };
  } catch (err) {
    return {
      ok: false,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "渲染失败",
      logs,
    };
  }
}

export function regenerateSceneInTimeline(
  timeline: TimelineDocument,
  sceneId: string,
  patch: Partial<TimelineScene>
): TimelineDocument {
  const mapScenes = (scenes: TimelineScene[]) =>
    scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s));

  return {
    ...timeline,
    videoTrack: {
      ...timeline.videoTrack,
      scenes: mapScenes(timeline.videoTrack.scenes),
    },
    imageTrack: {
      ...timeline.imageTrack,
      scenes: mapScenes(timeline.imageTrack.scenes),
    },
    textTrack: {
      ...timeline.textTrack,
      scenes: mapScenes(timeline.textTrack.scenes),
    },
    musicTrack: {
      ...timeline.musicTrack,
      scenes: mapScenes(timeline.musicTrack.scenes),
    },
    voiceTrack: {
      ...timeline.voiceTrack,
      scenes: mapScenes(timeline.voiceTrack.scenes),
    },
    effectTrack: {
      ...timeline.effectTrack,
      scenes: mapScenes(timeline.effectTrack.scenes),
    },
    updatedAt: new Date().toISOString(),
  };
}
