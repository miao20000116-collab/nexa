import { promises as fs } from "fs";
import path from "path";
import type { AccountUser, CreditLedgerEntry } from "@/modules/account/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "account");

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

type StoredSession = {
  token: string;
  userId: string;
  expiresAt: string;
};

type StoredUser = AccountUser & {
  googleId?: string | null;
};

export async function fileGetUserByEmail(
  email: string
): Promise<StoredUser | null> {
  const users = await fileListUsers();
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function fileGetUserById(id: string): Promise<StoredUser | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "users", `${id}.json`), "utf8");
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function fileListUsers(): Promise<StoredUser[]> {
  await ensureDir();
  const dir = path.join(DATA_DIR, "users");
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir).catch(() => []);
  const users: StoredUser[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      users.push(
        JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as StoredUser
      );
    } catch {
      /* skip */
    }
  }
  return users;
}

export async function fileUpsertUser(
  input: Partial<StoredUser> & { email?: string | null }
): Promise<StoredUser> {
  await ensureDir();
  const dir = path.join(DATA_DIR, "users");
  await fs.mkdir(dir, { recursive: true });
  const existing =
    (input.id ? await fileGetUserById(input.id) : null) ||
    (input.email ? await fileGetUserByEmail(input.email) : null);
  const now = new Date().toISOString();
  const user: StoredUser = {
    id: existing?.id ?? input.id ?? uid("user"),
    email: input.email ?? existing?.email ?? null,
    name: input.name ?? existing?.name ?? null,
    avatarUrl: input.avatarUrl ?? existing?.avatarUrl ?? null,
    role: input.role ?? existing?.role ?? "user",
    authProvider: input.authProvider ?? existing?.authProvider ?? null,
    createdAt: existing?.createdAt ?? now,
    googleId: input.googleId ?? existing?.googleId ?? null,
  };
  await fs.writeFile(
    path.join(dir, `${user.id}.json`),
    JSON.stringify(user, null, 2)
  );
  return user;
}

export async function fileCreateSession(
  userId: string,
  days = 30
): Promise<StoredSession> {
  await ensureDir();
  const dir = path.join(DATA_DIR, "sessions");
  await fs.mkdir(dir, { recursive: true });
  const token = uid("sess");
  const expiresAt = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000
  ).toISOString();
  const session: StoredSession = { token, userId, expiresAt };
  await fs.writeFile(
    path.join(dir, `${token}.json`),
    JSON.stringify(session, null, 2)
  );
  return session;
}

export async function fileGetSession(
  token: string
): Promise<StoredSession | null> {
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, "sessions", `${token}.json`),
      "utf8"
    );
    const session = JSON.parse(raw) as StoredSession;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await fileDeleteSession(token);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function fileDeleteSession(token: string) {
  try {
    await fs.unlink(path.join(DATA_DIR, "sessions", `${token}.json`));
  } catch {
    /* ignore */
  }
}

export async function fileListLedger(
  userId: string
): Promise<CreditLedgerEntry[]> {
  await ensureDir();
  const dir = path.join(DATA_DIR, "credits");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${userId}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as CreditLedgerEntry[];
  } catch {
    return [];
  }
}

export async function fileAppendLedger(
  userId: string,
  entry: Omit<CreditLedgerEntry, "id" | "createdAt" | "userId"> & {
    userId?: string | null;
  }
): Promise<CreditLedgerEntry> {
  const list = await fileListLedger(userId);
  const row: CreditLedgerEntry = {
    id: uid("cred"),
    userId,
    type: entry.type,
    amount: entry.amount,
    balance: entry.balance,
    description: entry.description,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    jobId: entry.jobId ?? null,
    capability: entry.capability ?? null,
    jobStatus: entry.jobStatus ?? null,
    createdAt: new Date().toISOString(),
  };
  list.unshift(row);
  const dir = path.join(DATA_DIR, "credits");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${userId}.json`),
    JSON.stringify(list, null, 2)
  );
  return row;
}
