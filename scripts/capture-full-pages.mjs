/**
 * Full-page screenshots of all Nexa routes → single PDF.
 * Usage: node scripts/capture-full-pages.mjs
 */
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "ux-fullpage-screenshots");
const PDF_PATH = path.join(ROOT, "docs", "Nexa_Full_Pages_Screenshot.pdf");
const BASE = process.env.NEXA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.NEXA_DEMO_EMAIL || "demo@nexa.local";

const VIEWPORT = { width: 1440, height: 900 };

/** @type {{ name: string, path: string }[]} */
const STATIC_ROUTES = [
  { name: "00-home", path: "/" },
  { name: "01-search", path: "/search?q=" + encodeURIComponent("美国 AI 眼镜市场最近发生了什么？") },
  { name: "02-read", path: "/read?url=" + encodeURIComponent("https://en.wikipedia.org/wiki/Retrieval-augmented_generation") },
  { name: "03-workspace-list", path: "/workspace" },
  { name: "04-create-hub", path: "/create" },
  { name: "05-create-image", path: "/create/image" },
  { name: "06-assets", path: "/assets" },
  { name: "07-publish", path: "/publish" },
  { name: "08-commerce-hub", path: "/commerce" },
  { name: "10-amazon-overview", path: "/commerce/amazon" },
  { name: "11-amazon-products", path: "/commerce/amazon/products" },
  { name: "12-amazon-product-detail", path: "/commerce/amazon/products/prod_portable_blender" },
  { name: "13-amazon-selection", path: "/commerce/amazon/selection" },
  { name: "14-amazon-compliance", path: "/commerce/amazon/compliance" },
  { name: "15-amazon-customer", path: "/commerce/amazon/customer" },
  { name: "16-amazon-ads", path: "/commerce/amazon/ads" },
  { name: "17-amazon-profit", path: "/commerce/amazon/profit" },
  { name: "18-amazon-inventory", path: "/commerce/amazon/inventory" },
  { name: "20-tiktok-overview", path: "/commerce/tiktok" },
  { name: "21-tiktok-products", path: "/commerce/tiktok/products" },
  { name: "22-tiktok-product-detail", path: "/commerce/tiktok/products/TTS-BLEND-01" },
  { name: "23-tiktok-selection", path: "/commerce/tiktok/selection" },
  { name: "24-tiktok-compliance", path: "/commerce/tiktok/compliance" },
  { name: "25-tiktok-customer", path: "/commerce/tiktok/customer" },
  { name: "26-tiktok-content", path: "/commerce/tiktok/content" },
  { name: "27-tiktok-creators", path: "/commerce/tiktok/creators" },
  { name: "30-account", path: "/account" },
  { name: "31-account-login", path: "/account/login" },
  { name: "32-account-credits", path: "/account/credits" },
  { name: "33-account-memory", path: "/account/memory" },
  { name: "34-account-connections", path: "/account/connections" },
  { name: "35-account-privacy", path: "/account/privacy" },
  // Known broken / missing pages — still capture for the audit PDF
  { name: "90-commerce-workspace-404", path: "/commerce/workspace" },
  { name: "91-commerce-metrics-404", path: "/commerce/metrics" },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function login(page, context) {
  // Prefer API login so cookies are reliable for Commerce / Create.
  const res = await page.request.post(`${BASE}/api/auth/email`, {
    data: { email: EMAIL },
  });
  if (!res.ok()) {
    console.warn("API login failed, falling back to UI", await res.text());
    await page.goto(`${BASE}/account/login`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    const email = page.locator('input[type="email"]');
    if (await email.count()) {
      await email.fill(EMAIL);
      await page.getByRole("button", { name: /邮箱登录|登录/ }).first().click();
      await page.waitForTimeout(1500);
    }
    return;
  }
  // Sync cookies from API request context into browser context
  const storage = await page.request.storageState();
  await context.addCookies(storage.cookies);
  await page.goto(`${BASE}/account`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  const sess = await page.evaluate(async () => {
    const r = await fetch("/api/auth/session");
    return r.json();
  });
  console.log(
    "Session:",
    sess.authenticated ? sess.user?.email : "NOT authenticated"
  );
}

async function expandCollapsibles(page) {
  // Best-effort: open folded KPI / glossary / “更多” so long content is visible
  const labels = [
    "展开全部定义",
    "展开指标",
    "展开 KPI",
    "展开",
    "查看更多",
    "显示全部",
    "展开噪音",
    "展开测试项目",
    "上下文 / QA / 发布",
  ];
  for (const text of labels) {
    const btns = page.getByRole("button", { name: new RegExp(text) });
    const n = await btns.count();
    for (let i = 0; i < Math.min(n, 6); i++) {
      try {
        const b = btns.nth(i);
        if (await b.isVisible()) await b.click({ timeout: 800 });
      } catch {
        /* ignore */
      }
    }
  }
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(1200);
  // Wait for common loading labels to clear (best-effort)
  for (let i = 0; i < 8; i++) {
    const loading = page.locator("text=正在加载").first();
    const searching = page.locator("text=正在检索").first();
    const busy =
      ((await loading.count()) && (await loading.isVisible().catch(() => false))) ||
      ((await searching.count()) &&
        (await searching.isVisible().catch(() => false)));
    if (!busy) break;
    await page.waitForTimeout(700);
  }
  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(600);
  // Scroll through to trigger lazy content, then return top for fullPage shot
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const step = Math.floor(window.innerHeight * 0.7);
    for (let y = 0; y < h + step; y += step) {
      window.scrollTo(0, y);
      await delay(160);
    }
    window.scrollTo(0, Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ));
    await delay(300);
    window.scrollTo(0, 0);
    await delay(250);
  });
}

async function captureOne(page, name, routePath) {
  const url = `${BASE}${routePath}`;
  console.log(`→ ${name}  ${routePath}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  } catch (e) {
    console.warn(`  navigate failed: ${e.message}`);
  }
  await settle(page);
  await expandCollapsibles(page);
  await page.waitForTimeout(400);
  await settle(page);

  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: true,
    type: "png",
  });
  const box = await page.evaluate(() => ({
    scrollH: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ),
    title: document.title,
  }));
  return { name, path: routePath, file, ...box };
}

async function seedDynamicRoutes(page, routes) {
  // Prefer existing creation project via API cookie session
  const projects = await page.evaluate(async () => {
    const res = await fetch("/api/create");
    if (!res.ok) return [];
    const data = await res.json();
    return data.projects || [];
  });
  if (projects[0]?.id) {
    routes.push({
      name: "40-create-workbench",
      path: `/create/${projects[0].id}`,
    });
    routes.push({
      name: "41-publish-detail",
      path: `/publish/${projects[0].id}`,
    });
  } else {
    // create one
    const id = await page.evaluate(async () => {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fullpage screenshot project",
          goal: "截图用示例项目",
          startMode: "idea",
          platform: "xiaohongshu",
          contentType: "social_post",
        }),
      });
      const data = await res.json();
      return data.id;
    });
    if (id) {
      routes.push({ name: "40-create-workbench", path: `/create/${id}` });
      routes.push({ name: "41-publish-detail", path: `/publish/${id}` });
    }
  }

  // Workspace: try list then open first
  const ws = await page.evaluate(async () => {
    const res = await fetch("/api/workspace");
    if (!res.ok) return null;
    const data = await res.json();
    const list = data.workspaces || data || [];
    return Array.isArray(list) ? list[0] : null;
  });
  if (ws?.id) {
    routes.push({ name: "42-workspace-detail", path: `/workspace/${ws.id}` });
    routes.push({
      name: "43-workspace-research",
      path: `/workspace/${ws.id}/research`,
    });
  }
}

/**
 * Pack a tall PNG into PDF pages (width-fit, slice vertically).
 */
async function appendImageToPdf(pdf, pngPath, label) {
  const meta = await sharp(pngPath).metadata();
  const imgW = meta.width || 1440;
  const imgH = meta.height || 900;

  const pageW = 595.28; // A4
  const pageH = 841.89;
  const margin = 28;
  const headerH = 22;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH;
  const scale = usableW / imgW;
  const scaledFullH = imgH * scale;
  const sliceSrcH = Math.floor(usableH / scale);

  let offsetY = 0;
  let part = 0;
  while (offsetY < imgH) {
    const h = Math.min(sliceSrcH, imgH - offsetY);
    const slice = await sharp(pngPath)
      .extract({ left: 0, top: offsetY, width: imgW, height: h })
      .png()
      .toBuffer();

    const page = pdf.addPage([pageW, pageH]);
    const embedded = await pdf.embedPng(slice);
    const drawH = h * scale;
    const title =
      part === 0 ? label : `${label}  (cont. ${part + 1})`;
    // Strip non-latin for Helvetica safety
    const safe = title.replace(/[^\x20-\x7E]/g, "?").slice(0, 90);
    page.drawText(safe, {
      x: margin,
      y: pageH - margin - 12,
      size: 9,
    });
    page.drawImage(embedded, {
      x: margin,
      y: pageH - margin - headerH - drawH,
      width: usableW,
      height: drawH,
    });

    offsetY += h;
    part += 1;
    // safety
    if (part > 40) break;
  }

  return { imgW, imgH, pages: part, scaledFullH };
}

async function buildPdf(captures) {
  const pdf = await PDFDocument.create();
  // Cover
  {
    const page = pdf.addPage([595.28, 841.89]);
    // Standard PDF fonts are Latin-only — keep cover text ASCII.
    page.drawText("Nexa Full-Page Screenshot Pack", {
      x: 48,
      y: 720,
      size: 20,
    });
    page.drawText("Scroll-captured full page PNGs compiled into one PDF", {
      x: 48,
      y: 690,
      size: 11,
    });
    page.drawText(`Base: ${BASE}`, { x: 48, y: 660, size: 10 });
    page.drawText(`Generated: ${new Date().toISOString()}`, {
      x: 48,
      y: 642,
      size: 10,
    });
    page.drawText(`Pages captured: ${captures.length}`, {
      x: 48,
      y: 624,
      size: 10,
    });
    let y = 580;
    for (const c of captures) {
      const line = `${c.name}  ${c.path}  (${c.scrollH}px)`;
      page.drawText(line.slice(0, 95), { x: 48, y, size: 8 });
      y -= 12;
      if (y < 48) break;
    }
  }

  for (const c of captures) {
    const label = `${c.name}  ${c.path}`;
    console.log(`  PDF ← ${c.name}`);
    await appendImageToPdf(pdf, c.file, label);
  }

  const bytes = await pdf.save();
  await fs.writeFile(PDF_PATH, bytes);
  console.log(`PDF written: ${PDF_PATH}`);
}

async function main() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  console.log("Logging in…");
  await login(page, context);

  const routes = [...STATIC_ROUTES];
  await seedDynamicRoutes(page, routes);
  routes.sort((a, b) => a.name.localeCompare(b.name));

  /** @type {Awaited<ReturnType<typeof captureOne>>[]} */
  const captures = [];
  for (const r of routes) {
    try {
      const cap = await captureOne(page, r.name, r.path);
      captures.push(cap);
    } catch (e) {
      console.error(`FAIL ${r.name}:`, e.message);
    }
  }

  await browser.close();

  const index = captures.map((c) => ({
    name: c.name,
    path: c.path,
    file: path.basename(c.file),
    scrollHeight: c.scrollH,
    title: c.title,
  }));
  await fs.writeFile(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(index, null, 2),
    "utf8"
  );

  console.log("Building PDF…");
  await buildPdf(captures);
  console.log(`Done. Screenshots: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
