/**
 * V3.2 Research plan / report persistence — .nexa-data/research/
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  IntelligentResearchReport,
  ResearchPlan,
} from "@/modules/research/types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "research");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function planPath(id: string) {
  return path.join(DATA_DIR, `plan_${id}.json`);
}

function reportPath(id: string) {
  return path.join(DATA_DIR, `report_${id}.json`);
}

export async function saveResearchPlan(plan: ResearchPlan): Promise<void> {
  await ensureDir();
  await fs.writeFile(planPath(plan.id), JSON.stringify(plan, null, 2));
}

export async function loadResearchPlan(
  id: string
): Promise<ResearchPlan | null> {
  try {
    const raw = await fs.readFile(planPath(id), "utf-8");
    return JSON.parse(raw) as ResearchPlan;
  } catch {
    return null;
  }
}

export async function saveIntelligentReport(
  id: string,
  report: IntelligentResearchReport
): Promise<void> {
  await ensureDir();
  // Persist without exposing quality algorithm in a separate public field —
  // keep _sourceQuality for internal audit only.
  await fs.writeFile(reportPath(id), JSON.stringify(report, null, 2));
}

export async function loadIntelligentReport(
  id: string
): Promise<IntelligentResearchReport | null> {
  try {
    const raw = await fs.readFile(reportPath(id), "utf-8");
    return JSON.parse(raw) as IntelligentResearchReport;
  } catch {
    return null;
  }
}
