"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AccountUser, SessionView, SessionWithTier, TierCapabilitiesView } from "@/modules/account/types";
import {
  GUEST_ALLOWED,
  LOGIN_REQUIRED_LABELS,
} from "@/modules/account/types";
import { googleOAuthConfigured } from "@/modules/account/auth/client-config";
import { getUserTier } from "@/modules/account/permissions/tier-policy";
import {
  TierBadge,
  TierCapabilitiesPanel,
} from "@/modules/account/components/tier-badge";
import { PageHeader } from "@/components/ui/hierarchy";

export function useSession() {
  const [session, setSession] = useState<SessionWithTier | null>(null);
  const [tier, setTier] = useState<TierCapabilitiesView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/auth/session");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as SessionWithTier;
        setSession(data);
        setTier(data.tier ?? null);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const refresh = async () => {
    const res = await fetch("/api/auth/session");
    if (res.ok) {
      const data = (await res.json()) as SessionWithTier;
      setSession(data);
      setTier(data.tier ?? null);
    }
  };

  return { session, tier, setSession, refresh };
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const googleReady = googleOAuthConfigured();

  const loginEmail = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "登录失败");
        return;
      }
      router.push(redirectTo || "/account");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const loginGoogle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (!res.ok || !data.authorizeUrl) {
        setMessage(data.message ?? "Google 登录暂未配置。V1 请使用邮箱登录。");
        return;
      }
      window.location.href = data.authorizeUrl as string;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[420px] space-y-5">
      <div>
        <label className="mb-1.5 block text-[12px] text-zinc-500">邮箱</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-[14px] outline-none focus:border-zinc-300"
        />
      </div>
      <button
        type="button"
        disabled={busy || !email.trim()}
        onClick={() => void loginEmail()}
        className="w-full rounded-lg bg-zinc-900 px-3 py-2.5 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
      >
        {busy ? "登录中…" : "邮箱登录"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void loginGoogle()}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-[14px] text-zinc-800 hover:bg-zinc-50 disabled:opacity-40"
      >
        Google 登录
      </button>
      {!googleReady && (
        <p className="text-[12px] text-zinc-400">
          Google 登录需后台配置 Client ID；未配置时可使用邮箱登录。不含企业
          SSO / 微信 / 手机号。
        </p>
      )}
      {message && <p className="text-[13px] text-zinc-600">{message}</p>}
    </div>
  );
}

export function AccountHomeClient() {
  const { session, refresh } = useSession();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refresh();
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  if (!session) {
    return (
      <div className="mx-auto max-w-[820px] px-[var(--nexa-page-pad-x)] py-10 text-[14px] text-zinc-400">
        正在加载…
      </div>
    );
  }

  const user = session.user;
  const tier = getUserTier(user);

  return (
    <div className="mx-auto w-full max-w-[820px] px-[var(--nexa-page-pad-x)] py-10">
      <PageHeader
        title="账户"
        description="设置与额度。无需填写 API Key。"
      />

      <section className="mt-2 border-b border-zinc-100 pb-6">
        {session.authenticated && user ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[20px] font-semibold tracking-tight text-zinc-900">
                  {user.name || user.email}
                </p>
                <TierBadge tier={tier} />
              </div>
              <p className="mt-1 text-[13px] text-zinc-500">
                {user.email}
                {user.authProvider ? ` · ${user.authProvider}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void logout()}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            >
              {loggingOut ? "退出中…" : "退出登录"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[20px] font-semibold text-zinc-900">访客模式</p>
            <p className="mt-1 text-[13px] text-zinc-500">
              可搜索、临时工作区、体验 Commerce Demo。
            </p>
            <Link
              href="/account/login"
              className="mt-4 inline-block rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              登录
            </Link>
          </div>
        )}
      </section>

      {session.authenticated && <TierCapabilitiesPanel tier={tier} />}

      <section className="mt-8 space-y-1">
        <p className="mb-3 text-[12px] font-medium tracking-wide text-zinc-400">
          设置
        </p>
        {[
          {
            href: "/account/credits",
            title: "Credits",
            desc: "余额与流水",
          },
          {
            href: "/account/memory",
            title: "用户记忆",
            desc: "长期偏好，创作自动读取",
          },
          {
            href: "/account/connections",
            title: "连接中心",
            desc: "平台与 Commerce 连接",
          },
          {
            href: "/account/privacy",
            title: "数据与隐私",
            desc: "保存范围说明",
          },
          {
            href: "/account/login",
            title: session.authenticated ? "切换账号" : "登录",
            desc: "邮箱 / Google",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-baseline justify-between gap-4 border-b border-zinc-50 py-3.5 hover:bg-zinc-50/50"
          >
            <span className="text-[15px] font-medium text-zinc-900">
              {item.title}
            </span>
            <span className="text-[13px] text-zinc-500">{item.desc}</span>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <p className="mb-2 text-[12px] font-medium text-zinc-400">访客可用</p>
        <p className="text-[13px] text-zinc-600">
          {GUEST_ALLOWED.map((k) => {
            const map: Record<string, string> = {
              search: "搜索",
              view_results: "查看真实结果",
              temp_workspace: "临时 Workspace",
              create: "创作",
              publish_preview: "发布预览",
              commerce_demo: "Commerce Demo",
            };
            return map[k] ?? k;
          }).join(" · ")}
        </p>
        <p className="mb-2 mt-4 text-[12px] font-medium text-zinc-400">
          需要登录
        </p>
        <p className="text-[13px] text-zinc-600">
          {Object.values(LOGIN_REQUIRED_LABELS).join(" · ")}
        </p>
      </section>
    </div>
  );
}

export function LoginGateBanner({
  feature,
}: {
  feature: keyof typeof LOGIN_REQUIRED_LABELS;
}) {
  const { session } = useSession();
  if (!session || session.authenticated) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      「{LOGIN_REQUIRED_LABELS[feature]}」需要登录。
      <Link href="/account/login" className="ml-2 underline">
        去登录
      </Link>
    </div>
  );
}

export type { AccountUser };
