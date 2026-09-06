import {
  notConfiguredStatus,
  type AmazonCommerceProvider,
  type ImageGenerationProvider,
  type ImageSearchProvider,
  type LLMProvider,
  type MusicProvider,
  type ProviderStatus,
  type PublishingProvider,
  type QualityCheckProvider,
  type ResearchProvider,
  type TextGenerationResult,
  type TikTokShopCommerceProvider,
  type TTSProvider,
  type VideoGenerationProvider,
  type VideoSearchProvider,
  type VisionProvider,
  type WikipediaProvider,
  type WebSearchProvider,
} from "./interfaces";

function unavailableProvider<T extends object>(extra: T): T & {
  isConfigured(): boolean;
  getStatus(): Promise<ProviderStatus>;
} {
  return {
    ...extra,
    isConfigured: () => false,
    getStatus: async () => notConfiguredStatus(),
  };
}

export function createUnavailableWebSearchProvider(): WebSearchProvider {
  return unavailableProvider({
    search: async () => [],
  });
}

export function createUnavailableWikipediaProvider(): WikipediaProvider {
  return unavailableProvider({
    search: async () => [],
  });
}

export function createUnavailableImageSearchProvider(): ImageSearchProvider {
  return unavailableProvider({
    search: async () => [],
  });
}

export function createUnavailableVideoSearchProvider(): VideoSearchProvider {
  return unavailableProvider({
    search: async () => [],
  });
}

export function createUnavailableLLMProvider(): LLMProvider {
  return unavailableProvider({
    generateText: async (): Promise<TextGenerationResult> => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
  });
}

export function createUnavailableVisionProvider(): VisionProvider {
  return unavailableProvider({
    analyzeImage: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
  });
}

export function createUnavailableImageGenerationProvider(): ImageGenerationProvider {
  return unavailableProvider({
    generateImage: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
  });
}

export function createUnavailableVideoGenerationProvider(): VideoGenerationProvider {
  return unavailableProvider({
    generateVideo: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
  });
}

export function createUnavailableMusicProvider(): MusicProvider {
  return unavailableProvider({
    generateMusic: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
    analyzeMusic: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
    detectBeats: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
    searchLicensedMusic: async () => [],
  });
}

export function createUnavailableTTSProvider(): TTSProvider {
  return unavailableProvider({
    synthesize: async () => {
      throw new Error("AI_CAPABILITY_NOT_CONFIGURED");
    },
  });
}

export function createUnavailableResearchProvider(): ResearchProvider {
  return unavailableProvider({
    research: async () => ({ status: "blocked_ai_unavailable" }),
  });
}

export function createUnavailableQualityCheckProvider(): QualityCheckProvider {
  return unavailableProvider({
    check: async () => ({ issues: [], suggestions: [] }),
  });
}

export function createUnavailablePublishingProvider(
  platform: string
): PublishingProvider {
  return {
    platform,
    isConfigured: () => false,
    getStatus: async () => notConfiguredStatus("发布能力将在连接平台后启用。"),
    publish: async () => ({
      status: "unsupported",
      errorCode: "PUBLISH_NOT_CONFIGURED",
    }),
  };
}

export function createUnavailableAmazonCommerceProvider(): AmazonCommerceProvider {
  return unavailableProvider({
    getOverview: async () => ({ demo: false, available: false }),
    getProduct: async () => ({ demo: false, available: false }),
    getAds: async () => ({ demo: false, available: false }),
  });
}

export function createUnavailableTikTokShopCommerceProvider(): TikTokShopCommerceProvider {
  return unavailableProvider({
    getOverview: async () => ({ demo: false, available: false }),
    getProduct: async () => ({ demo: false, available: false }),
    getContent: async () => ({ demo: false, available: false }),
  });
}
