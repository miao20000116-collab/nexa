/**
 * V2.3 smoke: creation project + generate/rewrite with demo login + confirm.
 */
import { promises as fs } from "fs";
import path from "path";

type Jar = Map<string, string>;

function parseSetCookie(h: string | null, jar: Jar) {
  if (!h) return;
  for (const line of h.split(/,(?=[^;]+?=)/)) {
    const part = line.split(";")[0];
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1));
  }
}

async function req(
  jar: Jar,
  base: string,
  p: string,
  opts: RequestInit = {}
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (jar.size) {
    headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  const r = await fetch(`${base}${p}`, { ...opts, headers });
  const set = r.headers.getSetCookie?.() ?? r.headers.get("set-cookie");
  if (set) {
    if (Array.isArray(set)) set.forEach((c) => parseSetCookie(c, jar));
    else parseSetCookie(set, jar);
  }
  const json = (await r.json()) as Record<string, unknown>;
  return { status: r.status, json };
}

async function login(jar: Jar, base: string) {
  jar.clear();
  await req(jar, base, "/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "pro" }),
  });
}

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  const base = process.env.NEXA_BASE_URL || "http://localhost:3000";
  const jar: Jar = new Map();
  await login(jar, base);

  const result: Record<string, unknown> = {
    at: new Date().toISOString(),
    base,
    loggedIn: jar.size > 0,
  };

  const createRes = await req(jar, base, "/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "为便携榨汁杯写一条小红书种草文",
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: "commerce",
      commerceContext:
        "Amazon 诊断：CVR 下行；强化 Travel 场景与转化卖点。",
    }),
  });
  const project = createRes.json;
  const projectId =
    (project.project as { id?: string } | undefined)?.id ??
    (project.id as string | undefined);
  result.createStatus = createRes.status;
  result.projectId = projectId;
  result.startMode = project.startMode;
  result.hasCommerceSource = Array.isArray(project.sources)
    ? (project.sources as Array<{ kind?: string }>).some(
        (s) => s.kind === "commerce"
      )
    : false;
  result.contentKeys = project.content
    ? Object.keys(project.content as object).filter(
        (k: string) => !k.startsWith("_")
      )
    : [];

  if (!projectId) {
    result.generate = { skipped: true, reason: "create_failed", body: project };
  } else {
    const genRes = await req(jar, base, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        confirm: true,
        jobId: `smoke_v23_${Date.now()}`,
      }),
    });
    const genBody = genRes.json;
    const content =
      (genBody.project as { content?: Record<string, unknown> } | undefined)
        ?.content ?? (genBody.content as Record<string, unknown> | undefined);
    const bodyText =
      content && typeof content.body === "string" ? content.body : "";
    result.generate = {
      status: genRes.status,
      ok: genBody.ok,
      code: genBody.code,
      message: genBody.message,
      hasBody: bodyText.length > 20,
      honestBlock:
        genBody.code === "blocked_ai_unavailable" ||
        genBody.code === "login_required" ||
        Boolean(genBody.id) ||
        bodyText.length > 20,
    };

    const rewriteRes = await req(jar, base, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rewrite_field",
        field: "title",
        rewriteAction: "optimize_title",
        confirm: true,
        jobId: `smoke_v23_rewrite_${Date.now()}`,
      }),
    });
    const rewriteBody = rewriteRes.json;
    result.rewrite = {
      status: rewriteRes.status,
      ok: rewriteBody.ok,
      code: rewriteBody.code,
      message: rewriteBody.message,
    };

    const promptRes = await req(jar, base, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_prompt",
        promptOverride: "测试 Prompt：只用简体中文输出 JSON。",
      }),
    });
    const promptBody = promptRes.json;
    result.savePrompt = {
      status: promptRes.status,
      hasOverride: Boolean(promptBody.promptOverride),
    };

    const doneRes = await req(jar, base, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_completed" }),
    });
    const doneBody = doneRes.json;
    result.markCompleted = {
      status: doneRes.status,
      statusField: doneBody.status,
    };
  }

  const outPath = path.join(outDir, "v2.3-creation-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);

  const gen = result.generate as { status?: number; hasBody?: boolean } | undefined;
  if (!gen?.hasBody && gen?.status !== 200) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
