import type { ReactNode } from "react";
import { CommercePlatformChrome } from "@/modules/commerce/components/commerce-platform-chrome";

export default function TikTokCommerceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CommercePlatformChrome platform="tiktok">{children}</CommercePlatformChrome>
  );
}
