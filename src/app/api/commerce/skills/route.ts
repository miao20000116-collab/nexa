import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/guest-guard";
import {
  getLatestSkillPack,
  listCommerceSkills,
  selectCommerceSkills,
} from "@/modules/commerce/skills";

export const runtime = "nodejs";

/**
 * GET /api/commerce/skills
 * Inspect system Skills (not a Marketplace / Prompt Center).
 * Query: platform, marketplace, country, category, task — returns Applied Knowledge preview.
 */
export async function GET(req: NextRequest) {
  const auth = await requireLogin("commerce");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: "login_required" },
      { status: auth.status }
    );
  }

  const sp = req.nextUrl.searchParams;
  const task = sp.get("task");
  const platformRaw = sp.get("platform");
  const platform =
    platformRaw === "Amazon" || platformRaw === "TikTok Shop"
      ? platformRaw
      : undefined;

  if (task) {
    const applied = selectCommerceSkills({
      task,
      platform,
      marketplace: sp.get("marketplace"),
      country: sp.get("country"),
      category: sp.get("category"),
    });
    return NextResponse.json({
      kind: "applied_knowledge_preview",
      note: "Users do not pick Skills. CapabilityRouter selects by Platform / Market / Category / Task.",
      applied,
    });
  }

  const skills = listCommerceSkills().map((s) => {
    const latest = getLatestSkillPack(s.skillId);
    return {
      skillId: s.skillId,
      name: s.name,
      domain: s.domain,
      platform: s.platform,
      marketplace: s.marketplace,
      country: s.country,
      version: s.latestVersion,
      lastUpdated: s.lastUpdated,
      ownership: s.ownership,
      versionHistory: s.versions.map((v) => ({
        version: v.version,
        releasedAt: v.releasedAt,
        changelog: v.changelog,
      })),
      inputs: latest?.pack.inputs ?? [],
      outputs: latest?.pack.outputs ?? [],
      applicableScenarios: latest?.pack.applicableScenarios ?? [],
      ruleCount: latest?.pack.rules.length ?? 0,
      evidenceCount: latest?.pack.evidenceIndex.length ?? 0,
    };
  });

  return NextResponse.json({
    kind: "skill_catalog",
    note: "Cross-border Skills Infrastructure — not Prompt/Agent Marketplace. Enterprise private skills reserved for later.",
    skills,
  });
}
