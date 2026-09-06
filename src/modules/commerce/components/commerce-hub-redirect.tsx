"use client";

import { useEffect } from "react";

/** Client redirect so hash anchors survive (server redirect drops #). */
export function CommerceHubRedirect({
  href,
}: {
  href: string;
}) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);

  return (
    <p className="py-16 text-center text-[14px] text-zinc-400">正在打开模块…</p>
  );
}
