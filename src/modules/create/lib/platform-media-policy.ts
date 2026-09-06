/**
 * Product policy: NEVER download / cache platform original media
 * (Douyin / XHS / TikTok CDN play_addr, watermarked MP4, original audio).
 *
 * Online recreate uses:
 * - share-link metadata / structure only
 * - user-owned face / assets
 * - AI generation (Jimeng / image models)
 */

const PLATFORM_MEDIA_HOST =
  /(douyinvod|douyin\.com|iesdouyin|xhscdn|xiaohongshu|tiktokcdn|musical\.ly|byteicdn|snssdk)/i;

export const PLATFORM_MEDIA_DOWNLOAD_DISABLED = true;

export const PLATFORM_MEDIA_POLICY_NOTICE =
  "不下载、不缓存平台原片 / 原声。线上二创只解析链接结构，用你的形象与 AI 新生成成片。";

export function isPlatformMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return PLATFORM_MEDIA_HOST.test(host);
  } catch {
    return PLATFORM_MEDIA_HOST.test(url);
  }
}

/** Hard stop for any product code that tries to fetch platform originals. */
export function assertPlatformMediaDownloadForbidden(url: string): void {
  if (!PLATFORM_MEDIA_DOWNLOAD_DISABLED) return;
  if (isPlatformMediaUrl(url)) {
    throw new Error(
      "已关闭平台原片下载：请用链接结构 + 自有形象在线生成，或自行上传参考素材。"
    );
  }
}
