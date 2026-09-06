/**
 * Optional connector for a remote video-understanding service.
 *
 * Nexa never downloads or persists a platform original. The configured service
 * receives an authorized public URL and returns compact shot metadata only.
 */

export type RemoteVideoShot = {
  startSec: number | null;
  endSec: number | null;
  description: string;
  camera?: string;
  motion?: string;
  style?: string;
};

export type RemoteVideoAnalysis = {
  status: "analyzed" | "not_configured" | "failed";
  shots: RemoteVideoShot[];
  summary?: string;
};

function asText(value: unknown, max = 220): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asTime(value: unknown): number | null {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? Math.round(time * 10) / 10 : null;
}

function normalizeShots(value: unknown): RemoteVideoShot[] {
  if (!Array.isArray(value)) return [];
  const shots: RemoteVideoShot[] = [];
  for (const raw of value.slice(0, 16)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const description = asText(
      item.description ?? item.summary ?? item.visualDescription
    );
    if (!description) continue;
    shots.push({
      startSec: asTime(item.startSec ?? item.start ?? item.timestamp),
      endSec: asTime(item.endSec ?? item.end),
      description,
      camera: asText(item.camera ?? item.composition, 120) || undefined,
      motion: asText(item.motion ?? item.movement, 120) || undefined,
      style: asText(item.style ?? item.editingStyle, 120) || undefined,
    });
  }
  return shots;
}

export async function analyzeRemoteVideoReference(input: {
  url: string;
  title?: string | null;
  thumbnail?: string | null;
}): Promise<RemoteVideoAnalysis> {
  const endpoint = process.env.VIDEO_REFERENCE_ANALYZER_URL?.trim();
  if (!endpoint) return { status: "not_configured", shots: [] };
  if (!/^https?:\/\//i.test(input.url)) {
    return { status: "failed", shots: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.VIDEO_REFERENCE_ANALYZER_API_KEY
          ? {
              Authorization: `Bearer ${process.env.VIDEO_REFERENCE_ANALYZER_API_KEY}`,
            }
          : {}),
      },
      body: JSON.stringify({
        videoUrl: input.url,
        title: input.title ?? undefined,
        thumbnailUrl: input.thumbnail ?? undefined,
        output: "shots",
      }),
    });
    if (!response.ok) return { status: "failed", shots: [] };
    const data = (await response.json()) as Record<string, unknown>;
    const shots = normalizeShots(data.shots ?? data.keyframes);
    if (!shots.length) return { status: "failed", shots: [] };
    return {
      status: "analyzed",
      shots,
      summary: asText(data.summary, 600) || undefined,
    };
  } catch {
    return { status: "failed", shots: [] };
  } finally {
    clearTimeout(timer);
  }
}
