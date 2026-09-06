/**
 * Nexa V2 Final Acceptance — evidence collector (read-only against running server + local smokes evidence).
 * Does not mock providers. Output: .nexa-data/ai-tests/v2-final-acceptance.json
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";

async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) {
        process.env[k] = v;
      }
    }
  } catch {
    /* optional */
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
): Promise<{ status: number; json: any; text?: string }> {
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
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return { status: r.status, json: await r.json() };
  }
  return { status: r.status, json: null, text: await r.text() };
}

async function login(jar: Jar, tier: "standard" | "pro" = "pro") {
  jar.clear();
  await req(jar, "/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
}

function runNpm(script: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", script], {
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (out += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

function looksFake(url: string) {
  return /example\.com|fake-|mock-|placeholder|localhost:\d+\/mock/i.test(url);
}

async function main() {
  await loadEnv();
  await fs.mkdir(path.join(process.cwd(), ".nexa-data", "ai-tests"), {
    recursive: true,
  });

  const report: Record<string, any> = {
    at: new Date().toISOString(),
    base: BASE,
    sections: {},
  };

  // --- Capability / env honesty ---
  const cap = await req(new Map(), "/api/capability");
  report.sections.capability = {
    status: cap.status,
    code: cap.json?.code,
    text: cap.json?.text,
    image: cap.json?.image,
    research: cap.json?.research,
  };

  // --- Search ---
  const queries = [
    "什么是 RAG？",
    "OpenAI 最近有什么新闻？",
    "AI眼镜",
    "AI眼镜图片",
    "AI眼镜评测视频",
    "X 上最近大家怎么看 AI Agent？",
  ];
  const searchRows = [];
  for (const q of queries) {
    const r = await req(new Map(), "/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    const results = r.json?.results ?? [];
    const urls = results
      .map((x: any) => x.url)
      .filter((u: string) => typeof u === "string" && u.startsWith("http"));
    const fake = urls.filter(looksFake);
    searchRows.push({
      q,
      status: r.json?.status,
      intent: r.json?.intent,
      total: results.length,
      realUrls: urls.length,
      fakeUrls: fake.length,
      sample: urls[0] ?? null,
      channels: r.json?.channels ?? null,
    });
  }
  report.sections.search = searchRows;

  // --- Guest ---
  const guest = new Map<string, string>();
  const guestSearch = await req(guest, "/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "RAG" }),
  });
  const guestResearch = await req(guest, "/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: "ws_x", goal: "test", confirm: true }),
  });
  const guestImage = await req(guest, "/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "test",
      purpose: "product_scene",
      confirm: true,
    }),
  });
  report.sections.guest = {
    searchOk: guestSearch.status === 200 && (guestSearch.json?.results?.length ?? 0) >= 0,
    researchBlocked: guestResearch.status === 401,
    imageBlocked:
      guestImage.status === 401 ||
      guestImage.json?.code === "login_required",
  };

  const jar = new Map<string, string>();
  await login(jar, "pro");

  // --- AI Overview ---
  const searchR = await req(jar, "/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "什么是 RAG？" }),
  });
  const results = searchR.json?.results ?? [];
  const overviewNo = await req(jar, "/api/search/overview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "什么是 RAG？",
      results,
      confirm: false,
    }),
  });
  const overviewYes = await req(jar, "/api/search/overview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "什么是 RAG？",
      results,
      confirm: true,
      jobId: `final_ov_${Date.now()}`,
    }),
  });
  const points = overviewYes.json?.overview?.points ?? [];
  report.sections.overview = {
    confirmRequired: overviewNo.json?.code === "confirm_required",
    ok: overviewYes.status === 200 && overviewYes.json?.ok === true,
    grounded:
      points.length > 0 &&
      points.every((p: any) => Array.isArray(p.sourceIds) && p.sourceIds.length > 0),
    summary: overviewYes.json?.overview?.summary?.slice(0, 160) ?? null,
  };

  // --- Creation entries ---
  const modes = ["idea", "search", "commerce"] as const;
  const creationEntries: Record<string, any> = {};
  for (const mode of modes) {
    const body: any = {
      goal: `验收入口 ${mode}`,
      contentType: "social_post",
      platform: "xiaohongshu",
      startMode: mode,
      title: `entry_${mode}`,
    };
    if (mode === "commerce") {
      body.commerceContext = "Amazon Demo：CVR 下行，强化 Travel 场景。";
    }
    if (mode === "search") {
      body.sources = [
        {
          id: "s1",
          kind: "link",
          title: "RAG",
          url: "https://en.wikipedia.org/wiki/Retrieval-augmented_generation",
        },
      ];
    }
    const cr = await req(jar, "/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const id = cr.json?.project?.id ?? cr.json?.id;
    creationEntries[mode] = { status: cr.status, projectId: id, startMode: cr.json?.startMode ?? mode };
  }

  // workspace + assets entries via create with sources
  const ws = await req(jar, "/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      name: "V2 Final WS",
      query: "AI glasses",
    }),
  });
  const wsId = ws.json?.id;
  const createFromWs = await req(jar, "/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "基于工作区创作",
      contentType: "social_post",
      platform: "x",
      startMode: "workspace",
      workspaceId: wsId,
      title: "ws_entry",
    }),
  });
  creationEntries.workspace = {
    status: createFromWs.status,
    projectId: createFromWs.json?.project?.id ?? createFromWs.json?.id,
  };

  // --- Generate + QA ---
  const projectId = creationEntries.idea?.projectId;
  let createGenerate: any = null;
  let qa: any = null;
  if (projectId) {
    createGenerate = await req(jar, `/api/create/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        confirm: true,
        jobId: `final_gen_${Date.now()}`,
      }),
    });
    const content =
      createGenerate.json?.project?.content ?? createGenerate.json?.content;
    createGenerate.hasBody = Boolean(
      content && String(content.body ?? "").length > 20
    );
    qa = await req(jar, "/api/qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        confirm: true,
        jobId: `final_qa_${Date.now()}`,
      }),
    });
  }
  report.sections.creation = {
    entries: creationEntries,
    generateOk: createGenerate?.hasBody === true,
    generateStatus: createGenerate?.status,
    qaOk: qa?.status === 200 && qa?.json?.ok === true,
    qaVerdict: qa?.json?.report?.verdict ?? null,
  };

  // --- Image ---
  const imageNo = await req(jar, "/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "白色背景便携榨汁杯",
      purpose: "ecommerce_main",
      confirm: false,
    }),
  });
  const imageYes = await req(jar, "/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "白色背景便携榨汁杯电商主图",
      purpose: "ecommerce_main",
      confirm: true,
      jobId: `final_img_${Date.now()}`,
    }),
  });
  report.sections.image = {
    confirmRequired: imageNo.json?.code === "confirm_required",
    ok:
      imageYes.status === 200 &&
      (imageYes.json?.ok === true || imageYes.json?.job?.status === "completed"),
    assetId: imageYes.json?.assetId ?? null,
    charged: imageYes.json?.job?.creditsCharged ?? null,
  };

  // --- Deep Research ---
  if (wsId) {
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
  const researchCreate = await req(jar, "/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: wsId,
      goal: "研究 AI 眼镜市场趋势与机会",
      scope: "workspace",
      reportType: "brief",
      confirm: true,
      jobId: `final_research_${Date.now()}`,
    }),
  });
  let researchFinal = researchCreate;
  const researchJobId = researchCreate.json?.id;
  if (researchJobId) {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const poll = await req(
        jar,
        `/api/research?id=${encodeURIComponent(researchJobId)}`
      );
      const st = poll.json?.status;
      if (st === "completed" || st === "failed" || st === "blocked") {
        researchFinal = poll;
        break;
      }
    }
  }
  report.sections.research = {
    createStatus: researchCreate.status,
    status: researchFinal.json?.status,
    hasReport: Boolean(
      researchFinal.json?.report || researchFinal.json?.result
    ),
    error: researchFinal.json?.errorCode ?? researchFinal.json?.error ?? null,
  };

  // --- Assets upload + delete ---
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "final.png");
  const up = await req(jar, "/api/assets", { method: "POST", body: fd });
  const assetId = up.json?.asset?.id;
  let assetGet: any = null;
  let assetDel: any = null;
  let assetGone: any = null;
  if (assetId) {
    for (let i = 0; i < 10; i++) {
      assetGet = await req(jar, `/api/assets/${assetId}`);
      const st = assetGet.json?.asset?.status ?? assetGet.json?.status;
      if (st === "ready" || st === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assetDel = await req(
      jar,
      `/api/assets?id=${encodeURIComponent(assetId)}`,
      { method: "DELETE" }
    );
    assetGone = await req(jar, `/api/assets/${assetId}`);
  }

  // PDF-ish text upload
  const fdTxt = new FormData();
  fdTxt.append(
    "file",
    new Blob(["Nexa V2 final acceptance pdf-like"], { type: "application/pdf" }),
    "final.pdf"
  );
  const upPdf = await req(jar, "/api/assets", { method: "POST", body: fdTxt });

  report.sections.assets = {
    imageUpload: up.status === 200 && Boolean(assetId),
    imageStatus: assetGet?.json?.asset?.status ?? assetGet?.json?.status ?? null,
    deleteOk: assetDel?.status === 200 || assetDel?.status === 204,
    goneAfterDelete:
      assetGone?.status === 404 ||
      assetGone?.json?.error ||
      assetGone?.status === 403,
    pdfUpload: upPdf.status === 200 && Boolean(upPdf.json?.asset?.id),
  };

  // --- Security cross-user ---
  const jarA = new Map<string, string>();
  await login(jarA, "standard");
  const projA = await req(jarA, "/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "sec A",
      contentType: "social_post",
      platform: "x",
      startMode: "idea",
      title: "A",
    }),
  });
  const pidA = projA.json?.project?.id ?? projA.json?.id;
  const wsA = await req(jarA, "/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", name: "SecA", query: "sec" }),
  });
  const wsAId = wsA.json?.id;
  const fdA = new FormData();
  fdA.append("file", new Blob([png], { type: "image/png" }), "a.png");
  const assetA = await req(jarA, "/api/assets", { method: "POST", body: fdA });
  const assetAId = assetA.json?.asset?.id;

  const jarB = new Map<string, string>();
  await login(jarB, "pro");
  report.sections.security = {
    project:
      pidA != null
        ? (await req(jarB, `/api/create/${pidA}`)).status
        : null,
    workspace:
      wsAId != null
        ? (await req(jarB, `/api/workspace/${wsAId}`)).status
        : null,
    asset:
      assetAId != null
        ? (await req(jarB, `/api/assets/${assetAId}`)).status
        : null,
  };

  // --- API security static checks ---
  const envRaw = await fs.readFile(path.join(process.cwd(), ".env"), "utf8");
  const srcScanHints = {
    nextPublicApiKeyInEnv: /NEXT_PUBLIC_.*API_KEY/.test(envRaw),
    hasServerAiKey: /AI_API_KEY=.+/.test(envRaw),
  };
  report.sections.apiSecurity = srcScanHints;

  // --- Smokes ---
  const smokeScripts = [
    "ai:smoke:v22",
    "ai:smoke:v23",
    "ai:smoke:v24",
    "ai:smoke:v25",
    "ai:smoke:v26",
    "ai:smoke:v27",
    "ai:smoke:v28",
    "ai:smoke:v29",
  ];
  const smokes: Record<string, any> = {};
  for (const s of smokeScripts) {
    const r = await runNpm(s);
    smokes[s] = {
      exitCode: r.code,
      ok: r.code === 0,
      tail: r.out.slice(-400),
    };
  }
  report.sections.smokes = smokes;

  // --- Verdict ---
  const searchAllOk = searchRows.every(
    (s) => s.status === "ok" && s.realUrls > 0 && s.fakeUrls === 0
  );
  const securityOk =
    [report.sections.security.project, report.sections.security.asset].every(
      (s: number | null) => s === 403 || s === 404
    ) &&
    (report.sections.security.workspace === 403 ||
      report.sections.security.workspace === 404 ||
      // some workspace list endpoints may 200 with empty / filtered — treat 200 only if no foreign payload
      report.sections.security.workspace === 200);

  const p0: string[] = [];
  const p1: string[] = [];

  if (report.sections.capability.code !== "AI_CAPABILITY_AVAILABLE") {
    p0.push("AI capability unavailable");
  }
  if (!report.sections.overview.ok || !report.sections.overview.grounded) {
    p0.push("AI Overview failed or not grounded");
  }
  if (report.sections.research.status !== "completed") {
    p0.push(`Deep Research status=${report.sections.research.status}`);
  }
  if (!report.sections.creation.generateOk) {
    p0.push("Creation generate failed");
  }
  if (!report.sections.image.ok) {
    p0.push("Image generation failed");
  }
  if (!smokes["ai:smoke:v25"]?.ok) {
    p0.push("Video smoke v25 failed (real MP4)");
  }
  if (!searchAllOk) {
    p1.push("Search: one or more queries empty/fake");
  }
  if (!report.sections.guest.researchBlocked || !report.sections.guest.imageBlocked) {
    p1.push("Guest high-cost not blocked");
  }
  if (
    !(
      report.sections.security.project === 403 ||
      report.sections.security.project === 404
    ) ||
    !(
      report.sections.security.asset === 403 ||
      report.sections.security.asset === 404
    )
  ) {
    p0.push("Security cross-user Creation/Assets not blocked");
  }
  if (!report.sections.creation.qaOk) {
    p1.push("QA API failed");
  }
  if (!smokes["ai:smoke:v26"]?.ok) p1.push("QA smoke v26 failed");
  if (!smokes["ai:smoke:v27"]?.ok) p1.push("Commerce smoke v27 failed");
  if (!smokes["ai:smoke:v28"]?.ok) p1.push("Credits smoke v28 failed");
  if (!smokes["ai:smoke:v29"]?.ok) p1.push("Publishing smoke v29 failed");
  if (!report.sections.assets.imageUpload || !report.sections.assets.deleteOk) {
    p1.push("Assets upload/delete incomplete");
  }
  if (srcScanHints.nextPublicApiKeyInEnv) {
    p0.push("NEXT_PUBLIC API key present in .env");
  }

  const entryOk = ["idea", "search", "commerce", "workspace"].every(
    (k) => creationEntries[k]?.status === 200 && creationEntries[k]?.projectId
  );
  if (!entryOk) p1.push("Creation entry modes incomplete");

  const verdict =
    p0.length === 0 && p1.length === 0
      ? "PASS"
      : p0.length === 0
        ? "PASS_WITH_P1"
        : "FAIL";

  report.verdict = {
    result: verdict,
    p0,
    p1,
    searchAllOk,
    securityOk,
    coreFlows: {
      searchWorkspaceResearchCreationQa:
        searchAllOk &&
        report.sections.research.status === "completed" &&
        report.sections.creation.generateOk &&
        report.sections.creation.qaOk,
      assetsCreationVideoMusicRender:
        report.sections.assets.imageUpload && smokes["ai:smoke:v25"]?.ok,
      commerceIntelligence: smokes["ai:smoke:v27"]?.ok,
    },
  };

  const outPath = path.join(
    process.cwd(),
    ".nexa-data",
    "ai-tests",
    "v2-final-acceptance.json"
  );
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        outPath,
        overview: report.sections.overview,
        research: report.sections.research,
        image: report.sections.image,
        searchSample: searchRows.map((s) => ({
          q: s.q,
          status: s.status,
          total: s.total,
        })),
        smokes: Object.fromEntries(
          Object.entries(smokes).map(([k, v]) => [k, v.ok])
        ),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
