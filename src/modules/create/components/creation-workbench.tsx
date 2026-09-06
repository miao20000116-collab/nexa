"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReturnBackLink } from "@/components/navigation/return-back-link";
import { UI } from "@/lib/ui-copy";
import { action } from "@/lib/ui-hierarchy";
import {
  FIELD_ACTIONS,
  PLATFORM_OPTIONS,
  STATUS_LABELS,
  fieldLabelsForPlatform,
} from "@/modules/create/constants";
import type { CreationProject } from "@/modules/create/types";
import { pickRecreateDisplayTitle } from "@/modules/create/lib/recreate-copyright";
import { isSocialShareBoilerplate } from "@/modules/create/lib/social-boilerplate";
import { extractReferenceSignals } from "@/modules/video/reference-storyboard";
import { VideoWorkbench } from "@/modules/video/components/video-workbench";
import { PublishPanel } from "@/modules/publish/components/publish-panel";
import { ContentQAPanel } from "@/modules/qa/components/content-qa-panel";
import { CreditsConfirmPanel } from "@/modules/account/components/credits-confirm";
import { emitAiJob } from "@/modules/ai-workbench/store";
import { useAiCapabilityListener } from "@/modules/ai-workbench/use-capability-listener";

/** True when this project should expose 成片 (video workbench), not only文案. */
function projectLooksLikeVideo(project: CreationProject): boolean {
  if (
    project.contentType === "short_video" ||
    project.platform === "tiktok" ||
    project.platform === "douyin"
  ) {
    return true;
  }
  const content = (project.content ?? {}) as Record<string, unknown>;
  if (Array.isArray(content.__extractShots) && content.__extractShots.length > 0) {
    return true;
  }
  if (content.__referenceStoryboard) return true;
  const blob = [
    project.goal,
    project.brief,
    project.title,
    content.body,
    content.structure,
    content.hook,
  ]
    .map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? "")))
    .join("\n");
  return /镜头|分镜|口播|短视频|成片|竖屏|视频脚本|\(镜头/.test(blob);
}

/** Expands with content — no inner scrollbar / nested scroll pane. */
function AutoGrowTextarea({
  value,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}

export function CreationWorkbench({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const panel = searchParams.get("panel");
  const [project, setProject] = useState<CreationProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [aiMenuField, setAiMenuField] = useState<string | null>(null);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showReferenceDetail, setShowReferenceDetail] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activePane, setActivePane] = useState<"script" | "video" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const confirmRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLElement>(null);
  const repairedRef = useRef(false);
  const [genConfirm, setGenConfirm] = useState<{
    message: string;
    estimatedCredits: number | null;
    jobId?: string;
    action: "generate" | "rewrite";
    field?: string;
    rewriteAction?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/create/${projectId}`);
          if (cancelled) return;
          if (res.ok) {
            const data = (await res.json()) as CreationProject;
            setProject(data);
            setPromptDraft(data.promptOverride ?? "");
          } else {
            setProject(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectId]);

  // Fix projects polluted by Douyin OG boilerplate title/goal
  useEffect(() => {
    if (!project || repairedRef.current) return;
    const fromLink =
      project.startMode === "link" ||
      Boolean(project.sources?.some((s) => s.kind === "link"));
    if (!fromLink) return;

    const goalBad = isSocialShareBoilerplate(project.goal);
    const titleBad = isSocialShareBoilerplate(project.title);
    if (!goalBad && !titleBad) return;

    const signals = extractReferenceSignals(
      project.goal ?? "",
      project.brief ?? ""
    );
    const hasRealSignal =
      Boolean(signals.caption && !isSocialShareBoilerplate(signals.caption)) ||
      signals.topics.length > 0 ||
      Boolean(signals.awemeId);

    const linkUrl =
      project.sources?.find((s) => s.kind === "link")?.url ?? null;

    repairedRef.current = true;

    void (async () => {
      let nextTitle: string | null = null;
      let nextGoal: string | null = null;
      let nextBrief: string | null = null;

      if (hasRealSignal) {
        nextTitle = pickRecreateDisplayTitle({
          title: signals.title,
          caption: signals.caption,
          topics: signals.topics,
          awemeId: signals.awemeId,
          structureHints: signals.structureHints,
        });
        const topics = signals.topics.length
          ? ` · ${signals.topics.slice(0, 2).map((t) => `#${t}`).join(" ")}`
          : "";
        nextGoal = `根据「${nextTitle}」${topics} 做版权安全的同款二创（抖音）`;
      } else if (linkUrl) {
        try {
          const res = await fetch("/api/create/social-ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: linkUrl,
              mediaAssetCount: project.assets.length,
            }),
          });
          if (res.ok) {
            const ingest = await res.json();
            nextTitle = pickRecreateDisplayTitle({
              title: ingest.title,
              caption: ingest.briefSnippet,
              topics: ingest.topics,
              awemeId: ingest.awemeId,
              structureHints: ingest.structureHints,
            });
            const topics = ingest.topics?.length
              ? ` · ${ingest.topics.slice(0, 2).map((t: string) => `#${t}`).join(" ")}`
              : "";
            nextGoal = `根据「${nextTitle}」${topics} 做版权安全的同款二创（${ingest.platformLabel || "抖音"}）`;
            if (ingest.briefSnippet || ingest.structureHints?.length) {
              const { buildCopyrightSafeBrief } = await import(
                "@/modules/create/lib/recreate-copyright"
              );
              nextBrief = buildCopyrightSafeBrief({
                platformLabel: ingest.platformLabel || "抖音",
                url: ingest.canonicalUrl || ingest.url || linkUrl,
                title: ingest.title,
                referenceCaption: ingest.briefSnippet,
                topics: ingest.topics,
                structureHints: ingest.structureHints,
                parseStatus: ingest.parseStatus,
                author: ingest.author,
              });
            }
          }
        } catch {
          /* keep page usable */
        }
      }

      if (!nextTitle && !nextGoal) return;
      const patch: Record<string, unknown> = {};
      if (nextTitle && titleBad) patch.title = nextTitle;
      if (nextGoal && goalBad) patch.goal = nextGoal;
      if (nextBrief && (!project.brief || isSocialShareBoilerplate(project.brief))) {
        patch.brief = nextBrief;
      }
      if (!Object.keys(patch).length) return;
      const res = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as CreationProject;
        setProject(data);
        setMessage("已用真实解析结果更正目标（不再使用抖音通用分享文案）");
      }
    })();
  }, [project, projectId]);

  const referenceSignals = useMemo(() => {
    if (!project) return null;
    return extractReferenceSignals(project.goal ?? "", project.brief ?? "");
  }, [project]);

  const reloadProject = async () => {
    const res = await fetch(`/api/create/${projectId}`);
    if (!res.ok) return;
    const data = (await res.json()) as CreationProject;
    setProject(data);
  };

  const savePatch = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "保存失败");
        return;
      }
      if (data.ok === false) {
        setMessage(data.message ?? UI.common.aiUnavailable);
        return;
      }
      setProject(data);
      setMessage("已保存");
    } finally {
      setSaving(false);
    }
  };

  // Promote social_post → short_video when content clearly wants 成片
  const promotedVideoRef = useRef(false);
  useEffect(() => {
    if (!project || promotedVideoRef.current) return;
    if (project.contentType === "short_video") {
      promotedVideoRef.current = true;
      return;
    }
    if (!projectLooksLikeVideo(project)) return;
    promotedVideoRef.current = true;
    void savePatch({ contentType: "short_video" }).then(() => {
      setProject((prev) =>
        prev ? { ...prev, contentType: "short_video" } : prev
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot promote
  }, [project?.id, project?.contentType, project?.goal, project?.content]);

  const updateField = async (field: string, value: string | string[]) => {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            content: { ...(prev.content as object), [field]: value },
          }
        : prev
    );
    await savePatch({ action: "update_field", field, value });
  };

  const runGenerate = async (confirm = false, jobId?: string) => {
    setMessage(null);
    setGenerating(true);
    emitAiJob({
      capabilityId: "create_script",
      capabilityLabel: "生成文案脚本",
      title: project?.title || project?.goal || "文案脚本",
      phase: "running",
      message: confirm ? "正在生成文案…" : "正在准备生成…",
      pageKey: "create",
    });
    try {
      const res = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", confirm, jobId }),
      });
      const data = await res.json();
      if (data.code === "confirm_required") {
        setGenConfirm({
          message: data.estimate?.message ?? data.message,
          estimatedCredits: data.estimate?.estimatedCredits ?? null,
          jobId: data.jobId,
          action: "generate",
        });
        setMessage("请确认 Credits 后继续生成");
        emitAiJob({
          capabilityId: "create_script",
          capabilityLabel: "生成文案脚本",
          title: project?.title || "文案脚本",
          phase: "confirm_required",
          message: data.estimate?.message ?? "请确认 Credits 后继续",
          pageKey: "create",
        });
        window.setTimeout(() => {
          confirmRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 50);
        return;
      }
      if (res.ok && data.id) {
        setGenConfirm(null);
        setProject(data);
        setPromptDraft(data.promptOverride ?? promptDraft);
        const openVideo = projectLooksLikeVideo(data);
        setActivePane(openVideo ? "video" : "script");
        setMessage(
          openVideo
            ? "文案已就绪。已切换到「成片」：关联素材 → 生成分镜 → 导出"
            : "文案已生成"
        );
        emitAiJob({
          capabilityId: "create_script",
          capabilityLabel: "生成文案脚本",
          title: data.title || "文案脚本",
          phase: "done",
          message: openVideo
            ? "文案已就绪。请在「成片」里生成分镜并导出视频。"
            : "文案已生成",
          pageKey: "create",
        });
        window.setTimeout(() => {
          const el = openVideo
            ? document.getElementById("video-workbench")
            : scriptRef.current;
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
        return;
      }
      setMessage(data.message ?? data.error ?? UI.common.aiUnavailable);
      emitAiJob({
        capabilityId: "create_script",
        capabilityLabel: "生成文案脚本",
        title: project?.title || "文案脚本",
        phase: "error",
        message: data.message ?? data.error ?? UI.common.aiUnavailable,
        pageKey: "create",
      });
    } catch {
      setMessage("生成失败，请稍后再试");
      emitAiJob({
        capabilityId: "create_script",
        capabilityLabel: "生成文案脚本",
        title: project?.title || "文案脚本",
        phase: "error",
        message: "生成失败，请稍后再试",
        pageKey: "create",
      });
    } finally {
      setGenerating(false);
    }
  };

  useAiCapabilityListener(
    {
      create_script: () => {
        setActivePane("script");
        void runGenerate();
      },
    },
    [projectId, generating]
  );

  const runFieldAction = async (
    field: string,
    rewriteAction: string,
    confirm = false,
    jobId?: string
  ) => {
    setActiveField(field);
    setMessage(null);
    const res = await fetch(`/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rewrite_field",
        field,
        rewriteAction,
        confirm,
        jobId,
      }),
    });
    const data = await res.json();
    if (data.code === "confirm_required") {
      setGenConfirm({
        message: data.estimate?.message ?? data.message,
        estimatedCredits: data.estimate?.estimatedCredits ?? null,
        jobId: data.jobId,
        action: "rewrite",
        field,
        rewriteAction,
      });
      setActiveField(null);
      return;
    }
    if (res.ok && data.id) {
      setGenConfirm(null);
      setProject(data);
      setMessage("已局部改写该字段（未全量重生成）");
    } else {
      setMessage(data.message ?? UI.common.aiUnavailable);
    }
    setActiveField(null);
  };

  const savePrompt = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/create/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_prompt",
          promptOverride: promptDraft,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "保存失败");
        return;
      }
      setProject(data);
      setMessage("已保存高级 Prompt（仅内部使用，不展示给最终用户）");
    } finally {
      setSaving(false);
    }
  };

  const markCompleted = async () => {
    setMessage(null);
    const res = await fetch(`/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_completed" }),
    });
    const data = await res.json();
    if (res.ok && data.id) {
      setProject(data);
      setMessage("已标记为完成");
      return;
    }
    setMessage(data.error ?? "操作失败");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <p className="text-[14px] text-zinc-400">{UI.common.loadingPage}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-20 text-center">
        <p className="text-[15px] text-zinc-500">项目不存在</p>
        <ReturnBackLink
          className="mt-4 inline-block"
          fallbackHref="/create"
          fallbackLabel="返回创作"
        />
      </div>
    );
  }

  const fields = fieldLabelsForPlatform(project.platform, project.contentType);
  const content = (project.content ?? {}) as Record<string, string | string[]>;
  const platformLabel =
    PLATFORM_OPTIONS.find((p) => p.value === project.platform)?.label ??
    project.platform;
  const isVideoProject = projectLooksLikeVideo(project);
  const fromSocialLink =
    project.startMode === "link" ||
    Boolean(project.sources?.some((s) => s.kind === "link"));
  const hasScriptContent = fields.some((f) => {
    const v = content[f.key];
    return Array.isArray(v) ? v.some((x) => String(x).trim()) : Boolean(String(v ?? "").trim());
  });
  const nextStep = isVideoProject
    ? hasScriptContent
      ? ({
          label: "下一步：去做视频成片",
          hint: "文案已有。成片在「成片」页：素材 → 分镜 → 导出（不是再点开始生成文案）",
          primary: "video" as const,
        })
      : ({
          label: "下一步：先生成文案脚本",
          hint: "先生成标题和口播，再去做成片；也可以跳过脚本直接拆分镜头。",
          primary: "script" as const,
        })
    : ({
        label: hasScriptContent ? "下一步：继续改写或预览" : "下一步：生成内容",
        hint: null,
        primary: "script" as const,
      });

  const pane: "script" | "video" =
    activePane ??
    (isVideoProject && hasScriptContent ? "video" : "script");

  const fieldClass =
    "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white";

  const renderScriptFields = (opts?: { withAiEdit?: boolean }) => {
    if (preview) {
      return (
        <div className="space-y-5">
          {fields.map((f) => {
            const value = content[f.key];
            const text = Array.isArray(value)
              ? value.join(" ")
              : String(value ?? "");
            if (!text.trim()) return null;
            return (
              <div key={f.key}>
                <p className="text-[14px] font-medium tracking-wide text-zinc-500">
                  {f.label}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[16px] leading-relaxed text-zinc-800">
                  {text}
                </p>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {fields.map((f) => {
          const raw = content[f.key];
          const value = Array.isArray(raw)
            ? raw.join(", ")
            : String(raw ?? "");
          const actions = FIELD_ACTIONS.filter((a) => {
            if (a.id === "optimize_title")
              return f.key === "title" || f.key === "hook";
            if (a.id === "regenerate_cover")
              return f.key === "coverSuggestion";
            return true;
          });
          return (
            <div key={f.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`field-${f.key}`}
                  className="text-[14px] font-medium tracking-wide text-zinc-500"
                >
                  {f.label}
                </label>
                {opts?.withAiEdit && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      disabled={activeField === f.key}
                      onClick={() =>
                        setAiMenuField((cur) =>
                          cur === f.key ? null : f.key
                        )
                      }
                      className="text-[14px] text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline disabled:opacity-40"
                    >
                      {activeField === f.key ? "处理中…" : "AI 编辑"}
                    </button>
                    {aiMenuField === f.key && (
                      <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-sm">
                        <p className="px-3 py-1.5 text-[13px] text-zinc-400">
                          你希望怎么调整？
                        </p>
                        {actions.map((act) => (
                          <button
                            key={act.id}
                            type="button"
                            onClick={() => {
                              setAiMenuField(null);
                              void runFieldAction(f.key, act.id);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-[14px] text-zinc-700 hover:bg-zinc-50"
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {f.multiline ? (
                <AutoGrowTextarea
                  id={`field-${f.key}`}
                  value={value}
                  onChange={(e) => {
                    const next = f.array
                      ? e.target.value
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : e.target.value;
                    setProject({
                      ...project,
                      content: {
                        ...(project.content as object),
                        [f.key]: next,
                      },
                    });
                  }}
                  onBlur={() => {
                    const next = f.array
                      ? value
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : value;
                    void updateField(f.key, next);
                  }}
                  placeholder="生成后会出现在这里，也可直接手写"
                  className={fieldClass}
                />
              ) : (
                <input
                  id={`field-${f.key}`}
                  value={value}
                  onChange={(e) => {
                    const next = f.array
                      ? e.target.value
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : e.target.value;
                    setProject({
                      ...project,
                      content: {
                        ...(project.content as object),
                        [f.key]: next,
                      },
                    });
                  }}
                  onBlur={() => {
                    const next = f.array
                      ? value
                          .split(/[,，]/)
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : value;
                    void updateField(f.key, next);
                  }}
                  placeholder="—"
                  className={fieldClass}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[var(--nexa-content-max)] px-[var(--nexa-page-pad-x)] py-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-zinc-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <ReturnBackLink
            fallbackHref="/create"
            fallbackLabel="返回创作列表"
          />
          <input
            value={project.title}
            onChange={(e) =>
              setProject({ ...project, title: e.target.value })
            }
            onBlur={() => void savePatch({ title: project.title })}
            className="mt-3 w-full bg-transparent text-[26px] font-semibold tracking-tight text-zinc-900 outline-none sm:text-[28px]"
          />
          <p className="mt-1 text-[14px] text-zinc-500">
            {STATUS_LABELS[project.status] ?? project.status}
            {platformLabel ? ` · ${platformLabel}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isVideoProject && hasScriptContent ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActivePane("video");
                  window.setTimeout(() => {
                    document
                      .getElementById("video-workbench")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 50);
                }}
                className={action.primary}
              >
                去做视频成片
              </button>
              <button
                type="button"
                disabled={generating}
                onClick={() => {
                  setActivePane("script");
                  void runGenerate();
                }}
                className={action.secondary}
              >
                {generating ? "生成中…" : "重新生成文案"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={generating}
                onClick={() => {
                  setActivePane("script");
                  void runGenerate();
                }}
                className={
                  nextStep.primary === "script"
                    ? action.primary
                    : action.secondary
                }
              >
                {generating
                  ? "生成中…"
                  : isVideoProject
                    ? "生成文案脚本"
                    : "开始生成"}
              </button>
              {isVideoProject && (
                <button
                  type="button"
                  onClick={() => setActivePane("video")}
                  className={action.secondary}
                >
                  跳过脚本，直接做分镜
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className={action.ghost}
          >
            {preview ? "返回编辑" : "预览"}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreActions((v) => !v)}
              className={action.ghost}
            >
              更多
            </button>
            {showMoreActions && (
              <div className="absolute right-0 z-10 mt-1 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreActions(false);
                    void savePatch({ brief: project.brief });
                  }}
                  disabled={saving}
                  className="block w-full px-3 py-2 text-left text-[14px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  {UI.common.save}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreActions(false);
                    void markCompleted();
                  }}
                  className="block w-full px-3 py-2 text-left text-[14px] text-zinc-700 hover:bg-zinc-50"
                >
                  标记完成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreActions(false);
                    void (async () => {
                      if (
                        !window.confirm(
                          `确定删除创作项目「${project.title}」？不可恢复。`
                        )
                      ) {
                        return;
                      }
                      const res = await fetch(`/api/create/${projectId}`, {
                        method: "DELETE",
                      });
                      if (!res.ok) {
                        setMessage("删除失败，请稍后再试");
                        return;
                      }
                      window.location.href = "/create";
                    })();
                  }}
                  className="block w-full px-3 py-2 text-left text-[14px] text-red-600 hover:bg-red-50"
                >
                  删除项目
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="mb-6 border-b border-zinc-100 pb-5">
        <p className="text-[14px] font-medium tracking-wide text-zinc-500">
          {nextStep.label}
        </p>
        <p className="mt-1 text-[20px] font-semibold tracking-tight text-zinc-900">
          {project.goal?.trim() || project.title}
        </p>
        {nextStep.hint && (
          <p className="mt-1 text-[14px] text-zinc-500">{nextStep.hint}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            className="text-zinc-500 hover:text-zinc-800"
          >
            {showContext ? "收起依据" : "查看依据"}
          </button>
          {fromSocialLink && (
            <button
              type="button"
              onClick={() => setShowReferenceDetail((v) => !v)}
              className="text-zinc-500 hover:text-zinc-800"
            >
              {showReferenceDetail ? "收起参考" : "参考解析"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowTools(true);
              window.setTimeout(() => {
                document
                  .getElementById("creation-goal")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 50);
            }}
            className="text-zinc-500 hover:text-zinc-800"
          >
            改目标
          </button>
        </div>
        {showContext && (
          <div className="mt-3 space-y-2 text-[14px] text-zinc-600">
            <p>
              · 来源 {project.sources?.length ?? 0} · 素材 {project.assets.length}{" "}
              · 平台 {platformLabel ?? "—"}
            </p>
            {project.brief && (
              <p className="whitespace-pre-wrap text-zinc-500">
                {project.brief.slice(0, 500)}
                {project.brief.length > 500 ? "…" : ""}
              </p>
            )}
          </div>
        )}
        {showReferenceDetail && referenceSignals && (
          <div className="mt-3 rounded-lg bg-zinc-50 px-4 py-3 text-[14px] text-zinc-700">
            <ul className="space-y-1.5 text-zinc-600">
              {referenceSignals.title &&
                !isSocialShareBoilerplate(referenceSignals.title) && (
                  <li>参考标题：{referenceSignals.title}</li>
                )}
              {referenceSignals.caption &&
                !isSocialShareBoilerplate(referenceSignals.caption) && (
                  <li>
                    文案线索：
                    {referenceSignals.caption.slice(0, 120)}
                    {referenceSignals.caption.length > 120 ? "…" : ""}
                  </li>
                )}
              {referenceSignals.topics.length > 0 && (
                <li>
                  话题：
                  {referenceSignals.topics.map((t) => `#${t}`).join(" ")}
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {message && (
        <p
          className={`mb-4 text-[15px] ${
            message.includes("失败") || message.includes("不可用")
              ? "text-amber-800"
              : "font-medium text-zinc-800"
          }`}
        >
          {message}
        </p>
      )}

      {genConfirm && (
        <div ref={confirmRef} className="mb-6">
          <CreditsConfirmPanel
            message={genConfirm.message}
            estimatedCredits={genConfirm.estimatedCredits}
            busy={generating}
            onConfirm={() => {
              if (genConfirm.action === "generate") {
                void runGenerate(true, genConfirm.jobId);
              } else if (genConfirm.field && genConfirm.rewriteAction) {
                void runFieldAction(
                  genConfirm.field,
                  genConfirm.rewriteAction,
                  true,
                  genConfirm.jobId
                );
              }
            }}
            onCancel={() => {
              setGenConfirm(null);
              setMessage(null);
            }}
          />
        </div>
      )}

      {isVideoProject && (
        <div className="mb-6 flex gap-1 border-b border-zinc-200">
          <button
            type="button"
            onClick={() => setActivePane("script")}
            className={`border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors ${
              pane === "script"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            文案
          </button>
          <button
            type="button"
            onClick={() => setActivePane("video")}
            className={`border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors ${
              pane === "video"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            成片
          </button>
        </div>
      )}

      <div className="min-w-0 space-y-8">
        {(!isVideoProject || pane === "script") && (
          <section id="script-fields" ref={scriptRef} className="space-y-5">
            <p className="text-[14px] font-medium tracking-wide text-zinc-500">
              {isVideoProject ? "文案脚本" : "内容字段"}
            </p>
            {!hasScriptContent && !preview ? (
              <p className="text-[15px] text-zinc-500">
                还没有文案。点击上方「
                {isVideoProject ? "生成文案脚本" : "开始生成"}」。
              </p>
            ) : (
              renderScriptFields({ withAiEdit: !isVideoProject })
            )}
            {isVideoProject && hasScriptContent && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4">
                <p className="text-[16px] font-medium text-zinc-900">
                  文案已就绪 · 下一步做成片
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-zinc-600">
                  口播不会自动变成视频。切换到「成片」：关联素材 → 生成分镜 →
                  配乐 → 导出。
                </p>
                <button
                  type="button"
                  onClick={() => setActivePane("video")}
                  className="mt-3 rounded-lg bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800"
                >
                  去做视频成片
                </button>
              </div>
            )}
          </section>
        )}

        {isVideoProject && pane === "video" && (
          <div id="video-workbench">
            <VideoWorkbench
              projectId={projectId}
              goal={project.goal}
              fromSocialLink={fromSocialLink}
              assetCount={project.assets.length}
              hasWorkspace={Boolean(
                project.workspaceId ||
                  project.sources?.some(
                    (s) => s.workspaceId || s.kind === "workspace_source"
                  )
              )}
              onAssetsChanged={() => void reloadProject()}
            />
          </div>
        )}
      </div>

      <div className="mt-12 border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          className="text-[15px] font-medium text-zinc-700 hover:text-zinc-900"
        >
          {showTools ? "收起工具" : "工具：素材 / 来源 / QA / 发布"}
        </button>
        {showTools && (
          <div className="mt-6 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[14px] font-medium text-zinc-500">
                  {UI.create.manageAssets}
                </p>
                <Link
                  href="/assets"
                  className="text-[14px] text-zinc-500 hover:text-zinc-800"
                >
                  {UI.create.myAssets}
                </Link>
              </div>
              {project.assets.length === 0 ? (
                <p className="text-[14px] text-zinc-400">
                  尚未关联素材。可在成片步骤上传，或从「我的素材」选择。
                </p>
              ) : (
                <ul className="space-y-2">
                  {project.assets.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-zinc-100 px-3 py-2 text-[14px] text-zinc-700"
                    >
                      {a.asset?.title || a.assetId}
                      <span className="ml-2 text-[13px] text-zinc-400">
                        {a.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <p className="mb-3 text-[14px] font-medium text-zinc-500">
                {UI.create.manageSources}
              </p>
              {!project.sources?.length ? (
                <p className="text-[14px] text-zinc-400">暂无来源</p>
              ) : (
                <ul className="space-y-2">
                  {Array.from(
                    new Map(project.sources.map((s) => [s.id, s])).values()
                  ).map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-zinc-100 px-3 py-2"
                    >
                      <p className="text-[14px] text-zinc-700">
                        {s.title || s.url || s.kind}
                      </p>
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block truncate text-[13px] text-zinc-400 hover:underline"
                        >
                          {s.url}
                        </a>
                      )}
                      {s.workspaceId && (
                        <Link
                          href={`/workspace/${s.workspaceId}`}
                          className="mt-1 block text-[13px] text-zinc-500 hover:underline"
                        >
                          查看工作区
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="creation-goal">
              <p className="mb-2 text-[14px] font-medium tracking-wide text-zinc-500">
                目标
              </p>
              <textarea
                value={project.goal ?? ""}
                onChange={(e) =>
                  setProject({ ...project, goal: e.target.value })
                }
                onBlur={() => void savePatch({ goal: project.goal })}
                rows={2}
                className={fieldClass}
              />
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[14px] font-medium text-zinc-500">
                    高级 Prompt
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPrompt((v) => !v)}
                    className="text-[14px] text-zinc-500 hover:text-zinc-800"
                  >
                    {showPrompt ? "收起" : "展开"}
                  </button>
                </div>
                {showPrompt && (
                  <div className="space-y-2">
                    <textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      rows={6}
                      placeholder="可选：覆盖默认系统 Prompt。留空则使用内置中文结构化模板。"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[13px] outline-none focus:border-zinc-300"
                    />
                    <button
                      type="button"
                      onClick={() => void savePrompt()}
                      disabled={saving}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[14px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                    >
                      保存 Prompt
                    </button>
                  </div>
                )}
              </div>
            </section>

            <div
              id="creation-qa-panel"
              className="md:col-span-2 xl:col-span-1"
              ref={(el) => {
                if (el && panel === "qa") {
                  window.setTimeout(() => {
                    setShowTools(true);
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 200);
                }
              }}
            >
              <ContentQAPanel
                projectId={projectId}
                platform={project.platform}
              />
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <PublishPanel
                projectId={projectId}
                defaultPlatform={project.platform}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
