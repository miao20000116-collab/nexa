/**
 * Re-capture a few routes that were short / incomplete, then rebuild PDF.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "docs", "ux-fullpage-screenshots");
const BASE = process.env.NEXA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.NEXA_DEMO_EMAIL || "demo@nexa.local";

const ROUTES = [
  { name: "01-search", path: "/search?q=" + encodeURIComponent("什么是 RAG？") },
  { name: "02-read", path: "/read?url=" + encodeURIComponent("https://en.wikipedia.org/wiki/Retrieval-augmented_generation") },
  { name: "03-workspace-list", path: "/workspace" },
  { name: "42-workspace-detail", path: null }, // filled after discovery
  { name: "43-workspace-research", path: null },
];

async function settle(page) {
  await page.waitForTimeout(1500);
  for (let i = 0; i < 12; i++) {
    const loading = page.locator("text=/正在加载|正在检索|正在生成|处理中/").first();
    if (!(await loading.isVisible().catch(() => false))) break;
    await page.waitForTimeout(800);
  }
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const h = () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const step = Math.floor(window.innerHeight * 0.7);
    for (let y = 0; y < h() + step; y += step) {
      window.scrollTo(0, y);
      await delay(150);
    }
    window.scrollTo(0, h());
    await delay(250);
    window.scrollTo(0, 0);
    await delay(200);
  });
}

async function main() {
  // wait searxng briefly
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch("http://localhost:8080");
      if (r.ok || r.status === 200) {
        console.log("searxng up");
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const res = await page.request.post(`${BASE}/api/auth/email`, {
    data: { email: EMAIL },
  });
  console.log("login", res.status());
  const storage = await page.request.storageState();
  await context.addCookies(storage.cookies);
  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });

  const ws = await page.evaluate(async () => {
    const r = await fetch("/api/workspace");
    if (!r.ok) return null;
    const d = await r.json();
    const list = d.workspaces || [];
    return list[0] || null;
  });
  if (ws?.id) {
    ROUTES.find((x) => x.name === "42-workspace-detail").path = `/workspace/${ws.id}`;
    ROUTES.find((x) => x.name === "43-workspace-research").path =
      `/workspace/${ws.id}/research`;
  }

  for (const r of ROUTES) {
    if (!r.path) {
      console.log("skip", r.name);
      continue;
    }
    console.log("→", r.name, r.path);
    await page.goto(`${BASE}${r.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await settle(page);
    const file = path.join(OUT_DIR, `${r.name}.png`);
    await page.screenshot({ path: file, fullPage: true, type: "png" });
    const h = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    );
    console.log("  height", h);
  }

  await browser.close();

  // rebuild pdf
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/rebuild-screenshot-pdf.mjs"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("pdf fail"))));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
