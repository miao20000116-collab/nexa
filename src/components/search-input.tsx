"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { buildEntryPath } from "@/modules/intent/entry-router";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  defaultValue?: string;
  workspaceId?: string | null;
  size?: "default" | "large";
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  /** When true, always route to /search (ignore create/research intent). */
  forceSearch?: boolean;
  showSubmit?: boolean;
  submitLabel?: string;
}

export function SearchInput({
  defaultValue = "",
  workspaceId = null,
  size = "default",
  autoFocus = false,
  className,
  placeholder = "搜索、研究、创作，或者直接告诉 Nexa 你的目标……",
  forceSearch = false,
  showSubmit = false,
  submitLabel = "开始",
}: SearchInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (forceSearch || pathname.startsWith("/search")) {
      const params = new URLSearchParams({ q: trimmed });
      if (workspaceId) params.set("workspaceId", workspaceId);
      router.push(`/search?${params.toString()}`);
      return;
    }

    if (pathname === "/") {
      router.push(buildEntryPath(trimmed));
      return;
    }

    const params = new URLSearchParams({ q: trimmed });
    if (workspaceId) params.set("workspaceId", workspaceId);
    router.push(`/search?${params.toString()}`);
  };

  const isLarge = size === "large";

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <div
        className={cn(
          "flex h-full items-center border bg-white transition-colors duration-200",
          isLarge
            ? "gap-2 rounded-xl px-2.5 min-[390px]:gap-2.5 min-[390px]:rounded-2xl min-[390px]:px-3 sm:gap-3 sm:px-5"
            : "h-[48px] gap-2.5 rounded-xl px-4",
          focused ? "border-zinc-300" : "border-zinc-200/90"
        )}
      >
        {!showSubmit && (
          <Search
            className={cn(
              "shrink-0 text-zinc-400",
              isLarge ? "h-[18px] w-[18px]" : "h-4 w-4"
            )}
            strokeWidth={1.75}
          />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-zinc-900 outline-none placeholder:text-zinc-400",
            isLarge
              ? "text-[14px] leading-normal placeholder:text-[14px] min-[390px]:text-[15px] min-[390px]:placeholder:text-[15px] sm:text-[16px] sm:placeholder:text-[16px]"
              : "text-[15px] leading-normal"
          )}
        />
        {showSubmit && (
          <button
            type="submit"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 font-medium text-white md:h-9 md:w-auto md:rounded-xl md:px-4 md:text-[13px]"
            aria-label={submitLabel}
          >
            <ArrowRight className="h-4 w-4 md:hidden" strokeWidth={2} />
            <span className="hidden md:inline">{submitLabel}</span>
          </button>
        )}
      </div>
    </form>
  );
}
