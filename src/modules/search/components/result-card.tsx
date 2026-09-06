"use client";

import { useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@/modules/search/types";
import { extractDomain, getProxiedImageUrl } from "@/lib/utils";
import { formatDateZh } from "@/lib/format";
import { getOpenHref, getOpenLabel, isExternalOpenHref } from "@/lib/read/open-url";
import {
  BookOpen,
  Check,
  Clapperboard,
  FolderPlus,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import {
  buildRecreateCreateHref,
  isSocialRecreateUrl,
  platformFromSocialUrl,
} from "@/modules/create/lib/recreate-copyright";

interface ResultCardProps {
  result: SearchResult;
  onToggleWorkspace?: (resultId: string) => void;
  isInWorkspace?: boolean;
  onCreateFromReference?: (resultId: string) => void;
  isReferenceBusy?: boolean;
}

function RecreateActions({
  url,
  title,
}: {
  url: string;
  title?: string | null;
}) {
  if (!isSocialRecreateUrl(url)) return null;
  const platform = platformFromSocialUrl(url) ?? undefined;
  const titleText = title ?? undefined;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Link
        href={buildRecreateCreateHref({
          url,
          title: titleText,
          output: "video",
          platform,
        })}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
      >
        <Clapperboard className="h-3.5 w-3.5" />
        作为视频参考
      </Link>
      <Link
        href={buildRecreateCreateHref({
          url,
          title: titleText,
          output: "image",
          platform,
        })}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        作为图片参考
      </Link>
    </div>
  );
}

export function KnowledgeCard({
  result,
  onToggleWorkspace,
  isInWorkspace,
}: ResultCardProps) {
  const openHref = getOpenHref(result.url);
  const external = isExternalOpenHref(openHref);
  return (
    <article className="mb-5 border-b border-zinc-100 pb-5">
      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-zinc-400">
        <BookOpen className="h-3.5 w-3.5" />
        <span>维基百科</span>
      </div>
      <a
        href={openHref}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="nexa-result-title"
      >
        {result.title}
      </a>
      {result.content && (
        <p className="nexa-result-snippet mt-1.5 line-clamp-3">{result.content}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={openHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="text-[13px] text-[var(--nexa-link)] hover:underline"
        >
          {getOpenLabel(result.url)} →
        </a>
        {onToggleWorkspace && (
          <WorkspaceAction
            onClick={() => onToggleWorkspace(result.id)}
            isInWorkspace={isInWorkspace}
          />
        )}
      </div>
    </article>
  );
}

export function WebResultItem({
  result,
  onToggleWorkspace,
  isInWorkspace,
}: ResultCardProps) {
  const domain = extractDomain(result.url);
  const openHref = getOpenHref(result.url);
  const external = isExternalOpenHref(openHref);

  return (
    <article className="group rounded-lg py-3.5 transition-colors hover:bg-zinc-50/80">
      <div className="mb-0.5 flex items-center gap-1.5">
        {result.favicon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.favicon} alt="" className="h-3.5 w-3.5 rounded-sm" />
        )}
        <a
          href={openHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="nexa-result-url truncate hover:underline"
        >
          {domain}
        </a>
        {result.publishedAt && (
          <span className="nexa-result-meta shrink-0">
            · {formatDateZh(result.publishedAt)}
          </span>
        )}
      </div>
      <a
        href={openHref}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="nexa-result-title"
      >
        {result.title ?? result.url}
      </a>
      {result.snippet && (
        <p className="nexa-result-snippet mt-1 line-clamp-2">{result.snippet}</p>
      )}
      {onToggleWorkspace && (
        <div className="mt-1.5">
          <WorkspaceAction
            onClick={() => onToggleWorkspace(result.id)}
            isInWorkspace={isInWorkspace}
          />
        </div>
      )}
      <RecreateActions url={result.url} title={result.title} />
    </article>
  );
}

export function YouTubeResultItem({
  result,
  onToggleWorkspace,
  isInWorkspace,
  onCreateFromReference,
  isReferenceBusy,
}: ResultCardProps) {
  const openHref = getOpenHref(result.url);
  const external = isExternalOpenHref(openHref);
  const sourceName = result.source ?? "视频";
  return (
    <article className="group flex gap-4 rounded-lg py-3.5 transition-colors hover:bg-zinc-50/80">
      <a
        href={openHref}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="relative shrink-0 overflow-hidden rounded-md ring-1 ring-zinc-100"
      >
        {result.thumbnail ? (
          <ProxiedImg
            src={result.thumbnail}
            alt={result.title ?? ""}
            className="aspect-video w-44 object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex aspect-video w-44 items-center justify-center bg-zinc-100">
            <Video className="h-8 w-8 text-zinc-300" />
          </div>
        )}
        {result.metrics?.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] text-white">
            {result.metrics.duration}
          </span>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] text-zinc-400">
          <Video className="h-3.5 w-3.5" />
          <span>{sourceName}</span>
        </div>
        <a
          href={openHref}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="nexa-result-title line-clamp-2"
        >
          {result.title || result.url}
        </a>
        {result.snippet && (
          <p className="nexa-result-snippet mt-1 line-clamp-2">{result.snippet}</p>
        )}
        {result.author && (
          <p className="mt-1 text-[13px] text-zinc-500">{result.author}</p>
        )}
        {result.publishedAt && (
          <p className="mt-0.5 text-[12px] text-zinc-400">
            {formatDateZh(result.publishedAt)}
          </p>
        )}
        {onToggleWorkspace && (
          <div className="mt-2">
            <WorkspaceAction
              onClick={() => onToggleWorkspace(result.id)}
              isInWorkspace={isInWorkspace}
            />
          </div>
        )}
        {onCreateFromReference && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => onCreateFromReference(result.id)}
              disabled={isReferenceBusy}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:text-zinc-300"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              {isReferenceBusy ? "正在解析参考…" : "带入工作区做视频"}
            </button>
          </div>
        )}
        <RecreateActions url={result.url} title={result.title} />
      </div>
    </article>
  );
}

export function SocialResultItem({
  result,
  onToggleWorkspace,
  isInWorkspace,
}: ResultCardProps) {
  const labels: Record<string, string> = {
    x: "X",
    reddit: "Reddit",
    xiaohongshu: "小红书",
    tiktok: "TikTok",
  };
  const platformLabel = result.source ?? labels[result.platform] ?? result.platform;
  const metrics = [
    result.metrics?.likes != null ? `${result.metrics.likes} 赞` : null,
    result.metrics?.comments != null ? `${result.metrics.comments} 评论` : null,
  ].filter(Boolean);
  const openHref = getOpenHref(result.url);
  const external = isExternalOpenHref(openHref);

  return (
    <article className="group rounded-lg py-3.5 transition-colors hover:bg-zinc-50/80">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">
          {platformLabel}
        </span>
        {result.author && (
          <span className="nexa-result-meta">{result.author}</span>
        )}
        {result.publishedAt && (
          <span className="nexa-result-meta">
            · {formatDateZh(result.publishedAt)}
          </span>
        )}
      </div>
      <a
        href={openHref}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="nexa-result-title text-[16px]"
      >
        {result.title ?? result.snippet}
      </a>
      {result.snippet && result.title && (
        <p className="nexa-result-snippet mt-1 line-clamp-3">{result.snippet}</p>
      )}
      {metrics.length > 0 && (
        <p className="mt-1.5 text-[12px] text-zinc-400">{metrics.join(" · ")}</p>
      )}
      {onToggleWorkspace && (
        <div className="mt-1.5">
          <WorkspaceAction
            onClick={() => onToggleWorkspace(result.id)}
            isInWorkspace={isInWorkspace}
          />
        </div>
      )}
      <RecreateActions url={result.url} title={result.title} />
    </article>
  );
}

export function ImageResultCard({
  result,
  onToggleWorkspace,
  isInWorkspace,
}: Pick<ResultCardProps, "result" | "onToggleWorkspace" | "isInWorkspace">) {
  const openHref = getOpenHref(result.url);
  const external = isExternalOpenHref(openHref);
  const thumb = getProxiedImageUrl(result.thumbnail) ?? result.thumbnail;
  return (
    <article
      className="group block overflow-hidden rounded-lg ring-1 ring-zinc-100 transition hover:ring-zinc-300"
    >
      <a
        href={openHref}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="block"
      >
        <div className="relative aspect-square bg-zinc-50">
          {thumb ? (
            <ProxiedImg
              src={result.thumbnail!}
              alt={result.title ?? ""}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-zinc-200" />
            </div>
          )}
        </div>
        {result.title && (
          <p className="line-clamp-2 px-1.5 py-1.5 text-[12px] leading-snug text-zinc-600 group-hover:text-[var(--nexa-link)]">
            {result.title}
          </p>
        )}
      </a>
      {onToggleWorkspace && (
        <span className="block px-1.5 pb-1.5">
          <WorkspaceAction
            onClick={() => onToggleWorkspace(result.id)}
            isInWorkspace={isInWorkspace}
          />
        </span>
      )}
    </article>
  );
}

function ProxiedImg({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const proxied = getProxiedImageUrl(src) ?? src;
  const [current, setCurrent] = useState(proxied);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-50 ${className ?? ""}`}
      >
        <ImageIcon className="h-8 w-8 text-zinc-200" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={className}
      onError={() => {
        // 代理失败时回退原图，仍能直接显示对应内容
        if (current !== src) {
          setCurrent(src);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function WorkspaceAction({
  onClick,
  isInWorkspace,
}: {
  onClick: () => void;
  isInWorkspace?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium transition-colors ${
        isInWorkspace
          ? "bg-emerald-50 text-emerald-700"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
      }`}
    >
      {isInWorkspace ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <FolderPlus className="h-3.5 w-3.5" />
      )}
      {isInWorkspace ? "已加入 AI 工作区" : "加入 AI 工作区"}
    </button>
  );
}

export function SearchResultItem(props: ResultCardProps) {
  const { result } = props;

  if (result.platform === "wikipedia") {
    return <KnowledgeCard {...props} />;
  }
  if (result.platform === "youtube" || result.sourceType === "video") {
    return <YouTubeResultItem {...props} />;
  }
  if (["x", "reddit", "xiaohongshu", "tiktok"].includes(result.platform)) {
    return <SocialResultItem {...props} />;
  }
  return <WebResultItem {...props} />;
}
