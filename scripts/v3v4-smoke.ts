/**
 * V3/V4 API smoke — login + endpoint presence / honesty checks.
 * Run: npx tsx scripts/v3v4-smoke.ts (requires npm run dev)
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
  let json: Record<string, unknown> = {};
  try {
    json = (await r.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: r.status, json };
}

async function main() {
  const base = process.env.NEXA_BASE_URL || "http://localhost:3000";
  const jar: Jar = new Map();
  const out: Record<string, unknown> = { at: new Date().toISOString(), base };

  await req(jar, base, "/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "pro" }),
  });
  out.loggedIn = jar.size > 0;

  // V3.0 context
  const ws = await req(jar, base, "/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", query: "V3V4 smoke" }),
  });
  const workspaceId = ws.json.id as string;
  out.workspace = { status: ws.status, id: workspaceId };

  const ctx = await req(jar, base, `/api/workspace/${workspaceId}/context`);
  out.context = {
    status: ctx.status,
    hasContext: Boolean(ctx.json.context),
  };

  // V3.1 memory
  const mem = await req(jar, base, "/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      type: "Preference",
      key: "lang",
      label: "内容语言",
      value: "默认中文",
      requireConfirm: false,
    }),
  });
  out.memory = { status: mem.status, id: (mem.json.memory as { id?: string })?.id };

  // V3.5 trends
  const trends = await req(jar, base, "/api/commerce/amazon?view=trends&period=7d");
  out.commerceTrends = {
    status: trends.status,
    isDemo: trends.json.isDemo === true,
  };

  // V3.6 optimization without data
  const opt = await req(jar, base, "/api/optimization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  out.optimization = {
    status: opt.status,
    code: opt.json.code,
    honest: opt.json.code === "DATA_NOT_AVAILABLE",
  };

  // V3.7 automation
  const auto = await req(jar, base, "/api/automation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      kind: "weekly_research",
      name: "每周竞品研究",
      cronLike: "weekly",
      context: { goal: "AI 搜索竞品", workspaceId },
    }),
  });
  const ruleId = (auto.json.rule as { id?: string })?.id;
  const run = ruleId
    ? await req(jar, base, "/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", ruleId, confirm: false }),
      })
    : { status: 0, json: {} };
  out.automation = {
    createStatus: auto.status,
    runStatus: run.status,
    awaitingConfirm:
      (run.json.job as { status?: string })?.status === "awaiting_confirmation",
  };

  // V4.0 personal AI
  const personal = await req(jar, base, "/api/personal-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "resolve",
      workspaceId,
      task: "写小红书内容",
    }),
  });
  out.personalAi = { status: personal.status };

  // V4.1 workflow
  const wf = await req(jar, base, "/api/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      goal: "分析这个产品为什么销量下降，并给我一套新的营销内容",
    }),
  });
  out.workflow = {
    status: wf.status,
    steps: ((wf.json.workflow as { steps?: unknown[] })?.steps || []).length,
  };

  // V4.2 decision (no evidence)
  const dec = await req(jar, base, "/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domain: "commerce",
      situation: "销量下降如何决策",
      evidence: [],
    }),
  });
  out.decision = {
    status: dec.status,
    honesty: (dec.json.decision as { dataHonesty?: string })?.dataHonesty,
  };

  // V4.4 experiment insufficient
  const exp = await req(jar, base, "/api/experiment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", hypothesis: "新 Hook 提升 CTR" }),
  });
  const expId = (exp.json.experiment as { id?: string })?.id;
  const concluded = expId
    ? await req(jar, base, "/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "conclude", experimentId: expId }),
      })
    : { status: 0, json: {} };
  out.experiment = {
    status: exp.status,
    concludeCode: (concluded.json.experiment as { code?: string })?.code,
  };

  // V4.5 knowledge
  const know = await req(jar, base, "/api/knowledge/recall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "AI 搜索" }),
  });
  out.knowledge = { status: know.status };

  // V4.6 integrations
  const integ = await req(jar, base, "/api/integrations");
  out.integrations = {
    status: integ.status,
    count: ((integ.json.integrations as unknown[]) || []).length,
  };

  // V4.7 credits pack
  const pack = await req(jar, base, "/api/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "purchase_pack", packId: "pack_200" }),
  });
  out.credits = { status: pack.status, ok: pack.json.ok === true };

  // V4.8 health
  const health = await req(jar, base, "/api/platform/health");
  out.platform = { status: health.status, ok: health.json.ok === true };

  const dir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "v3v4-smoke.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
