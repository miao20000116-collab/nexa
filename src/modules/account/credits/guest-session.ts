import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE_NAME = "nexa_guest_id";

export async function getOrCreateGuestId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value?.trim();
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}

export function guestAccountId(guestId: string): string {
  return `guest:${guestId}`;
}

export function isGuestAccountId(accountId: string): boolean {
  return accountId.startsWith("guest:");
}
