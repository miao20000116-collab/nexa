"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BackLink, PageHeader } from "@/components/ui/hierarchy";
import { action, type as typeStyle } from "@/lib/ui-hierarchy";
import { UI } from "@/lib/ui-copy";
import { IMAGE_PURPOSE_OPTIONS } from "@/modules/image/constants";
import { CreditsConfirmPanel } from "@/modules/account/components/credits-confirm";
import type {
  ImageGenerationJobView,
  ImagePurpose,
} from "@/modules/image/types";

interface RefAsset {
  id: string;
  fileName: string;
  url: string | null;
  proxyUrl?: string | null;
  subject: string | null;
  scene: string | null;
  visualTags: string[];
}

export function ImageStudio() {
  const [purpose, setPurpose] = useState<ImagePurpose>("product_scene");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<RefAsset[]>([]);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [estimateLabel, setEstimateLabel] = useState("预计消耗将在接入后显示");
  const [available, setAvailable] = useState(false);
  const [history, setHistory] = useState<ImageGenerationJobView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ImageGenerationJobView | null>(
    null
  );
  const [confirmState, setConfirmState] = useState<{
    message: string;
    estimatedCredits: number | null;
    jobId?: string;
  } | null>(null);

  const reload = useCallback(async () => {
    const [metaRes, histRes, refRes] = await Promise.all([
      fetch("/api/image"),
      fetch("/api/image?view=history"),
      fetch("/api/image?view=references"),
    ]);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      setAvailable(Boolean(meta.available));
      if (meta.estimate?.message) setEstimateLabel(meta.estimate.message);
      if (meta.message && !meta.available) setMessage(meta.message);
    }
    if (histRes.ok) {
      const data = await histRes.json();
      setHistory(data.history ?? []);
    }
    if (refRes.ok) {
      const data = await refRes.json();
      const assets = (data.assets ?? []) as RefAsset[];
      setRefs(assets);
      setSelectedRef((prev) => prev ?? assets[0]?.id ?? null);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(t);
  }, [reload]);

  const runGenerate = async (confirm = false, jobId?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          prompt,
          referenceAssetIds: selectedRef ? [selectedRef] : [],
          confirm,
          jobId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "confirm_required") {
          setConfirmState({
            message: data.estimate?.message ?? data.message,
            estimatedCredits: data.estimate?.estimatedCredits ?? null,
            jobId: data.jobId,
          });
          return;
        }
        if (data.code === "login_required") {
          setMessage(data.message);
          return;
        }
        setMessage(data.message ?? UI.common.aiUnavailable);
        if (data.job) setLastResult(data.job);
        await reload();
        return;
      }
      setConfirmState(null);
      setLastResult(data.job);
      setMessage(
        data.job.creditsCharged != null
          ? `已生成并入库。实际扣除 ${data.job.creditsCharged} Credits`
          : "已生成并入库素材库"
      );
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const thumbUrl = (a: RefAsset) => a.proxyUrl || a.url || undefined;

  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
      <PageHeader
        title="为任务制作图片"
        description="先选用途与参考素材，再描述需求。Prompt 是辅助，不是主角。"
        eyebrow={
          <BackLink href="/create">← 返回创作列表</BackLink>
        }
        actions={
          <Link href="/assets" className={action.tertiary}>
            {UI.create.myAssets}
          </Link>
        }
      />

      {lastResult?.status === "completed" && (
        <section className="mb-8 border-b border-zinc-100 pb-6">
          <p className={typeStyle.insightLabel}>本次结果</p>
          <p className={`mt-1 ${typeStyle.focusTitle}`}>图片已生成并入库</p>
          <p className={`mt-2 ${typeStyle.bodyMuted}`}>
            可在素材库选用，或继续调整用途后再次生成。
          </p>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section>
            <p className={typeStyle.sectionLabel}>用途</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {IMAGE_PURPOSE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPurpose(opt.id)}
                  className={`rounded-lg px-3 py-2 text-left text-[13px] ${
                    purpose === opt.id
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 text-zinc-700 hover:border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className={`mt-2 ${typeStyle.meta}`}>
              {IMAGE_PURPOSE_OPTIONS.find((o) => o.id === purpose)?.hint}
            </p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-zinc-400">
                参考素材（优先已有）
              </p>
              <Link
                href="/assets"
                className="text-[12px] text-zinc-500 underline-offset-2 hover:underline"
              >
                去上传
              </Link>
            </div>
            {refs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-[13px] text-zinc-400">
                还没有可用图片素材。可先上传商品图 / 人物图 / 场景图 / Logo，再回来生成。
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setSelectedRef(null)}
                  className={`rounded-lg border px-2 py-6 text-[12px] ${
                    !selectedRef
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 text-zinc-500"
                  }`}
                >
                  不使用参考
                </button>
                {refs.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedRef(a.id)}
                    className={`overflow-hidden rounded-lg border text-left ${
                      selectedRef === a.id
                        ? "border-zinc-900 ring-1 ring-zinc-900"
                        : "border-zinc-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(a)}
                      alt={a.fileName}
                      className="aspect-square w-full object-cover bg-zinc-100"
                    />
                    <p className="truncate px-1.5 py-1 text-[11px] text-zinc-500">
                      {a.fileName}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="mb-2 text-[12px] font-medium text-zinc-400">
              自然语言需求
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="例如：把这个便携榨汁杯放在纽约公园野餐场景。"
              className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-[14px] outline-none focus:border-zinc-300"
            />
          </section>

          <div className="space-y-3">
            {confirmState ? (
              <CreditsConfirmPanel
                message={confirmState.message}
                estimatedCredits={confirmState.estimatedCredits}
                busy={busy}
                onConfirm={() =>
                  void runGenerate(true, confirmState.jobId)
                }
                onCancel={() => setConfirmState(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !prompt.trim()}
                  onClick={() => void runGenerate()}
                  className="rounded-lg bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  {busy ? "生成中…" : "生成图片"}
                </button>
                <p className="text-[13px] text-zinc-500">{estimateLabel}</p>
                {!available && (
                  <p className="text-[13px] text-amber-700">
                    {UI.common.aiUnavailable}
                  </p>
                )}
              </div>
            )}
          </div>

          {message && (
            <p className="text-[14px] text-zinc-600">{message}</p>
          )}

          {lastResult?.resultUrl && lastResult.status === "completed" && (
            <section className="rounded-xl border border-zinc-100 p-4">
              <p className="mb-3 text-[12px] font-medium text-zinc-400">
                本次结果
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lastResult.resultUrl}
                alt="生成结果"
                className="max-h-[420px] w-full rounded-lg object-contain bg-zinc-50"
              />
              {lastResult.resultAssetId && (
                <Link
                  href={`/assets/${lastResult.resultAssetId}`}
                  className="mt-3 inline-block text-[13px] text-zinc-700 underline underline-offset-2"
                >
                  在素材库查看
                </Link>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <p className="text-[12px] font-medium text-zinc-400">生成历史</p>
          {history.length === 0 ? (
            <p className="text-[13px] text-zinc-400">暂无记录</p>
          ) : (
            <ul className="space-y-3">
              {history.map((job) => (
                <li
                  key={job.id}
                  className="rounded-xl border border-zinc-100 px-3 py-3"
                >
                  <p className="line-clamp-2 text-[13px] text-zinc-800">
                    {job.prompt}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {job.status}
                    {job.creditsCharged != null
                      ? ` · 扣除 ${job.creditsCharged}`
                      : job.creditsEstimated != null
                        ? ` · 预计 ${job.creditsEstimated}`
                        : ""}
                    {" · "}
                    {new Date(job.createdAt).toLocaleString("zh-CN")}
                  </p>
                  {job.resultUrl && job.status === "completed" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={job.resultUrl}
                      alt=""
                      className="mt-2 aspect-video w-full rounded-md object-cover bg-zinc-50"
                    />
                  )}
                  {job.errorMessage && (
                    <p className="mt-1 text-[12px] text-red-600">
                      {job.errorMessage}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
