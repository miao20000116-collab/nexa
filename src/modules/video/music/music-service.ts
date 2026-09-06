import { promises as fs } from "fs";
import path from "path";
import { detectBeatsFromWav } from "./beat-detection";
import type { BeatAnalysis } from "./beat-detection";
import { UI } from "@/lib/ui-copy";
import type { MusicTrack, MusicSourceKind } from "../types";

const MUSIC_DIR = path.join(process.cwd(), ".nexa-data", "music");

async function ensureDir() {
  await fs.mkdir(MUSIC_DIR, { recursive: true });
}

export interface UploadedMusicResult {
  track: MusicTrack;
  analysis: BeatAnalysis | null;
  warning?: string;
}

/**
 * Store user-uploaded music and run local beat detection when WAV.
 * Never fabricates AI music.
 */
export async function saveUserMusic(options: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  title?: string;
}): Promise<UploadedMusicResult> {
  await ensureDir();
  const id = `music_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = options.filename.replace(/[^\w.\-()\u4e00-\u9fff]+/g, "_");
  const storageName = `${id}_${safeName}`;
  const filePath = path.join(MUSIC_DIR, storageName);
  await fs.writeFile(filePath, options.bytes);

  let analysis: BeatAnalysis | null = null;
  let warning: string | undefined;

  const isWav =
    options.mimeType.includes("wav") ||
    options.filename.toLowerCase().endsWith(".wav");

  if (isWav) {
    const ab = new ArrayBuffer(options.bytes.byteLength);
    new Uint8Array(ab).set(options.bytes);
    analysis = detectBeatsFromWav(ab);
  } else {
    warning =
      "已保存上传音乐。当前本地 Beat Detection 支持 WAV；其他格式可在接入转码后分析。";
  }

  const track: MusicTrack = {
    id: "music_main",
    sourceKind: "user_upload" satisfies MusicSourceKind,
    assetId: id,
    url: `/api/video/music/file/${storageName}`,
    title: options.title || options.filename,
    license: {
      commercialUse: false,
      note: "用户上传音乐。商业发布前请自行确认使用权。",
    },
    bpm: analysis?.bpm ?? null,
    beats: analysis?.beats ?? [],
    sections: analysis?.sections ?? [],
    scenes: [],
  };

  return { track, analysis, warning };
}

export async function readMusicFile(
  storageName: string
): Promise<Buffer | null> {
  const safe = path.basename(storageName);
  try {
    return await fs.readFile(path.join(MUSIC_DIR, safe));
  } catch {
    return null;
  }
}

export function blockedAiMusicMessage() {
  return UI.common.aiUnavailable;
}

/** Licensed library search — empty until a licensed catalog is connected. */
export function searchLicensedMusicStub() {
  return {
    items: [] as Array<{
      id: string;
      title: string;
      commercialUse: boolean;
    }>,
    message:
      "Nexa 合法音乐库尚未接入。请上传自有音乐，或等待授权曲库开通。禁止抓取平台热门音乐。",
  };
}
