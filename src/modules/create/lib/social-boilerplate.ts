/**
 * Detect Douyin / XHS / TikTok share OG boilerplate titles & captions.
 * Kept in a tiny leaf module so client bundles never get an undefined binding
 * from circular HMR init of recreate-copyright.ts.
 */

export function isSocialShareBoilerplate(
  text: string | null | undefined
): boolean {
  if (!text?.trim()) return true;
  const t = text.trim();
  // Structured ingest snippets are not boilerplate even if they quote OG somewhere
  if (
    t.length > 80 &&
    /真实链接|作品 ID|开场钩子|话题方向|分享口令|结构线索/.test(t)
  ) {
    return false;
  }
  return (
    /发布在抖音/.test(t) ||
    /来抖音[，,]?\s*记录美好生活/.test(t) ||
    /已经收获了\d+个喜欢/.test(t) ||
    /于\d{6,8}发布/.test(t) ||
    /^抖音$|^Douyin$/i.test(t) ||
    /在小红书，分享照片和视频/.test(t) ||
    /和最会生活的人做朋友/.test(t) ||
    /^小红书$|^RED$|^Xiaohongshu$/i.test(t) ||
    /^TikTok$/i.test(t) ||
    /Make Your Day/i.test(t)
  );
}
