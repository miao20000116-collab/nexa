"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UI } from "@/lib/ui-copy";
import {
  ASPECT_RATIO_OPTIONS,
  MATERIAL_MODE_OPTIONS,
  VIDEO_STATUS_LABELS,
  type AspectRatio,
  type MaterialStrategyMode,
  type Storyboard,
  type VideoProjectState,
} from "@/modules/video/types";
import { emitAiJob } from "@/modules/ai-workbench/store";
import type { ReferenceStoryboardPackage } from "@/modules/create/services/reference-storyboard-package";
import { REFERENCE_STORYBOARD_KEY } from "@/modules/create/services/reference-storyboard-package";

interface VideoWorkbenchProps {
  projectId: string;
  goal?: string | null;
  /** True when recreating from Douyin/XHS/TikTok link — no platform original audio */
  fromSocialLink?: boolean;
  assetCount?: number;
  /** Project is linked to a workspace — show import affordance */
  hasWorkspace?: boolean;
  onAssetsChanged?: () => void;
}

function StepHeader({
  n,
  title,
  hint,
  done,
}: {
  n: number;
  title: string;
  hint?: string;
  done?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-100 pb-3">
      <span
        className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-[14px] font-semibold tabular-nums ${
          done
            ? "bg-zinc-900 text-white"
            : "bg-zinc-100 text-zinc-800"
        }`}
      >
        {String(n).padStart(2, "0")}
      </span>
      <p className="text-[17px] font-semibold tracking-tight text-zinc-900">
        {title}
      </p>
      {hint && (
        <p className="w-full text-[14px] text-zinc-500 sm:w-auto sm:ml-auto">
          {hint}
        </p>
      )}
    </div>
  );
}

export function VideoWorkbench({
  projectId,
  goal,
  fromSocialLink = false,
  assetCount = 0,
  hasWorkspace = false,
  onAssetsChanged,
}: VideoWorkbenchProps) {
  const [video, setVideo] = useState<VideoProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [targetDuration, setTargetDuration] = useState(30);
  const [mode, setMode] = useState<MaterialStrategyMode>("more_ai");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [refPackage, setRefPackage] = useState<ReferenceStoryboardPackage | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingWs, setImportingWs] = useState(false);
  const [localAssetCount, setLocalAssetCount] = useState(assetCount);
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [videoAiAvailable, setVideoAiAvailable] = useState<boolean | null>(
    null
  );
  const [musicAiAvailable, setMusicAiAvailable] = useState<boolean | null>(
    null
  );
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/video?projectId=${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      setVideo(data.video);
      if (data.video?.materialStrategy) setMode(data.video.materialStrategy);
      if (data.video?.storyboard) setStoryboard(data.video.storyboard);
      if (data.video?.timeline?.aspectRatio)
        setAspectRatio(data.video.timeline.aspectRatio);
      if (data.video?.coverage?.targetDurationSec)
        setTargetDuration(data.video.coverage.targetDurationSec);
      const rawPkg =
        data.project?.content?.[REFERENCE_STORYBOARD_KEY] ??
        data.referenceStoryboard;
      if (
        rawPkg &&
        typeof rawPkg === "object" &&
        Array.isArray(rawPkg.shotSlots) &&
        rawPkg.shotSlots.length
      ) {
        setRefPackage(rawPkg as ReferenceStoryboardPackage);
      } else {
        setRefPackage(null);
      }
      const linked = Array.isArray(data.project?.assets)
        ? data.project.assets.length
        : null;
      if (linked != null) {
        setLocalAssetCount(linked);
        if (linked !== assetCount) onAssetsChanged?.();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLocalAssetCount(assetCount);
  }, [assetCount]);

  const importFromWorkspace = async () => {
    setImportingWs(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_workspace_media" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "导入失败");
        return;
      }
      const count = Array.isArray(data.assets) ? data.assets.length : 0;
      setLocalAssetCount(count);
      const notes = data.importResult?.messages as string[] | undefined;
      setMessage(notes?.join(" ") || `已关联 ${count} 个素材`);
      onAssetsChanged?.();
      if (count > 0) {
        void postJson({
          action: "material_strategy",
          mode,
          targetDurationSec: targetDuration,
        });
      }
    } catch {
      setMessage("导入工作区素材失败，请稍后重试");
    } finally {
      setImportingWs(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    void fetch("/api/ai/capability")
      .then((r) => r.json())
      .then((d) => {
        setVideoAiAvailable(
          d.video === "available" || d.image === "available"
        );
        setMusicAiAvailable(
          d.capabilities?.generateMusic?.status === "available" || false
        );
        setTtsAvailable(
          d.tts === "available" ||
            d.capabilities?.tts?.status === "available" ||
            false
        );
      })
      .catch(() => {
        setVideoAiAvailable(false);
        setMusicAiAvailable(false);
        setTtsAvailable(false);
      });
  }, []);

  // Poll progress while AI fill / voice / render is running
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/video?projectId=${projectId}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.video) {
            setVideo(data.video);
            if (data.video.storyboard) setStoryboard(data.video.storyboard);
            if (data.video.jobMessage) setMessage(data.video.jobMessage);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 2500);
    return () => window.clearInterval(id);
  }, [busy, projectId]);

  const postJson = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    const action = String(body.action || "");
    const jobMeta =
      action === "plan_storyboard"
        ? {
            capabilityId: "plan_storyboard",
            capabilityLabel: "生成分镜",
            title: goal || "分镜草稿",
          }
        : action === "request_ai_fill" || action === "ai_fill"
          ? {
              capabilityId: "ai_fill",
              capabilityLabel: "AI 补镜头",
              title: goal || "补 AI 镜头",
            }
          : action === "synthesize_voice"
            ? {
                capabilityId: "synthesize_voice",
                capabilityLabel: "字幕配音",
                title: goal || "朗读字幕",
              }
            : action === "render"
              ? {
                  capabilityId: "render_video",
                  capabilityLabel: "导出成片",
                  title: goal || "导出 MP4",
                }
              : null;
    if (jobMeta) {
      emitAiJob({
        ...jobMeta,
        phase: "running",
        message: "正在执行…",
        pageKey: "create",
      });
    }
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...body }),
      });
      const data = await res.json();
      if (data.video) setVideo(data.video);
      if (data.video?.storyboard) setStoryboard(data.video.storyboard);
      setMessage(data.message ?? data.video?.jobMessage ?? null);
      if (jobMeta) {
        if (data.code === "confirm_required") {
          emitAiJob({
            ...jobMeta,
            phase: "confirm_required",
            message: data.message || "请确认 Credits 后继续",
            pageKey: "create",
          });
        } else if (
          !res.ok ||
          data.code === "ai_error" ||
          data.code === "ai_unavailable" ||
          data.video?.jobStatus === "failed"
        ) {
          emitAiJob({
            ...jobMeta,
            phase: "error",
            message: data.message || data.error || "执行失败",
            pageKey: "create",
          });
        } else {
          emitAiJob({
            ...jobMeta,
            phase: "done",
            message:
              data.message ||
              data.video?.jobMessage ||
              "已完成。可继续下一步。",
            pageKey: "create",
          });
        }
      }
      return data;
    } finally {
      setBusy(false);
    }
  };

  const runAiFill = async () => {
    if (storyboard) {
      await postJson({ action: "save_storyboard", storyboard });
    }
    await postJson({ action: "ai_fill", confirm: true, force: true });
  };

  const runSynthesizeVoice = async () => {
    if (storyboard) {
      await postJson({ action: "save_storyboard", storyboard });
    }
    if (!video?.timeline) {
      await postJson({ action: "build_timeline", aspectRatio });
    }
    await postJson({ action: "synthesize_voice", confirm: true });
  };

  const uploadMusic = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("file", file);
      const res = await fetch("/api/video", { method: "POST", body: form });
      const data = await res.json();
      if (data.video) setVideo(data.video);
      setMessage(
        data.warning ||
          (data.analysis?.bpm
            ? `音乐已上传 · 本地分析 BPM ≈ ${data.analysis.bpm}`
            : "音乐已上传")
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadAssets = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setMessage(null);
    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "上传失败");
        if (data.asset?.id) newIds.push(data.asset.id);
      }
      if (!newIds.length) return;

      // Merge with existing project assets
      const projectRes = await fetch(`/api/create/${projectId}`);
      const projectData = await projectRes.json();
      const existing: string[] = (projectData.assets ?? []).map(
        (a: { assetId: string }) => a.assetId
      );
      const merged = [...new Set([...existing, ...newIds])];
      const patch = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_assets", assetIds: merged }),
      });
      if (!patch.ok) {
        const err = await patch.json();
        throw new Error(err.error ?? "关联素材失败");
      }
      setMessage(`已上传并关联 ${newIds.length} 个素材`);
      setLocalAssetCount(merged.length);
      onAssetsChanged?.();
      void postJson({
        action: "material_strategy",
        mode,
        targetDurationSec: targetDuration,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <p className="text-[14px] text-zinc-400">{UI.common.loadingPage}</p>
    );
  }

  const duration =
    video?.timeline?.durationSec ??
    video?.coverage?.targetDurationSec ??
    targetDuration;
  const playhead = video?.playheadSec ?? 0;
  const scenes = [
    ...(video?.timeline?.videoTrack.scenes ?? []),
    ...(video?.timeline?.imageTrack.scenes ?? []),
  ].sort((a, b) => a.start - b.start);

  const hasAssets = localAssetCount > 0;
  const hasStoryboard = Boolean(storyboard?.shots?.length);
  const hasMusic = Boolean(video?.timeline?.musicTrack?.url);
  const hasVoice = Boolean(
    video?.timeline?.voiceTrack?.scenes?.some((s) => s.assetId)
  );
  const hasPreview = Boolean(video?.previewUrl);
  const hasTimeline = Boolean(video?.timeline);
  const filledShotCount =
    storyboard?.shots?.filter((s) => s.assetId).length ?? 0;
  const isGenerating = busy || video?.jobStatus === "generating";

  return (
    <section className="lg:grid lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      <aside className="mb-8 space-y-4 lg:sticky lg:top-[calc(var(--nexa-header-height)+1rem)] lg:mb-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] text-zinc-500">预览</p>
          <span className="text-[13px] text-zinc-500">
            {VIDEO_STATUS_LABELS[video?.jobStatus ?? "draft"]}
          </span>
        </div>
        {message && (
          <p className="text-[14px] text-zinc-600">{message}</p>
        )}
        {hasPreview ? (
          <div className="rounded-xl border border-zinc-200 bg-black/5 p-3">
            <p className="mb-2 text-[13px] font-medium text-zinc-500">
              成片预览
            </p>
            {video?.jobMessage && (
              <p className="mb-2 text-[14px] leading-relaxed text-zinc-600">
                {video.jobMessage}
              </p>
            )}
            <video
              key={video!.previewUrl!}
              controls
              playsInline
              className="w-full rounded-lg bg-black"
              src={video!.previewUrl!}
            />
          </div>
        ) : (
          <div className="flex aspect-[9/16] max-h-[min(70vh,640px)] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 text-center text-[14px] leading-relaxed text-zinc-400">
            {isGenerating ? (
              <>
                <span className="font-medium text-zinc-600">生成中，请耐心等待</span>
                <span className="text-[13px] text-zinc-500">
                  {video?.jobMessage || message || "正在生成画面 / 配音…"}
                </span>
              </>
            ) : filledShotCount > 0 ? (
              <>
                <span className="font-medium text-zinc-600">
                  已有 {filledShotCount} 镜画面
                </span>
                <span className="text-[13px]">
                  下一步：用字幕生成配音（可选）→ 生成画面并导出
                </span>
              </>
            ) : (
              <>
                <span>画面尚未生成</span>
                <span className="text-[13px]">
                  分镜写好后点「AI 补镜头」生成每镜画面，再导出成片
                </span>
              </>
            )}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-[13px] text-zinc-400 hover:text-zinc-700">
            能力状态
          </summary>
          <div className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            <p>
              成片合成：可用 · AI 出镜：
              {videoAiAvailable === null
                ? "检测中"
                : videoAiAvailable
                  ? "可用"
                  : "需配置"}
              {" · "}
              字幕配音：
              {ttsAvailable === null
                ? "检测中"
                : ttsAvailable
                  ? "可用"
                  : "需配置"}
              {" · "}
              AI 配乐：{musicAiAvailable ? "可用" : "需配置"}
            </p>
          </div>
        </details>
      </aside>

      <div className="min-w-0 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-zinc-500">
          素材 → 分镜 → AI 补镜头 → 字幕配音 → 导出
        </p>
      </div>
      <div>
        <StepHeader
          n={1}
          title="准备画面素材"
          done={hasAssets}
        />
        <div className="space-y-3 rounded-lg border border-zinc-100 p-4">
          <p className="text-[14px] text-zinc-600">
            已关联{" "}
            <span className="font-medium text-zinc-900">{localAssetCount}</span>{" "}
            个素材
            {hasWorkspace && localAssetCount === 0 && (
              <span className="ml-2 text-zinc-400">
                · 工作区资料尚未导入为可剪辑素材
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading || busy}
              onClick={() => assetInputRef.current?.click()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {uploading ? "上传中…" : "上传图片 / 视频"}
            </button>
            <input
              ref={assetInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => void uploadAssets(e.target.files)}
            />
            <Link
              href="/assets"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50"
            >
              从素材库选择
            </Link>
            {hasWorkspace && (
              <button
                type="button"
                disabled={busy || importingWs}
                onClick={() => void importFromWorkspace()}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
              >
                {importingWs ? "导入中…" : "从工作区导入素材"}
              </button>
            )}
            <button
              type="button"
              disabled={busy || !hasAssets}
              onClick={() =>
                void postJson({
                  action: "material_strategy",
                  mode,
                  targetDurationSec: targetDuration,
                })
              }
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
            >
              分析素材覆盖
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[13px] text-zinc-500">
              目标时长（秒）
              <input
                type="number"
                min={5}
                max={180}
                value={targetDuration}
                onChange={(e) => setTargetDuration(Number(e.target.value))}
                className="ml-2 w-20 rounded border border-zinc-200 px-2 py-1"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_RATIO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setAspectRatio(opt.value);
                    void postJson({
                      action: "set_aspect_ratio",
                      aspectRatio: opt.value,
                    });
                  }}
                  className={`rounded-md border px-2.5 py-1 text-[14px] ${
                    aspectRatio === opt.value
                      ? "border-zinc-900 text-zinc-900"
                      : "border-zinc-200 text-zinc-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {video?.coverage && (
            <p className="text-[13px] text-zinc-700">{video.coverage.summary}</p>
          )}
          <button
            type="button"
            onClick={() => setShowAdvancedMode((v) => !v)}
            className="text-[14px] text-zinc-400 hover:text-zinc-700"
          >
            {showAdvancedMode ? "收起策略选项" : "高级：素材策略模式"}
          </button>
          {showAdvancedMode && (
            <div className="grid gap-2 sm:grid-cols-3">
              {MATERIAL_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    mode === opt.value
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-100 hover:border-zinc-200"
                  }`}
                >
                  <p className="text-[13px] font-medium text-zinc-800">
                    {opt.label}
                  </p>
                  <p className="mt-1 text-[14px] text-zinc-400">
                    {opt.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step 2 — Storyboard */}
      <div>
        <StepHeader
          n={2}
          title="生成分镜"
          done={hasStoryboard}
        />
        <div className="space-y-3 rounded-lg border border-zinc-100 p-4">
          {refPackage && (
            <div className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
              {refPackage.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={refPackage.coverUrl}
                  alt=""
                  className="h-20 w-14 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-zinc-200 text-[11px] text-zinc-500">
                  无封面
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-800">
                  已从链接解析的分镜槽位 · {refPackage.platformLabel}
                </p>
                <p className="mt-0.5 truncate text-[14px] text-zinc-500">
                  {refPackage.title || refPackage.caption || refPackage.canonicalUrl}
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">
                  {refPackage.shotSlots.length} 镜：
                  {refPackage.shotSlots.map((s) => s.role).join(" → ")}
                  。下方「生成分镜草稿」会优先使用这些槽位（封面仅作视觉线索）。
                </p>
                {refPackage.coverVision && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">
                    封面识别：{refPackage.coverVision}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-[14px] leading-relaxed text-zinc-600">
            <span className="font-medium text-zinc-800">分镜逻辑：</span>
            {refPackage
              ? "先「生成分镜草稿」拆镜并编辑字幕；再点「AI 补镜头」真正生成每镜画面。"
              : "先「生成分镜草稿」写出画面/字幕；再点「AI 补镜头」按描述生成图片或视频画面。"}
            画面不会在写分镜时自动出现。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void postJson({
                  action: "plan_storyboard",
                  targetDurationSec: targetDuration,
                })
              }
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
            >
              生成分镜草稿
            </button>
            <button
              type="button"
              disabled={busy || !hasStoryboard}
              onClick={() => void runAiFill()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {busy && video?.jobStatus === "generating"
                ? "正在补镜头…"
                : "AI 补镜头"}
            </button>
          </div>
          {!hasAssets && (
            <p className="text-[14px] text-zinc-400">
              无自有素材时，AI 补镜头会按画面描述生成图片/视频；需已配置图片或视频 AI。
            </p>
          )}
          {storyboard ? (
            <div className="space-y-3">
              <textarea
                value={storyboard.script}
                onChange={(e) =>
                  setStoryboard({ ...storyboard, script: e.target.value })
                }
                rows={3}
                placeholder="口播 / 脚本总览"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
              />
              <div className="space-y-2">
                {storyboard.shots.map((shot, idx) => (
                  <div
                    key={shot.id}
                    className="space-y-2 rounded-lg border border-zinc-100 px-3 py-3"
                  >
                    <div className="flex gap-3">
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-100 bg-zinc-100">
                        {shot.assetId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/assets/file/${encodeURIComponent(shot.assetId)}`}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-zinc-400">
                            待生成
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-400">
                          <span>镜头 {shot.order}</span>
                          <span>{shot.sourceType}</span>
                          {shot.notes && (
                            <span className="text-emerald-700">{shot.notes}</span>
                          )}
                          <label className="inline-flex items-center gap-1">
                            <span>时长</span>
                            <input
                              type="number"
                              min={0.5}
                              step={0.5}
                              value={shot.durationSec}
                              onChange={(e) => {
                                const shots = [...storyboard.shots];
                                shots[idx] = {
                                  ...shot,
                                  durationSec: Number(e.target.value),
                                };
                                setStoryboard({ ...storyboard, shots });
                              }}
                              className="w-16 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-zinc-700"
                            />
                          </label>
                        </div>
                        <label className="mt-2 block text-[13px] tracking-wide text-zinc-500">
                          画面描述
                          <input
                            value={shot.description}
                            onChange={(e) => {
                              const shots = [...storyboard.shots];
                              shots[idx] = {
                                ...shot,
                                description: e.target.value,
                              };
                              setStoryboard({ ...storyboard, shots });
                            }}
                            className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-800 outline-none focus:border-zinc-300 focus:bg-white"
                          />
                        </label>
                      </div>
                    </div>
                    <label className="block text-[13px] tracking-wide text-zinc-500">
                      字幕（配音会朗读这段）
                      <input
                        value={shot.subtitle ?? ""}
                        onChange={(e) => {
                          const shots = [...storyboard.shots];
                          shots[idx] = { ...shot, subtitle: e.target.value };
                          setStoryboard({ ...storyboard, shots });
                        }}
                        className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[14px] text-zinc-700 outline-none focus:border-zinc-300 focus:bg-white"
                      />
                    </label>
                    <label className="block text-[13px] tracking-wide text-zinc-500">
                      旁白（无字幕时用作配音）
                      <input
                        value={shot.narration ?? ""}
                        onChange={(e) => {
                          const shots = [...storyboard.shots];
                          shots[idx] = { ...shot, narration: e.target.value };
                          setStoryboard({ ...storyboard, shots });
                        }}
                        className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[14px] text-zinc-700 outline-none focus:border-zinc-300 focus:bg-white"
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void postJson({ action: "save_storyboard", storyboard })
                  }
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
                >
                  保存分镜
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAiFill()}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
                >
                  AI 补镜头
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-zinc-400">
              建议先完成第 1 步素材，再点「生成分镜草稿」。
            </p>
          )}
        </div>
      </div>

      {/* Step 3 — Voice + Music */}
      <div>
        <StepHeader
          n={3}
          title="配音与配乐"
          done={hasVoice || hasMusic}
        />
        <div className="space-y-3 rounded-lg border border-zinc-100 p-4">
          <p className="text-[14px] leading-relaxed text-zinc-600">
            配音会<strong>直接朗读每镜字幕</strong>
            （无字幕则用旁白）。生成后导出成片时混入人声。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !hasStoryboard}
              onClick={() => void runSynthesizeVoice()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {hasVoice ? "重新生成字幕配音" : "用字幕生成配音"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
            >
              上传 BGM
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.wav,.mp3,.m4a"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMusic(f);
              }}
            />
          </div>
          {hasVoice && (
            <p className="text-[13px] text-emerald-700">
              已生成{" "}
              {video?.timeline?.voiceTrack?.scenes?.filter((s) => s.assetId)
                .length ?? 0}{" "}
              段字幕配音
            </p>
          )}
          {ttsAvailable === false && (
            <p className="text-[13px] text-amber-700">
              TTS 暂未接入时无法朗读字幕；仍可烧录字幕画面，或上传 BGM。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || musicAiAvailable === false}
              title={
                musicAiAvailable === false
                  ? "NEXA_MUSIC_ENABLED 未开启"
                  : undefined
              }
              onClick={() => void postJson({ action: "generate_music" })}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
            >
              AI 生成音乐
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postJson({ action: "search_licensed_music" })}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
            >
              合法曲库
            </button>
          </div>
          {video?.timeline?.musicTrack?.title && (
            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700">
              <p>{video.timeline.musicTrack.title}</p>
              <p className="mt-1 text-[14px] text-zinc-400">
                来源：{video.timeline.musicTrack.sourceKind}
                {video.timeline.musicTrack.bpm
                  ? ` · BPM ${video.timeline.musicTrack.bpm}`
                  : ""}
              </p>
              {video.timeline.musicTrack.url && (
                <audio
                  ref={audioRef}
                  controls
                  className="mt-2 w-full"
                  src={video.timeline.musicTrack.url}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 4 — Assemble & export */}
      <div>
        <StepHeader
          n={4}
          title="导出成片"
          done={hasPreview}
        />
        <div className="space-y-3 rounded-lg border border-zinc-100 p-4">
          <button
            type="button"
            disabled={busy || !storyboard}
            onClick={() =>
              void postJson({ action: "build_timeline", aspectRatio })
            }
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] hover:bg-zinc-50 disabled:opacity-40"
          >
            根据分镜生成时间线
          </button>

          {hasTimeline && (
            <div>
              <div className="mb-2 flex items-center justify-between text-[14px] text-zinc-400">
                <span>时间轴</span>
                <span>
                  {playhead.toFixed(1)}s / {duration.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={playhead}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVideo((prev) =>
                    prev ? { ...prev, playheadSec: v } : prev
                  );
                }}
                onMouseUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  void postJson({ action: "playhead", playheadSec: v });
                }}
                className="w-full"
              />
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-[13px]"
                  >
                    <div>
                      <span className="text-zinc-800">
                        {scene.sourceType}
                      </span>
                      <span className="ml-2 text-zinc-400">
                        {scene.start.toFixed(1)}–{scene.end.toFixed(1)}s
                      </span>
                      {scene.text && (
                        <p className="text-[14px] text-zinc-500">{scene.text}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void postJson({
                            action: "regenerate_scene",
                            sceneId: scene.id,
                          })
                        }
                        className="text-[14px] text-zinc-500 hover:text-zinc-800"
                      >
                        重做镜头
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void postJson({
                            action: "delete_scene",
                            sceneId: scene.id,
                          })
                        }
                        className="text-[14px] text-zinc-400 hover:text-zinc-700"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {video?.costEstimate && (
            <p className="text-[13px] text-zinc-600">
              {video.costEstimate.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
            <button
              type="button"
              disabled={busy || !hasStoryboard}
              onClick={() => void runAiFill()}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[14px] hover:bg-zinc-50 disabled:opacity-40"
            >
              AI 补镜头
            </button>
            <button
              type="button"
              disabled={busy || !hasStoryboard}
              onClick={() =>
                void (async () => {
                  if (!video?.timeline) {
                    await postJson({
                      action: "build_timeline",
                      aspectRatio,
                    });
                  }
                  await postJson({
                    action: "render",
                    confirm: true,
                    allowWithoutMusic: true,
                  });
                })()
              }
              className="rounded-lg bg-zinc-900 px-4 py-2 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              生成画面并导出
            </button>
          </div>
          <p className="text-[13px] text-zinc-500">
            「AI 补镜头」现在生成每镜画面；「导出」会合成字幕/配音/BGM 成片。建议先补镜头再导出。
          </p>
        </div>
      </div>
      </div>
    </section>
  );
}
