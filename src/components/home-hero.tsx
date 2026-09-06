"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ImagePlus, Loader2, X } from "lucide-react";
import { SearchInput } from "@/components/search-input";
import { cn } from "@/lib/utils";
import { detectSocialLink } from "@/lib/social-link";
import { buildCopyrightSafeBrief } from "@/modules/create/lib/recreate-copyright";
import type { SocialIngestResult } from "@/modules/create/services/social-recreate";

type HomeMode = "search" | "create";

const HEADLINES = [
  "你想了解什么，或者完成什么？",
  "从一个问题，走到一个结果。",
  "检索、判断、创作——从同一句话开始。",
  "今天最重要的事，交给 Nexa。",
] as const;

const SEARCH_PLACEHOLDER = "例如：周末去哪玩、买什么更合适、这个话题为什么火了……";
const CREATE_PLACEHOLDER = "例如：做一条旅行短视频，或把一篇长文改成小红书笔记……";
const CREATE_LINK_PLACEHOLDER = "粘贴抖音 / 小红书 / TikTok / X 链接，拆结构做版权安全同款……";

const SEARCH_SUGGESTIONS = [
  {
    tag: "出行",
    query: "第一次去成都玩 3 天，怎么安排路线才不赶？有哪些值得提前预约？",
    hint: "搜索 → 整理 → 行程",
  },
  {
    tag: "选择",
    query: "预算 5000 元，通勤和轻度剪辑都够用的笔记本怎么选？",
    hint: "搜索 → 对比 → 判断",
  },
  {
    tag: "热点",
    query: "为什么最近很多人讨论 Citywalk？它到底适合怎样的旅行方式？",
    hint: "搜索 → 研究 → 看懂",
  },
  {
    tag: "学习",
    query: "零基础想开始学摄影，第一台相机和前 30 天练习怎么安排？",
    hint: "搜索 → 收集 → 行动",
  },
].map((item) => ({
  ...item,
  href: `/search?q=${encodeURIComponent(item.query)}`,
}));

const CREATE_SUGGESTIONS = [
  {
    tag: "短视频",
    label: "把一次旅行做成 30 秒短视频",
    goal: "做一条 30 秒旅行短视频：第一次去成都的 3 天游玩路线，开头有反差钩子，画面轻松有生活感",
    hint: "目标 → 脚本 → 成片",
  },
  {
    tag: "图文",
    label: "把一篇长文改成小红书笔记",
    goal: "把一篇关于提高专注力的长文，改写成一篇适合小红书发布的图文笔记：有标题、分段、可执行清单和自然的互动结尾",
    hint: "资料 → 文案 → 发布",
  },
  {
    tag: "表达",
    label: "把读书笔记做成一篇有观点的文章",
    goal: "根据我的读书笔记，写一篇有个人观点的文章：开头提出问题，中间用 3 个观点展开，结尾留下值得讨论的问题",
    hint: "笔记 → 结构 → 成文",
  },
  {
    tag: "二创",
    label: "参考一条视频做自己的同款表达",
    goal: "根据参考链接拆解开头、节奏和分镜，做一条版权安全的同款短视频，保留表达逻辑但使用自己的素材和观点",
    hint: "链接 → 结构 → 成片",
  },
];

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}

/**
 * Layout is CSS-only (media queries). Headline index + font-fit run in
 * useLayoutEffect before paint to avoid refresh flash.
 */
export function HomeHero() {
  const router = useRouter();
  const [mode, setMode] = useState<HomeMode>("search");
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [headlineVisible, setHeadlineVisible] = useState(false);
  const [goal, setGoal] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [socialHint, setSocialHint] = useState<string | null>(null);
  const [needsSocialUpload, setNeedsSocialUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  useLayoutEffect(() => {
    const key = "nexa-home-headline";
    const prev = Number(sessionStorage.getItem(key) ?? "-1");
    const next = (Number.isFinite(prev) ? prev + 1 : 0) % HEADLINES.length;
    sessionStorage.setItem(key, String(next));
    setHeadlineIndex(next);

    const el = headlineRef.current;
    const fit = () => {
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const maxWidth = parent.clientWidth;
      if (maxWidth <= 0) return;

      const w = window.innerWidth;
      if (w < 390) {
        el.style.whiteSpace = "normal";
        el.style.fontSize = "22px";
        return;
      }

      const maxPx = w >= 768 ? 32 : w >= 640 ? 28 : 24;
      const minPx = 18;
      let size = maxPx;
      el.style.whiteSpace = "nowrap";
      el.style.fontSize = `${size}px`;
      while (size > minPx && el.scrollWidth > maxWidth) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };

    // Write final headline into DOM immediately so fit uses the right width
    if (el) el.textContent = HEADLINES[next];
    fit();
    setHeadlineVisible(true);

    const parent = el?.parentElement;
    const ro = parent ? new ResizeObserver(fit) : null;
    if (parent) ro?.observe(parent);
    window.addEventListener("resize", fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  useLayoutEffect(() => {
    return () => {
      filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (!next.length) {
      setError("请上传图片或视频文件");
      return;
    }
    setError(null);
    setNeedsSocialUpload(false);
    setFiles((prev) => [...prev, ...next].slice(0, 8));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = goal.trim();
    const social = detectSocialLink(trimmed);

    if (!trimmed && files.length === 0) {
      setError("请上传素材，或输入制作指令 / 粘贴抖音、小红书链接");
      return;
    }

    // Social recreate path
    if (social) {
      setSubmitting(true);
      setError(null);
      setSocialHint(null);
      try {
        const assetIds: string[] = [];
        for (const item of files) {
          const form = new FormData();
          form.append("file", item.file);
          const uploadRes = await fetch("/api/assets", {
            method: "POST",
            body: form,
          });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            throw new Error(uploadData.error ?? "素材上传失败");
          }
          if (uploadData.asset?.id) assetIds.push(uploadData.asset.id);
        }

        const ingestRes = await fetch("/api/create/social-ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Full share paste so caption / 【标题】 can be extracted
            url: trimmed,
            mediaAssetCount: assetIds.length,
          }),
        });
        const ingest = (await ingestRes.json()) as SocialIngestResult & {
          error?: string;
        };
        if (!ingestRes.ok) {
          throw new Error(ingest.error ?? "链接解析失败");
        }

        if (ingest.needsUpload) {
          setNeedsSocialUpload(true);
        } else {
          setNeedsSocialUpload(false);
        }
        setSocialHint(
          [
            ingest.reason,
            ingest.parseStatus === "failed"
              ? "（未能解析到视频正文元数据）"
              : ingest.parseStatus === "partial"
                ? "（仅部分元数据）"
                : null,
          ]
            .filter(Boolean)
            .join(" ")
        );

        const brief = buildCopyrightSafeBrief({
          platformLabel: ingest.platformLabel,
          url: ingest.url,
          title: ingest.title,
          referenceCaption: ingest.briefSnippet,
          outputKind: "video",
          author: ingest.author,
          topics: ingest.topics,
          structureHints: ingest.structureHints,
          parseStatus: ingest.parseStatus,
        });

        const res = await fetch("/api/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goal: `根据参考做版权安全的同款二创（${ingest.platformLabel}）：${ingest.url}`,
            title: ingest.title
              ? `同款二创 · ${ingest.title.slice(0, 28)}`
              : `同款二创 · ${ingest.platformLabel}`,
            contentType: "short_video",
            platform: ingest.platform,
            startMode: "link",
            linkUrl: ingest.url,
            assetIds,
            brief,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "创建失败");
        router.push(`/create/${data.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建失败，请稍后再试");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!trimmed) {
      setError("请告诉我要做成什么");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNeedsSocialUpload(false);
    setSocialHint(null);
    try {
      const assetIds: string[] = [];
      for (const item of files) {
        const form = new FormData();
        form.append("file", item.file);
        const uploadRes = await fetch("/api/assets", { method: "POST", body: form });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error ?? "素材上传失败");
        }
        if (uploadData.asset?.id) assetIds.push(uploadData.asset.id);
      }

      const hasVideo = files.some((f) => f.file.type.startsWith("video/"));
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: trimmed,
          contentType: hasVideo ? "short_video" : "social_post",
          platform: "xiaohongshu",
          startMode: assetIds.length ? "assets" : "idea",
          assetIds: assetIds.length ? assetIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      router.push(`/create/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  const socialDetected = Boolean(detectSocialLink(goal));
  const createPlaceholder = socialDetected
    ? CREATE_LINK_PLACEHOLDER
    : CREATE_PLACEHOLDER;

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center bg-[var(--nexa-bg)]",
        // Center whenever height allows; only top-align on short viewports
        // (was: justify-start below md → tablet/half-window looked “stuck up”)
        "justify-center px-3.5 py-5",
        "min-[390px]:px-4 min-[390px]:py-6",
        "md:px-5 md:py-8 lg:px-8",
        "[@media(max-height:640px)]:justify-start [@media(max-height:640px)]:py-5"
      )}
    >
      <div
        className={cn(
          "w-full max-w-[640px]",
          "max-[389px]:max-w-none",
          // Slight optical lift on tall screens only
          "-translate-y-[1.5vh] [@media(max-height:700px)]:translate-y-0"
        )}
      >
        <header className="mb-4 w-full text-center min-[390px]:mb-5 md:mb-6 lg:mb-7">
          <h1
            ref={headlineRef}
            suppressHydrationWarning
            className={cn(
              "mx-auto min-h-[1.3em] font-semibold tracking-[-0.03em] text-zinc-900",
              "text-[22px] leading-[1.25] max-[389px]:max-w-[16em]",
              "min-[390px]:text-[24px] min-[390px]:leading-none min-[390px]:whitespace-nowrap",
              "sm:text-[28px] md:text-[32px]",
              "transition-opacity duration-150",
              headlineVisible ? "opacity-100" : "opacity-0"
            )}
          >
            {HEADLINES[headlineIndex]}
          </h1>
        </header>

        <div className="mb-4 flex justify-stretch min-[390px]:justify-center md:mb-5 lg:mb-6">
          <div
            role="tablist"
            aria-label="首页模式"
            className="grid w-full grid-cols-2 rounded-full bg-zinc-100/70 p-1 min-[390px]:inline-flex min-[390px]:w-auto"
          >
            {(
              [
                { id: "search", label: "全网检索" },
                { id: "create", label: "智能创作" },
              ] as const
            ).map((item) => {
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setMode(item.id);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-full px-3 py-2.5 text-[13px] outline-none transition-colors duration-200",
                    "min-[390px]:px-4 min-[390px]:py-2 md:px-5 md:text-[14px]",
                    active
                      ? "bg-white font-medium text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "font-normal text-zinc-500 hover:text-zinc-700"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative h-12 w-full min-[390px]:h-14">
          {mode === "search" ? (
            <SearchInput
              size="large"
              forceSearch
              showSubmit
              submitLabel="开始"
              placeholder={SEARCH_PLACEHOLDER}
              className="h-full"
            />
          ) : (
            <form onSubmit={handleCreateSubmit} className="h-full w-full">
              {files.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2.5 flex flex-wrap gap-2">
                  {files.map((item) => (
                    <div
                      key={item.id}
                      className="group relative h-9 w-9 overflow-hidden rounded-lg bg-zinc-100 sm:h-10 sm:w-10"
                    >
                      {item.file.type.startsWith("video/") ? (
                        <video
                          src={item.previewUrl}
                          className="h-full w-full object-cover"
                          muted
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="移除素材"
                      >
                        <X className="h-2.5 w-2.5" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={cn(
                  "flex h-full w-full items-center gap-2 border bg-white px-2.5 transition-colors duration-200",
                  "rounded-xl min-[390px]:gap-2.5 min-[390px]:rounded-2xl min-[390px]:px-3 sm:gap-3 sm:px-4",
                  focused ? "border-zinc-300" : "border-zinc-200/90"
                )}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors min-[390px]:h-9 min-[390px]:w-9",
                    needsSocialUpload || socialDetected
                      ? "border border-zinc-900 bg-zinc-50 text-zinc-900 ring-2 ring-zinc-900/15"
                      : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                  )}
                  aria-label="上传图片或视频"
                >
                  <ImagePlus className="h-4 w-4 min-[390px]:h-[18px] min-[390px]:w-[18px]" strokeWidth={1.75} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    if (!detectSocialLink(e.target.value)) {
                      setNeedsSocialUpload(false);
                      setSocialHint(null);
                    }
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder={createPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[14px] leading-normal text-zinc-900 outline-none placeholder:text-zinc-400 min-[390px]:text-[15px] sm:text-[16px]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 font-medium text-white transition-opacity disabled:opacity-50 md:h-9 md:w-auto md:rounded-xl md:px-4 md:text-[13px]"
                  aria-label="开始"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 md:hidden" strokeWidth={2} />
                      <span className="hidden md:inline">开始</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {mode === "create" && socialHint && (
          <p className="mt-3 text-center text-[13px] leading-relaxed text-amber-700">
            {socialHint}
          </p>
        )}

        {error && (
          <p className="mt-3 text-center text-[13px] text-red-600">{error}</p>
        )}

        <section className="mt-6 min-[390px]:mt-7 md:mt-8 lg:mt-9 md:[@media(max-height:640px)]:mt-5">
          <p className="mb-1 text-[10px] text-zinc-400 min-[390px]:mb-1.5 min-[390px]:text-[11px]">
            {mode === "search" ? "大家都在问" : "常见创作"}
          </p>

          {mode === "search" ? (
            <ul className="border-t border-zinc-100/80 divide-y divide-zinc-100/80 max-[389px]:divide-y-0">
              {SEARCH_SUGGESTIONS.map((item, i) => (
                <li
                  key={item.tag}
                  className={cn(
                    "max-[389px]:border-b max-[389px]:border-zinc-100/80",
                    i >= 2 &&
                      "max-md:[@media(max-height:640px)]:hidden"
                  )}
                >
                  <Link
                    href={item.href}
                    className="group flex flex-col gap-0.5 py-2.5 transition-colors min-[390px]:flex-row min-[390px]:items-center min-[390px]:gap-3 min-[390px]:py-2"
                  >
                    <span className="shrink-0 text-[10px] text-zinc-400 group-hover:text-zinc-500 min-[390px]:w-7 min-[390px]:text-[11px]">
                      {item.tag}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-500 group-hover:text-zinc-800 min-[390px]:truncate">
                      {item.query}
                    </span>
                    {"hint" in item && item.hint ? (
                      <span className="hidden shrink-0 text-[10px] text-zinc-300 sm:inline">
                        {item.hint}
                      </span>
                    ) : null}
                    <ArrowRight className="hidden h-3 w-3 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 min-[390px]:block" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-zinc-100/80 border-t border-zinc-100/80">
              {CREATE_SUGGESTIONS.map((item, i) => (
                <li
                  key={item.label}
                  className={cn(
                    i >= 2 &&
                      "max-md:[@media(max-height:640px)]:hidden"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setGoal(item.goal)}
                    className="group flex w-full flex-col gap-0.5 py-2.5 text-left transition-colors min-[390px]:flex-row min-[390px]:items-center min-[390px]:gap-3 min-[390px]:py-2"
                  >
                    <span className="shrink-0 text-[10px] text-zinc-400 group-hover:text-zinc-500 min-[390px]:w-9 min-[390px]:text-[11px]">
                      {item.tag}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-zinc-500 group-hover:text-zinc-800 min-[390px]:truncate">
                      {item.label}
                    </span>
                    {item.hint ? (
                      <span className="hidden shrink-0 text-[10px] text-zinc-300 sm:inline">
                        {item.hint}
                      </span>
                    ) : null}
                    <ArrowRight className="hidden h-3 w-3 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500 min-[390px]:block" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
