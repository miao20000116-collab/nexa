import { cookies } from "next/headers";
import { prisma, isDatabaseAvailable } from "@/lib/db";
import {
  fileCreateSession,
  fileDeleteSession,
  fileGetSession,
  fileGetUserByEmail,
  fileGetUserById,
  fileUpsertUser,
} from "@/lib/account/file-store";
import type { AccountUser, SessionView } from "@/modules/account/types";
import {
  getDemoAccountByEmail,
  getDemoAccountByTier,
  type DemoTier,
} from "@/modules/account/permissions/demo-accounts";

export const SESSION_COOKIE = "nexa_session";

function mapUser(row: {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  authProvider?: string | null;
  createdAt: Date | string;
}): AccountUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    authProvider: (row.authProvider as AccountUser["authProvider"]) ?? null,
    createdAt:
      typeof row.createdAt === "string"
        ? row.createdAt
        : row.createdAt.toISOString(),
  };
}

export async function getSession(): Promise<SessionView> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { authenticated: false, user: null, isGuest: true };
  }

  if (await isDatabaseAvailable()) {
    try {
      const db = prisma as unknown as {
        authSession: {
          findUnique: (args: unknown) => Promise<{
            token: string;
            userId: string;
            expiresAt: Date;
            user: {
              id: string;
              email: string | null;
              name: string | null;
              avatarUrl: string | null;
              role: string;
              authProvider: string | null;
              createdAt: Date;
            };
          } | null>;
          delete: (args: unknown) => Promise<unknown>;
        };
      };
      const session = await db.authSession.findUnique({
        where: { token },
        include: { user: true },
      });
      if (!session || session.expiresAt.getTime() < Date.now()) {
        if (session) {
          await db.authSession.delete({ where: { token } }).catch(() => null);
        }
        return { authenticated: false, user: null, isGuest: true };
      }
      return {
        authenticated: true,
        user: mapUser(session.user),
        isGuest: false,
      };
    } catch {
      /* fallback */
    }
  }

  const session = await fileGetSession(token);
  if (!session) {
    return { authenticated: false, user: null, isGuest: true };
  }
  const user = await fileGetUserById(session.userId);
  if (!user) {
    return { authenticated: false, user: null, isGuest: true };
  }
  return {
    authenticated: true,
    user: mapUser(user),
    isGuest: false,
  };
}

async function createDbSession(userId: string, token: string, expiresAt: Date) {
  const db = prisma as unknown as {
    authSession: {
      create: (args: unknown) => Promise<unknown>;
    };
  };
  await db.authSession.create({
    data: { userId, token, expiresAt },
  });
}

export async function loginWithEmail(emailRaw: string): Promise<{
  ok: boolean;
  message: string;
  user?: AccountUser;
  token?: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "请输入有效的邮箱地址" };
  }

  const demo = getDemoAccountByEmail(email);
  const role = demo?.role ?? "user";
  const name = demo?.name ?? email.split("@")[0];

  let user: AccountUser;

  if (await isDatabaseAvailable()) {
    try {
      const db = prisma as unknown as {
        user: {
          findUnique: (args: unknown) => Promise<{
            id: string;
            email: string | null;
            name: string | null;
            avatarUrl: string | null;
            role: string;
            authProvider: string | null;
            createdAt: Date;
          } | null>;
          create: (args: unknown) => Promise<{
            id: string;
            email: string | null;
            name: string | null;
            avatarUrl: string | null;
            role: string;
            authProvider: string | null;
            createdAt: Date;
          }>;
          update: (args: unknown) => Promise<{
            id: string;
            email: string | null;
            name: string | null;
            avatarUrl: string | null;
            role: string;
            authProvider: string | null;
            createdAt: Date;
          }>;
        };
      };
      const existing = await db.user.findUnique({ where: { email } });
      const row = existing
        ? await db.user.update({
            where: { id: existing.id },
            data: { role, name, authProvider: "email" },
          })
        : await db.user.create({
            data: {
              email,
              name,
              role,
              authProvider: "email",
            },
          });
      user = mapUser(row);
      const token = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createDbSession(user.id, token, expiresAt);
      return {
        ok: true,
        message: "登录成功",
        user,
        token,
      };
    } catch {
      /* fallback */
    }
  }

  const stored = await fileUpsertUser({
    email,
    name,
    role,
    authProvider: "email",
  });
  user = mapUser(stored);
  const session = await fileCreateSession(user.id);
  return {
    ok: true,
    message: "登录成功",
    user,
    token: session.token,
  };
}

export async function loginWithDemoTier(tier: DemoTier): Promise<{
  ok: boolean;
  message: string;
  user?: AccountUser;
  token?: string;
}> {
  const demo = getDemoAccountByTier(tier);
  return loginWithEmail(demo.email);
}

export function googleOAuthConfigured() {
  return Boolean(
    process.env.NEXA_GOOGLE_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim()
  );
}

export function buildGoogleAuthorizeUrl(state: string): string | null {
  const clientId =
    process.env.NEXA_GOOGLE_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;
  const base =
    process.env.NEXA_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const redirectUri = `${base}/api/auth/google/callback`;
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("openid email profile")}&state=${encodeURIComponent(state)}&access_type=online&prompt=select_account`;
}

/**
 * Google callback without wired token exchange — never invent a logged-in Google user.
 */
export async function handleGoogleCallback(): Promise<{
  ok: boolean;
  message: string;
  redirect: string;
}> {
  return {
    ok: false,
    message: "Google 登录尚未完成接入，请使用邮箱登录。",
    redirect: "/account/login?error=google_pending",
  };
}

export async function logoutSession(token?: string | null) {
  if (!token) return;
  if (await isDatabaseAvailable()) {
    try {
      const db = prisma as unknown as {
        authSession: { deleteMany: (args: unknown) => Promise<unknown> };
      };
      await db.authSession.deleteMany({ where: { token } });
    } catch {
      /* fallback */
    }
  }
  await fileDeleteSession(token);
}

export async function requireLoginFor(
  feature: string
): Promise<{ ok: true; user: AccountUser } | { ok: false; message: string }> {
  const session = await getSession();
  if (!session.authenticated || !session.user) {
    return {
      ok: false,
      message: `「${feature}」需要登录后使用`,
    };
  }
  return { ok: true, user: session.user };
}

/** Ensure we can resolve email users from file when DB path unused */
export async function ensureUserExists(email: string) {
  return fileGetUserByEmail(email);
}
