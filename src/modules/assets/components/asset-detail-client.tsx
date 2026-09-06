"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { BackLink } from "@/components/ui/hierarchy";
import type { OwnedAsset } from "@/modules/assets/types";
import { showToast } from "@/components/ui/overlay";
import { formatDateTimeZh } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  uploaded: "已上传",
  processing: "处理中",
  ready: "可用",
  failed: "失败",
};

const TYPE_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetDetailClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<OwnedAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assets/${assetId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "加载失败");
        }
        return res.json();
      })
      .then((data) => setAsset(data.asset))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assetId]);

  const handleDelete = async () => {
    const res = await fetch(`/api/assets?id=${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? "删除失败", "error");
      return;
    }
    showToast("素材已删除");
    router.push("/assets");
  };

  const handleRetry = async () => {
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "重试失败", "error");
      return;
    }
    setAsset(data.asset);
    showToast("已重新处理");
  };

  if (loading) {
    return <p className="px-5 py-10 text-[14px] text-zinc-400">加载中…</p>;
  }

  if (error || !asset) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="mb-4 text-[15px] text-zinc-500">{error ?? "素材不存在"}</p>
        <Link href="/assets" className="text-[14px] text-zinc-900 underline">
          返回素材库
        </Link>
      </div>
    );
  }

  const meta = asset.metadata;
  const aiPending = meta?.ai_analysis_status === "pending";
  const aiUnavailable = meta?.ai_analysis_status === "unavailable";

  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <BackLink href="/assets" className="mb-6">
        ← 返回素材库
      </BackLink>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">
            {asset.fileName}
          </h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            {TYPE_LABELS[asset.assetType]} · {formatSize(asset.sizeBytes)} ·{" "}
            {formatDateTimeZh(asset.createdAt)} · {STATUS_LABELS[asset.status]}
          </p>
        </div>
      </div>

      {asset.errorMessage && (
        <p className="mb-4 text-[13px] text-red-600">{asset.errorMessage}</p>
      )}

      <div className="mb-6 flex flex-wrap gap-3">
        {asset.status === "failed" && (
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800"
          >
            <RefreshCw className="h-4 w-4" />
            重试处理
          </button>
        )}
        <Link
          href={`/create?mode=assets&assetIds=${encodeURIComponent(assetId)}&goal=${encodeURIComponent(`基于素材 ${asset.fileName} 创作内容`)}`}
          className={cn(
            "inline-flex items-center rounded-lg px-4 py-2.5 text-[13px] font-medium",
            asset.status === "failed"
              ? "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              : "bg-zinc-900 text-white hover:bg-zinc-800"
          )}
        >
          用于创作
        </Link>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="inline-flex items-center gap-2 text-[13px] text-zinc-500 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
          删除
        </button>
      </div>

      <div className="mb-8">
        <AssetPreview asset={asset} />
      </div>

      {(meta?.ai_analysis_status === "ready" || aiPending || aiUnavailable) && (
        <section className="mb-6 border-b border-zinc-100 pb-6">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-zinc-400">
            AI 分析
          </p>
          {aiUnavailable && (
            <p className="text-[13px] text-zinc-500">AI 素材分析暂未接入</p>
          )}
          {aiPending && <p className="text-[13px] text-zinc-500">待分析</p>}
          {meta?.ai_analysis_status === "ready" && (
            <dl className="grid gap-2 text-[13px]">
              {meta.subject && (
                <div>
                  <dt className="text-zinc-400">主体</dt>
                  <dd className="text-zinc-800">{meta.subject}</dd>
                </div>
              )}
              {meta.visual_tags && meta.visual_tags.length > 0 && (
                <div>
                  <dt className="text-zinc-400">标签</dt>
                  <dd className="text-zinc-800">{meta.visual_tags.join("、")}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
      )}

      <details>
        <summary className="cursor-pointer text-[13px] text-zinc-500 hover:text-zinc-800">
          基础信息
        </summary>
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-zinc-400">类型</dt>
            <dd className="text-zinc-800">{asset.mimeType}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">大小</dt>
            <dd className="text-zinc-800">{formatSize(asset.sizeBytes)}</dd>
          </div>
          {meta?.width && meta?.height && (
            <div>
              <dt className="text-zinc-400">尺寸</dt>
              <dd className="text-zinc-800">
                {meta.width} × {meta.height}
                {meta.orientation ? ` (${meta.orientation})` : ""}
              </dd>
            </div>
          )}
          {meta?.proxy_storage_key && (
            <div>
              <dt className="text-zinc-400">代理视频</dt>
              <dd className="text-zinc-800">已生成</dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}

function AssetPreview({ asset }: { asset: OwnedAsset }) {
  if (asset.status !== "ready" || !asset.url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-zinc-100 text-[14px] text-zinc-400">
        {asset.status === "processing" ? "处理中…" : "预览不可用"}
      </div>
    );
  }

  if (asset.assetType === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt={asset.fileName}
        className="max-h-[480px] w-full rounded-lg object-contain bg-zinc-50"
      />
    );
  }

  if (asset.assetType === "video") {
    return (
      <video
        src={asset.proxyUrl ?? asset.url}
        controls
        className="w-full rounded-lg bg-black"
      />
    );
  }

  if (asset.assetType === "audio") {
    return (
      <div className="rounded-lg border border-zinc-100 p-6">
        <audio src={asset.url} controls className="w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-100 p-6 text-center">
      <p className="text-[14px] text-zinc-500">文档预览</p>
      <a
        href={asset.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-[13px] text-zinc-900 underline"
      >
        打开文件
      </a>
    </div>
  );
}
