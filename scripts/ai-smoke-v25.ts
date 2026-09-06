/**
 * V2.5 smoke: produce a real 30s Chinese short MP4 via Timeline Engine + FFmpeg.
 * Does not fabricate a fake file. Uses owned-style image slides + user music.
 */
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { createDraftStoryboard, analyzeMaterialCoverage, timelineFromStoryboard } from "../src/modules/video/material-strategy";
import { renderTimeline, isFfmpegAvailable } from "../src/modules/video/timeline-engine";
import { saveUserMusic } from "../src/modules/video/music/music-service";

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ ok: boolean; log: string }>((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stderr?.on("data", (d) => (log += String(d)));
    child.stdout?.on("data", (d) => (log += String(d)));
    child.on("error", (e) => resolve({ ok: false, log: e.message }));
    child.on("close", (code) => resolve({ ok: code === 0, log }));
  });
}

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  const workDir = path.join(process.cwd(), ".nexa-data", "renders", "v25_smoke_30s");
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });

  const ffmpegOk = await isFfmpegAvailable();
  const result: Record<string, unknown> = {
    at: new Date().toISOString(),
    ffmpegOk,
  };

  if (!ffmpegOk) {
    result.status = "blocked_ffmpeg_unavailable";
    await fs.writeFile(
      path.join(outDir, "v2.5-video-smoke.json"),
      JSON.stringify(result, null, 2)
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  // 1) Existing assets first: create 3 image assets (simulating user uploads)
  const imgPaths: string[] = [];
  const colors = ["0x1d4ed8", "0x047857", "0xb45309"];
  const labels = ["便携榨汁杯", "纽约公园野餐", "机场旅行场景"];
  for (let i = 0; i < 3; i++) {
    const img = path.join(workDir, `asset_${i}.png`);
    const r = await run("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${colors[i]}:s=1080x1920:d=1`,
      "-frames:v",
      "1",
      img,
    ]);
    if (!r.ok) throw new Error(`image gen failed ${r.log.slice(-200)}`);
    imgPaths.push(img);
  }

  // 2) User-upload music priority: generate a 30s wav as "uploaded" music
  const wav = path.join(workDir, "user_music.wav");
  const musicGen = await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=554:sample_rate=44100:duration=30",
    "-filter_complex",
    "[0][1]amix=inputs=2:duration=first,volume=0.2",
    wav,
  ]);
  if (!musicGen.ok) throw new Error(`music gen failed ${musicGen.log.slice(-200)}`);
  const musicBytes = await fs.readFile(wav);
  const uploaded = await saveUserMusic({
    filename: "user_bgm.wav",
    mimeType: "audio/wav",
    bytes: musicBytes,
    title: "用户上传测试音乐",
  });

  // 3) Coverage: 3 images * 3s = 9s existing; AI required = 21s (but we render with image reuse, not infinite AI)
  const coverage = analyzeMaterialCoverage({
    targetDurationSec: 30,
    mode: "prefer_owned",
    assets: imgPaths.map((p) => ({
      id: p,
      type: "image",
      durationSec: 3,
    })),
    imageAnimationSecPerImage: 10, // enough existing coverage for 30s without AI
  });

  result.coverage = coverage;

  const storyboard = createDraftStoryboard({
    goal: "便携榨汁杯：30秒中文种草短视频",
    coverage,
    assets: imgPaths.map((p) => ({ id: p, type: "image", durationSec: 10 })),
  });

  // Force Chinese subtitles / narration / 30s
  let remaining = 30;
  storyboard.shots = imgPaths.map((p, i) => {
    const dur = i === imgPaths.length - 1 ? remaining : 10;
    remaining -= dur;
    return {
      id: `shot_${i + 1}`,
      order: i + 1,
      durationSec: dur,
      description: labels[i],
      sourceType: "image_animation" as const,
      assetId: p,
      subtitle: labels[i],
      narration: `旁白：${labels[i]}`,
    };
  });
  storyboard.script =
    "30秒中文短视频：便携榨汁杯种草。优先使用已有图片素材，不无限 AI 生成。";

  const timeline = timelineFromStoryboard(storyboard, "9:16", uploaded.track);
  result.timelineTracks = {
    video: timeline.videoTrack.scenes.length,
    image: timeline.imageTrack.scenes.length,
    text: timeline.textTrack.scenes.length,
    voice: timeline.voiceTrack.scenes.length,
    music: Boolean(timeline.musicTrack.url),
    durationSec: timeline.durationSec,
  };

  const render = await renderTimeline(timeline, workDir, {
    projectId: "v25_smoke_30s",
    allowSyntheticForMissing: false,
    resolveAssetPath: async (id) => id,
  });

  result.render = {
    ok: render.ok,
    status: render.status,
    errorMessage: render.errorMessage,
    previewRelativeUrl: render.previewRelativeUrl,
  };

  if (render.ok && render.outputPath) {
    const st = await fs.stat(render.outputPath);
    result.mp4 = {
      path: render.outputPath,
      bytes: st.size,
      previewUrl: `/api/video/render/file/v25_smoke_30s`,
    };
    // Probe duration
    const probe = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      render.outputPath,
    ]);
    result.mp4DurationSec = Number(probe.log.trim());
    result.status =
      st.size > 10000 && Number(probe.log.trim()) >= 25 ? "ok" : "mp4_too_short";
  } else {
    result.status = render.status;
    result.logs = render.logs?.slice(-5);
  }

  const outPath = path.join(outDir, "v2.5-video-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);
  if (result.status !== "ok") process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
