import type { PublishPlatform, PlatformCapability } from "./types";

function envFlag(...keys: string[]) {
  return keys.some((k) => Boolean(process.env[k]?.trim()));
}

/**
 * Platform capabilities drive UI buttons.
 * oauthConfigured / publishApiAvailable reflect Nexa backend config — never user-entered keys.
 */
export function getPlatformCapability(
  platform: PublishPlatform
): PlatformCapability {
  switch (platform) {
    case "x":
      return {
        platform: "x",
        label: "X",
        canPublishText: true,
        canPublishImage: true,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: false,
        oauthConfigured: envFlag("NEXA_X_CLIENT_ID", "X_CLIENT_ID"),
        publishApiAvailable: envFlag("NEXA_X_CLIENT_ID", "X_CLIENT_ID"),
      };
    case "tiktok":
      return {
        platform: "tiktok",
        label: "TikTok",
        canPublishText: false,
        canPublishImage: false,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: true,
        oauthConfigured: envFlag("NEXA_TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_KEY"),
        publishApiAvailable: envFlag(
          "NEXA_TIKTOK_CLIENT_KEY",
          "TIKTOK_CLIENT_KEY"
        ),
      };
    case "instagram":
      return {
        platform: "instagram",
        label: "Instagram",
        canPublishText: true,
        canPublishImage: true,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: false,
        oauthConfigured: envFlag(
          "NEXA_INSTAGRAM_CLIENT_ID",
          "INSTAGRAM_CLIENT_ID",
          "NEXA_META_APP_ID"
        ),
        publishApiAvailable: envFlag(
          "NEXA_INSTAGRAM_CLIENT_ID",
          "INSTAGRAM_CLIENT_ID",
          "NEXA_META_APP_ID"
        ),
      };
    case "youtube":
      return {
        platform: "youtube",
        label: "YouTube",
        canPublishText: false,
        canPublishImage: false,
        canPublishVideo: true,
        supportsSchedule: true,
        supportsDraft: true,
        oauthConfigured: envFlag(
          "NEXA_YOUTUBE_CLIENT_ID",
          "GOOGLE_CLIENT_ID",
          "YOUTUBE_CLIENT_ID"
        ),
        publishApiAvailable: envFlag(
          "NEXA_YOUTUBE_CLIENT_ID",
          "GOOGLE_CLIENT_ID",
          "YOUTUBE_CLIENT_ID"
        ),
      };
    case "xiaohongshu":
      return {
        platform: "xiaohongshu",
        label: "小红书",
        canPublishText: true,
        canPublishImage: true,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: true,
        oauthConfigured: false,
        publishApiAvailable: false,
      };
    case "linkedin":
      return {
        platform: "linkedin",
        label: "LinkedIn",
        canPublishText: true,
        canPublishImage: true,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: false,
        oauthConfigured: envFlag("NEXA_LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_ID"),
        publishApiAvailable: envFlag(
          "NEXA_LINKEDIN_CLIENT_ID",
          "LINKEDIN_CLIENT_ID"
        ),
      };
    case "douyin":
      return {
        platform: "douyin",
        label: "抖音",
        canPublishText: false,
        canPublishImage: false,
        canPublishVideo: true,
        supportsSchedule: false,
        supportsDraft: true,
        oauthConfigured: false,
        publishApiAvailable: false,
      };
  }
}

export function listPlatformCapabilities(): PlatformCapability[] {
  return (
    [
      "x",
      "tiktok",
      "instagram",
      "youtube",
      "xiaohongshu",
      "linkedin",
      "douyin",
    ] as PublishPlatform[]
  ).map(getPlatformCapability);
}
