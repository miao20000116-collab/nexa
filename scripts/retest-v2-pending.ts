/**
 * Re-test items that failed or were incomplete in V2 acceptance + SiliconFlow config.
 * Output: .nexa-data/ai-tests/v2-retest-pending.json
 */
import { promises as fs } from "fs";
import path from "path";

async function loadEnv() {
  const raw = await fs.readFile(path.join(process.cwd(), ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const BASE = process.env.NEXA_BASE_URL || "http://localhost:3000";

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
  p: string,
  opts: RequestInit = {}
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (jar.size) {
    headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  const r = await fetch(`${BASE}${p}`, { ...opts, headers });
  const set = r.headers.getSetCookie?.() ?? r.headers.get("set-cookie");
  if (set) {
    if (Array.isArray(set)) set.forEach((c) => parseSetCookie(c, jar));
    else parseSetCookie(set, jar);
  }
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    /* */
  }
  return { status: r.status, json };
}

async function login(jar: Jar, tier: "standard" | "pro" = "pro") {
  jar.clear();
  await req(jar, "/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

async function main() {
  await loadEnv();
  const out: Record<string, unknown> = {
    at: new Date().toISOString(),
    base: BASE,
  };

  // --- Capability ---
  out.capability = (await req(new Map(), "/api/capability")).json;

  // --- Search (previously failed / partial) ---
  const queries = [
    "什么是 RAG?",
    "OpenAI 最近有什么新闻?",
    "AI眼镜",
    "AI眼镜图片",
    "AI眼镜评测视频",
    "X 上最近大家怎么看 AI Agent?",
  ];
  out.search = [];
  for (const q of queries) {
    const r = await req(new Map(), "/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    const j = r.json as {
      status?: string;
      results?: Array<{ url?: string; type?: string }>;
    };
    const results = j.results ?? [];
    const urls = results.map((x) => x.url).filter((u) => u?.startsWith("http"));
    const byType: Record<string, number> = {};
    for (const x of results) {
      const t = x.type || "unknown";
      byType[t] = (byType[t] || 0) + 1;
    }
    (out.search as unknown[]).push({
      q,
      status: j.status,
      total: results.length,
      realUrls: urls.length,
      byType,
      sample: urls[0] ?? null,
    });
  }

  // --- Guest vs Login ---
  const guest = new Map<string, string>();
  out.guest = {
    search: (await req(guest, "/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "RAG" }),
    })).status,
    research: await req(guest, "/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "ws_x", goal: "test" }),
    }),
  };

  const jar = new Map<string, string>();
  await login(jar, "pro");

  // --- AI Overview (confirm flow) ---
  const searchR = await req(jar, "/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "什么是 RAG?" }),
  });
  const searchData = searchR.json as {
    sessionId?: string;
    query?: string;
    results?: Array<Record<string, unknown>>;
  };
  const sessionId = searchData.sessionId;
  const searchResults = searchData.results ?? [];
  const overviewQuery = searchData.query ?? "什么是 RAG?";
  out.overviewNoConfirm = await req(jar, "/api/search/overview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: overviewQuery,
      results: searchResults,
      sessionId,
      confirm: false,
    }),
  });
  const overviewJobId = `job_retest_${Date.now()}`;
  out.overviewConfirm = await req(jar, "/api/search/overview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: overviewQuery,
      results: searchResults,
      sessionId,
      confirm: true,
      jobId: overviewJobId,
    }),
  });

  // --- Creation + AI generate (v23 failed without login) ---
  const createR = await req(jar, "/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "便携榨汁杯种草",
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: "idea",
      title: "出差好物",
      sources: [
        {
          id: "s1",
          kind: "link",
          title: "示例",
          url: "https://example.com",
        },
      ],
    }),
  });
  const projectId = (createR.json as { id?: string; project?: { id?: string } })
    ?.project?.id ?? (createR.json as { id?: string })?.id;
  out.create = { status: createR.status, projectId };
  if (projectId) {
    out.createGenerate = await req(jar, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", confirm: true }),
    });
    const gen = out.createGenerate as { status: number; json: Record<string, unknown> };
    const content = (gen.json?.project as { content?: Record<string, unknown> })?.content
      ?? gen.json?.content;
    out.createHasBody = Boolean(
      content && typeof content === "object" && String((content as { body?: string }).body ?? "").length > 20
    );
  }

  // --- Image (v24 smoke cookies issue) ---
  out.imageMeta = await req(jar, "/api/image");
  out.imageNoConfirm = await req(jar, "/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "白色背景上的便携榨汁杯产品图",
      purpose: "product_scene",
      confirm: false,
    }),
  });
  const imgConfirmJob = `img_retest_${Date.now()}`;
  out.imageConfirm = await req(jar, "/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "白色背景上的便携榨汁杯产品图，电商主图",
      purpose: "product_scene",
      confirm: true,
      jobId: imgConfirmJob,
    }),
  });

  // --- Deep Research via API with workspace + sources ---
  const wsR = await req(jar, "/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      name: "Retest Research",
      query: "AI glasses",
    }),
  });
  const wsId = (wsR.json as { id?: string })?.id;
  if (wsId && sessionId) {
    await req(jar, "/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: wsId,
        query: "AI glasses",
        source: {
          url: "https://en.wikipedia.org/wiki/Smartglasses",
          title: "Smartglasses",
          snippet: "Smart glasses market",
        },
      }),
    });
  }
  out.research = await req(jar, "/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: wsId,
      goal: "研究 AI 眼镜市场趋势与机会",
      scope: "workspace",
      reportType: "brief",
      confirm: true,
      jobId: `research_retest_${Date.now()}`,
    }),
  });

  const researchJobId = (out.research as { json?: { id?: string } })?.json?.id;
  if (researchJobId) {
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await req(jar, `/api/research?id=${encodeURIComponent(researchJobId)}`);
      const status = (poll.json as { status?: string })?.status;
      if (status === "completed" || status === "failed") {
        out.research = poll;
        break;
      }
    }
  }

  // --- QA ---
  if (projectId) {
    out.qa = await req(jar, "/api/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        confirm: true,
        jobId: `qa_retest_${Date.now()}`,
      }),
    });
  }

  // --- Assets: video upload (minimal mp4 via ffmpeg if available) ---
  out.assets = { image: null as unknown, video: null as unknown };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const fd1 = new FormData();
  fd1.append("file", new Blob([png], { type: "image/png" }), "retest.png");
  out.assets = {
    ...(out.assets as object),
    image: await req(jar, "/api/assets", { method: "POST", body: fd1 }),
  };

  // --- Security cross-user (quick) ---
  const jarA = new Map<string, string>();
  await login(jarA, "standard");
  const projA = await req(jarA, "/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "sec",
      contentType: "social_post",
      platform: "x",
      startMode: "idea",
      title: "A",
    }),
  });
  const pidA =
    (projA.json as { project?: { id?: string } })?.project?.id ??
    (projA.json as { id?: string })?.id;
  const jarB = new Map<string, string>();
  await login(jarB, "pro");
  out.security = {
    bAccessProject: pidA
      ? await req(jarB, `/api/create/${pidA}`)
      : { skip: true },
  };

  // --- Pass/fail summary ---
  const searchArr = out.search as Array<{
    q: string;
    status: string;
    realUrls: number;
  }>;
  const cap = out.capability as Record<string, string>;
  const ov = out.overviewConfirm as { json: Record<string, unknown> };
  const img = out.imageConfirm as { status: number; json: Record<string, unknown> };
  const res = out.research as { json: Record<string, unknown> };

  out.summary = {
    capabilityAi: cap?.code === "AI_CAPABILITY_AVAILABLE",
    ragSearch: searchArr.find((s) => s.q.includes("RAG"))?.status === "ok",
    aiGlassesEmpty: searchArr.find((s) => s.q === "AI眼镜")?.status === "empty",
    xSocialEmpty: searchArr.find((s) => s.q.includes("AI Agent"))?.status === "empty",
    overviewOk: Boolean(
      (ov?.json as { overview?: unknown; ok?: boolean })?.overview ||
        (ov?.json as { ok?: boolean })?.ok
    ),
    imageOk: img?.status === 200 && (img?.json?.ok === true || img?.json?.job),
    researchOk:
      (res?.json as { status?: string })?.status === "completed" ||
      Boolean((res?.json as { report?: unknown })?.report),
    createGenerateOk: out.createHasBody === true,
    guestResearchBlocked:
      (out.guest as { research: { status: number } }).research.status === 401,
  };

  const outPath = path.join(process.cwd(), ".nexa-data", "ai-tests", "v2-retest-pending.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify({ summary: out.summary, outPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
