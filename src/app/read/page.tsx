"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { BackLink } from "@/components/ui/hierarchy";

interface ReadPayload {
  title?: string;
  text?: string;
  sourceUrl?: string;
  error?: string;
  message?: string;
  thin?: boolean;
  binary?: boolean;
  proxyConfigured?: boolean;
}

function ReadInner() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";
  const [data, setData] = useState<ReadPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) {
      setData({ error: "缺少链接" });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/read?url=${encodeURIComponent(url)}`)
      .then(async (res) => {
        const json = (await res.json()) as ReadPayload;
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({ error: "加载失败" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <BackLink href="/">← 返回首页</BackLink>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-zinc-700"
          >
            原链接
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-20 text-[14px] text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在整理 Nexa 可预览内容…
        </div>
      )}

      {!loading && data?.error && (
        <div className="rounded-xl border border-zinc-100 px-5 py-8">
          <p className="text-[16px] font-medium text-zinc-900">{data.error}</p>
          {data.proxyConfigured === false && (
            <p className="mt-3 text-[14px] leading-relaxed text-zinc-500">
              该来源未返回可公开读取的内容。Nexa 不承诺在国内直接播放或打开境外原站；
              可将已有标题、摘要、封面和已解析的资料放入工作区继续研究或创作。
            </p>
          )}
        </div>
      )}

      {!loading && !data?.error && data && (
        <article>
          <p className="mb-2 text-[12px] text-zinc-400">Nexa 来源预览</p>
          <h1 className="text-[26px] font-semibold leading-snug tracking-[-0.02em] text-zinc-900">
            {data.title || "未命名页面"}
          </h1>
          {data.sourceUrl && (
            <p className="mt-2 break-all text-[12px] text-zinc-400">
              {data.sourceUrl}
            </p>
          )}
          {(data.message || data.thin || data.binary) && (
            <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-500">
              {data.message}
            </p>
          )}
          {data.text ? (
            <div className="mt-8 whitespace-pre-wrap text-[15px] leading-[1.75] text-zinc-700">
              {data.text}
            </div>
          ) : null}
        </article>
      )}
    </div>
  );
}

export default function ReadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-[14px] text-zinc-400">
          正在加载…
        </div>
      }
    >
      <ReadInner />
    </Suspense>
  );
}
