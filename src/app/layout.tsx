import type { Metadata } from "next";
import { Noto_Sans_SC, Geist_Mono } from "next/font/google";
import { Navigation } from "@/components/navigation";
import { ToastHost } from "@/components/ui";
import { AiWorkbench } from "@/modules/ai-workbench/components/ai-workbench";
import { WorkspaceProvider } from "@/contexts/workspace-context";
import "./globals.css";

/** Common Chinese UI font — closer to Baidu / mainstream sites than Geist. */
const notoSansSc = Noto_Sans_SC({
  variable: "--font-nexa-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexa",
  description: "你的 AI 搜索与创作引擎",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSc.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--nexa-bg)] text-[var(--nexa-fg)]">
        <WorkspaceProvider>
          <Navigation />
          <main className="flex flex-1 flex-col">{children}</main>
          <AiWorkbench />
          <ToastHost />
        </WorkspaceProvider>
      </body>
    </html>
  );
}
