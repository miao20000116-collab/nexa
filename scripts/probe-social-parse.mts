import { parseSocialReference } from "../src/modules/create/services/social-meta-parser";
import type { SocialRecreatePlatform } from "../src/lib/social-link";

const cases: Array<{ label: string; platform: SocialRecreatePlatform; url: string }> = [
  {
    label: "douyin_long",
    platform: "douyin",
    url: "https://www.iesdouyin.com/share/video/7673183599574666530/",
  },
  {
    label: "douyin_short",
    platform: "douyin",
    url: "https://v.douyin.com/JXmDmiKtuW0/",
  },
  {
    label: "xhs",
    platform: "xiaohongshu",
    url: "https://www.xiaohongshu.com/explore/64f1c2e0000000001e00c8a1",
  },
  {
    label: "tiktok",
    platform: "tiktok",
    url: "https://www.tiktok.com/@scout2015/video/6718339392118795461",
  },
];

for (const c of cases) {
  try {
    const m = await parseSocialReference(c.platform, c.url);
    console.log(
      JSON.stringify({
        label: c.label,
        status: m.parseStatus,
        method: m.parseMethod,
        title: (m.title || "").slice(0, 80),
        author: m.author,
        cover: Boolean(m.coverUrl),
        awemeId: m.awemeId,
        topics: m.topics.slice(0, 4),
        note: (m.parseNote || "").slice(0, 160),
      })
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        label: c.label,
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }
}
