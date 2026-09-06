/**
 * V4.4 — Experimentation
 * Hypothesis / Variants / Metrics / Result / Conclusion
 * Fake metrics forbidden. Insufficient Data when no real metrics.
 */

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".nexa-data", "experiments");

export type ExperimentVariable =
  | "hook"
  | "title"
  | "visual"
  | "cta"
  | "structure";

export interface ExperimentVariant {
  id: "A" | "B" | "C";
  variable: ExperimentVariable;
  description: string;
  contentRef?: string;
}

export interface ExperimentMetrics {
  views?: number;
  clicks?: number;
  ctr?: number;
  cvr?: number;
  engagement?: number;
  source: "user_provided" | "platform" | "none";
}

export interface Experiment {
  id: string;
  userId: string;
  hypothesis: string;
  variants: ExperimentVariant[];
  metrics: Record<string, ExperimentMetrics>;
  status: "draft" | "running" | "completed" | "insufficient_data";
  winner?: "A" | "B" | "C" | null;
  possibleReason?: string | null;
  nextExperiment?: string | null;
  conclusion?: string | null;
  code?: "INSUFFICIENT_DATA" | null;
  createdAt: string;
  updatedAt: string;
}

function uid() {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function expPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function createExperiment(input: {
  userId: string;
  hypothesis: string;
  variants?: ExperimentVariant[];
}): Promise<Experiment> {
  await ensureDir();
  const now = new Date().toISOString();
  const variants =
    input.variants ??
    ([
      { id: "A", variable: "hook", description: "强情绪 Hook" },
      { id: "B", variable: "title", description: "利益点标题" },
      { id: "C", variable: "cta", description: "明确行动号召" },
    ] as ExperimentVariant[]);

  const exp: Experiment = {
    id: uid(),
    userId: input.userId,
    hypothesis: input.hypothesis,
    variants,
    metrics: {},
    status: "draft",
    winner: null,
    possibleReason: null,
    nextExperiment: null,
    conclusion: null,
    code: null,
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(expPath(exp.id), JSON.stringify(exp, null, 2));
  return exp;
}

export async function getExperiment(
  id: string,
  userId: string
): Promise<Experiment | null> {
  try {
    const raw = await fs.readFile(expPath(id), "utf-8");
    const exp = JSON.parse(raw) as Experiment;
    return exp.userId === userId ? exp : null;
  } catch {
    return null;
  }
}

export async function recordExperimentMetrics(input: {
  userId: string;
  experimentId: string;
  variantId: "A" | "B" | "C";
  metrics: ExperimentMetrics;
}): Promise<Experiment> {
  const exp = await getExperiment(input.experimentId, input.userId);
  if (!exp) throw new Error("实验不存在");

  if (!input.metrics.source || input.metrics.source === "none") {
    exp.status = "insufficient_data";
    exp.code = "INSUFFICIENT_DATA";
    exp.conclusion = "Insufficient Data：未提供真实指标，不会生成假 Winner。";
    exp.updatedAt = new Date().toISOString();
    await fs.writeFile(expPath(exp.id), JSON.stringify(exp, null, 2));
    return exp;
  }

  exp.metrics[input.variantId] = input.metrics;
  exp.status = "running";
  exp.code = null;
  exp.updatedAt = new Date().toISOString();
  await fs.writeFile(expPath(exp.id), JSON.stringify(exp, null, 2));
  return exp;
}

export async function concludeExperiment(input: {
  userId: string;
  experimentId: string;
}): Promise<Experiment> {
  const exp = await getExperiment(input.experimentId, input.userId);
  if (!exp) throw new Error("实验不存在");

  const entries = Object.entries(exp.metrics).filter(
    ([, m]) => m.source !== "none" && (m.ctr != null || m.views != null || m.cvr != null)
  );

  if (entries.length < 2) {
    exp.status = "insufficient_data";
    exp.code = "INSUFFICIENT_DATA";
    exp.winner = null;
    exp.conclusion =
      "Insufficient Data：至少需要 2 个变体的真实指标才能判定 Winner。";
    exp.updatedAt = new Date().toISOString();
    await fs.writeFile(expPath(exp.id), JSON.stringify(exp, null, 2));
    return exp;
  }

  const scored = entries.map(([id, m]) => ({
    id: id as "A" | "B" | "C",
    score: (m.ctr ?? 0) * 0.5 + (m.cvr ?? 0) * 0.3 + (m.engagement ?? 0) * 0.2,
  }));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0].id;
  exp.winner = winner;
  exp.status = "completed";
  exp.possibleReason = `变体 ${winner} 在已记录的真实指标上综合表现更好`;
  exp.nextExperiment = "在 Winner 基础上只改一个新变量做下一轮实验";
  exp.conclusion = `Winner = ${winner}。${exp.possibleReason}。下一轮：${exp.nextExperiment}`;
  exp.updatedAt = new Date().toISOString();
  await fs.writeFile(expPath(exp.id), JSON.stringify(exp, null, 2));
  return exp;
}
