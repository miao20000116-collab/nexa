import type { SearchResult, VideoSearchOptions } from "../types";
import type { VideoSearchProvider } from "./interfaces";

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  error?: { message: string };
}

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_TIMEOUT = 8000;

export class YouTubeProvider implements VideoSearchProvider {
  private apiKey: string;
  private timeout: number;

  constructor(apiKey?: string, timeout = DEFAULT_TIMEOUT) {
    this.apiKey = apiKey || process.env.YOUTUBE_API_KEY || "";
    this.timeout = timeout;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(options: VideoSearchOptions): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error("YOUTUBE_API_KEY is not configured");
    }

    const params = new URLSearchParams({
      part: "snippet",
      q: options.query,
      type: "video",
      maxResults: String(options.maxResults ?? 10),
      key: this.apiKey,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${YOUTUBE_API}?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as YouTubeSearchResponse).error?.message ||
            `YouTube API returned ${response.status}`
        );
      }

      const data: YouTubeSearchResponse = await response.json();

      return (data.items ?? []).map((item) => ({
        id: `yt_${item.id.videoId}`,
        type: "video",
        platform: "youtube" as const,
        sourceType: "video" as const,
        title: item.snippet.title,
        snippet: item.snippet.description,
        author: item.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
        retrievalMethod: "youtube_api",
        rawSource: item,
      }));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createYouTubeProvider(): YouTubeProvider {
  return new YouTubeProvider();
}
