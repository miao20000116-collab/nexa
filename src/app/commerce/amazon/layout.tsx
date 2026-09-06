import type { ReactNode } from "react";
import { CommercePlatformChrome } from "@/modules/commerce/components/commerce-platform-chrome";

export default function AmazonCommerceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CommercePlatformChrome platform="amazon">{children}</CommercePlatformChrome>
  );
}
