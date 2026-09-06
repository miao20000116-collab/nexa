/**
 * Provider factory — selects implementation from server env.
 * Business code never references provider product names (Qwen, DeepSeek, etc.).
 */

import { OpenAITextProvider } from "@/modules/ai/providers/openai-text-provider";

export type KnownProviderKey =
  | "domestic_openai"
  | "qwen"
  | "deepseek"
  | "doubao"
  | "gemini"
  | "openai";

const PROVIDER_ENV_PREFIX: Partial<Record<KnownProviderKey, string>> = {
  qwen: "QWEN",
  deepseek: "DEEPSEEK",
  doubao: "DOUBAO",
  gemini: "GEMINI",
  openai: "OPENAI",
};

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function getActiveProviderKey(): KnownProviderKey {
  const key = (
    env("NEXA_AI_PRIMARY_PROVIDER") ||
    env("AI_PROVIDER") ||
    "domestic_openai"
  ).toLowerCase() as KnownProviderKey;

  const known: KnownProviderKey[] = [
    "domestic_openai",
    "qwen",
    "deepseek",
    "doubao",
    "gemini",
    "openai",
  ];
  return known.includes(key) ? key : "domestic_openai";
}

export function isProviderKeyEnabled(key: KnownProviderKey): boolean {
  return key === getActiveProviderKey();
}

/** Resolve base URL / API key for a provider key (only active provider is configured in V2.1). */
export function resolveProviderCredentials(key: KnownProviderKey): {
  baseUrl: string;
  apiKey: string;
} {
  if (!isProviderKeyEnabled(key)) {
    return { baseUrl: "", apiKey: "" };
  }

  const prefix = PROVIDER_ENV_PREFIX[key];
  if (prefix) {
    const baseUrl = env(`${prefix}_BASE_URL`) || env("AI_BASE_URL");
    const apiKey = env(`${prefix}_API_KEY`) || env("AI_API_KEY");
    return { baseUrl, apiKey };
  }

  return {
    baseUrl: env("AI_BASE_URL"),
    apiKey: env("AI_API_KEY"),
  };
}

let primaryTextProvider: OpenAITextProvider | null = null;

export function getPrimaryTextProvider(): OpenAITextProvider {
  if (!primaryTextProvider) {
    const key = getActiveProviderKey();
    const creds = resolveProviderCredentials(key);
    primaryTextProvider = new OpenAITextProvider({
      id: key,
      baseUrl: creds.baseUrl,
      apiKey: creds.apiKey,
    });
  }
  return primaryTextProvider;
}

export function registerFutureProviderStubs(): KnownProviderKey[] {
  return ["qwen", "deepseek", "doubao", "gemini", "openai"];
}
