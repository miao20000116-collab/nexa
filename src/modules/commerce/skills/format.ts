/**
 * Format Applied Knowledge for AI prompts (rules ≠ prompt-only).
 */

import { getLatestSkillPack } from "./registry";
import type { AppliedKnowledgeSummary } from "./types";

export function formatSkillsForPrompt(
  applied: AppliedKnowledgeSummary
): string {
  if (!applied.items.length) return "";

  const blocks: string[] = [
    "=== Nexa Cross-border Skills (Applied Knowledge) ===",
    "Follow these Business / Platform / Category / Keyword / Compliance / Localization rules and Decision Logic.",
    "Do not invent metrics. Cite evidence when making factual claims. This is not legal approval.",
    "",
  ];

  for (const item of applied.items) {
    const resolved = getLatestSkillPack(
      // skillIds aligned with items order
      applied.skillIds[applied.items.indexOf(item)] || ""
    );
    blocks.push(`## ${item.skillName} v${item.version}`);
    blocks.push(`Domain: ${item.domain} · Platform: ${item.platform}`);
    if (item.marketplaceHint) {
      blocks.push(`Marketplace context: ${item.marketplaceHint}`);
    }
    blocks.push("Decision Logic:");
    for (const d of item.ruleHighlights.slice(0, 3)) {
      blocks.push(`- ${d}`);
    }
    if (resolved) {
      const byKind = new Map<string, string[]>();
      for (const r of resolved.pack.rules) {
        const arr = byKind.get(r.kind) || [];
        arr.push(r.statement);
        byKind.set(r.kind, arr);
      }
      for (const [kind, stmts] of byKind) {
        blocks.push(`${kind} rules:`);
        for (const s of stmts.slice(0, 4)) blocks.push(`- ${s}`);
      }
      if (resolved.pack.evidenceIndex.length) {
        blocks.push("Evidence anchors:");
        for (const e of resolved.pack.evidenceIndex.slice(0, 3)) {
          blocks.push(
            `- ${e.source} | ${e.platform} | ${e.region} | ${e.timestamp}${e.url ? ` | ${e.url}` : ""}`
          );
        }
      }
    }
    blocks.push("");
  }

  return blocks.join("\n");
}
