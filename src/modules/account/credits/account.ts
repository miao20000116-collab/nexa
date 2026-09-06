import { getSession } from "@/modules/account/auth/service";
import {
  getOrCreateGuestId,
  guestAccountId,
} from "@/modules/account/credits/guest-session";
import type { CreditsAccountContext } from "@/modules/account/types";

/** Resolve ledger account: logged-in user or guest session. */
export async function resolveCreditsAccount(): Promise<CreditsAccountContext> {
  const session = await getSession();
  if (session.user?.id) {
    return {
      accountId: session.user.id,
      userId: session.user.id,
      isGuest: false,
      userRole: session.user.role,
    };
  }
  const guestId = await getOrCreateGuestId();
  return {
    accountId: guestAccountId(guestId),
    userId: null,
    isGuest: true,
  };
}
