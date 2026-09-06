/**
 * Skill registry — resolve definitions & immutable version packs.
 */

import { COMMERCE_SKILL_PACKS } from "./packs";
import type {
  CommerceSkillDefinition,
  SkillVersionPack,
} from "./types";

export function listCommerceSkills(): CommerceSkillDefinition[] {
  return COMMERCE_SKILL_PACKS.map((s) => ({
    ...s,
    versions: s.versions.map((v) => ({ ...v, rules: [...v.rules] })),
  }));
}

export function getSkillById(skillId: string): CommerceSkillDefinition | null {
  return COMMERCE_SKILL_PACKS.find((s) => s.skillId === skillId) ?? null;
}

/**
 * Resolve a specific version. Never falls back by mutating older packs.
 */
export function getSkillVersion(
  skillId: string,
  version?: string | null
): { skill: CommerceSkillDefinition; pack: SkillVersionPack } | null {
  const skill = getSkillById(skillId);
  if (!skill) return null;
  const ver = version?.trim() || skill.latestVersion;
  const pack = skill.versions.find((v) => v.version === ver);
  if (!pack) return null;
  return { skill, pack };
}

export function getLatestSkillPack(skillId: string) {
  const skill = getSkillById(skillId);
  if (!skill) return null;
  return getSkillVersion(skillId, skill.latestVersion);
}

/** Publish path for future: append version only (validation helper). */
export function assertVersionNotOverwrite(
  skill: CommerceSkillDefinition,
  newVersion: string
): void {
  if (skill.versions.some((v) => v.version === newVersion)) {
    throw new Error(
      `[skills] Version ${newVersion} already exists for ${skill.skillId}; create a new version instead of overwriting.`
    );
  }
}
