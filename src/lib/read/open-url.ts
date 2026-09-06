/** Decide how to open a result URL without making foreign-site access promises. */

const DIRECT_HOST_SUFFIXES = [
  "baidu.com",
  "baidu.jp",
  "sogou.com",
  "so.com",
  "360.cn",
  "qihoo.com",
  "xiaohongshu.com",
  "xhslink.com",
  "douyin.com",
  "iesdouyin.com",
  "weibo.com",
  "sina.com.cn",
  "qq.com",
  "tencent.com",
  "zhihu.com",
  "bilibili.com",
  "b23.tv",
  "jd.com",
  "taobao.com",
  "tmall.com",
  "alibaba.com",
  "aliyun.com",
  "163.com",
  "126.com",
  "ifeng.com",
  "people.com.cn",
  "xinhuanet.com",
  "cctv.com",
  "thepaper.cn",
  "36kr.com",
  "jiemian.com",
  "cls.cn",
  "sspai.com",
  "juejin.cn",
  "csdn.net",
  "cnblogs.com",
  "oschina.net",
  "gitee.com",
  "toutiao.com",
  "bytedance.com",
  "mi.com",
  "huawei.com",
  "localhost",
  "127.0.0.1",
];

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function canOpenDirectly(url: string): boolean {
  const host = extractHostname(url);
  if (!host) return false;
  return DIRECT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Domestic sites open at their source. Foreign sources open through Nexa's
 * preview route, which shows only content Nexa can actually retrieve.
 */
export function getOpenHref(url: string): string {
  if (!url) return "#";
  if (canOpenDirectly(url)) return url;
  return `/read?url=${encodeURIComponent(url)}`;
}

export function isExternalOpenHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export function getOpenLabel(url: string): string {
  return canOpenDirectly(url) ? "打开原站" : "Nexa 预览";
}
