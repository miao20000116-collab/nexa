"use client";

import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-copy";
import type {
  PlatformCapability,
  PublishPreview,
  PublishRecordView,
} from "@/modules/publish/types";
import {
  PLATFORM_LABELS,
  PUBLISH_STATUS_LABELS,
} from "@/modules/publish/types";

type Step = "idle" | "preview" | "done";

export function PublishPanel({
  projectId,
  defaultPlatform,
}: {
  projectId: string;
  defaultPlatform?: string | null;
}) {
  const [platforms, setPlatforms] = useState<PlatformCapability[]>([]);
  const [platform, setPlatform] = useState(defaultPlatform || "xiaohongshu");
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<PublishRecordView[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const [pRes, hRes] = await Promise.all([
          fetch("/api/publish/platforms"),
          fetch(
            `/api/publish/records?projectId=${encodeURIComponent(projectId)}`
          ),
        ]);
        if (cancelled) return;
        if (pRes.ok) {
          const data = await pRes.json();
          setPlatforms(data.platforms ?? []);
        }
        if (hRes.ok) {
          const data = await hRes.json();
          setHistory(data.records ?? []);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectId]);

  const runPreview = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/publish/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, platform }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "预览失败");
        return;
      }
      setPreview(data.preview);
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (!preview?.contentSnapshot) return;
    const text = Object.entries(preview.contentSnapshot)
      .filter(([, v]) => typeof v === "string" && String(v).trim())
      .map(([k, v]) => `【${k}】\n${String(v)}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(
        text || JSON.stringify(preview.contentSnapshot, null, 2)
      );
      setMessage("成稿已复制，可自行发布到目标平台");
      setStep("done");
    } catch {
      setMessage("复制失败，请手动选择正文复制");
    }
  };

  return (
    <section className="rounded-xl border border-zinc-100 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-zinc-400">
          {UI.create.publish}
        </p>
      </div>

      <p className="mb-3 text-[12px] leading-relaxed text-zinc-400">
        无需登录、无需连接平台。选择成稿适配目标后即可质量检查与预览，并复制成稿自行发布。
      </p>

      <label className="mb-2 block text-[12px] text-zinc-500">成稿适配目标</label>
      <select
        value={platform}
        onChange={(e) => {
          setPlatform(e.target.value);
          setStep("idle");
          setPreview(null);
        }}
        className="mb-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none"
      >
        {(platforms.length
          ? platforms
          : [
              {
                platform: "xiaohongshu",
                label: "小红书",
              } as PlatformCapability,
            ]
        ).map((p) => (
          <option key={p.platform} value={p.platform}>
            {p.label}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPreview()}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {busy ? "检查中…" : "质量检查与预览"}
        </button>
        {step === "preview" && preview && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void copyDraft()}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            复制成稿
          </button>
        )}
      </div>

      {preview && (step === "preview" || step === "done") && (
        <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
          <div>
            <p className="text-[12px] font-medium text-zinc-500">适配检查</p>
            <p className="mt-1 text-[13px] text-zinc-700">
              {preview.adaptation.summary}
            </p>
            {preview.adaptation.issues.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preview.adaptation.issues.map((issue, i) => (
                  <li
                    key={`${issue.field}-${i}`}
                    className={`text-[12px] ${
                      issue.severity === "error"
                        ? "text-red-600"
                        : "text-amber-700"
                    }`}
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[12px] font-medium text-zinc-500">质量检查</p>
            {preview.qa.blockedAi ? (
              <p className="mt-1 text-[12px] text-zinc-400">
                AI 辅助质检未接入；以下为规则检测结果。
              </p>
            ) : null}
            <p
              className={`mt-1 text-[14px] font-semibold ${
                preview.qa.passed || preview.qa.verdict === "PASS"
                  ? "text-emerald-700"
                  : "text-amber-700"
              }`}
            >
              {preview.qa.verdict === "PASS" || preview.qa.verdict === "通过"
                ? "PASS"
                : "NEEDS_REVISION"}
            </p>
            {preview.qa.checks && preview.qa.checks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preview.qa.checks.map((c) => (
                  <li
                    key={c.id}
                    className="flex justify-between gap-2 text-[12px] text-zinc-600"
                  >
                    <span>{c.label}</span>
                    <span
                      className={c.ok ? "text-emerald-700" : "text-amber-700"}
                    >
                      {c.ok ? "通过" : "需关注"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {preview.qa.details && preview.qa.details.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {preview.qa.details.map((issue) => (
                  <li
                    key={issue.id}
                    className="rounded-lg border border-zinc-100 px-2.5 py-2 text-[12px] text-zinc-700"
                  >
                    <p>
                      <span className="text-zinc-400">哪里：</span>
                      {issue.where}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-zinc-400">为什么：</span>
                      {issue.why}
                    </p>
                    <p className="mt-0.5">
                      <span className="text-zinc-400">怎么改：</span>
                      {issue.how}
                    </p>
                  </li>
                ))}
              </ul>
            ) : preview.qa.issues.length ? (
              <ul className="mt-2 space-y-1">
                {preview.qa.issues.map((issue) => (
                  <li key={issue} className="text-[12px] text-zinc-600">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-zinc-600">未发现明显问题</p>
            )}
            {preview.qa.suggestions.length > 0 && (
              <div className="mt-3">
                <p className="text-[12px] font-medium text-zinc-400">建议</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {preview.qa.suggestions.map((s) => (
                    <li key={s} className="text-[12px] text-zinc-600">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {preview.blockReason && (
            <p className="text-[12px] leading-relaxed text-zinc-500">
              {preview.blockReason}
            </p>
          )}
        </div>
      )}

      {message && <p className="mt-3 text-[13px] text-zinc-600">{message}</p>}

      {history.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-[12px] font-medium text-zinc-400">本项目记录</p>
          <ul className="space-y-2">
            {history.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="text-[12px] text-zinc-600"
              >
                {PLATFORM_LABELS[r.platform] ?? r.platform}
                {" · "}
                {PUBLISH_STATUS_LABELS[r.status] ?? r.status}
                {" · "}
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
