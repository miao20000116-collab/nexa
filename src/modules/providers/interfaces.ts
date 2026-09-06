/**
 * Nexa Provider Interfaces — P0 foundation.
 * Business code must call Application Services, never React → Provider directly.
 * API keys stay server-side only.
 */

export type ProviderAvailability =
  | "available"
  | "not_configured"
  | "unavailable";

export interface ProviderStatus {
  available: boolean;
  code:
    | "PROVIDER_AVAILABLE"
    | "PROVIDER_NOT_CONFIGURED"
    | "PROVIDER_UNAVAILABLE";
  message?: string;
}

export interface TextGenerationRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  context?: Record<string, unknown>;
}

export interface TextGenerationResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface MediaAnalysisRequest {
  url?: string;
  storageKey?: string;
  mimeType?: string;
  prompt?: string;
}

export interface MediaAnalysisResult {
  summary?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  style?: string;
  /** Optional reference image for edits / product-in-scene (server bytes). */
  referenceImageBytes?: Buffer | Uint8Array;
  referenceImageBase64?: string;
  referenceMimeType?: string;
  /** Prefer edit endpoint when reference is present. */
  mode?: "generate" | "edit";
}

export interface ImageGenerationResult {
  url?: string;
  storageKey?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  /** Internal — never show raw model slug in client UI */
  model?: string;
  latencyMs?: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  durationSec?: number;
  /** Optional first-frame image (base64, no data: prefix) for I2V */
  imageBase64?: string;
  /** Optional public image URL for I2V */
  imageUrl?: string;
  /** Preferred aspect ratio for T2V, e.g. 9:16 */
  aspectRatio?: string;
}

export interface VideoGenerationResult {
  url?: string;
  storageKey?: string;
}

export interface MusicGenerationRequest {
  prompt: string;
  durationSec?: number;
}

export interface MusicGenerationResult {
  url?: string;
  storageKey?: string;
}

export interface MusicAnalysisRequest {
  url?: string;
  storageKey?: string;
  buffer?: ArrayBuffer;
  mimeType?: string;
}

export interface MusicAnalysisResult {
  bpm?: number | null;
  beats?: number[];
  sections?: Array<{ name: string; start: number; end: number }>;
  durationSec?: number;
  method?: string;
}

export interface LicensedMusicQuery {
  query: string;
  mood?: string;
  bpm?: number;
  commercialOnly?: boolean;
}

export interface LicensedMusicItem {
  id: string;
  title: string;
  url?: string;
  commercialUse: boolean;
  attributionRequired?: boolean;
  licenseNote?: string;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
}

export interface TTSResult {
  url?: string;
  storageKey?: string;
}

export interface ResearchRequest {
  goal: string;
  sources?: Array<{ title?: string; url: string; snippet?: string }>;
  reportType?: string;
}

export interface ResearchResult {
  report?: Record<string, unknown>;
  status: string;
}

export interface QualityCheckRequest {
  content: string;
  platform?: string;
}

export interface QualityCheckResult {
  score?: number;
  issues?: string[];
  suggestions?: string[];
  passed?: boolean;
  verdict?: "通过" | "需要修改" | "PASS" | "NEEDS_REVISION";
  reasons?: string[];
  checks?: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
}

export interface PublishRequest {
  platform: string;
  content: Record<string, unknown>;
  connectionId?: string;
}

export interface PublishResult {
  status: "queued" | "published" | "failed" | "unsupported";
  externalId?: string;
  externalUrl?: string;
  errorCode?: string;
}

export interface CommerceQuery {
  storeId?: string;
  asin?: string;
  sku?: string;
  timeRange?: string;
}

/** Search providers */
export interface WebSearchProvider {
  isConfigured(): boolean;
  search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  getStatus(): Promise<ProviderStatus>;
}

export interface WikipediaProvider {
  isConfigured(): boolean;
  search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  getStatus(): Promise<ProviderStatus>;
}

export interface ImageSearchProvider {
  isConfigured(): boolean;
  search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  getStatus(): Promise<ProviderStatus>;
}

export interface VideoSearchProvider {
  isConfigured(): boolean;
  search(query: string, options?: Record<string, unknown>): Promise<unknown[]>;
  getStatus(): Promise<ProviderStatus>;
}

/** AI / media providers */
export interface LLMProvider {
  isConfigured(): boolean;
  generateText(req: TextGenerationRequest): Promise<TextGenerationResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface VisionProvider {
  isConfigured(): boolean;
  analyzeImage(req: MediaAnalysisRequest): Promise<MediaAnalysisResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface ImageGenerationProvider {
  isConfigured(): boolean;
  generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface VideoGenerationProvider {
  isConfigured(): boolean;
  generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface MusicProvider {
  isConfigured(): boolean;
  generateMusic(req: MusicGenerationRequest): Promise<MusicGenerationResult>;
  analyzeMusic(req: MusicAnalysisRequest): Promise<MusicAnalysisResult>;
  detectBeats(req: MusicAnalysisRequest): Promise<MusicAnalysisResult>;
  searchLicensedMusic(query: LicensedMusicQuery): Promise<LicensedMusicItem[]>;
  getStatus(): Promise<ProviderStatus>;
}

export interface TTSProvider {
  isConfigured(): boolean;
  synthesize(req: TTSRequest): Promise<TTSResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface ResearchProvider {
  isConfigured(): boolean;
  research(req: ResearchRequest): Promise<ResearchResult>;
  getStatus(): Promise<ProviderStatus>;
}

export interface QualityCheckProvider {
  isConfigured(): boolean;
  check(req: QualityCheckRequest): Promise<QualityCheckResult>;
  getStatus(): Promise<ProviderStatus>;
}

/** Publishing */
export interface PublishingProvider {
  platform: string;
  isConfigured(): boolean;
  publish(req: PublishRequest): Promise<PublishResult>;
  getStatus(): Promise<ProviderStatus>;
}

/** Commerce */
export interface AmazonCommerceProvider {
  isConfigured(): boolean;
  getOverview(query: CommerceQuery): Promise<Record<string, unknown>>;
  getProduct(query: CommerceQuery): Promise<Record<string, unknown>>;
  getAds(query: CommerceQuery): Promise<Record<string, unknown>>;
  getStatus(): Promise<ProviderStatus>;
}

export interface TikTokShopCommerceProvider {
  isConfigured(): boolean;
  getOverview(query: CommerceQuery): Promise<Record<string, unknown>>;
  getProduct(query: CommerceQuery): Promise<Record<string, unknown>>;
  getContent(query: CommerceQuery): Promise<Record<string, unknown>>;
  getStatus(): Promise<ProviderStatus>;
}

export const PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED" as const;

export function notConfiguredStatus(message = "该能力将在后续阶段启用。"): ProviderStatus {
  return {
    available: false,
    code: PROVIDER_NOT_CONFIGURED,
    message,
  };
}
