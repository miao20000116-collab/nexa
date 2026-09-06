import { promises as fs } from "fs";
import path from "path";
import type { DecisionResult } from "./types";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "decisions");

function safe(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function saveDecision(d: DecisionResult): Promise<void> {
  const dir = path.join(DATA_DIR, safe(d.userId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${d.id}.json`), JSON.stringify(d, null, 2));
}

export async function getDecision(
  userId: string,
  id: string
): Promise<DecisionResult | null> {
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, safe(userId), `${id}.json`),
      "utf-8"
    );
    const d = JSON.parse(raw) as DecisionResult;
    return d.userId === userId ? d : null;
  } catch {
    return null;
  }
}

export async function listDecisions(userId: string): Promise<DecisionResult[]> {
  const dir = path.join(DATA_DIR, safe(userId));
  await fs.mkdir(dir, { recursive: true });
  const files = await fs.readdir(dir).catch(() => []);
  const list: DecisionResult[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const d = JSON.parse(
        await fs.readFile(path.join(dir, f), "utf-8")
      ) as DecisionResult;
      if (d.userId === userId) list.push(d);
    } catch {
      /* skip */
    }
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
