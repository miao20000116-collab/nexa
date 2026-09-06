/**
 * Try Douyin iteminfo / detail APIs when SSR no longer embeds videoInfoRes.
 */
const MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

const awemeId = process.argv[2] || "7475598819415706931";

async function tryUrl(label, url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": MOBILE,
        Referer: `https://www.iesdouyin.com/share/video/${awemeId}/`,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    console.log("\n===", label, res.status, "len", text.length);
    if (json) {
      const item =
        json?.item_list?.[0] ||
        json?.aweme_detail ||
        json?.aweme_list?.[0] ||
        json?.data?.aweme_detail ||
        null;
      console.log("keys", Object.keys(json).slice(0, 20));
      if (item) {
        console.log({
          desc: (item.desc || item.share_info?.share_title || "").slice(0, 80),
          author: item.author?.nickname,
          cover: Boolean(
            item.video?.cover?.url_list?.[0] || item.video?.origin_cover?.url_list?.[0]
          ),
          duration: item.video?.duration,
        });
      } else {
        console.log("sample", text.slice(0, 400));
      }
    } else {
      console.log("non-json", text.slice(0, 200));
    }
  } catch (e) {
    console.log(label, "ERR", e.message);
  }
}

await tryUrl(
  "ies iteminfo",
  `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${awemeId}`
);
await tryUrl(
  "ies detail",
  `https://www.iesdouyin.com/web/api/v2/aweme/detail/?aweme_id=${awemeId}`
);
await tryUrl(
  "douyin web detail",
  `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&device_platform=webapp&aid=6383`
);
await tryUrl(
  "m.douyin reflow",
  `https://www.douyin.com/share/video/${awemeId}`
);
