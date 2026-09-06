"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/hierarchy";
import { ReturnBackLink } from "@/components/navigation/return-back-link";
import { withPreservedReturnNav } from "@/modules/commerce/lib/return-nav";
import { UI } from "@/lib/ui-copy";
import { type as typeStyle, action } from "@/lib/ui-hierarchy";
import { detectSocialLink } from "@/lib/social-link";
import { getProxiedImageUrl } from "@/lib/utils";
import {
  PLATFORM_OPTIONS,
  STATUS_LABELS,
  contentTypeOptionsForPlatform,
  defaultContentTypeForPlatform,
  isContentTypeAllowedOnPlatform,
} from "@/modules/create/constants";
import {
  buildCopyrightSafeBrief,
  pickRecreateDisplayTitle,
  type RecreateOutputKind,
} from "@/modules/create/lib/recreate-copyright";
import { isSocialShareBoilerplate } from "@/modules/create/lib/social-boilerplate";
import type { SocialIngestResult } from "@/modules/create/services/social-recreate";
import type {
  ContentType,
  CreationPlatform,
  CreationStartMode,
} from "@/modules/create/types";
import {
  classifyCreationIntent,
  CREATION_INTENT_LABELS,
} from "@/modules/intent/creation-intent";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";
import { NEXA_AI_OPEN_CHAT_EVENT } from "@/modules/ai-workbench/types";

interface ProjectSummary {
  id: string;
  title: string;
  goal?: string | null;
  platform?: string | null;
  contentType?: string | null;
  status: string;
  updatedAt: string;
}

interface PickedAsset {
  id: string;
  fileName: string;
  url: string | null;
  status: string;
}

const START_MODES: {
  id: CreationStartMode;
  short: string;
  desc: string;
}[] = [
  { id: "idea", short: "仅目标", desc: "直接写目标开始" },
  { id: "workspace", short: "工作区", desc: "用已整理的资料" },
  { id: "assets", short: "素材", desc: "上传图片后创作" },
  {
    id: "link",
    short: "链接二创",
    desc: "抖音 / 小红书 / TikTok / X 解析参考后生成",
  },
];

const PRIMARY_MODE = START_MODES.find((m) => m.id === "link")!;

const SECONDARY_MODES = START_MODES.filter(
  (m) => m.id === "workspace" || m.id === "assets"
);
const RECENT_PROJECT_LIMIT = 6;

function isNoiseProject(p: ProjectSummary) {
  const blob = `${p.title ?? ""} ${p.goal ?? ""}`.toLowerCase();
  if (!p.title?.trim()) return true;
  return (
    /^(\?|\uff1f){3,}/.test(p.title.trim()) ||
    /smoke|test\b|测试|untitled|未命名|demo[_ ]?test|自动生成|retest/.test(blob)
  );
}

function isNoiseWorkspace(w: { name: string; count: number }) {
  const name = (w.name ?? "").toLowerCase();
  if (!name.trim()) return true;
  // 开发/验收留下的噪音工作区，不出现在创作关联列表里
  return /smoke|test\b|retest|untitled|未命名|demo[_ ]?test|v\d+v\d+/.test(name);
}

function inferPlatform(text: string): CreationPlatform {
  if (/TikTok|tiktok/i.test(text)) return "tiktok";
  if (/抖音/.test(text)) return "douyin";
  if (/Instagram|instagram/i.test(text)) return "instagram";
  if (/\bX\b|推特|Twitter/i.test(text)) return "x";
  if (/LinkedIn|领英/i.test(text)) return "linkedin";
  return "xiaohongshu";
}

function inferContentType(text: string): ContentType {
  if (/视频|脚本|TikTok|抖音|短视频/.test(text)) return "short_video";
  if (/图片|封面|海报/.test(text)) return "image";
  if (/文案|帖子|tweet/i.test(text)) return "copy";
  return "social_post";
}

export function CreateHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetMode = (searchParams.get("mode") as CreationStartMode) || null;
  const presetWorkspaceId = searchParams.get("workspaceId");
  const presetLinkUrl = searchParams.get("linkUrl") ?? "";
  const presetOutput = (searchParams.get("output") as RecreateOutputKind | null) ?? null;
  const presetPlatform = searchParams.get("platform");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  const presetAssetIds = searchParams.get("assetIds");
  const commerceContext = searchParams.get("commerceContext") ?? "";
  const goalPreset = searchParams.get("goal") ?? "";
  const productFromUrl = searchParams.get("product")?.trim() || "";
  const presetResearchId = searchParams.get("researchId")?.trim() || "";
  const presetStage = searchParams.get("stage")?.trim() || "";
  const presetStoreId = searchParams.get("storeId")?.trim() || "";
  const presetMarketplace = searchParams.get("marketplace")?.trim() || "";
  // Parse product for continuity — do not ask user to re-enter
  const productFromCommerce = (() => {
    const m = commerceContext.match(/^product:\s*(.+)$/im);
    return m?.[1]?.trim() || "";
  })();
  const knownCommerceProduct = productFromUrl || productFromCommerce;
  const [mode, setMode] = useState<CreationStartMode>(() => {
    if (presetAssetIds) return "assets";
    if (commerceContext || presetMode === "commerce") return "commerce";
    if (presetWorkspaceId && presetMode !== "link") return "workspace";
    if (presetMode === "search") return "search";
    if (presetMode === "link" || presetLinkUrl) return "link";
    if (presetMode === "idea") return "idea";
    // Default: goal-first creation (not link recreate)
    return "idea";
  });
  const [goal, setGoal] = useState(goalPreset);
  const [assetIds, setAssetIds] = useState<string[]>(
    () => presetAssetIds?.split(",").filter(Boolean) ?? []
  );

  useAiCapabilityListener(
    {
      create_script: () => {
        window.dispatchEvent(
          new CustomEvent(NEXA_AI_OPEN_CHAT_EVENT, {
            detail: {
              question:
                goal.trim() ||
                "帮我生成文案脚本，并规划需要的能力与步骤",
            },
          })
        );
      },
      creation_agent: () => {
        window.dispatchEvent(
          new CustomEvent(NEXA_AI_OPEN_CHAT_EVENT, {
            detail: {
              question: goal.trim() || "根据我的目标规划创作链路",
            },
          })
        );
      },
    },
    [goal]
  );
  const [pickedAssets, setPickedAssets] = useState<PickedAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const [outputKind, setOutputKind] = useState<RecreateOutputKind>(
    () => presetOutput ?? "video"
  );
  const [contentType, setContentType] = useState<ContentType>(() => {
    if (presetOutput === "image") return "image";
    if (presetOutput === "copy") return "copy";
    if (presetLinkUrl || presetMode === "link") return "short_video";
    const plat = inferPlatform(goalPreset);
    const inferred = inferContentType(goalPreset);
    return isContentTypeAllowedOnPlatform(inferred, plat)
      ? inferred
      : defaultContentTypeForPlatform(plat);
  });
  const [platform, setPlatform] = useState<CreationPlatform>(() => {
    if (
      presetPlatform === "douyin" ||
      presetPlatform === "xiaohongshu" ||
      presetPlatform === "tiktok"
    ) {
      return presetPlatform;
    }
    return inferPlatform(goalPreset);
  });
  const [workspaceId, setWorkspaceId] = useState(presetWorkspaceId ?? "");
  const [linkUrl, setLinkUrl] = useState(presetLinkUrl);
  const [socialIngest, setSocialIngest] = useState<SocialIngestResult | null>(
    null
  );
  const [manualReference, setManualReference] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [identityRunning, setIdentityRunning] = useState(false);
  const [identityPreview, setIdentityPreview] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identityWorkspaceHref, setIdentityWorkspaceHref] = useState<
    string | null
  >(null);
  const [identityJobId, setIdentityJobId] = useState<string | null>(null);
  const [identityTitle, setIdentityTitle] = useState<string | null>(null);
  const [saveWorkspaceId, setSaveWorkspaceId] = useState(presetWorkspaceId ?? "");
  const [savingRender, setSavingRender] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNoise, setShowNoise] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [agentPlanSummary, setAgentPlanSummary] = useState<string | null>(null);
  const [agentPlanning, setAgentPlanning] = useState(false);

  useEffect(() => {
    fetch("/api/create")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => undefined);
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((d) =>
        setWorkspaces(
          (d.workspaces ?? []).map(
            (w: { id: string; name: string; count: number }) => ({
              id: w.id,
              name: w.name,
              count: w.count,
            })
          )
        )
      )
      .catch(() => undefined);
  }, []);

  const renameProject = async (p: ProjectSummary) => {
    const next = window.prompt("重命名创作项目", p.title || "");
    if (next == null) return;
    const title = next.trim();
    if (!title || title === p.title) return;
    const res = await fetch(`/api/create/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      window.alert("重命名失败，请稍后再试");
      return;
    }
    setProjects((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, title } : x))
    );
  };

  const deleteProjectRow = async (p: ProjectSummary) => {
    if (
      !window.confirm(
        `确定删除创作项目「${p.title || "未命名"}」？不可恢复。`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/create/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      window.alert("删除失败，请稍后再试");
      return;
    }
    setProjects((prev) => prev.filter((x) => x.id !== p.id));
  };

  // 从素材库带入 id 时，补全名称预览
  useEffect(() => {
    if (!assetIds.length || pickedAssets.length) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/assets");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const map = new Map<string, PickedAsset>(
        ((data.assets ?? []) as PickedAsset[]).map((a) => [a.id, a])
      );
      const rows = assetIds
        .map((id) => map.get(id))
        .filter((a): a is PickedAsset => Boolean(a));
      if (!cancelled && rows.length) setPickedAssets(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetIds, pickedAssets.length]);

  const addPickedAsset = (asset: PickedAsset) => {
    setPickedAssets((prev) => {
      if (prev.some((p) => p.id === asset.id)) return prev;
      return [...prev, asset];
    });
    setAssetIds((prev) => (prev.includes(asset.id) ? prev : [...prev, asset.id]));
  };

  const removePickedAsset = (id: string) => {
    setPickedAssets((prev) => prev.filter((a) => a.id !== id));
    setAssetIds((prev) => prev.filter((x) => x !== id));
  };

  const handleAssetUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const accepted =
      mode === "link"
        ? Array.from(files).filter(
            (f) =>
              f.type.startsWith("image/") || f.type.startsWith("video/")
          )
        : Array.from(files);
    if (mode === "link" && accepted.length === 0) {
      setError("请上传图片或视频文件");
      setUploading(false);
      return;
    }
    try {
      const nextIds = [...assetIds];
      for (const file of accepted) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(
            data.error ??
              (res.status === 401
                ? "上传素材需要登录。可先使用演示账号登录。"
                : "上传失败，请重试")
          );
          continue;
        }
        const asset = data.asset as PickedAsset;
        addPickedAsset({
          id: asset.id,
          fileName: asset.fileName,
          url: asset.url,
          status: asset.status,
        });
        if (!nextIds.includes(asset.id)) nextIds.push(asset.id);
      }
      if (mode === "link" && detectSocialLink(linkUrl) && nextIds.length > 0) {
        void runSocialIngest(linkUrl, nextIds.length);
      }
    } finally {
      setUploading(false);
      if (assetInputRef.current) assetInputRef.current.value = "";
    }
  };

  const runSocialIngest = async (rawPaste: string, mediaCount?: number) => {
    const match = detectSocialLink(rawPaste);
    if (!match) {
      setSocialIngest(null);
      return null;
    }
    // Normalize input field to clean short URL for clarity
    setLinkUrl(match.url);
    setIngesting(true);
    try {
      const res = await fetch("/api/create/social-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pass full paste so server can extract share caption / 【标题】
          url: rawPaste,
          mediaAssetCount: mediaCount ?? assetIds.length,
        }),
      });
      const data = (await res.json()) as SocialIngestResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "链接解析失败");
        setSocialIngest(null);
        return null;
      }
      setSocialIngest(data);
      // Replace short link in the input with the real expanded URL
      if (data.canonicalUrl) {
        setLinkUrl(data.canonicalUrl);
      } else if (data.url) {
        setLinkUrl(data.url);
      }
      setPlatform(data.platform as CreationPlatform);
      const nextType: ContentType =
        outputKind === "image"
          ? "image"
          : outputKind === "copy"
            ? "copy"
            : "short_video";
      setContentType(nextType);
      const kindLabel =
        outputKind === "image"
          ? "同款图片"
          : outputKind === "copy"
            ? "同款文案"
            : "同款短视频";
      const displayTitle = pickRecreateDisplayTitle({
        title: data.title,
        caption: data.briefSnippet,
        topics: data.topics,
        awemeId: data.awemeId,
        structureHints: data.structureHints,
      });
      const topicBit = data.topics?.length
        ? ` · ${data.topics.slice(0, 2).map((t) => `#${t}`).join(" ")}`
        : "";
      const nextGoal = `根据「${displayTitle}」${topicBit} 做版权安全的${kindLabel}（${data.platformLabel}）`;
      if (
        !goal.trim() ||
        goal.includes("根据参考") ||
        goal.includes("同款") ||
        goal.includes(match.url) ||
        isSocialShareBoilerplate(goal)
      ) {
        setGoal(nextGoal);
      }
      return data;
    } catch {
      setError("链接解析失败，请稍后再试");
      setSocialIngest(null);
      return null;
    } finally {
      setIngesting(false);
    }
  };

  // Deep-link / paste: auto-expand short link (debounced)
  useEffect(() => {
    if (mode !== "link") return;
    const raw = linkUrl.trim();
    if (!raw || !detectSocialLink(raw)) return;

    if (socialIngest?.canonicalUrl || socialIngest?.awemeId) {
      const current = detectSocialLink(raw);
      const resolved = socialIngest.canonicalUrl || socialIngest.url || "";
      const sameWork =
        Boolean(current) &&
        (resolved === current!.url ||
          socialIngest.url === current!.url ||
          (socialIngest.awemeId
            ? resolved.includes(socialIngest.awemeId) &&
              (raw.includes(socialIngest.awemeId) ||
                current!.url.includes(socialIngest.awemeId) ||
                resolved.includes(current!.url.replace(/\/$/, "")))
            : resolved.includes(current!.url) || current!.url.includes(resolved)));
      if (sameWork) return;
    }

    const timer = window.setTimeout(() => {
      void runSocialIngest(raw, assetIds.length);
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paste/expand only
  }, [mode, linkUrl]);

  const buildSocialBrief = (
    ingest: SocialIngestResult,
    kind: RecreateOutputKind = "video"
  ) => {
    const base = buildCopyrightSafeBrief({
      platformLabel: ingest.platformLabel,
      url: ingest.url,
      title: ingest.title,
      referenceCaption: ingest.briefSnippet,
      outputKind: kind,
      author: ingest.author,
      topics: ingest.topics,
      structureHints: ingest.structureHints,
      parseStatus: ingest.parseStatus,
    });
    if (!manualReference.trim()) return base;
    return `${base}\n\n【用户补充的参考结构/风格】\n${manualReference.trim()}`;
  };

  const renderAssetUpload = (opts?: {
    acceptVideo?: boolean;
    title?: string;
    hint?: string;
  }) => (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleAssetUpload(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 bg-white"
        }`}
      >
        <p className="text-[14px] text-zinc-700">
          {opts?.title ?? "拖拽图片到这里，或直接上传"}
        </p>
        <p className="mt-1 text-[12px] text-zinc-400">
          {opts?.hint ??
            "支持 JPG / PNG / WEBP 等常见图片；上传后即可开始创作"}
        </p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => assetInputRef.current?.click()}
          className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {uploading
            ? "上传中…"
            : opts?.acceptVideo
              ? "选择图片 / 视频上传"
              : "选择图片上传"}
        </button>
        <input
          ref={assetInputRef}
          type="file"
          accept={
            opts?.acceptVideo
              ? "image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
              : "image/*,.jpg,.jpeg,.png,.webp"
          }
          multiple
          className="hidden"
          onChange={(e) => void handleAssetUpload(e.target.files)}
        />
      </div>

      {pickedAssets.length > 0 && (
        <ul className="space-y-2">
          {pickedAssets.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-3">
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover bg-zinc-100"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-100 text-[11px] text-zinc-400">
                    图
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-zinc-800">
                    {a.fileName}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {a.status === "ready"
                      ? "可用"
                      : a.status === "processing"
                        ? "处理中"
                        : a.status === "failed"
                          ? "处理失败"
                          : "已上传"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removePickedAsset(a.id)}
                className="shrink-0 text-[12px] text-zinc-500 hover:text-zinc-800"
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const contentTypeOptions = useMemo(
    () => contentTypeOptionsForPlatform(platform),
    [platform]
  );

  const visibleProjects = useMemo(() => {
    const main = projects.filter((p) => !isNoiseProject(p));
    const noise = projects.filter((p) => isNoiseProject(p));
    return {
      main,
      recent: showAllProjects ? main : main.slice(0, RECENT_PROJECT_LIMIT),
      hiddenMainCount: Math.max(0, main.length - RECENT_PROJECT_LIMIT),
      noise,
    };
  }, [projects, showAllProjects]);

  const selectableWorkspaces = useMemo(() => {
    return workspaces
      .filter((w) => !isNoiseWorkspace(w))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }, [workspaces]);

  const applyPlatform = (next: CreationPlatform) => {
    setPlatform(next);
    setContentType((cur) =>
      isContentTypeAllowedOnPlatform(cur, next)
        ? cur
        : defaultContentTypeForPlatform(next)
    );
  };

  const applyGoalInference = (v: string) => {
    if (v.trim().length <= 4) {
      setAgentPlanSummary(null);
      return;
    }
    const intent = classifyCreationIntent(v);
    const nextPlat =
      (intent.platformHint as CreationPlatform | undefined) || inferPlatform(v);
    const nextType =
      (intent.contentTypeHint as ContentType | undefined) || inferContentType(v);
    setPlatform(nextPlat);
    setContentType(
      isContentTypeAllowedOnPlatform(nextType, nextPlat)
        ? nextType
        : defaultContentTypeForPlatform(nextPlat)
    );
    if (intent.kind === "social_recreate" && mode !== "link") {
      setMode("link");
    } else if (intent.kind === "commerce_strategy" && mode === "idea") {
      setMode("commerce");
    }
    setAgentPlanSummary(
      `意图 · ${CREATION_INTENT_LABELS[intent.kind]}（${Math.round(intent.confidence * 100)}%）`
    );
  };

  /** Call Creation Agent: intent → tools/MCP plan (honest availability). */
  const runCreationAgentPlan = async (goalText: string) => {
    setAgentPlanning(true);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goalText,
          execute: false,
          enrich: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return null;
      }
      setAgentPlanSummary(data.plan?.summary || agentPlanSummary);
      return data as {
        plan: { summary: string; primaryHref: string };
        projectHints: {
          goal: string;
          brief: string;
          platform?: string;
          contentType?: string;
          startMode?: string;
        };
      };
    } catch {
      return null;
    } finally {
      setAgentPlanning(false);
    }
  };

  /** Online: link structure + face → AI. Never downloads platform original. */
  const handleIdentityRecreate = async () => {
    if (!linkUrl.trim()) {
      setError("请粘贴链接");
      return;
    }
    if (!detectSocialLink(linkUrl)) {
      setError("请粘贴抖音 / 小红书 / TikTok / X 链接");
      return;
    }
    if (assetIds.length === 0) {
      setError("请先上传一张你的形象照片");
      return;
    }
    setIdentityRunning(true);
    setError(null);
    setIdentityPreview(null);
    setIdentityMessage(null);
    setIdentityWorkspaceHref(null);
    setIdentityJobId(null);
    setIdentityTitle(null);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/create/identity-recreate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: linkUrl,
          faceAssetId: assetIds[0],
          outputKind: outputKind === "image" ? "image" : "video",
          durationSec: 5,
          workspaceId: saveWorkspaceId || workspaceId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "在线生成失败");
        return;
      }
      setIdentityMessage(data.message ?? "生成完成");
      setIdentityPreview(data.previewUrl || data.imageUrl || data.videoUrl || null);
      setIdentityJobId(typeof data.jobId === "string" ? data.jobId : null);
      setIdentityTitle(
        typeof data.displayTitle === "string" ? data.displayTitle : null
      );
      setIdentityWorkspaceHref(
        typeof data.workspaceHref === "string" ? data.workspaceHref : null
      );
      if (typeof data.workspaceId === "string" && data.workspaceId) {
        setSaveWorkspaceId(data.workspaceId);
      }
      if (data.ingest) setSocialIngest(data.ingest as SocialIngestResult);
    } catch {
      setError("在线生成失败，请稍后重试");
    } finally {
      setIdentityRunning(false);
    }
  };

  const handleSaveRender = async () => {
    if (!identityPreview || !identityJobId) {
      setError("请先生成成片");
      return;
    }
    setSavingRender(true);
    setSaveMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/create/save-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: identityJobId,
          mediaUrl: identityPreview,
          title: identityTitle || goal || "二创成片",
          kind: outputKind === "image" ? "image" : "video",
          workspaceId: saveWorkspaceId || undefined,
          platform: socialIngest?.platform,
          sourceUrl: socialIngest?.url || linkUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "存入工作区失败");
        return;
      }
      setSaveMessage(data.message ?? "已存入工作区");
      setIdentityWorkspaceHref(data.workspaceHref ?? null);
      if (typeof data.workspaceId === "string") {
        setSaveWorkspaceId(data.workspaceId);
      }
      // refresh workspace list counts
      const wsRes = await fetch("/api/workspace");
      if (wsRes.ok) {
        const d = await wsRes.json();
        setWorkspaces(
          (d.workspaces ?? []).map(
            (w: { id: string; name: string; count: number }) => ({
              id: w.id,
              name: w.name,
              count: w.count,
            })
          )
        );
      }
    } catch {
      setError("存入工作区失败，请稍后重试");
    } finally {
      setSavingRender(false);
    }
  };

  const handleCreate = async () => {
    const trimmed = goal.trim();
    if (!trimmed) {
      setError("请告诉 Nexa 你要完成什么");
      return;
    }
    if (mode === "workspace" && !workspaceId) {
      setError("请选择一个工作区");
      return;
    }
    if (mode === "assets" && assetIds.length === 0) {
      setError("请先在本页上传至少一张图片或素材");
      return;
    }
    if (mode === "link" && !linkUrl.trim()) {
      setError("请粘贴链接");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const wantsVideo =
        contentType === "short_video" ||
        /视频|成片|口播|分镜|抖音|TikTok|Reel/i.test(trimmed);
      const canOneClickProduce =
        (mode === "workspace" || mode === "idea" || mode === "search") &&
        wantsVideo;

      if (canOneClickProduce) {
        const produceGoal = wantsVideo
          ? trimmed
          : `${trimmed}：生成一条短视频成片`;
        const res = await fetch("/api/create/produce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal: produceGoal,
            workspaceId:
              mode === "workspace" ? workspaceId || undefined : undefined,
            confirm: true,
            contentType: "short_video",
            platform,
          }),
        });
        const data = await res.json();
        if (data.projectId || data.href) {
          router.push(
            withPreservedReturnNav(
              data.href || `/create/${data.projectId}?panel=video`,
              searchParams
            )
          );
          return;
        }
        if (data.code === "confirm_required" && data.projectId) {
          router.push(
            withPreservedReturnNav(
              `/create/${data.projectId}?panel=video`,
              searchParams
            )
          );
          return;
        }
        setError(data.message || data.error || "一键成片失败");
        return;
      }

      const socialMatch =
        mode === "link" ? detectSocialLink(linkUrl) : null;
      let ingest = socialIngest;

      if (socialMatch) {
        ingest =
          (await runSocialIngest(linkUrl, assetIds.length)) ?? ingest;
        if (!ingest) {
          return;
        }
        // Allow start without assets — upload happens in video workbench
      }

      const isSocialRecreate = Boolean(socialMatch && ingest);

      // Agent: intent → capability / MCP plan; attach to brief (never fake MCP).
      const agent =
        !isSocialRecreate && mode !== "link"
          ? await runCreationAgentPlan(trimmed)
          : null;
      const hints = agent?.projectHints;

      const createPlatform = isSocialRecreate
        ? (ingest!.platform as CreationPlatform)
        : ((hints?.platform as CreationPlatform | undefined) || platform);
      const createContentType = isSocialRecreate
        ? outputKind === "image"
          ? ("image" as ContentType)
          : outputKind === "copy"
            ? ("copy" as ContentType)
            : ("short_video" as ContentType)
        : ((hints?.contentType as ContentType | undefined) || contentType);
      const baseBrief = isSocialRecreate
        ? buildSocialBrief(ingest!, outputKind)
        : mode === "commerce" && commerceContext
          ? commerceContext
          : undefined;
      const createBrief = hints?.brief
        ? [hints.brief, baseBrief].filter(Boolean).join("\n\n")
        : baseBrief;

      // Structured parse → storyboard handoff (not just flat brief)
      let referenceStoryboard:
        | import("@/modules/create/services/reference-storyboard-package").ReferenceStoryboardPackage
        | undefined;
      if (isSocialRecreate && ingest) {
        try {
          const { buildReferenceStoryboardPackage } = await import(
            "@/modules/create/services/reference-storyboard-package"
          );
          // Client cannot call vision; server create can enrich — send base package
          referenceStoryboard = buildReferenceStoryboardPackage(ingest);
        } catch {
          referenceStoryboard = undefined;
        }
      }
      const createGoal = isSocialRecreate
        ? (() => {
            const label = pickRecreateDisplayTitle({
              title: ingest!.title,
              caption: ingest!.briefSnippet,
              topics: ingest!.topics,
              awemeId: ingest!.awemeId,
              structureHints: ingest!.structureHints,
            });
            const topics = ingest!.topics?.length
              ? ` · ${ingest!.topics.slice(0, 2).map((t) => `#${t}`).join(" ")}`
              : "";
            if (trimmed && !isSocialShareBoilerplate(trimmed)) return trimmed;
            return `根据「${label}」${topics} 做版权安全的同款二创（${ingest!.platformLabel}）`;
          })()
        : trimmed;
      const createTitle = isSocialRecreate
        ? pickRecreateDisplayTitle({
            title: ingest!.title,
            caption: ingest!.briefSnippet,
            topics: ingest!.topics,
            awemeId: ingest!.awemeId,
            structureHints: ingest!.structureHints,
          })
        : undefined;

      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: createGoal,
          title: createTitle,
          contentType: createContentType,
          platform: createPlatform,
          startMode: mode,
          workspaceId:
            mode === "workspace" ? workspaceId || undefined : undefined,
          linkUrl: mode === "link" ? linkUrl.trim() : undefined,
          assetIds:
            (mode === "assets" || mode === "link") && assetIds.length
              ? assetIds
              : undefined,
          commerceContext:
            mode === "commerce" && commerceContext
              ? commerceContext
              : undefined,
          researchId: presetResearchId || undefined,
          brief: createBrief,
          referenceStoryboard: referenceStoryboard || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "创建失败");
        return;
      }
      const next =
        presetStage === "qa"
          ? `/create/${data.id}?panel=qa`
          : `/create/${data.id}`;
      router.push(withPreservedReturnNav(next, searchParams));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-8 sm:py-10">
      <ReturnBackLink className="mb-4" />
      <PageHeader
        title="你想完成什么？"
        description="先选入口与平台，再写目标。Agent 会据此规划并执行。"
        actions={
          <div className="flex flex-wrap gap-4 text-[14px] font-medium text-zinc-600">
            <Link href="/workspace" className="hover:text-zinc-900">
              工作区
            </Link>
            <Link href="/assets" className="hover:text-zinc-900">
              {UI.create.myAssets}
            </Link>
            <Link href="/create/image" className="hover:text-zinc-900">
              图片制作
            </Link>
          </div>
        }
      />

      {/* 01 创作入口 — 前置条件，不是脚注小字 */}
      <section className="mb-8">
        <p className={typeStyle.sectionLabel}>01 · 创作入口</p>
        <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>从哪里开始</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {START_MODES.map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMode(item.id);
                  if (item.id !== "workspace") setWorkspaceId("");
                }}
                className={`rounded-xl border px-4 py-3.5 text-left transition-colors ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400"
                }`}
              >
                <span className="block text-[15px] font-semibold tracking-tight">
                  {item.short}
                </span>
                <span
                  className={`mt-1 block text-[13px] leading-snug ${
                    active ? "text-zinc-300" : "text-zinc-500"
                  }`}
                >
                  {item.desc}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 02 平台与类型 — 始终可见 */}
      {mode !== "link" && (
        <section className="mb-8">
          <p className={typeStyle.sectionLabel}>02 · 平台与类型</p>
          <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>发到哪、做什么</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={typeStyle.fieldLabel}>目标平台</span>
              <select
                value={platform}
                onChange={(e) =>
                  applyPlatform(e.target.value as CreationPlatform)
                }
                className={`${typeStyle.fieldControl} mt-1.5`}
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={typeStyle.fieldLabel}>内容类型</span>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as ContentType)}
                className={`${typeStyle.fieldControl} mt-1.5`}
              >
                {contentTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* 03 目标 */}
      <section className="mb-8">
        <p className={typeStyle.sectionLabel}>
          {mode === "link" ? "02 · 目标" : "03 · 目标"}
        </p>
        <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>你要完成什么</h2>
        <label className="mt-4 block">
          <textarea
            value={goal}
            onChange={(e) => {
              const v = e.target.value;
              setGoal(v);
              if (v.trim().length > 4) applyGoalInference(v);
            }}
            rows={3}
            placeholder="例如：根据差评痛点，重写榨汁杯亚马逊商品页卖点，并做一条 TikTok 旅行场景短视频"
            className={`${typeStyle.fieldControl} min-h-[96px]`}
          />
        </label>
        {agentPlanSummary && (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[14px] leading-relaxed text-zinc-600">
            {agentPlanning ? "Agent 规划中…" : agentPlanSummary}
          </p>
        )}
      </section>

      {/* 入口专属字段（不再重复列出入口本身） */}
      <section className="mb-8">
        {mode === "workspace" && (
          <>
            <p className={typeStyle.sectionLabel}>04 · 工作区</p>
            <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>选择资料来源</h2>
            <label className="mt-4 block">
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                className={typeStyle.fieldControl}
              >
                <option value="">请选择工作区</option>
                {selectableWorkspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.count > 0 ? `（${w.count} 条）` : "（暂无资料）"}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {mode === "assets" && (
          <>
            <p className={typeStyle.sectionLabel}>04 · 素材</p>
            <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>上传或选用图片</h2>
            <div className="mt-4 space-y-3">
              {renderAssetUpload()}
              <p className={typeStyle.bodyMuted}>
                也可前往{" "}
                <Link
                  href="/assets"
                  className="font-medium text-zinc-800 underline underline-offset-2"
                >
                  {UI.create.myAssets}
                </Link>{" "}
                管理素材。
              </p>
            </div>
          </>
        )}

        {mode === "commerce" && (
          <>
            <p className={typeStyle.sectionLabel}>04 · 跨境诊断</p>
            <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>诊断上下文</h2>
            <div className={`mt-4 ${typeStyle.bodyMuted}`}>
              {knownCommerceProduct ? (
                <p>
                  商品：
                  <span className="font-medium text-zinc-800">
                    {knownCommerceProduct}
                  </span>
                </p>
              ) : null}
              <p className="mt-1">
                {commerceContext
                  ? "已带入诊断上下文。"
                  : "请从跨境诊断页一键带入，或直接写目标。"}
              </p>
            </div>
          </>
        )}

        {mode === "link" && (
          <>
            <p className={typeStyle.sectionLabel}>03 · 链接二创</p>
            <h2 className={`mt-1 ${typeStyle.sectionTitle}`}>
              {PRIMARY_MODE.short}
            </h2>
            <p className={`mt-1 ${typeStyle.bodyMuted}`}>{PRIMARY_MODE.desc}</p>
            <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium text-zinc-600">
                粘贴参考链接或完整分享口令
              </span>
              <input
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  setSocialIngest(null);
                  setManualReference("");
                }}
                onBlur={() => {
                  if (detectSocialLink(linkUrl)) {
                    void runSocialIngest(linkUrl);
                  }
                }}
                placeholder="抖音 / 小红书 / TikTok / X 链接或口令全文"
                className={typeStyle.fieldControl}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "video", label: "生成视频" },
                  { id: "image", label: "生成图片" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setOutputKind(opt.id);
                    setContentType(opt.id === "image" ? "image" : "short_video");
                  }}
                  className={`rounded-lg border px-4 py-2 text-[14px] font-medium ${
                    outputKind === opt.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <p className="mb-2 text-[14px] font-medium text-zinc-600">
                上传你的形象 / 素材（二创画面用）
              </p>
              {renderAssetUpload({
                title: "拖拽或上传你的形象 / 素材",
                hint: "二创画面使用你的素材，不下载平台原片",
              })}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium text-zinc-600">
                补充参考结构（可选）
              </span>
              <textarea
                value={manualReference}
                onChange={(e) => setManualReference(e.target.value)}
                rows={3}
                placeholder="口令解析不全时，可手写镜头节奏、风格要点"
                className={typeStyle.fieldControl}
              />
            </label>

            {ingesting && (
              <p className="text-[14px] text-zinc-500">
                正在真实请求分享页解析元数据（非预置结果）…
              </p>
            )}

            {socialIngest && (
              <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-3">
                <p
                  className={`text-[14px] leading-relaxed ${
                    socialIngest.parseStatus === "ok"
                      ? "text-zinc-700"
                      : "text-amber-800"
                  }`}
                >
                  解析
                  {socialIngest.parseStatus === "ok"
                    ? "成功"
                    : "不完整"}
                  ：{socialIngest.title || "未命名"}
                </p>
              </div>
            )}
            </div>
          </>
        )}
      </section>

      {/* 主操作 */}
      <section className="mb-10 flex flex-wrap items-center gap-3">
        {mode === "link" ? (
          <>
            <button
              type="button"
              onClick={() => void handleIdentityRecreate()}
              disabled={
                identityRunning ||
                assetIds.length === 0 ||
                !detectSocialLink(linkUrl)
              }
              className={action.primary.replace("px-4", "px-5")}
            >
              {identityRunning
                ? "在线生成中…"
                : outputKind === "image"
                  ? "生成图片"
                  : "生成成片"}
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={submitting || identityRunning}
              className={action.secondary.replace("px-4", "px-5")}
            >
              {submitting ? UI.common.loading : "进工作台细改"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={submitting || agentPlanning || !goal.trim()}
            className={action.primary.replace("px-4", "px-6").replace("py-2.5", "py-3") + " text-[15px]"}
          >
            {submitting || agentPlanning
              ? UI.common.loading
              : mode === "workspace" || contentType === "short_video"
                ? "一键成片"
                : "开始创作"}
          </button>
        )}
        {error && (
          <p className="w-full text-[14px] text-red-600">{error}</p>
        )}
      </section>

      <section className="border-t border-zinc-100 pt-8">
        <p className={`mb-3 ${typeStyle.sectionLabel}`}>最近项目</p>
        {visibleProjects.main.length === 0 &&
        visibleProjects.noise.length === 0 ? (
          <div className="py-8 text-center">
            <p className="mb-2 text-[15px] text-zinc-500">还没有创作项目</p>
            <p className="text-[13px] text-zinc-400">
              生成成片后可存入工作区；或点「进工作台」创建项目。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {visibleProjects.recent.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-50 py-3.5 transition-colors hover:bg-zinc-50/60"
              >
                <Link
                  href={withPreservedReturnNav(`/create/${p.id}`, searchParams)}
                  className="min-w-0 flex-1"
                >
                  <p className="font-medium text-zinc-900">{p.title}</p>
                  <p className="mt-1 text-[13px] text-zinc-400">
                    {STATUS_LABELS[p.status] ?? p.status}
                    {p.platform
                      ? ` · ${
                          PLATFORM_OPTIONS.find((x) => x.value === p.platform)
                            ?.label ?? p.platform
                        }`
                      : ""}
                    {" · "}
                    {new Date(p.updatedAt).toLocaleString("zh-CN")}
                  </p>
                </Link>
                <div className="flex shrink-0 gap-3 text-[13px]">
                  <button
                    type="button"
                    onClick={() => void renameProject(p)}
                    className="text-zinc-500 hover:text-zinc-800"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteProjectRow(p)}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {visibleProjects.hiddenMainCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllProjects((v) => !v)}
                className="pt-3 text-[13px] font-medium text-zinc-600 hover:text-zinc-900"
              >
                {showAllProjects
                  ? "收起项目列表"
                  : `查看其余 ${visibleProjects.hiddenMainCount} 个项目`}
              </button>
            )}
            {visibleProjects.noise.length > 0 && (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setShowNoise((v) => !v)}
                  className="text-[12px] text-zinc-400 hover:text-zinc-600"
                >
                  {showNoise
                    ? "隐藏测试项目"
                    : `另有 ${visibleProjects.noise.length} 个测试/噪音项目`}
                </button>
                {showNoise &&
                  visibleProjects.noise.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 border-b border-zinc-50 py-3"
                    >
                      <Link
                        href={withPreservedReturnNav(
                          `/create/${p.id}`,
                          searchParams
                        )}
                        className="min-w-0 flex-1 truncate text-[13px] text-zinc-400"
                      >
                        {p.title || "（无标题）"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void deleteProjectRow(p)}
                        className="shrink-0 text-[12px] text-zinc-400 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
