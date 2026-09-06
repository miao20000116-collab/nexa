import { getSession } from "@/modules/account/auth/service";
import type { CreationProject } from "@/modules/create/types";

/** Deny access when a persisted project belongs to another user. */
export async function assertProjectAccess(
  project: CreationProject
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!project.userId) {
    return { ok: true };
  }
  const session = await getSession();
  if (!session.authenticated || session.user?.id !== project.userId) {
    return {
      ok: false,
      status: 403,
      message: "无权访问该创作项目",
    };
  }
  return { ok: true };
}
