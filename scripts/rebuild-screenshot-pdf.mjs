/**
 * Rebuild PDF from all PNGs in docs/ux-fullpage-screenshots
 */
import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "docs", "ux-fullpage-screenshots");
const PDF_PATH = path.join(ROOT, "docs", "Nexa_Full_Pages_Screenshot.pdf");

async function appendImageToPdf(pdf, pngPath, label) {
  const meta = await sharp(pngPath).metadata();
  const imgW = meta.width || 1440;
  const imgH = meta.height || 900;
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 28;
  const headerH = 22;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2 - headerH;
  const scale = usableW / imgW;
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
    const title = (part === 0 ? label : `${label}  (cont. ${part + 1})`)
      .replace(/[^\x20-\x7E]/g, "?")
      .slice(0, 90);
    page.drawText(title, {
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
    if (part > 40) break;
  }
  return part;
}

async function main() {
  let index = [];
  try {
    index = JSON.parse(
      await fs.readFile(path.join(OUT_DIR, "index.json"), "utf8")
    );
  } catch {
    /* ignore */
  }
  const byFile = new Map(index.map((x) => [x.file, x]));

  const files = (await fs.readdir(OUT_DIR))
    .filter((f) => f.endsWith(".png"))
    .sort();

  const pdf = await PDFDocument.create();
  {
    const page = pdf.addPage([595.28, 841.89]);
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
    page.drawText(`Generated: ${new Date().toISOString()}`, {
      x: 48,
      y: 660,
      size: 10,
    });
    page.drawText(`Screenshots: ${files.length}`, {
      x: 48,
      y: 642,
      size: 10,
    });
    let y = 600;
    for (const f of files) {
      const meta = byFile.get(f);
      const line = meta
        ? `${meta.name}  ${meta.path}  (${meta.scrollHeight}px)`
        : f;
      page.drawText(line.replace(/[^\x20-\x7E]/g, "?").slice(0, 95), {
        x: 48,
        y,
        size: 8,
      });
      y -= 11;
      if (y < 48) break;
    }
  }

  const newIndex = [];
  for (const f of files) {
    const pngPath = path.join(OUT_DIR, f);
    const meta = byFile.get(f) || {
      name: f.replace(/\.png$/, ""),
      path: "",
      scrollHeight: (await sharp(pngPath).metadata()).height,
    };
    const m = await sharp(pngPath).metadata();
    console.log(`PDF <- ${f} (${m.height}px)`);
    await appendImageToPdf(
      pdf,
      pngPath,
      `${meta.name || f}  ${meta.path || ""}`.trim()
    );
    newIndex.push({
      name: meta.name || f.replace(/\.png$/, ""),
      path: meta.path || "",
      file: f,
      scrollHeight: m.height,
      title: meta.title || "",
    });
  }

  await fs.writeFile(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(newIndex, null, 2),
    "utf8"
  );
  const bytes = await pdf.save();
  await fs.writeFile(PDF_PATH, bytes);
  console.log(`PDF pages: ${(await PDFDocument.load(bytes)).getPageCount()}`);
  console.log(`Wrote ${PDF_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
