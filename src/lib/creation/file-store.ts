import { promises as fs } from "fs";
import path from "path";
import type {
  CreationProject,
  CreationProjectAsset,
  CreateProjectInput,
  StructuredContent,
  CreationSourceRef,
} from "@/modules/create/types";
import {
  defaultTimeline,
  emptyContentForPlatform,
} from "@/modules/create/constants";

const DATA_DIR = path.join(process.cwd(), ".nexa-data");

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function projectPath(id: string) {
  return path.join(DATA_DIR, "creations", `${id}.json`);
}

export async function fileStoreCreateProject(
  input: CreateProjectInput,
  userId?: string | null
): Promise<CreationProject> {
  await ensureDir(path.join(DATA_DIR, "creations"));
  const now = new Date().toISOString();
  const sources: CreationSourceRef[] = [...(input.sources ?? [])];
  if (input.linkUrl) {
    sources.push({
      id: uid("src"),
      kind: "link",
      url: input.linkUrl,
      title: input.title || input.linkUrl,
      snippet: input.brief?.slice(0, 500),
    });
  }
  if (input.workspaceId) {
    sources.push({
      id: uid("src"),
      kind: "workspace_source",
      workspaceId: input.workspaceId,
      title: "工作区资料",
    });
  }
  if (input.commerceContext) {
    sources.push({
      id: uid("src"),
      kind: "commerce",
      title: "商品诊断",
      snippet: input.commerceContext.slice(0, 2000),
    });
  }

  const assets: CreationProjectAsset[] = (input.assetIds ?? []).map(
    (assetId, i) => ({
      id: uid("ca"),
      projectId: "",
      assetId,
      role: "media",
      sortOrder: i,
      usage: null,
      selected: true,
      createdAt: now,
    })
  );

  const brief =
    input.brief ||
    (input.commerceContext ? input.commerceContext.slice(0, 4000) : null);

  const content = {
    ...emptyContentForPlatform(input.platform, input.contentType),
    ...(input.seedContent ?? {}),
    ...(input.promptOverride
      ? { _promptOverride: input.promptOverride }
      : {}),
    ...(input.referenceStoryboard
      ? { __referenceStoryboard: input.referenceStoryboard }
      : {}),
  } as StructuredContent;

  const project: CreationProject = {
    id: uid("cp"),
    userId: userId ?? null,
    title: input.title || input.goal.slice(0, 40) || "未命名创作",
    goal: input.goal,
    contentType: input.contentType,
    platform: input.platform,
    status: "draft",
    brief,
    workspaceId: input.workspaceId ?? null,
    startMode: input.startMode,
    timeline: defaultTimeline(),
    content,
    sources,
    promptOverride: input.promptOverride ?? null,
    createdAt: now,
    updatedAt: now,
    assets: [],
  };

  project.assets = assets.map((a) => ({ ...a, projectId: project.id }));
  await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

function normalizeProject(project: CreationProject): CreationProject {
  const content = (project.content ?? {}) as Record<string, unknown>;
  const promptOverride =
    project.promptOverride ??
    (typeof content._promptOverride === "string"
      ? content._promptOverride
      : null);
  return { ...project, promptOverride };
}

export async function fileStoreGetProject(
  id: string
): Promise<CreationProject | null> {
  try {
    const raw = await fs.readFile(projectPath(id), "utf-8");
    return normalizeProject(JSON.parse(raw) as CreationProject);
  } catch {
    return null;
  }
}

export async function fileStoreListProjects(
  userId?: string | null
): Promise<CreationProject[]> {
  await ensureDir(path.join(DATA_DIR, "creations"));
  const files = await fs.readdir(path.join(DATA_DIR, "creations"));
  const projects: CreationProject[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(
      path.join(DATA_DIR, "creations", file),
      "utf-8"
    );
    projects.push(normalizeProject(JSON.parse(raw) as CreationProject));
  }
  const filtered = projects.filter((p) =>
    userId ? p.userId === userId : !p.userId
  );
  return filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function fileStoreUpdateProject(
  id: string,
  patch: Partial<CreationProject> & Record<string, unknown>
): Promise<CreationProject | null> {
  const project = await fileStoreGetProject(id);
  if (!project) return null;
  const updated: CreationProject = {
    ...project,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.content) {
    const content = patch.content as Record<string, unknown>;
    if (typeof content._promptOverride === "string") {
      updated.promptOverride = content._promptOverride;
    } else if (content._promptOverride === undefined) {
      // keep existing
    } else {
      updated.promptOverride = null;
    }
  }
  await fs.writeFile(projectPath(id), JSON.stringify(updated, null, 2));
  return normalizeProject(updated);
}

export async function fileStoreDeleteProject(id: string): Promise<boolean> {
  try {
    await fs.unlink(projectPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function fileStoreUpdateContentField(
  id: string,
  field: string,
  value: string | string[]
): Promise<CreationProject | null> {
  const project = await fileStoreGetProject(id);
  if (!project) return null;
  const content = {
    ...(project.content ?? {}),
    [field]: value,
  } as StructuredContent;
  return fileStoreUpdateProject(id, { content });
}

export async function fileStoreSetProjectAssets(
  id: string,
  assets: CreationProjectAsset[]
): Promise<CreationProject | null> {
  const project = await fileStoreGetProject(id);
  if (!project) return null;
  const updated: CreationProject = {
    ...project,
    assets,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(projectPath(id), JSON.stringify(updated, null, 2));
  return updated;
}
