/**
 * Optional media providers (image / video / music / TTS).
 * Configured only on Nexa server. Missing config → not available (no fake success).
 */

import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  MusicGenerationRequest,
  MusicGenerationResult,
  MusicAnalysisRequest,
  MusicAnalysisResult,
  ProviderStatus,
  TTSRequest,
  TTSResult,
  VideoGenerationRequest,
  VideoGenerationResult,
  ImageGenerationProvider,
  VideoGenerationProvider,
  MusicProvider,
  TTSProvider,
} from "@/modules/providers/interfaces";
import { notConfiguredStatus } from "@/modules/providers/interfaces";
import path from "path";
import { writeBlob } from "@/lib/storage/blob-store";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function mediaBase() {
  return (env("AI_MEDIA_BASE_URL") || env("AI_BASE_URL")).replace(/\/$/, "");
}

function mediaKey() {
  return env("AI_MEDIA_API_KEY") || env("AI_API_KEY");
}

function imageModel() {
  return env("AI_MODEL_IMAGE") || "nexa-image";
}

async function persistB64(
  b64: string,
  ext = "png"
): Promise<{ storageKey: string; url: string }> {
  const file = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : "application/octet-stream";
  const saved = await writeBlob({
    namespace: "generated",
    filename: file,
    body: Buffer.from(b64, "base64"),
    contentType: mime,
  });
  return { storageKey: path.basename(saved.storageKey), url: saved.url };
}

function parseImagePayload(data: unknown): {
  url?: string;
  b64?: string;
} {
  const obj = data as {
    data?: Array<{ url?: string; b64_json?: string }>;
    url?: string;
    b64_json?: string;
  };
  const first = obj.data?.[0];
  return {
    url: first?.url || obj.url,
    b64: first?.b64_json || obj.b64_json,
  };
}

export class DomesticImageProvider implements ImageGenerationProvider {
  readonly id = "domestic_image";

  isConfigured(): boolean {
    return Boolean(
      mediaBase() && mediaKey() && env("NEXA_IMAGE_ENABLED") !== "0"
    );
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConfigured()) return notConfiguredStatus("图片生成暂未接入");
    return { available: true, code: "PROVIDER_AVAILABLE" };
  }

  async generateImage(
    req: ImageGenerationRequest
  ): Promise<ImageGenerationResult> {
    const started = Date.now();
    const model = imageModel();
    const hasRef = Boolean(
      req.referenceImageBytes?.length || req.referenceImageBase64
    );
    const preferEdit = req.mode === "edit" || (hasRef && req.mode !== "generate");

    if (preferEdit && hasRef) {
      try {
        return {
          ...(await this.callEdits(req, model)),
          model,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // SiliconFlow / many CN gateways have no /images/edits → 404
        if (!/\b404\b/.test(msg)) {
          console.warn(
            "[DomesticImageProvider] edits failed, trying generations+ref",
            msg
          );
        }
      }
    }

    return {
      ...(await this.callGenerations(req, model, hasRef)),
      model,
      latencyMs: Date.now() - started,
    };
  }

  private async callEdits(
    req: ImageGenerationRequest,
    model: string
  ): Promise<ImageGenerationResult> {
    const bytes = req.referenceImageBytes
      ? Buffer.from(req.referenceImageBytes)
      : Buffer.from(req.referenceImageBase64!, "base64");
    const mime = req.referenceMimeType || "image/png";
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", req.prompt);
    if (req.size) form.append("size", req.size);
    form.append("n", "1");
    form.append(
      "image",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      mime.includes("jpeg") || mime.includes("jpg") ? "ref.jpg" : "ref.png"
    );

    const res = await fetch(`${mediaBase()}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mediaKey()}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`image edits api ${res.status} ${text.slice(0, 200)}`);
    }
    return this.materialize(await res.json());
  }

  private async callGenerations(
    req: ImageGenerationRequest,
    model: string,
    withRef: boolean
  ): Promise<ImageGenerationResult> {
    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      size: req.size || "1024x1024",
      n: 1,
    };
    if (req.style) body.style = req.style;
    if (withRef) {
      const b64 =
        req.referenceImageBase64 ||
        (req.referenceImageBytes
          ? Buffer.from(req.referenceImageBytes).toString("base64")
          : undefined);
      if (b64) {
        body.image = b64;
        body.image_base64 = b64;
      }
    }

    const res = await fetch(`${mediaBase()}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mediaKey()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`image api ${res.status} ${text.slice(0, 200)}`);
    }
    return this.materialize(await res.json());
  }

  private async materialize(data: unknown): Promise<ImageGenerationResult> {
    const parsed = parseImagePayload(data);
    if (parsed.url) return { url: parsed.url, mimeType: "image/png" };
    if (parsed.b64) {
      const saved = await persistB64(parsed.b64, "png");
      return {
        storageKey: saved.storageKey,
        url: saved.url,
        mimeType: "image/png",
      };
    }
    throw new Error("image api empty");
  }
}

export class DomesticVideoProvider implements VideoGenerationProvider {
  readonly id = "domestic_video";

  isConfigured(): boolean {
    if (env("NEXA_VIDEO_ENABLED") !== "1") return false;
    // Prefer 即梦 when configured
    if (
      env("NEXA_VIDEO_PROVIDER") === "jimeng" ||
      (env("JIMENG_ACCESS_KEY") && env("JIMENG_SECRET_KEY"))
    ) {
      return Boolean(env("JIMENG_ACCESS_KEY") && env("JIMENG_SECRET_KEY"));
    }
    return Boolean(mediaBase() && mediaKey());
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConfigured()) return notConfiguredStatus("视频生成暂未接入");
    return { available: true, code: "PROVIDER_AVAILABLE" };
  }

  async generateVideo(
    req: VideoGenerationRequest
  ): Promise<VideoGenerationResult> {
    const jimengReady = Boolean(
      env("JIMENG_ACCESS_KEY") && env("JIMENG_SECRET_KEY")
    );
    const preferJimeng =
      env("NEXA_VIDEO_PROVIDER") === "jimeng" ||
      (jimengReady && !(mediaBase() && mediaKey()));

    if (preferJimeng && jimengReady) {
      const {
        durationToJimengFrames,
        jimengImageToVideo,
        jimengTextToVideo,
      } = await import("@/modules/ai/providers/jimeng-volc-video");
      const frames = durationToJimengFrames(req.durationSec);
      const result =
        req.imageBase64 || req.imageUrl
          ? await jimengImageToVideo({
              prompt: req.prompt,
              imageBase64:
                req.imageBase64 ||
                (await fetchImageAsBase64(req.imageUrl!)),
              frames,
            })
          : await jimengTextToVideo({
              prompt: req.prompt,
              frames,
              aspectRatio: req.aspectRatio || "9:16",
            });
      return { url: result.videoUrl };
    }

    const pathSuffix = env("NEXA_VIDEO_API_PATH") || "/videos/generations";
    const res = await fetch(`${mediaBase()}${pathSuffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mediaKey()}`,
      },
      body: JSON.stringify({
        model: env("AI_MODEL_VIDEO") || "nexa-video",
        prompt: req.prompt,
        duration: req.durationSec ?? 5,
      }),
    });
    if (!res.ok) throw new Error(`video api ${res.status}`);
    const data = (await res.json()) as { url?: string; data?: { url?: string } };
    const url = data.url || data.data?.url;
    if (!url) throw new Error("video api empty");
    return { url };
  }
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法下载参考图 HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

export class DomesticMusicProvider implements MusicProvider {
  readonly id = "domestic_music";

  isConfigured(): boolean {
    return Boolean(
      mediaBase() && mediaKey() && env("NEXA_MUSIC_ENABLED") === "1"
    );
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConfigured()) return notConfiguredStatus("AI 音乐生成暂未接入");
    return { available: true, code: "PROVIDER_AVAILABLE" };
  }

  async generateMusic(
    req: MusicGenerationRequest
  ): Promise<MusicGenerationResult> {
    const pathSuffix = env("NEXA_MUSIC_API_PATH") || "/audio/generations";
    const res = await fetch(`${mediaBase()}${pathSuffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mediaKey()}`,
      },
      body: JSON.stringify({
        model: env("AI_MODEL_MUSIC") || "nexa-music",
        prompt: req.prompt,
        duration: req.durationSec ?? 30,
      }),
    });
    if (!res.ok) throw new Error(`music api ${res.status}`);
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("music api empty");
    return { url: data.url };
  }

  async analyzeMusic(_req: MusicAnalysisRequest): Promise<MusicAnalysisResult> {
    return { method: "ai_unavailable_use_local", bpm: null, beats: [] };
  }

  async detectBeats(req: MusicAnalysisRequest): Promise<MusicAnalysisResult> {
    return this.analyzeMusic(req);
  }

  async searchLicensedMusic() {
    return [];
  }
}

export class DomesticTTSProvider implements TTSProvider {
  readonly id = "domestic_tts";

  isConfigured(): boolean {
    return Boolean(mediaBase() && mediaKey() && env("NEXA_TTS_ENABLED") !== "0");
  }

  async getStatus(): Promise<ProviderStatus> {
    if (!this.isConfigured()) return notConfiguredStatus("语音合成暂未接入");
    return { available: true, code: "PROVIDER_AVAILABLE" };
  }

  async synthesize(req: TTSRequest): Promise<TTSResult> {
    const res = await fetch(`${mediaBase()}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mediaKey()}`,
      },
      body: JSON.stringify({
        model: env("AI_MODEL_TTS") || "nexa-tts",
        input: req.text,
        voice: req.voice || "alloy",
      }),
    });
    if (!res.ok) throw new Error(`tts api ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const file = `tts_${Date.now()}.mp3`;
    const saved = await writeBlob({
      namespace: "generated",
      filename: file,
      body: buf,
      contentType: "audio/mpeg",
    });
    return {
      storageKey: path.basename(saved.storageKey),
      url: saved.url,
    };
  }
}
