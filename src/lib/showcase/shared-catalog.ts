/**
 * Shared showcase records — visible to every account and guests.
 * Keep IDs stable so deploy seed can upsert the same rows.
 */
export const SHARED_CREATION_IDS = [
  "cp_1788673504290_eujpk2n",
  "cp_1788676054120_1pbolrt",
  "cp_1788713784199_bm290to",
] as const;

export const SHARED_WORKSPACE_IDS = [
  "ws_1788673467325_j8uwym3",
  "ws_1788675908892_llshfll",
  "ws_1788713767021_05nb8th",
] as const;

export type SharedCreationId = (typeof SHARED_CREATION_IDS)[number];
export type SharedWorkspaceId = (typeof SHARED_WORKSPACE_IDS)[number];

export function isSharedCreationId(id: string): boolean {
  return (SHARED_CREATION_IDS as readonly string[]).includes(id);
}

export function isSharedWorkspaceId(id: string): boolean {
  return (SHARED_WORKSPACE_IDS as readonly string[]).includes(id);
}

/** List filter: own rows + shared showcase (guests still see shared). */
export function ownsOrSharedCreation(
  userId: string | null | undefined,
  project: { id: string; userId?: string | null }
): boolean {
  if (isSharedCreationId(project.id)) return true;
  if (userId) return project.userId === userId;
  return !project.userId;
}

export function ownsOrSharedWorkspace(
  userId: string | null | undefined,
  workspace: { id: string; userId?: string | null }
): boolean {
  if (isSharedWorkspaceId(workspace.id)) return true;
  if (userId) return workspace.userId === userId;
  return !workspace.userId;
}
