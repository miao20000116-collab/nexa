import { getSession } from "@/modules/account/auth/service";
import type { Workspace } from "@/modules/workspace/types";
import { isSharedWorkspaceId } from "@/lib/showcase/shared-catalog";

/** Deny access when a persisted workspace belongs to another user. */
export async function assertWorkspaceAccess(
  workspace: Workspace
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!workspace.userId || isSharedWorkspaceId(workspace.id)) {
    return { ok: true };
  }
  const session = await getSession();
  if (!session.authenticated || session.user?.id !== workspace.userId) {
    return {
      ok: false,
      status: 403,
      message: "无权访问该工作区",
    };
  }
  return { ok: true };
}
