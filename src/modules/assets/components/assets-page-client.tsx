"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/hierarchy";
import type { AssetStatus, AssetType, OwnedAsset } from "@/modules/assets/types";
import { showToast } from "@/components/ui/overlay";
import { formatDateTimeZh } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<AssetStatus, string> = {
  uploaded: "已上传",
  processing: "处理中",
  ready: "可用",
  failed: "失败",
};

const TYPE_LABELS: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
};

const STATUS_FILTERS: { value: "all" | AssetStatus; label: string }[] = [
  { value: "all", label: "全部状态" },
  { value: "ready", label: "可用" },
  { value: "processing", label: "处理中" },
  { value: "uploaded", label: "已上传" },
  { value: "failed", label: "失败" },
];

const TYPE_FILTERS: { value: "all" | AssetType; label: string }[] = [
  { value: "all", label: "全部类型" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "document", label: "文档" },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetsPageClient() {
  const [assets, setAssets] = useState<OwnedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | AssetStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AssetType>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const sessionRes = await fetch("/api/auth/session");
      const session = await sessionRes.json();
      setAuthenticated(session.authenticated === true);

      const res = await fetch("/api/assets");
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets ?? []);
      } else {
        setAssets([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAssets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error ?? "上传失败", "error");
          continue;
        }
        setAssets((prev) => [data.asset, ...prev]);
        showToast(`「${file.name}」上传成功`);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/assets?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? "删除失败", "error");
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    showToast("素材已删除");
  };

  const handleRetry = async (id: string) => {
    const res = await fetch(`/api/assets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "重试失败", "error");
      return;
    }
    setAssets((prev) => prev.map((a) => (a.id === id ? data.asset : a)));
    showToast("已重新处理");
  };

  const filteredAssets = assets.filter((asset) => {
    if (statusFilter !== "all" && asset.status !== statusFilter) return false;
    if (typeFilter !== "all" && asset.assetType !== typeFilter) return false;
    return true;
  });

  if (authenticated === null && loading) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-[var(--nexa-page-pad-x)] py-10">
        <PageHeader
          title="素材库"
          description="统一管理图片、视频、音频与文档，供创作与发布使用。"
        />
        <p className="text-[14px] text-zinc-400">加载中…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="素材库"
        description="这些素材可直接用于创作、图片与发布。先上传，再带到任务里。"
        actions={
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "上传中…" : "上传素材"}
            </button>
            <Link
              href={`/create?mode=assets${
                assets.filter((a) => a.status === "ready").length
                  ? `&assetIds=${assets
                      .filter((a) => a.status === "ready")
                      .slice(0, 8)
                      .map((a) => a.id)
                      .join(",")}`
                  : ""
              }`}
              className="rounded-lg border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
            >
              去创作
            </Link>
            <Link
              href="/create/image"
              className="text-[13px] text-zinc-500 hover:text-zinc-800"
            >
              图片制作
            </Link>
          </div>
        }
      />
      <p className="mb-6 text-[12px] text-zinc-400">
        支持 JPG、PNG、WEBP、MP4、MOV、WEBM、MP3、WAV、M4A、PDF、DOCX、TXT
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.mp3,.wav,.m4a,.pdf,.docx,.txt,image/*,video/*,audio/*"
        onChange={(e) => void handleUpload(e.target.files)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleUpload(e.dataTransfer.files);
        }}
        className={cn(
          "mb-6 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
          dragOver
            ? "border-zinc-400 bg-zinc-50"
            : "border-zinc-200 hover:border-zinc-300"
        )}
      >
        <p className="text-[14px] text-zinc-500">拖拽文件到此处上传</p>
        <p className="mt-1 text-[12px] text-zinc-400">或点击右上角「上传素材」</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | AssetType)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-700"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | AssetStatus)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-700"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {(statusFilter !== "all" || typeFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setTypeFilter("all");
            }}
            className="text-[13px] text-zinc-500 hover:text-zinc-800"
          >
            清除筛选
          </button>
        )}
      </div>

      {loading && <p className="text-[14px] text-zinc-400">加载中…</p>}

      {!loading && assets.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-200 px-6 py-16 text-center">
          <p className="mb-2 text-[15px] text-zinc-500">还没有素材</p>
          <p className="text-[13px] text-zinc-400">上传图片、视频、音频或文档开始使用</p>
        </div>
      )}

      {!loading && assets.length > 0 && filteredAssets.length === 0 && (
        <div className="rounded-lg border border-zinc-100 px-6 py-12 text-center">
          <p className="text-[14px] text-zinc-500">没有符合筛选条件的素材</p>
        </div>
      )}

      <div className="space-y-2">
        {filteredAssets.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-4 rounded-lg border border-zinc-100 px-4 py-3 hover:border-zinc-200"
          >
            <AssetThumb asset={asset} />
            <div className="min-w-0 flex-1">
              <Link
                href={`/assets/${asset.id}`}
                className="block truncate text-[14px] font-medium text-zinc-900 hover:underline"
              >
                {asset.fileName}
              </Link>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                {TYPE_LABELS[asset.assetType]} · {formatSize(asset.sizeBytes)} ·{" "}
                {formatDateTimeZh(asset.createdAt)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                asset.status === "ready" && "bg-emerald-50 text-emerald-700",
                asset.status === "processing" && "bg-amber-50 text-amber-700",
                asset.status === "uploaded" && "bg-zinc-100 text-zinc-600",
                asset.status === "failed" && "bg-red-50 text-red-600"
              )}
            >
              {STATUS_LABELS[asset.status]}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {asset.status === "failed" && (
                <button
                  type="button"
                  onClick={() => void handleRetry(asset.id)}
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                  title="重试"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleDelete(asset.id)}
                className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetThumb({ asset }: { asset: OwnedAsset }) {
  if (asset.assetType === "image" && asset.url && asset.status === "ready") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt=""
        className="h-12 w-12 shrink-0 rounded object-cover bg-zinc-100"
      />
    );
  }

  if (asset.assetType === "video" && asset.url && asset.status === "ready") {
    return (
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-900">
        <video src={asset.proxyUrl ?? asset.url} className="h-full w-full object-cover" muted />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90">
          视频
        </span>
      </div>
    );
  }

  const label = TYPE_LABELS[asset.assetType]?.[0] ?? "?";
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-100 text-[13px] font-medium text-zinc-500">
      {label}
    </div>
  );
}
