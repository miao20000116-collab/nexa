"use client";

import { useState } from "react";
import type { CreationPack } from "@/modules/workspace/services/creation-pack";
import {
  formatNarrationForCopy,
  formatShotPromptsForCopy,
  sourceLabel,
} from "@/modules/workspace/services/creation-pack";

type Props = {
  label: string;
  notes: string;
  pack: CreationPack | null;
  rawText: string;
  onUseForCreate: () => void;
  createBusy?: boolean;
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ExtractResultPanel({
  label,
  notes,
  pack,
  rawText,
  onUseForCreate,
  createBusy,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const flash = (key: string) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const hasPack = Boolean(pack && (pack.shots.length > 0 || pack.narration));

  return (
    <div className="mb-2 space-y-4 rounded-lg bg-zinc-50/80 px-4 py-3">
      <p className="text-[12px] font-medium tracking-wide text-zinc-400">
        {label}
      </p>

      {notes ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-zinc-500">
            研究笔记
          </p>
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
            {notes}
          </div>
        </div>
      ) : null}

      {hasPack && pack ? (
        <div className="space-y-3 border-t border-zinc-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-zinc-500">创作包</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50"
                onClick={async () => {
                  const ok = await copyText(formatNarrationForCopy(pack));
                  if (ok) flash("narration");
                }}
              >
                {copied === "narration" ? "已复制口播" : "复制全部口播"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50"
                onClick={async () => {
                  const ok = await copyText(formatShotPromptsForCopy(pack));
                  if (ok) flash("prompts");
                }}
              >
                {copied === "prompts" ? "已复制 Prompt" : "复制分镜 Prompt"}
              </button>
              <button
                type="button"
                disabled={createBusy}
                className="rounded-lg bg-zinc-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                onClick={onUseForCreate}
              >
                {createBusy ? "正在打开创作…" : "用于创作"}
              </button>
            </div>
          </div>

          {pack.hook ? (
            <p className="text-[14px] text-zinc-700">
              <span className="text-zinc-400">钩子 · </span>
              {pack.hook}
            </p>
          ) : null}

          {pack.narration ? (
            <div>
              <p className="mb-1 text-[12px] text-zinc-400">完整口播</p>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                {pack.narration}
              </p>
            </div>
          ) : null}

          {(pack.styleNotes || pack.musicMood) && (
            <p className="text-[13px] text-zinc-500">
              {[pack.styleNotes && `风格：${pack.styleNotes}`, pack.musicMood && `配乐：${pack.musicMood}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          <ul className="space-y-2.5">
            {pack.shots.map((shot, i) => (
              <li
                key={`${i}-${shot.description.slice(0, 12)}`}
                className="rounded-lg border border-zinc-100 bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium text-zinc-900">
                    镜头 {i + 1}
                    <span className="ml-2 text-[12px] font-normal text-zinc-400">
                      约 {shot.durationSec}s · {sourceLabel(shot.source)}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="text-[12px] text-zinc-500 underline-offset-2 hover:underline"
                    onClick={async () => {
                      const ok = await copyText(shot.imagePrompt);
                      if (ok) flash(`shot-${i}`);
                    }}
                  >
                    {copied === `shot-${i}` ? "已复制" : "复制 Prompt"}
                  </button>
                </div>
                {shot.description ? (
                  <p className="mt-1.5 text-[13px] text-zinc-700">
                    {shot.description}
                  </p>
                ) : null}
                {shot.narration ? (
                  <p className="mt-1 text-[13px] text-zinc-600">
                    旁白：{shot.narration}
                  </p>
                ) : null}
                {shot.subtitle ? (
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    字幕：{shot.subtitle}
                  </p>
                ) : null}
                {shot.imagePrompt ? (
                  <p className="mt-1.5 line-clamp-2 text-[12px] text-zinc-400">
                    Prompt：{shot.imagePrompt}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
          {!notes ? rawText : null}
          {notes && !hasPack ? (
            <p className="mt-3 text-[13px] text-zinc-500">
              本次未解析出结构化创作包，可再点一次「提取要点」，或基于上方笔记手动创作。
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
